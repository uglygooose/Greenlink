from __future__ import annotations

import json
from datetime import date, datetime, timedelta, time as Time
from typing import Any

from sqlalchemy import String, asc, case, cast, desc, func, or_
from sqlalchemy.orm import Session

from app.models import (
    AccountCustomer,
    Booking,
    BookingStatus,
    ClubSetting,
    GolfDayBooking,
    ImportBatch,
    LedgerEntry,
    Member,
    ProShopProduct,
    ProShopSale,
    ProShopSaleItem,
    RevenueTransaction,
    TeeTime,
    User,
    UserRole,
)
from app.services.dashboard_read_model_service import (
    dashboard_cache_key,
    normalize_dashboard_view,
    project_dashboard_payload,
)
from app.services.finance_reporting_service import (
    days_in_year as _days_in_year,
    derive_target as _derive_target,
    normalize_revenue_stream as _normalize_revenue_stream,
    period_window as _period_window,
    pro_shop_revenue_source_clause as _pro_shop_revenue_source_clause,
)
from app.services.kpi_targets_service import get_target_model_payload
from app.ttl_cache import TTLCache

ADMIN_DASHBOARD_CACHE = TTLCache[str, dict[str, Any]](ttl_seconds=20, max_entries=64)


def clear_admin_dashboard_metrics_cache() -> None:
    ADMIN_DASHBOARD_CACHE.clear()


def _safe_rollback(db: Session | None) -> None:
    if db is None:
        return
    try:
        db.rollback()
    except Exception:
        pass


def get_dashboard_stats_payload(db: Session, *, club_id: int, view: str | None = None) -> dict[str, Any]:
    """Get main dashboard statistics"""
    dashboard_view = normalize_dashboard_view(view)
    cache_key = dashboard_cache_key(club_id=int(club_id), view=dashboard_view)
    cached = ADMIN_DASHBOARD_CACHE.get(cache_key)
    if cached is not None:
        return cached

    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]
    today_anchor = datetime.utcnow().date()
    year_start_dt = datetime.combine(date(today_anchor.year, 1, 1), datetime.min.time())
    next_year_start_dt = datetime.combine(date(today_anchor.year + 1, 1, 1), datetime.min.time())
    today_start_dt = datetime.combine(today_anchor, Time.min)
    tomorrow_start_dt = today_start_dt + timedelta(days=1)

    def _date_bounds(start_d: date, end_d: date) -> tuple[datetime, datetime]:
        start_dt = datetime.combine(start_d, Time.min)
        end_dt = datetime.combine(end_d + timedelta(days=1), Time.min)
        return start_dt, end_dt

    # Total bookings
    total_bookings = db.query(func.count(Booking.id)).filter(Booking.club_id == club_id).scalar() or 0

    def _empty_status_counts() -> dict[str, int]:
        return {
            "booked": 0,
            "checked_in": 0,
            "completed": 0,
            "no_show": 0,
            "cancelled": 0,
        }

    def _booking_status_counts(start_d: date | None = None, end_d: date | None = None) -> dict[str, int]:
        counts = _empty_status_counts()
        try:
            q = db.query(Booking.status, func.count(Booking.id)).filter(Booking.club_id == club_id)
            if start_d is not None or end_d is not None:
                q = q.join(TeeTime, Booking.tee_time_id == TeeTime.id).filter(TeeTime.club_id == club_id)
                if start_d is not None and end_d is not None:
                    range_start_dt, range_end_dt = _date_bounds(start_d, end_d)
                    q = q.filter(TeeTime.tee_time >= range_start_dt, TeeTime.tee_time < range_end_dt)
                elif start_d is not None:
                    q = q.filter(TeeTime.tee_time >= datetime.combine(start_d, Time.min))
                elif end_d is not None:
                    q = q.filter(TeeTime.tee_time < datetime.combine(end_d + timedelta(days=1), Time.min))

            for status, count in q.group_by(Booking.status).all():
                if isinstance(status, BookingStatus):
                    key = str(status.value or "").strip().lower()
                else:
                    key = str(status or "").strip().lower().replace("bookingstatus.", "")
                if key in counts:
                    counts[key] = int(count or 0)
        except Exception:
            _safe_rollback(db)
            return counts
        return counts

    bookings_by_status = _booking_status_counts()
    booked_count = int(bookings_by_status.get("booked", 0))
    checked_in_count = int(bookings_by_status.get("checked_in", 0))
    completed_count = int(bookings_by_status.get("completed", 0))
    cancelled_count = int(bookings_by_status.get("cancelled", 0))
    no_show_count = int(bookings_by_status.get("no_show", 0))
    
    # Total golf revenue (cashbook basis = payment date / ledger entries)
    total_revenue = (
        db.query(func.sum(LedgerEntry.amount))
        .filter(LedgerEntry.club_id == club_id, LedgerEntry.booking_id.isnot(None))
        .scalar()
        or 0.0
    )

    # Total imported non-golf revenue excluding pro shop operational sales mirrored from POS.
    # Pro shop operational totals come from ProShopSale directly.
    try:
        other_total_revenue = (
            db.query(func.sum(RevenueTransaction.amount))
            .filter(
                RevenueTransaction.club_id == club_id,
                ~_pro_shop_revenue_source_clause(),
            )
            .scalar()
            or 0.0
        )
    except Exception:
        _safe_rollback(db)
        other_total_revenue = 0.0
    
    # Completed rounds (admin expectation = bookings marked completed)
    completed_rounds = completed_count
    
    # Registered players
    total_players = (
        db.query(func.count(User.id))
        .filter(User.role == UserRole.player, User.club_id == club_id)
        .scalar()
        or 0
    )

    # Members (imported club membership list)
    total_members = (
        db.query(func.count(Member.id))
        .filter(Member.club_id == club_id, Member.active == 1)
        .scalar()
        or 0
    )
    
    # Today's bookings
    now_utc = datetime.utcnow()
    today = now_utc.date()
    today_bookings = (
        db.query(func.count(Booking.id))
        .join(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(TeeTime.club_id == club_id, TeeTime.tee_time >= today_start_dt, TeeTime.tee_time < tomorrow_start_dt)
        .scalar()
        or 0
    )
    
    def _other_revenue_by_stream(start_d: date | None = None, end_d: date | None = None) -> dict[str, float]:
        out: dict[str, float] = {}
        try:
            q = (
                db.query(
                    RevenueTransaction.source,
                    func.sum(RevenueTransaction.amount).label("amount"),
                )
                .filter(
                    RevenueTransaction.club_id == club_id,
                    ~_pro_shop_revenue_source_clause(),
                )
            )
            if start_d is not None:
                q = q.filter(RevenueTransaction.transaction_date >= start_d)
            if end_d is not None:
                q = q.filter(RevenueTransaction.transaction_date <= end_d)

            rows = q.group_by(RevenueTransaction.source).all()
            for source, amount in rows:
                key = _normalize_revenue_stream(source)
                out[key] = float(out.get(key, 0.0)) + float(amount or 0.0)
        except Exception:
            _safe_rollback(db)
            return {}
        return out

    other_total_by_stream = _other_revenue_by_stream()

    imported_golf_total = float(other_total_by_stream.get("golf", 0.0))
    golf_total_revenue = float(total_revenue) + imported_golf_total
    try:
        pro_shop_total_revenue = (
            db.query(func.sum(ProShopSale.total))
            .filter(ProShopSale.club_id == club_id)
            .scalar()
            or 0.0
        )
    except Exception:
        _safe_rollback(db)
        pro_shop_total_revenue = 0.0

    # Import freshness (best-effort; OK if tables not present on older DBs)
    imports = {}
    try:
        last_rev = db.query(ImportBatch).filter(ImportBatch.kind == "revenue").order_by(desc(ImportBatch.imported_at)).first()
        last_bookings = db.query(ImportBatch).filter(ImportBatch.kind == "bookings").order_by(desc(ImportBatch.imported_at)).first()
        imports = {
            "revenue": last_rev.imported_at.isoformat() if last_rev and last_rev.imported_at else None,
            "bookings": last_bookings.imported_at.isoformat() if last_bookings and last_bookings.imported_at else None,
        }
    except Exception:
        _safe_rollback(db)
        imports = {}

    unresolved_pricing_count = 0
    try:
        unresolved_pricing_count = int(
            db.query(func.count(Booking.id))
            .join(TeeTime, Booking.tee_time_id == TeeTime.id)
            .filter(
                Booking.club_id == club_id,
                TeeTime.club_id == club_id,
                TeeTime.tee_time >= year_start_dt,
                TeeTime.tee_time < next_year_start_dt,
                or_(Booking.price.is_(None), Booking.price <= 0),
            )
            .scalar()
            or 0
        )
    except Exception:
        _safe_rollback(db)
        unresolved_pricing_count = 0

    def _stream_amounts_and_transactions(start_d: date, end_d: date) -> dict[str, dict[str, float | int]]:
        out: dict[str, dict[str, float | int]] = {}
        try:
            rows = (
                db.query(
                    RevenueTransaction.source,
                    func.sum(RevenueTransaction.amount).label("amount"),
                    func.count(RevenueTransaction.id).label("txns"),
                )
                .filter(
                    RevenueTransaction.club_id == club_id,
                    ~_pro_shop_revenue_source_clause(),
                    RevenueTransaction.transaction_date >= start_d,
                    RevenueTransaction.transaction_date <= end_d,
                )
                .group_by(RevenueTransaction.source)
                .all()
            )
            for source, amount, txns in rows:
                stream = _normalize_revenue_stream(source)
                cur = out.get(stream, {"amount": 0.0, "transactions": 0})
                cur["amount"] = float(cur["amount"]) + float(amount or 0.0)
                cur["transactions"] = int(cur["transactions"]) + int(txns or 0)
                out[stream] = cur
        except Exception:
            _safe_rollback(db)
            return {}
        return out

    def _golf_paid_amounts_and_rounds(start_d: date, end_d: date) -> tuple[float, int]:
        start_dt, end_dt = _date_bounds(start_d, end_d)
        try:
            paid_revenue = (
                db.query(func.sum(LedgerEntry.amount))
                .filter(
                    LedgerEntry.club_id == club_id,
                    LedgerEntry.booking_id.isnot(None),
                    LedgerEntry.created_at >= start_dt,
                    LedgerEntry.created_at < end_dt,
                )
                .scalar()
                or 0.0
            )
            paid_rounds = (
                db.query(func.count(LedgerEntry.id))
                .filter(
                    LedgerEntry.club_id == club_id,
                    LedgerEntry.booking_id.isnot(None),
                    LedgerEntry.created_at >= start_dt,
                    LedgerEntry.created_at < end_dt,
                )
                .scalar()
                or 0
            )
            return float(paid_revenue), int(paid_rounds)
        except Exception:
            _safe_rollback(db)
            return 0.0, 0

    def _pro_shop_sales_amounts_and_transactions(start_d: date, end_d: date) -> tuple[float, int]:
        start_dt = datetime.combine(start_d, Time.min)
        end_dt = datetime.combine(end_d + timedelta(days=1), Time.min)
        try:
            gross = (
                db.query(func.sum(ProShopSale.total))
                .filter(
                    ProShopSale.club_id == club_id,
                    ProShopSale.sold_at >= start_dt,
                    ProShopSale.sold_at < end_dt,
                )
                .scalar()
                or 0.0
            )
            txns = (
                db.query(func.count(ProShopSale.id))
                .filter(
                    ProShopSale.club_id == club_id,
                    ProShopSale.sold_at >= start_dt,
                    ProShopSale.sold_at < end_dt,
                )
                .scalar()
                or 0
            )
            return float(gross), int(txns)
        except Exception:
            _safe_rollback(db)
            return 0.0, 0

    golf_today_paid_rounds = 0
    golf_today_no_shows = 0
    golf_today_slot_capacity = 0
    golf_today_slot_booked = 0
    try:
        golf_today_paid_rounds = (
            db.query(func.count(Booking.id))
            .join(TeeTime, Booking.tee_time_id == TeeTime.id)
            .filter(
                TeeTime.club_id == club_id,
                Booking.club_id == club_id,
                TeeTime.tee_time >= today_start_dt,
                TeeTime.tee_time < tomorrow_start_dt,
                Booking.status.in_(paid_statuses),
            )
            .scalar()
            or 0
        )
        golf_today_no_shows = (
            db.query(func.count(Booking.id))
            .join(TeeTime, Booking.tee_time_id == TeeTime.id)
            .filter(
                TeeTime.club_id == club_id,
                Booking.club_id == club_id,
                TeeTime.tee_time >= today_start_dt,
                TeeTime.tee_time < tomorrow_start_dt,
                Booking.status == BookingStatus.no_show,
            )
            .scalar()
            or 0
        )
        golf_today_slot_capacity = (
            db.query(func.sum(TeeTime.capacity))
            .filter(TeeTime.club_id == club_id, TeeTime.tee_time >= today_start_dt, TeeTime.tee_time < tomorrow_start_dt)
            .scalar()
            or 0
        )
        golf_today_slot_booked = (
            db.query(func.count(Booking.id))
            .join(TeeTime, Booking.tee_time_id == TeeTime.id)
            .filter(
                TeeTime.club_id == club_id,
                Booking.club_id == club_id,
                TeeTime.tee_time >= today_start_dt,
                TeeTime.tee_time < tomorrow_start_dt,
                Booking.status.in_([BookingStatus.booked, BookingStatus.checked_in, BookingStatus.completed]),
            )
            .scalar()
            or 0
        )
    except Exception:
        _safe_rollback(db)
        golf_today_paid_rounds = 0
        golf_today_no_shows = 0
        golf_today_slot_capacity = 0
        golf_today_slot_booked = 0

    pro_shop_txns_today = 0
    pro_shop_txns_7d = 0
    pro_shop_avg_basket_30d = 0.0
    pro_shop_units_sold_30d = 0
    pro_shop_days_of_cover: float | None = None
    pro_shop_active_products = 0
    pro_shop_low_stock_items = 0
    pro_shop_stock_units = 0
    pro_shop_stock_value = 0.0
    pro_shop_top_sellers: list[dict[str, float | int | str]] = []
    try:
        start_7 = datetime.combine(today - timedelta(days=6), Time.min)
        start_30 = datetime.combine(today - timedelta(days=29), Time.min)
        end_exclusive = datetime.combine(today + timedelta(days=1), Time.min)

        pro_shop_txns_today = (
            db.query(func.count(ProShopSale.id))
            .filter(
                ProShopSale.club_id == club_id,
                ProShopSale.sold_at >= datetime.combine(today, Time.min),
                ProShopSale.sold_at < end_exclusive,
            )
            .scalar()
            or 0
        )
        pro_shop_txns_7d = (
            db.query(func.count(ProShopSale.id))
            .filter(ProShopSale.club_id == club_id, ProShopSale.sold_at >= start_7, ProShopSale.sold_at < end_exclusive)
            .scalar()
            or 0
        )
        pro_shop_sales_30d = (
            db.query(func.sum(ProShopSale.total))
            .filter(ProShopSale.club_id == club_id, ProShopSale.sold_at >= start_30, ProShopSale.sold_at < end_exclusive)
            .scalar()
            or 0.0
        )
        pro_shop_txns_30d = (
            db.query(func.count(ProShopSale.id))
            .filter(ProShopSale.club_id == club_id, ProShopSale.sold_at >= start_30, ProShopSale.sold_at < end_exclusive)
            .scalar()
            or 0
        )
        pro_shop_avg_basket_30d = (
            float(pro_shop_sales_30d) / float(pro_shop_txns_30d)
            if int(pro_shop_txns_30d) > 0
            else 0.0
        )
        pro_shop_units_sold_30d = (
            db.query(func.sum(ProShopSaleItem.quantity))
            .join(ProShopSale, ProShopSaleItem.sale_id == ProShopSale.id)
            .filter(
                ProShopSaleItem.club_id == club_id,
                ProShopSale.sold_at >= start_30,
                ProShopSale.sold_at < end_exclusive,
            )
            .scalar()
            or 0
        )
        pro_shop_active_products = (
            db.query(func.count(ProShopProduct.id))
            .filter(ProShopProduct.club_id == club_id, ProShopProduct.active == 1)
            .scalar()
            or 0
        )
        pro_shop_low_stock_items = (
            db.query(func.count(ProShopProduct.id))
            .filter(
                ProShopProduct.club_id == club_id,
                ProShopProduct.active == 1,
                ProShopProduct.stock_qty <= func.coalesce(ProShopProduct.reorder_level, 0),
            )
            .scalar()
            or 0
        )
        pro_shop_stock_units = (
            db.query(func.sum(ProShopProduct.stock_qty))
            .filter(ProShopProduct.club_id == club_id, ProShopProduct.active == 1)
            .scalar()
            or 0
        )
        pro_shop_stock_value = (
            db.query(func.sum(ProShopProduct.stock_qty * func.coalesce(ProShopProduct.cost_price, ProShopProduct.unit_price)))
            .filter(ProShopProduct.club_id == club_id, ProShopProduct.active == 1)
            .scalar()
            or 0.0
        )
        if int(pro_shop_units_sold_30d) > 0:
            daily_velocity_30d = float(pro_shop_units_sold_30d) / 30.0
            pro_shop_days_of_cover = (
                float(pro_shop_stock_units) / daily_velocity_30d
                if daily_velocity_30d > 0
                else None
            )
        else:
            pro_shop_days_of_cover = None
        top_rows = (
            db.query(
                ProShopSaleItem.name_snapshot,
                func.sum(ProShopSaleItem.quantity).label("units"),
                func.sum(ProShopSaleItem.line_total).label("revenue"),
            )
            .join(ProShopSale, ProShopSaleItem.sale_id == ProShopSale.id)
            .filter(
                ProShopSaleItem.club_id == club_id,
                ProShopSale.sold_at >= start_30,
                ProShopSale.sold_at < end_exclusive,
            )
            .group_by(ProShopSaleItem.name_snapshot)
            .order_by(desc(func.sum(ProShopSaleItem.line_total)))
            .limit(5)
            .all()
        )
        pro_shop_top_sellers = [
            {
                "name": str(r[0] or "Item"),
                "units": int(r[1] or 0),
                "revenue": float(r[2] or 0.0),
            }
            for r in top_rows
        ]
    except Exception:
        _safe_rollback(db)
        pro_shop_txns_today = 0
        pro_shop_txns_7d = 0
        pro_shop_avg_basket_30d = 0.0
        pro_shop_units_sold_30d = 0
        pro_shop_days_of_cover = None
        pro_shop_active_products = 0
        pro_shop_low_stock_items = 0
        pro_shop_stock_units = 0
        pro_shop_stock_value = 0.0
        pro_shop_top_sellers = []

    today_stream_stats = _stream_amounts_and_transactions(today, today)
    week_stream_stats = _stream_amounts_and_transactions(today - timedelta(days=6), today)
    prior_week_stream_stats = _stream_amounts_and_transactions(today - timedelta(days=13), today - timedelta(days=7))
    stream_highlights: dict[str, list[dict[str, float | int | str]]] = {"pub": [], "bowls": [], "other": []}

    try:
        top_start = today - timedelta(days=29)
        top_rows = (
            db.query(
                RevenueTransaction.source,
                func.coalesce(RevenueTransaction.category, "Uncategorized").label("category"),
                func.sum(RevenueTransaction.amount).label("amount"),
                func.count(RevenueTransaction.id).label("txns"),
            )
            .filter(
                RevenueTransaction.club_id == club_id,
                RevenueTransaction.transaction_date >= top_start,
                RevenueTransaction.transaction_date <= today,
            )
            .group_by(RevenueTransaction.source, func.coalesce(RevenueTransaction.category, "Uncategorized"))
            .order_by(desc(func.sum(RevenueTransaction.amount)))
            .all()
        )
        grouped: dict[str, list[dict[str, float | int | str]]] = {}
        for source, category, amount, txns in top_rows:
            stream = _normalize_revenue_stream(source)
            if stream not in {"pub", "bowls", "other"}:
                continue
            rows = grouped.get(stream, [])
            if len(rows) >= 3:
                continue
            rows.append(
                {
                    "name": f"Top Category: {str(category or 'Uncategorized')}",
                    "current": float(amount or 0.0),
                    "format": "currency",
                    "context": f"{int(txns or 0)} transactions in last 30 days",
                }
            )
            grouped[stream] = rows
        for key in ("pub", "bowls", "other"):
            stream_highlights[key] = grouped.get(key, [])
    except Exception:
        _safe_rollback(db)
        stream_highlights = {"pub": [], "bowls": [], "other": []}

    def _stream_amount(stats: dict[str, dict[str, float | int]], stream: str) -> float:
        return float((stats.get(stream) or {}).get("amount", 0.0))

    def _stream_txns(stats: dict[str, dict[str, float | int]], stream: str) -> int:
        return int((stats.get(stream) or {}).get("transactions", 0))

    def _avg_ticket(amount: float, txns: int) -> float:
        return (float(amount) / float(txns)) if int(txns) > 0 else 0.0

    def _delta_ratio(current: float, previous: float) -> float | None:
        prev = float(previous or 0.0)
        cur = float(current or 0.0)
        if prev <= 0:
            return 1.0 if cur > 0 else None
        return (cur - prev) / prev

    yesterday = today - timedelta(days=1)
    month_start = today.replace(day=1)
    prior_month_end = month_start - timedelta(days=1)
    prior_month_start = prior_month_end.replace(day=1)
    ytd_start = date(today.year, 1, 1)
    ytd_days_elapsed = (today - ytd_start).days + 1
    prior_ytd_start = date(today.year - 1, 1, 1)
    prior_ytd_end = prior_ytd_start + timedelta(days=max(0, ytd_days_elapsed - 1))
    prior_ytd_year_end = date(today.year - 1, 12, 31)
    if prior_ytd_end > prior_ytd_year_end:
        prior_ytd_end = prior_ytd_year_end
    bookings_by_status_periods = {
        "day": _booking_status_counts(today, today),
        "week": _booking_status_counts(today - timedelta(days=6), today),
        "month": _booking_status_counts(month_start, today),
        "ytd": _booking_status_counts(ytd_start, today),
    }

    day_stream_stats = today_stream_stats
    prior_day_stream_stats = _stream_amounts_and_transactions(yesterday, yesterday)
    month_stream_stats = _stream_amounts_and_transactions(month_start, today)
    prior_month_stream_stats = _stream_amounts_and_transactions(prior_month_start, prior_month_end)
    ytd_stream_stats = _stream_amounts_and_transactions(ytd_start, today)
    prior_ytd_stream_stats = _stream_amounts_and_transactions(prior_ytd_start, prior_ytd_end)

    def _period_rollup(current_revenue: float, current_txns: int, prior_revenue: float) -> dict[str, float | int | None]:
        return {
            "revenue": float(current_revenue),
            "transactions": int(current_txns),
            "avg_ticket": float(_avg_ticket(current_revenue, current_txns)),
            "vs_prior": _delta_ratio(current_revenue, prior_revenue),
            "prior_revenue": float(prior_revenue),
        }

    golf_paid_day_revenue, golf_paid_day_rounds = _golf_paid_amounts_and_rounds(today, today)
    golf_paid_prior_day_revenue, golf_paid_prior_day_rounds = _golf_paid_amounts_and_rounds(yesterday, yesterday)
    golf_paid_week_revenue, golf_paid_week_rounds = _golf_paid_amounts_and_rounds(today - timedelta(days=6), today)
    golf_paid_prior_week_revenue, golf_paid_prior_week_rounds = _golf_paid_amounts_and_rounds(
        today - timedelta(days=13),
        today - timedelta(days=7),
    )
    golf_paid_month_revenue, golf_paid_month_rounds = _golf_paid_amounts_and_rounds(month_start, today)
    golf_paid_prior_month_revenue, golf_paid_prior_month_rounds = _golf_paid_amounts_and_rounds(
        prior_month_start,
        prior_month_end,
    )
    golf_paid_ytd_revenue, golf_paid_ytd_rounds = _golf_paid_amounts_and_rounds(ytd_start, today)
    golf_paid_prior_ytd_revenue, golf_paid_prior_ytd_rounds = _golf_paid_amounts_and_rounds(
        prior_ytd_start,
        prior_ytd_end,
    )
    pro_shop_day_revenue, pro_shop_day_txns = _pro_shop_sales_amounts_and_transactions(today, today)
    pro_shop_prior_day_revenue, pro_shop_prior_day_txns = _pro_shop_sales_amounts_and_transactions(yesterday, yesterday)
    pro_shop_week_revenue_native, pro_shop_week_txns_native = _pro_shop_sales_amounts_and_transactions(today - timedelta(days=6), today)
    pro_shop_prior_week_revenue, pro_shop_prior_week_txns = _pro_shop_sales_amounts_and_transactions(
        today - timedelta(days=13),
        today - timedelta(days=7),
    )
    pro_shop_month_revenue_native, pro_shop_month_txns_native = _pro_shop_sales_amounts_and_transactions(month_start, today)
    pro_shop_prior_month_revenue, pro_shop_prior_month_txns = _pro_shop_sales_amounts_and_transactions(
        prior_month_start,
        prior_month_end,
    )
    pro_shop_ytd_revenue_native, pro_shop_ytd_txns_native = _pro_shop_sales_amounts_and_transactions(ytd_start, today)
    pro_shop_prior_ytd_revenue, pro_shop_prior_ytd_txns = _pro_shop_sales_amounts_and_transactions(
        prior_ytd_start,
        prior_ytd_end,
    )

    golf_periods = {
        "day": _period_rollup(
            golf_paid_day_revenue + _stream_amount(day_stream_stats, "golf"),
            golf_paid_day_rounds + _stream_txns(day_stream_stats, "golf"),
            golf_paid_prior_day_revenue + _stream_amount(prior_day_stream_stats, "golf"),
        ),
        "week": _period_rollup(
            golf_paid_week_revenue + _stream_amount(week_stream_stats, "golf"),
            golf_paid_week_rounds + _stream_txns(week_stream_stats, "golf"),
            golf_paid_prior_week_revenue + _stream_amount(prior_week_stream_stats, "golf"),
        ),
        "month": _period_rollup(
            golf_paid_month_revenue + _stream_amount(month_stream_stats, "golf"),
            golf_paid_month_rounds + _stream_txns(month_stream_stats, "golf"),
            golf_paid_prior_month_revenue + _stream_amount(prior_month_stream_stats, "golf"),
        ),
        "ytd": _period_rollup(
            golf_paid_ytd_revenue + _stream_amount(ytd_stream_stats, "golf"),
            golf_paid_ytd_rounds + _stream_txns(ytd_stream_stats, "golf"),
            golf_paid_prior_ytd_revenue + _stream_amount(prior_ytd_stream_stats, "golf"),
        ),
    }

    pro_shop_periods = {
        "day": _period_rollup(
            pro_shop_day_revenue,
            pro_shop_day_txns,
            pro_shop_prior_day_revenue,
        ),
        "week": _period_rollup(
            pro_shop_week_revenue_native,
            pro_shop_week_txns_native,
            pro_shop_prior_week_revenue,
        ),
        "month": _period_rollup(
            pro_shop_month_revenue_native,
            pro_shop_month_txns_native,
            pro_shop_prior_month_revenue,
        ),
        "ytd": _period_rollup(
            pro_shop_ytd_revenue_native,
            pro_shop_ytd_txns_native,
            pro_shop_prior_ytd_revenue,
        ),
    }

    other_streams: list[tuple[str, str]] = [("pub", "Pub"), ("bowls", "Bowls"), ("other", "Other")]
    stream_rollups: dict[str, dict] = {
        "golf": {
            "label": "Golf",
            "total_revenue": float(golf_total_revenue),
            "periods": golf_periods,
        },
        "pro_shop": {
            "label": "Pro Shop",
            "total_revenue": float(pro_shop_total_revenue),
            "periods": pro_shop_periods,
        },
    }
    for stream_key, stream_label in other_streams:
        stream_rollups[stream_key] = {
            "label": stream_label,
            "total_revenue": float(other_total_by_stream.get(stream_key, 0.0)),
            "periods": {
                "day": _period_rollup(
                    _stream_amount(day_stream_stats, stream_key),
                    _stream_txns(day_stream_stats, stream_key),
                    _stream_amount(prior_day_stream_stats, stream_key),
                ),
                "week": _period_rollup(
                    _stream_amount(week_stream_stats, stream_key),
                    _stream_txns(week_stream_stats, stream_key),
                    _stream_amount(prior_week_stream_stats, stream_key),
                ),
                "month": _period_rollup(
                    _stream_amount(month_stream_stats, stream_key),
                    _stream_txns(month_stream_stats, stream_key),
                    _stream_amount(prior_month_stream_stats, stream_key),
                ),
                "ytd": _period_rollup(
                    _stream_amount(ytd_stream_stats, stream_key),
                    _stream_txns(ytd_stream_stats, stream_key),
                    _stream_amount(prior_ytd_stream_stats, stream_key),
                ),
            },
        }

    combined_total_revenue = float(sum(float(stream_rollups[k]["total_revenue"]) for k in ["golf", "pro_shop", "pub", "bowls", "other"]))
    combined_periods: dict[str, dict[str, float | int | None]] = {}
    for period_key in ("day", "week", "month", "ytd"):
        combined_revenue = float(sum(float(stream_rollups[k]["periods"][period_key]["revenue"]) for k in ["golf", "pro_shop", "pub", "bowls", "other"]))
        combined_txns = int(sum(int(stream_rollups[k]["periods"][period_key]["transactions"]) for k in ["golf", "pro_shop", "pub", "bowls", "other"]))
        combined_prior_revenue = float(
            sum(float(stream_rollups[k]["periods"][period_key]["prior_revenue"]) for k in ["golf", "pro_shop", "pub", "bowls", "other"])
        )
        combined_periods[period_key] = _period_rollup(combined_revenue, combined_txns, combined_prior_revenue)

    stream_rollups["all"] = {
        "label": "All Operations",
        "total_revenue": float(combined_total_revenue),
        "periods": combined_periods,
    }

    golf_today_revenue = float(stream_rollups["golf"]["periods"]["day"]["revenue"])
    golf_week_revenue = float(stream_rollups["golf"]["periods"]["week"]["revenue"])
    golf_today_transactions = int(stream_rollups["golf"]["periods"]["day"]["transactions"])
    golf_week_transactions = int(stream_rollups["golf"]["periods"]["week"]["transactions"])
    golf_week_vs_prior = stream_rollups["golf"]["periods"]["week"]["vs_prior"]
    golf_avg_ticket_7d = float(stream_rollups["golf"]["periods"]["week"]["avg_ticket"])

    pro_shop_today_revenue = float(stream_rollups["pro_shop"]["periods"]["day"]["revenue"])
    pro_shop_week_revenue = float(stream_rollups["pro_shop"]["periods"]["week"]["revenue"])
    pro_shop_today_transactions = int(stream_rollups["pro_shop"]["periods"]["day"]["transactions"])
    pro_shop_week_transactions = int(stream_rollups["pro_shop"]["periods"]["week"]["transactions"])
    pro_shop_week_vs_prior = stream_rollups["pro_shop"]["periods"]["week"]["vs_prior"]
    pro_shop_avg_ticket_7d = float(stream_rollups["pro_shop"]["periods"]["week"]["avg_ticket"])

    other_total_revenue = float(sum(float(stream_rollups[k]["total_revenue"]) for k, _ in other_streams))
    today_other_revenue = float(sum(float(stream_rollups[k]["periods"]["day"]["revenue"]) for k, _ in other_streams))
    week_other_revenue = float(sum(float(stream_rollups[k]["periods"]["week"]["revenue"]) for k, _ in other_streams))

    combined_today_revenue = float(stream_rollups["all"]["periods"]["day"]["revenue"])
    combined_week_revenue = float(stream_rollups["all"]["periods"]["week"]["revenue"])
    combined_today_transactions = int(stream_rollups["all"]["periods"]["day"]["transactions"])
    combined_week_transactions = int(stream_rollups["all"]["periods"]["week"]["transactions"])
    combined_week_vs_prior = stream_rollups["all"]["periods"]["week"]["vs_prior"]
    combined_avg_ticket_7d = float(stream_rollups["all"]["periods"]["week"]["avg_ticket"])

    golf_today_occupancy_rate = (
        float(golf_today_slot_booked) / float(golf_today_slot_capacity)
        if float(golf_today_slot_capacity) > 0
        else 0.0
    )
    golf_no_show_rate_today = (
        float(golf_today_no_shows) / float(golf_today_paid_rounds + golf_today_no_shows)
        if int(golf_today_paid_rounds + golf_today_no_shows) > 0
        else 0.0
    )
    golf_revenue_per_paid_round = (
        float(golf_today_revenue) / float(golf_today_paid_rounds)
        if int(golf_today_paid_rounds) > 0
        else 0.0
    )
    pro_shop_low_stock_rate = (
        float(pro_shop_low_stock_items) / float(pro_shop_active_products)
        if int(pro_shop_active_products) > 0
        else 0.0
    )

    revenue_streams: dict[str, dict] = {}
    for stream_key in ("all", "golf", "pro_shop", "pub", "bowls", "other"):
        stream_data = stream_rollups[stream_key]
        periods_payload: dict[str, dict[str, float | int | None]] = {}
        for period_key in ("day", "week", "month", "ytd"):
            period_data = stream_data["periods"][period_key]
            periods_payload[period_key] = {
                "revenue": float(period_data["revenue"]),
                "transactions": int(period_data["transactions"]),
                "avg_ticket": float(period_data["avg_ticket"]),
                "vs_prior": period_data["vs_prior"],
                "prior_revenue": float(period_data["prior_revenue"]),
            }

        revenue_streams[stream_key] = {
            "label": str(stream_data["label"]),
            "total_revenue": float(stream_data["total_revenue"]),
            "today_revenue": float(periods_payload["day"]["revenue"]),
            "week_revenue": float(periods_payload["week"]["revenue"]),
            "month_revenue": float(periods_payload["month"]["revenue"]),
            "ytd_revenue": float(periods_payload["ytd"]["revenue"]),
            "today_transactions": int(periods_payload["day"]["transactions"]),
            "week_transactions": int(periods_payload["week"]["transactions"]),
            "month_transactions": int(periods_payload["month"]["transactions"]),
            "ytd_transactions": int(periods_payload["ytd"]["transactions"]),
            "avg_ticket_week": float(periods_payload["week"]["avg_ticket"]),
            "avg_ticket_month": float(periods_payload["month"]["avg_ticket"]),
            "avg_ticket_ytd": float(periods_payload["ytd"]["avg_ticket"]),
            "day_vs_prior_day": periods_payload["day"]["vs_prior"],
            "week_vs_prior_week": periods_payload["week"]["vs_prior"],
            "month_vs_prior_month": periods_payload["month"]["vs_prior"],
            "ytd_vs_prior_ytd": periods_payload["ytd"]["vs_prior"],
            "periods": periods_payload,
        }

    def _stream_mix(amt: float) -> float:
        return (float(amt) / float(combined_today_revenue)) if float(combined_today_revenue) > 0 else 0.0

    all_highlights: list[dict[str, float | int | str | None]] = [
        {
            "name": "Golf Revenue Mix (Today)",
            "current": _stream_mix(golf_today_revenue),
            "format": "percent",
            "context": f"{golf_today_transactions} transactions | R{golf_today_revenue:.2f}",
        },
        {
            "name": "Pro Shop Revenue Mix (Today)",
            "current": _stream_mix(pro_shop_today_revenue),
            "format": "percent",
            "context": f"{pro_shop_today_transactions} transactions | R{pro_shop_today_revenue:.2f}",
        },
    ]
    for stream_key, stream_label in other_streams:
        stream_day = stream_rollups[stream_key]["periods"]["day"]
        all_highlights.append(
            {
                "name": f"{stream_label} Revenue Mix (Today)",
                "current": _stream_mix(float(stream_day["revenue"])),
                "format": "percent",
                "context": f"{int(stream_day['transactions'])} transactions | R{float(stream_day['revenue']):.2f}",
            }
        )

    pro_shop_highlights: list[dict[str, float | int | str | None]] = [
        {
            "name": "Avg Basket (30d)",
            "current": float(pro_shop_avg_basket_30d),
            "format": "currency",
            "context": f"{int(pro_shop_txns_7d)} POS transactions in last 7 days",
        },
        {
            "name": "Inventory Value",
            "current": float(pro_shop_stock_value),
            "format": "currency",
            "context": f"{int(pro_shop_stock_units)} units on hand",
        },
        {
            "name": "Days of Cover",
            "current": float(pro_shop_days_of_cover) if pro_shop_days_of_cover is not None else 0.0,
            "format": "number",
            "context": (
                "Based on 30-day unit velocity"
                if pro_shop_days_of_cover is not None
                else "Insufficient 30-day sales history"
            ),
        },
    ]
    for row in pro_shop_top_sellers[:3]:
        pro_shop_highlights.append(
            {
                "name": f"Top Seller: {str(row['name'])}",
                "current": float(row["revenue"]),
                "format": "currency",
                "context": f"{int(row['units'])} units in last 30 days",
            }
        )

    operation_insights = {
        "all": {
            "cards": [
                {"label": "Revenue Today", "value": float(combined_today_revenue), "format": "currency"},
                {"label": "Transactions Today", "value": int(combined_today_transactions), "format": "number"},
                {"label": "Avg Ticket (7d)", "value": float(combined_avg_ticket_7d), "format": "currency"},
                {"label": "7d vs Prior 7d", "value": combined_week_vs_prior, "format": "percent"},
            ],
            "note": "Executive view across golf, native pro shop POS sales, and imported non-pro-shop revenue. Switch streams above for operational detail.",
            "highlights": all_highlights,
        },
        "golf": {
            "cards": [
                {"label": "Tee Occupancy Today", "value": float(golf_today_occupancy_rate), "format": "percent"},
                {"label": "Paid Rounds Today", "value": int(golf_today_paid_rounds), "format": "number"},
                {"label": "Revenue / Paid Round", "value": float(golf_revenue_per_paid_round), "format": "currency"},
                {"label": "No-show Rate Today", "value": float(golf_no_show_rate_today), "format": "percent"},
            ],
            "note": "Golf dashboard tracks utilization, conversion to paid rounds, and no-show leakage.",
            "highlights": [
                {
                    "name": "Booked Slots Today",
                    "current": int(golf_today_slot_booked),
                    "format": "number",
                    "context": f"{int(golf_today_slot_capacity)} total slot capacity",
                },
                {
                    "name": "Revenue 7d",
                    "current": float(golf_week_revenue),
                    "format": "currency",
                    "context": (
                        f"{golf_week_transactions} transactions | trend {(golf_week_vs_prior or 0.0):+.0%}"
                        if golf_week_vs_prior is not None
                        else f"{golf_week_transactions} transactions | no prior-week baseline"
                    ),
                },
                {
                    "name": "No-shows Today",
                    "current": int(golf_today_no_shows),
                    "format": "number",
                    "context": f"{golf_today_paid_rounds + golf_today_no_shows} attended + no-show records",
                },
            ],
        },
        "pro_shop": {
            "cards": [
                {"label": "Sales Today", "value": float(pro_shop_today_revenue), "format": "currency"},
                {"label": "Transactions Today", "value": int(pro_shop_today_transactions), "format": "number"},
                {"label": "Avg Basket (7d)", "value": float(pro_shop_avg_ticket_7d), "format": "currency"},
                {"label": "Low-stock Rate", "value": float(pro_shop_low_stock_rate), "format": "percent"},
            ],
            "note": "Pro shop dashboard tracks POS throughput, basket value, and stock risk.",
            "highlights": pro_shop_highlights,
            "inventory": {
                "active_products": int(pro_shop_active_products),
                "stock_units": int(pro_shop_stock_units),
                "stock_value": float(pro_shop_stock_value),
                "low_stock_items": int(pro_shop_low_stock_items),
                "low_stock_rate": float(pro_shop_low_stock_rate),
                "transactions_7d": int(pro_shop_week_transactions),
                "transactions_7d_pos": int(pro_shop_txns_7d),
                "transactions_today_pos": int(pro_shop_txns_today),
                "avg_basket_30d": float(pro_shop_avg_basket_30d),
                "units_sold_30d": int(pro_shop_units_sold_30d),
                "days_of_cover": float(pro_shop_days_of_cover) if pro_shop_days_of_cover is not None else None,
                "week_vs_prior_week": pro_shop_week_vs_prior,
            },
        },
    }

    for stream_key, stream_label in other_streams:
        stream_day = stream_rollups[stream_key]["periods"]["day"]
        stream_week = stream_rollups[stream_key]["periods"]["week"]
        stream_today_amount = float(stream_day["revenue"])
        stream_week_amount = float(stream_week["revenue"])
        stream_today_txns = int(stream_day["transactions"])
        stream_week_txns = int(stream_week["transactions"])
        stream_avg_ticket_week = float(stream_week["avg_ticket"])
        stream_week_vs_prior = stream_week["vs_prior"]

        operation_insights[stream_key] = {
            "cards": [
                {"label": f"{stream_label} Revenue Today", "value": stream_today_amount, "format": "currency"},
                {"label": "Transactions Today", "value": stream_today_txns, "format": "number"},
                {"label": "Avg Ticket (7d)", "value": stream_avg_ticket_week, "format": "currency"},
                {"label": "7d vs Prior 7d", "value": stream_week_vs_prior, "format": "percent"},
            ],
            "note": f"{stream_label} dashboard tracks revenue pace, ticket quality, and 7-day trend versus prior week.",
            "highlights": (
                stream_highlights.get(stream_key, [])
                or [
                    {
                        "name": "Revenue 7d",
                        "current": stream_week_amount,
                        "format": "currency",
                        "context": f"{stream_week_txns} transactions",
                    }
                ]
            ),
        }

    ai_no_show: dict[str, Any] = {
        "window_days": 7,
        "upcoming_bookings": 0,
        "high_risk_next_72h": 0,
        "medium_risk_next_72h": 0,
        "predictions": [],
        "recommendations": [],
    }

    ai_revenue_integrity: dict[str, Any] = {
        "status": "healthy",
        "health_score": 100,
        "alerts": [],
        "period_alignment": [],
        "window_days": 30,
        "metrics": {},
        "recommendations": [],
    }

    ai_import_copilot: dict[str, Any] = {
        "summary": {
            "configured_streams": 0,
            "total_streams": 5,
            "stale_streams": 0,
            "high_failure_streams": 0,
        },
        "streams": [],
        "freshness": {},
        "recommendations": [],
    }

    # Lightweight no-show risk model (rule-based; no external AI/API costs).
    try:
        risk_window_days = 7
        risk_window_end = now_utc + timedelta(days=risk_window_days)
        high_risk_window_end = now_utc + timedelta(hours=72)
        upcoming_rows = (
            db.query(Booking, TeeTime)
            .join(TeeTime, Booking.tee_time_id == TeeTime.id)
            .filter(
                Booking.club_id == club_id,
                TeeTime.club_id == club_id,
                Booking.status == BookingStatus.booked,
                TeeTime.tee_time >= now_utc,
                TeeTime.tee_time <= risk_window_end,
            )
            .order_by(TeeTime.tee_time.asc(), Booking.id.asc())
            .limit(250)
            .all()
        )

        player_keys: set[str] = set()
        upcoming_entries: list[tuple[Booking, TeeTime, str]] = []
        for booking_row, tee_row in upcoming_rows:
            player_key = (
                str(getattr(booking_row, "player_email", "") or "").strip().lower()
                or str(getattr(booking_row, "player_name", "") or "").strip().lower()
            )
            if not player_key:
                continue
            player_keys.add(player_key)
            upcoming_entries.append((booking_row, tee_row, player_key))

        history_by_player: dict[str, dict[str, int]] = {}
        if player_keys:
            player_key_expr = func.coalesce(
                func.nullif(func.lower(Booking.player_email), ""),
                func.lower(cast(Booking.player_name, String)),
            )
            history_rows = (
                db.query(
                    player_key_expr.label("player_key"),
                    func.count(Booking.id).label("total_bookings"),
                    func.sum(case((Booking.status == BookingStatus.no_show, 1), else_=0)).label("no_show_count"),
                    func.sum(case((Booking.status == BookingStatus.cancelled, 1), else_=0)).label("cancelled_count"),
                )
                .join(TeeTime, Booking.tee_time_id == TeeTime.id)
                .filter(
                    Booking.club_id == club_id,
                    TeeTime.club_id == club_id,
                    TeeTime.tee_time < now_utc,
                    player_key_expr.in_(list(player_keys)),
                )
                .group_by(player_key_expr)
                .all()
            )
            for player_key, total_bookings_hist, no_show_hist, cancelled_hist in history_rows:
                key = str(player_key or "").strip().lower()
                if not key:
                    continue
                history_by_player[key] = {
                    "total_bookings": int(total_bookings_hist or 0),
                    "no_show_count": int(no_show_hist or 0),
                    "cancelled_count": int(cancelled_hist or 0),
                }

        predictions: list[dict[str, Any]] = []
        high_risk_72h = 0
        medium_risk_72h = 0
        for booking_row, tee_row, player_key in upcoming_entries:
            history = history_by_player.get(
                player_key,
                {"total_bookings": 0, "no_show_count": 0, "cancelled_count": 0},
            )
            history_total = int(history.get("total_bookings") or 0)
            history_no_show = int(history.get("no_show_count") or 0)
            history_cancelled = int(history.get("cancelled_count") or 0)
            no_show_rate = (float(history_no_show) / float(history_total)) if history_total > 0 else 0.0
            cancel_rate = (float(history_cancelled) / float(history_total)) if history_total > 0 else 0.0

            created_at = getattr(booking_row, "created_at", None) or now_utc
            tee_dt = getattr(tee_row, "tee_time", None) or now_utc
            lead_hours = max(0.0, (tee_dt - created_at).total_seconds() / 3600.0)

            score = 0.08
            reasons: list[str] = []
            if history_total < 3:
                score += 0.12
                reasons.append("Limited history")
            if no_show_rate > 0:
                score += min(0.45, no_show_rate * 0.70)
                reasons.append(f"Prior no-show rate {no_show_rate:.0%}")
            if cancel_rate >= 0.25:
                score += min(0.15, cancel_rate * 0.30)
                reasons.append(f"Cancellation rate {cancel_rate:.0%}")
            if lead_hours < 6:
                score += 0.22
                reasons.append("Short lead time (<6h)")
            elif lead_hours < 24:
                score += 0.12
                reasons.append("Short lead time (<24h)")
            elif lead_hours >= 24 * 14:
                score += 0.06
                reasons.append("Long lead time (>14d)")
            if getattr(booking_row, "member_id", None) is None:
                score += 0.08
                reasons.append("Guest booking")
            source_value = str(getattr(getattr(booking_row, "source", None), "value", getattr(booking_row, "source", "")) or "").strip().lower()
            if source_value == "external":
                score += 0.06
                reasons.append("External mirror booking")
            if int(getattr(booking_row, "party_size", 1) or 1) >= 3:
                score += 0.06
                reasons.append("Large party size")

            score = max(0.02, min(0.95, score))
            risk_level = "high" if score >= 0.65 else ("medium" if score >= 0.40 else "low")
            if tee_dt <= high_risk_window_end:
                if risk_level == "high":
                    high_risk_72h += 1
                elif risk_level == "medium":
                    medium_risk_72h += 1

            predictions.append(
                {
                    "booking_id": int(getattr(booking_row, "id", 0) or 0),
                    "player_name": str(getattr(booking_row, "player_name", "") or "Player"),
                    "player_email": str(getattr(booking_row, "player_email", "") or ""),
                    "tee_time": tee_dt.isoformat() if tee_dt else None,
                    "tee": str(getattr(tee_row, "hole", "") or "1"),
                    "risk_level": risk_level,
                    "risk_score": float(round(score, 4)),
                    "lead_hours": float(round(lead_hours, 1)),
                    "history": {
                        "total_bookings": history_total,
                        "no_show_count": history_no_show,
                        "cancelled_count": history_cancelled,
                        "no_show_rate": float(round(no_show_rate, 4)),
                    },
                    "reasons": reasons[:4],
                }
            )

        predictions.sort(key=lambda r: (-float(r.get("risk_score") or 0.0), str(r.get("tee_time") or "")))
        recommendations: list[str] = []
        if high_risk_72h > 0:
            recommendations.append(
                f"Send confirmation reminders and deposit prompts for {high_risk_72h} high-risk booking(s) in next 72h."
            )
        if medium_risk_72h >= 3:
            recommendations.append(
                "Queue medium-risk bookings for automated reconfirmation messages 24h before tee-off."
            )
        if not recommendations:
            recommendations.append("No immediate no-show intervention required in the next 72 hours.")

        ai_no_show = {
            "window_days": risk_window_days,
            "upcoming_bookings": int(len(upcoming_entries)),
            "high_risk_next_72h": int(high_risk_72h),
            "medium_risk_next_72h": int(medium_risk_72h),
            "predictions": predictions[:8],
            "recommendations": recommendations,
        }
    except Exception:
        _safe_rollback(db)

    # Revenue integrity monitor (ledger vs booking-status and settlement consistency).
    try:
        alignment_rows: list[dict[str, Any]] = []
        period_specs = [
            ("day", "Daily", int(golf_paid_day_rounds)),
            ("week", "Weekly", int(golf_paid_week_rounds)),
            ("month", "Monthly", int(golf_paid_month_rounds)),
            ("ytd", "YTD", int(golf_paid_ytd_rounds)),
        ]
        for period_key, period_label, ledger_paid_rounds in period_specs:
            status_row = bookings_by_status_periods.get(period_key, {}) or {}
            status_paid_rounds = int(status_row.get("checked_in", 0)) + int(status_row.get("completed", 0))
            delta = int(ledger_paid_rounds) - int(status_paid_rounds)
            delta_abs = abs(delta)
            delta_pct = (float(delta_abs) / float(max(1, status_paid_rounds)))
            if delta_abs >= 20 and delta_pct >= 0.20:
                severity = "high"
            elif delta_abs >= 8 and delta_pct >= 0.12:
                severity = "medium"
            elif delta_abs >= 3 and delta_pct >= 0.08:
                severity = "low"
            else:
                severity = "ok"
            note = (
                "Ledger paid rounds exceed tee-time status paid rounds (prepayments/timing shift likely)."
                if delta > 0
                else (
                    "Tee-time status paid rounds exceed ledger paid rounds (payment capture lag possible)."
                    if delta < 0
                    else "Ledger and tee-time status paid rounds are aligned."
                )
            )
            alignment_rows.append(
                {
                    "period_key": period_key,
                    "period_label": period_label,
                    "ledger_paid_rounds": int(ledger_paid_rounds),
                    "status_paid_rounds": int(status_paid_rounds),
                    "delta_rounds": int(delta),
                    "delta_pct": float(round(delta_pct, 4)),
                    "severity": severity,
                    "note": note,
                }
            )

        integrity_window_days = 30
        integrity_start = today - timedelta(days=integrity_window_days - 1)
        integrity_start_dt = datetime.combine(integrity_start, Time.min)
        ledger_counts_sq = (
            db.query(
                LedgerEntry.booking_id.label("booking_id"),
                func.count(LedgerEntry.id).label("payment_count"),
                func.sum(LedgerEntry.amount).label("paid_amount"),
            )
            .filter(
                LedgerEntry.club_id == club_id,
                LedgerEntry.booking_id.isnot(None),
            )
            .group_by(LedgerEntry.booking_id)
            .subquery()
        )

        unpaid_attended_row = (
            db.query(
                func.count(Booking.id).label("count"),
                func.coalesce(func.sum(Booking.price), 0.0).label("amount"),
            )
            .join(TeeTime, Booking.tee_time_id == TeeTime.id)
            .outerjoin(ledger_counts_sq, ledger_counts_sq.c.booking_id == Booking.id)
            .filter(
                Booking.club_id == club_id,
                TeeTime.club_id == club_id,
                Booking.status.in_(paid_statuses),
                TeeTime.tee_time >= integrity_start_dt,
                func.coalesce(ledger_counts_sq.c.payment_count, 0) == 0,
            )
            .first()
        )
        unpaid_attended_count = int(getattr(unpaid_attended_row, "count", 0) or 0)
        unpaid_attended_amount = float(getattr(unpaid_attended_row, "amount", 0.0) or 0.0)

        paid_without_attendance_row = (
            db.query(
                func.count(LedgerEntry.id).label("count"),
                func.coalesce(func.sum(LedgerEntry.amount), 0.0).label("amount"),
            )
            .join(Booking, Booking.id == LedgerEntry.booking_id)
            .filter(
                LedgerEntry.club_id == club_id,
                Booking.club_id == club_id,
                LedgerEntry.created_at >= integrity_start_dt,
                ~Booking.status.in_(paid_statuses),
            )
            .first()
        )
        paid_without_attendance_count = int(getattr(paid_without_attendance_row, "count", 0) or 0)
        paid_without_attendance_amount = float(getattr(paid_without_attendance_row, "amount", 0.0) or 0.0)

        future_paid_row = (
            db.query(
                func.count(LedgerEntry.id).label("count"),
                func.coalesce(func.sum(LedgerEntry.amount), 0.0).label("amount"),
            )
            .join(Booking, Booking.id == LedgerEntry.booking_id)
            .join(TeeTime, TeeTime.id == Booking.tee_time_id)
            .filter(
                LedgerEntry.club_id == club_id,
                Booking.club_id == club_id,
                TeeTime.club_id == club_id,
                LedgerEntry.created_at >= integrity_start_dt,
                TeeTime.tee_time > (now_utc + timedelta(days=1)),
                Booking.status.in_([BookingStatus.booked, BookingStatus.checked_in, BookingStatus.completed]),
            )
            .first()
        )
        future_paid_count = int(getattr(future_paid_row, "count", 0) or 0)
        future_paid_amount = float(getattr(future_paid_row, "amount", 0.0) or 0.0)

        alerts: list[dict[str, Any]] = []
        for row in alignment_rows:
            severity = str(row.get("severity") or "ok")
            if severity == "ok":
                continue
            alerts.append(
                {
                    "scope": "period_alignment",
                    "severity": severity,
                    "title": f"{row.get('period_label')} paid-round variance",
                    "detail": (
                        f"Ledger {int(row.get('ledger_paid_rounds', 0))} vs "
                        f"status {int(row.get('status_paid_rounds', 0))} "
                        f"(delta {int(row.get('delta_rounds', 0)):+d})."
                    ),
                    "context": str(row.get("note") or ""),
                }
            )

        if unpaid_attended_count > 0:
            alerts.append(
                {
                    "scope": "settlement_gap",
                    "severity": "high" if unpaid_attended_count >= 8 else "medium",
                    "title": "Attended rounds without payment",
                    "detail": (
                        f"{unpaid_attended_count} checked-in/completed booking(s) in last {integrity_window_days} days "
                        f"have no linked ledger payment."
                    ),
                    "context": f"Approx value at risk: R{unpaid_attended_amount:.2f}",
                }
            )

        if paid_without_attendance_count > 0:
            alerts.append(
                {
                    "scope": "status_gap",
                    "severity": "medium",
                    "title": "Payments linked to non-paid statuses",
                    "detail": (
                        f"{paid_without_attendance_count} ledger payment(s) in last {integrity_window_days} days "
                        f"are linked to bookings not marked checked-in/completed."
                    ),
                    "context": f"Value to verify: R{paid_without_attendance_amount:.2f}",
                }
            )

        if future_paid_count >= 10:
            alerts.append(
                {
                    "scope": "prepayment_pipeline",
                    "severity": "low",
                    "title": "High future prepayment pipeline",
                    "detail": (
                        f"{future_paid_count} payment(s) are posted for tee times more than one day ahead."
                    ),
                    "context": f"Pipeline value: R{future_paid_amount:.2f}",
                }
            )

        if unresolved_pricing_count > 0:
            alerts.append(
                {
                    "scope": "pricing_gap",
                    "severity": "medium" if unresolved_pricing_count >= 25 else "low",
                    "title": "Bookings with unresolved pricing",
                    "detail": (
                        f"{unresolved_pricing_count} booking(s) in the current dashboard year still have no resolved price."
                    ),
                    "context": "Dashboard is read-only and no longer repairs booking pricing in-request.",
                }
            )

        severity_penalty = {"high": 24, "medium": 12, "low": 5}
        health_score = 100
        for alert in alerts:
            health_score -= int(severity_penalty.get(str(alert.get("severity") or "low"), 5))
        health_score = max(0, min(100, int(health_score)))

        status = "healthy"
        if any(str(a.get("severity")) == "high" for a in alerts) or health_score < 65:
            status = "critical"
        elif alerts or health_score < 82:
            status = "warning"

        recommendations: list[str] = []
        if unpaid_attended_count > 0:
            recommendations.append("Settle checked-in/completed bookings missing ledger payments.")
        if paid_without_attendance_count > 0:
            recommendations.append("Align booking statuses with posted payments before closeout.")
        if any(str(r.get("severity")) in {"high", "medium"} for r in alignment_rows):
            recommendations.append("Review prepayment timing so dashboard periods compare like-for-like.")
        if unresolved_pricing_count > 0:
            recommendations.append("Review unresolved booking pricing through explicit pricing/booking maintenance flows.")
        if not recommendations:
            recommendations.append("Revenue integrity checks are stable for the current data window.")

        ai_revenue_integrity = {
            "status": status,
            "health_score": int(health_score),
            "alerts": alerts[:8],
            "period_alignment": alignment_rows,
            "window_days": integrity_window_days,
            "metrics": {
                "unpaid_attended_count": unpaid_attended_count,
                "unpaid_attended_amount": float(unpaid_attended_amount),
                "paid_without_attendance_count": paid_without_attendance_count,
                "paid_without_attendance_amount": float(paid_without_attendance_amount),
                "future_prepaid_count": future_paid_count,
                "future_prepaid_amount": float(future_paid_amount),
                "unresolved_pricing_count": unresolved_pricing_count,
            },
            "recommendations": recommendations,
        }
    except Exception:
        _safe_rollback(db)

    # Import copilot (mapping + freshness + failure-rate guidance).
    try:
        stream_defs = [
            ("golf", "Golf"),
            ("pro_shop", "Pro Shop"),
            ("pub", "Pub"),
            ("bowls", "Bowls"),
            ("other", "Other"),
        ]

        settings_rows = (
            db.query(ClubSetting.key, ClubSetting.value)
            .filter(
                ClubSetting.club_id == club_id,
                ClubSetting.key.like("revenue_import_settings:%"),
            )
            .all()
        )
        settings_by_stream: dict[str, dict[str, Any]] = {}
        for key, value in settings_rows:
            raw_key = str(key or "")
            stream_key = raw_key.split(":", 1)[1].strip().lower() if ":" in raw_key else ""
            if not stream_key:
                continue
            parsed: dict[str, Any] = {}
            try:
                parsed = json.loads(value or "{}")
            except Exception:
                parsed = {}
            settings_by_stream[stream_key] = parsed

        imports_60d = (
            db.query(ImportBatch)
            .filter(
                ImportBatch.club_id == club_id,
                ImportBatch.imported_at >= (now_utc - timedelta(days=60)),
            )
            .order_by(desc(ImportBatch.imported_at))
            .all()
        )
        imports_30d_cutoff = now_utc - timedelta(days=30)
        stream_health: list[dict[str, Any]] = []
        recommendations: list[str] = []
        configured_streams = 0
        stale_streams = 0
        high_failure_streams = 0

        for stream_key, stream_label in stream_defs:
            settings = settings_by_stream.get(stream_key) or {}
            has_date = bool(str(settings.get("date_field") or "").strip())
            has_amount = bool(str(settings.get("amount_field") or "").strip())
            configured = has_date and has_amount
            if configured:
                configured_streams += 1

            stream_batches = [
                b
                for b in imports_60d
                if str(getattr(b, "kind", "") or "").strip().lower() == "revenue"
                and _normalize_revenue_stream(getattr(b, "source", None)) == stream_key
            ]
            last_import = next(
                (b.imported_at for b in stream_batches if getattr(b, "imported_at", None) is not None),
                None,
            )
            days_since = (today - last_import.date()).days if last_import else None

            rows_total_30d = 0
            rows_failed_30d = 0
            for batch in stream_batches:
                imported_at = getattr(batch, "imported_at", None)
                if imported_at is None or imported_at < imports_30d_cutoff:
                    continue
                rows_total_30d += int(getattr(batch, "rows_total", 0) or 0)
                rows_failed_30d += int(getattr(batch, "rows_failed", 0) or 0)
            failure_rate = (float(rows_failed_30d) / float(rows_total_30d)) if rows_total_30d > 0 else 0.0

            health = "healthy"
            recommendation = "No action needed."
            if not configured:
                health = "critical"
                recommendation = "Save date/amount mapping in Operations Config."
                recommendations.append(f"{stream_label}: save import settings before next file upload.")
            elif rows_total_30d >= 20 and failure_rate >= 0.08:
                health = "critical"
                recommendation = "High fail-rate; review column mapping and tax settings."
                high_failure_streams += 1
                recommendations.append(f"{stream_label}: review mapping (30d fail rate {failure_rate:.0%}).")
            elif rows_total_30d >= 10 and failure_rate >= 0.03:
                health = "warning"
                recommendation = "Moderate fail-rate; validate CSV schema before import."
            elif days_since is None:
                health = "warning"
                recommendation = "No recent imports detected."
                stale_streams += 1
                recommendations.append(f"{stream_label}: no imports found in last 60 days.")
            elif days_since > 14:
                health = "warning"
                recommendation = "Import is stale (>14 days)."
                stale_streams += 1
                recommendations.append(f"{stream_label}: import is stale ({days_since} days).")

            stream_health.append(
                {
                    "stream": stream_key,
                    "label": stream_label,
                    "configured": configured,
                    "health": health,
                    "last_import_at": last_import.isoformat() if last_import else None,
                    "days_since_import": int(days_since) if days_since is not None else None,
                    "rows_total_30d": int(rows_total_30d),
                    "rows_failed_30d": int(rows_failed_30d),
                    "failure_rate_30d": float(round(failure_rate, 4)),
                    "recommendation": recommendation,
                }
            )

        last_bookings_batch = (
            db.query(ImportBatch)
            .filter(ImportBatch.club_id == club_id, ImportBatch.kind == "bookings")
            .order_by(desc(ImportBatch.imported_at))
            .first()
        )
        last_members_batch = (
            db.query(ImportBatch)
            .filter(ImportBatch.club_id == club_id, ImportBatch.kind == "members")
            .order_by(desc(ImportBatch.imported_at))
            .first()
        )

        def _freshness_payload(batch: ImportBatch | None) -> dict[str, Any]:
            if not batch or not getattr(batch, "imported_at", None):
                return {"imported_at": None, "days_since": None}
            imported_at = batch.imported_at
            return {
                "imported_at": imported_at.isoformat(),
                "days_since": int((today - imported_at.date()).days),
            }

        freshness = {
            "bookings": _freshness_payload(last_bookings_batch),
            "members": _freshness_payload(last_members_batch),
        }
        if freshness["bookings"]["days_since"] is not None and int(freshness["bookings"]["days_since"]) > 2:
            recommendations.append(
                f"Bookings mirror import is {freshness['bookings']['days_since']} days old; run mirror sync."
            )

        if freshness["members"]["days_since"] is not None and int(freshness["members"]["days_since"]) > 30:
            recommendations.append(
                f"Members import is {freshness['members']['days_since']} days old; refresh directory."
            )

        deduped_recommendations: list[str] = []
        for rec in recommendations:
            if rec not in deduped_recommendations:
                deduped_recommendations.append(rec)

        ai_import_copilot = {
            "summary": {
                "configured_streams": int(configured_streams),
                "total_streams": int(len(stream_defs)),
                "stale_streams": int(stale_streams),
                "high_failure_streams": int(high_failure_streams),
            },
            "streams": stream_health,
            "freshness": freshness,
            "recommendations": (
                deduped_recommendations[:6]
                if deduped_recommendations
                else ["Import profiles are configured and recent files are healthy."]
            ),
        }
    except Exception:
        _safe_rollback(db)
    
    # KPI targets vs actuals (Day/WTD/MTD/YTD)
    anchor = datetime.utcnow().date()
    year = int(anchor.year)
    # NOTE: For accounting, the transaction date is when the booking is marked paid/checked-in
    # (ledger_entries.created_at), not the tee time date.

    # Default targets (can be overridden via kpi_targets table):
    # - Rounds: 35,000/year (client target)
    # - Revenue: derived from rounds target * member 18-hole rate unless explicitly set
    target_model = get_target_model_payload(db, year=year)
    annual_rounds_target = target_model.get("rounds_target")
    annual_revenue_target = target_model.get("revenue_target")

    def _paid_window_actuals(start_d: date, end_d: date) -> tuple[float, int]:
        start_dt, end_dt = _date_bounds(start_d, end_d)
        revenue = (
            db.query(func.sum(LedgerEntry.amount))
            .filter(
                LedgerEntry.booking_id.isnot(None),
                LedgerEntry.club_id == club_id,
                LedgerEntry.created_at >= start_dt,
                LedgerEntry.created_at < end_dt,
            )
            .scalar()
            or 0.0
        )
        rounds = (
            db.query(func.count(LedgerEntry.id))
            .filter(
                LedgerEntry.booking_id.isnot(None),
                LedgerEntry.club_id == club_id,
                LedgerEntry.created_at >= start_dt,
                LedgerEntry.created_at < end_dt,
            )
            .scalar()
            or 0
        )
        return float(revenue), int(rounds)

    kpis = {}
    for period_key in ["day", "wtd", "mtd", "ytd"]:
        start_d, end_d, elapsed_days = _period_window(period_key, anchor)
        actual_revenue, actual_rounds = _paid_window_actuals(start_d, end_d)
        kpis[period_key] = {
            "start_date": start_d.isoformat(),
            "end_date": end_d.isoformat(),
            "days": int(elapsed_days),
            "revenue_actual": float(actual_revenue),
            "revenue_target": _derive_target(annual_revenue_target, year, elapsed_days),
            "rounds_actual": int(actual_rounds),
            "rounds_target": _derive_target(annual_rounds_target, year, elapsed_days),
        }

    golf_day_total = (
        db.query(func.sum(GolfDayBooking.amount))
        .filter(GolfDayBooking.club_id == club_id)
        .scalar()
        or 0.0
    )
    golf_day_outstanding = (
        db.query(func.sum(GolfDayBooking.balance_due))
        .filter(
            GolfDayBooking.club_id == club_id,
            func.coalesce(GolfDayBooking.payment_status, "pending") != "paid",
        )
        .scalar()
        or 0.0
    )
    golf_day_open_count = (
        db.query(func.count(GolfDayBooking.id))
        .filter(
            GolfDayBooking.club_id == club_id,
            func.coalesce(GolfDayBooking.payment_status, "pending").in_(["pending", "partial"]),
        )
        .scalar()
        or 0
    )
    account_customer_count = (
        db.query(func.count(AccountCustomer.id))
        .filter(AccountCustomer.club_id == club_id, AccountCustomer.active == 1)
        .scalar()
        or 0
    )

    payload = {
        "total_bookings": total_bookings,
        "total_players": total_players,
        "total_members": total_members,
        "account_customers_active": int(account_customer_count),
        "golf_revenue_total": float(golf_total_revenue),
        "golf_revenue_today": float(golf_today_revenue),
        "golf_revenue_week": float(golf_week_revenue),
        "pro_shop_revenue_total": float(pro_shop_total_revenue),
        "pro_shop_revenue_today": float(pro_shop_today_revenue),
        "pro_shop_revenue_week": float(pro_shop_week_revenue),
        "other_revenue_total": float(other_total_revenue),
        "other_revenue_today": float(today_other_revenue),
        "other_revenue_week": float(week_other_revenue),
        "golf_day_pipeline_total": float(golf_day_total),
        "golf_day_outstanding_balance": float(golf_day_outstanding),
        "golf_day_open_count": int(golf_day_open_count),
        "total_revenue": float(combined_total_revenue),
        "today_revenue": float(combined_today_revenue),
        "week_revenue": float(combined_week_revenue),
        "revenue_streams": revenue_streams,
        "operation_insights": operation_insights,
        "revenue_boundary": {
            "golf_reporting_source": "ledger_entries_plus_imported_golf_adjustments",
            "pro_shop_reporting_source": "native_pro_shop_sales_only",
            "imported_pro_shop_handling": "excluded_from_dashboard_stream_rollups",
        },
        "imports": imports,
        "bookings_by_status": bookings_by_status,
        "bookings_by_status_periods": bookings_by_status_periods,
        "completed_rounds": completed_rounds,
        "today_bookings": today_bookings,
        "ai_assistant": {
            "no_show": ai_no_show,
            "revenue_integrity": ai_revenue_integrity,
            "import_copilot": ai_import_copilot,
        },
        "targets": {
            "year": year,
            "annual": {
                "revenue": annual_revenue_target,
                "rounds": annual_rounds_target,
                "revenue_mode": target_model.get("revenue_mode"),
                "revenue_source": target_model.get("revenue_source"),
                "revenue_override": target_model.get("revenue_override"),
                "revenue_derived": target_model.get("revenue_derived"),
                "assumptions": target_model.get("assumptions") or {},
            },
            "periods": kpis,
        },
    }
    projected = project_dashboard_payload(payload, view=dashboard_view)
    ADMIN_DASHBOARD_CACHE.set(cache_key, projected)
    return projected

