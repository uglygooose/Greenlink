from __future__ import annotations

from calendar import isleap
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import String, and_, cast, desc, func, or_
from sqlalchemy.orm import Session

from app.models import Booking, LedgerEntry, RevenueTransaction, TeeTime
from app.services.kpi_targets_service import get_target_model_payload
from app.ttl_cache import TTLCache

ADMIN_REVENUE_CACHE = TTLCache[str, dict[str, Any]](ttl_seconds=20, max_entries=96)
ADMIN_LEDGER_CACHE = TTLCache[str, dict[str, Any]](ttl_seconds=15, max_entries=128)


def clear_admin_finance_reporting_caches() -> None:
    ADMIN_REVENUE_CACHE.clear()
    ADMIN_LEDGER_CACHE.clear()


def _safe_rollback(db: Session | None) -> None:
    if db is None:
        return
    try:
        db.rollback()
    except Exception:
        pass


def days_in_year(year: int) -> int:
    return 366 if isleap(int(year or 0)) else 365


def period_window(period: str, anchor: date) -> tuple[date, date, int]:
    p = str(period or "").strip().lower()
    if p in {"day", "today"}:
        return anchor, anchor, 1
    if p in {"week", "wtd"}:
        start = anchor - timedelta(days=anchor.weekday())
        return start, anchor, (anchor - start).days + 1
    if p in {"month", "mtd"}:
        start = anchor.replace(day=1)
        return start, anchor, anchor.day
    if p in {"ytd", "year", "year_to_date"}:
        start = date(anchor.year, 1, 1)
        return start, anchor, (anchor - start).days + 1
    return anchor, anchor, 1


def derive_target(annual: float | None, year: int, days_elapsed: int) -> float | None:
    if annual is None:
        return None
    denom = float(days_in_year(year))
    if denom <= 0:
        return None
    d = max(0, int(days_elapsed or 0))
    return float(annual) * (float(d) / denom)


def normalize_revenue_stream(raw: str | None) -> str:
    source = (raw or "").strip().lower()
    if source in {"golf", "green_fee", "green_fees", "green fees"}:
        return "golf"
    if source in {"proshop", "pro_shop", "golf_shop", "golfshop", "shop", "retail", "merch", "merchandise"}:
        return "pro_shop"
    if source in {"pub", "bar", "fnb", "food", "restaurant"}:
        return "pub"
    if source in {"bowls", "lawn_bowls", "lawn-bowls"}:
        return "bowls"
    if source in {"", "other", "misc", "unknown"}:
        return "other"
    return source


def pro_shop_revenue_source_clause():
    source_col = func.lower(func.coalesce(RevenueTransaction.source, ""))
    return source_col.in_(["proshop", "pro_shop", "golf_shop", "golfshop", "shop", "retail", "merch", "merchandise"])


def native_pro_shop_revenue_clause():
    external_id_col = func.lower(func.coalesce(RevenueTransaction.external_id, ""))
    return and_(pro_shop_revenue_source_clause(), external_id_col.like("proshop-sale-%"))


def get_revenue_analytics_payload(
    db: Session,
    *,
    club_id: int,
    days: int = 30,
    period: str | None = None,
    anchor_date: date | None = None,
) -> dict[str, Any]:
    anchor = anchor_date or datetime.utcnow().date()
    cache_key = f"revenue:{int(club_id)}:{int(days)}:{str(period or '').lower()}:{anchor.isoformat()}"
    cached = ADMIN_REVENUE_CACHE.get(cache_key)
    if cached is not None:
        return cached

    if period:
        start_d, end_d, elapsed_days = period_window(period, anchor)
        start_date = datetime.combine(start_d, datetime.min.time())
        end_date_exclusive = datetime.combine(end_d + timedelta(days=1), datetime.min.time())
        period_days = (end_d - start_d).days + 1
    else:
        start_date = datetime.utcnow() - timedelta(days=days)
        end_date_exclusive = None
        elapsed_days = None
        period_days = days

    daily_revenue_query = (
        db.query(
            func.date(TeeTime.tee_time).label("date"),
            func.sum(Booking.price).label("amount"),
            func.count(Booking.id).label("bookings"),
        )
        .join(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(
            TeeTime.club_id == club_id,
            Booking.club_id == club_id,
            TeeTime.tee_time >= start_date,
        )
    )
    if end_date_exclusive is not None:
        daily_revenue_query = daily_revenue_query.filter(TeeTime.tee_time < end_date_exclusive)
    daily_revenue = (
        daily_revenue_query.group_by(func.date(TeeTime.tee_time))
        .order_by(func.date(TeeTime.tee_time))
        .all()
    )

    daily_paid_revenue_query = db.query(
        func.date(LedgerEntry.created_at).label("date"),
        func.sum(LedgerEntry.amount).label("amount"),
        func.count(LedgerEntry.id).label("bookings"),
    ).filter(
        LedgerEntry.club_id == club_id,
        LedgerEntry.booking_id.isnot(None),
        LedgerEntry.created_at >= start_date,
    )
    if end_date_exclusive is not None:
        daily_paid_revenue_query = daily_paid_revenue_query.filter(LedgerEntry.created_at < end_date_exclusive)
    daily_paid_revenue = (
        daily_paid_revenue_query.group_by(func.date(LedgerEntry.created_at))
        .order_by(func.date(LedgerEntry.created_at))
        .all()
    )

    other_daily_revenue = []
    try:
        other_daily_query = db.query(
            RevenueTransaction.transaction_date.label("date"),
            func.sum(RevenueTransaction.amount).label("amount"),
            func.count(RevenueTransaction.id).label("transactions"),
        ).filter(
            RevenueTransaction.club_id == club_id,
            ~native_pro_shop_revenue_clause(),
            RevenueTransaction.transaction_date >= start_date.date(),
        )
        if end_date_exclusive is not None:
            other_daily_query = other_daily_query.filter(RevenueTransaction.transaction_date < end_date_exclusive.date())
        other_daily_revenue = (
            other_daily_query.group_by(RevenueTransaction.transaction_date)
            .order_by(RevenueTransaction.transaction_date)
            .all()
        )
    except Exception:
        _safe_rollback(db)
        other_daily_revenue = []

    status_revenue_query = (
        db.query(
            Booking.status,
            func.sum(Booking.price).label("amount"),
            func.count(Booking.id).label("count"),
        )
        .join(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(
            Booking.club_id == club_id,
            TeeTime.club_id == club_id,
            TeeTime.tee_time >= start_date,
        )
    )
    if end_date_exclusive is not None:
        status_revenue_query = status_revenue_query.filter(TeeTime.tee_time < end_date_exclusive)
    status_revenue = status_revenue_query.group_by(Booking.status).all()

    year = int(anchor.year)
    target_model = get_target_model_payload(db, year=year)
    annual_revenue_target = target_model.get("revenue_target")
    derived_target = derive_target(annual_revenue_target, year, elapsed_days) if elapsed_days is not None else None
    daily_required = (float(annual_revenue_target) / float(days_in_year(year))) if annual_revenue_target is not None else None

    other_by_stream = []
    try:
        other_stream_query = db.query(
            RevenueTransaction.source,
            func.sum(RevenueTransaction.amount).label("amount"),
            func.count(RevenueTransaction.id).label("transactions"),
        ).filter(
            RevenueTransaction.club_id == club_id,
            ~native_pro_shop_revenue_clause(),
            RevenueTransaction.transaction_date >= start_date.date(),
        )
        if end_date_exclusive is not None:
            other_stream_query = other_stream_query.filter(RevenueTransaction.transaction_date < end_date_exclusive.date())
        raw_by_stream = (
            other_stream_query.group_by(RevenueTransaction.source)
            .order_by(desc(func.sum(RevenueTransaction.amount)))
            .all()
        )
        by_stream: dict[str, dict[str, float | int]] = {}
        for source, amount, transactions in raw_by_stream:
            stream = normalize_revenue_stream(source)
            current = by_stream.get(stream, {"amount": 0.0, "transactions": 0})
            current["amount"] = float(current["amount"]) + float(amount or 0.0)
            current["transactions"] = int(current["transactions"]) + int(transactions or 0)
            by_stream[stream] = current
        other_by_stream = sorted(
            [
                {
                    "stream": stream,
                    "amount": float(stats.get("amount", 0.0)),
                    "transactions": int(stats.get("transactions", 0)),
                }
                for stream, stats in by_stream.items()
            ],
            key=lambda row: float(row["amount"]),
            reverse=True,
        )
    except Exception:
        _safe_rollback(db)
        other_by_stream = []

    payload = {
        "period_days": int(period_days or days),
        "period": (period or "").lower().strip() or None,
        "anchor_date": anchor.isoformat(),
        "target_revenue": derived_target,
        "annual_revenue_target": annual_revenue_target,
        "target_context": target_model,
        "revenue_boundary": {
            "golf_paid_source": "ledger_entries",
            "imported_non_booking_source": "revenue_transactions_excluding_native_pro_shop_pos",
            "pro_shop_native_reporting_source": "pro_shop_sales",
            "pro_shop_imported_reporting_source": "revenue_transactions_import_only",
        },
        "daily_revenue_required": daily_required,
        "daily_revenue": [
            {"date": str(dr[0]), "amount": float(dr[1]) if dr[1] else 0.0, "bookings": dr[2]}
            for dr in daily_revenue
        ],
        "daily_paid_revenue": [
            {"date": str(dr[0]), "amount": float(dr[1]) if dr[1] else 0.0, "bookings": dr[2]}
            for dr in daily_paid_revenue
        ],
        "daily_other_revenue": [
            {"date": str(dr[0]), "amount": float(dr[1]) if dr[1] else 0.0, "transactions": int(dr[2] or 0)}
            for dr in other_daily_revenue
        ],
        "other_revenue_by_stream": other_by_stream,
        "revenue_by_status": [
            {"status": sr[0], "amount": float(sr[1]) if sr[1] else 0.0, "count": sr[2]}
            for sr in status_revenue
        ],
    }
    ADMIN_REVENUE_CACHE.set(cache_key, payload)
    return payload


def get_ledger_entries_payload(
    db: Session,
    *,
    club_id: int,
    skip: int = 0,
    limit: int = 50,
    start: datetime | None = None,
    end: datetime | None = None,
    q: str | None = None,
    exported: bool | None = None,
) -> dict[str, Any]:
    cache_key = (
        f"ledger:{int(club_id)}:{int(skip)}:{int(limit)}:"
        f"{start.isoformat() if start else ''}:{end.isoformat() if end else ''}:"
        f"{str(q or '').strip().lower()}:{str(exported)}"
    )
    cached = ADMIN_LEDGER_CACHE.get(cache_key)
    if cached is not None:
        return cached

    query = db.query(LedgerEntry).filter(LedgerEntry.club_id == club_id)
    if start and end:
        query = query.filter(LedgerEntry.created_at >= start, LedgerEntry.created_at < end)
    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        query = query.filter(
            or_(
                func.lower(LedgerEntry.description).like(like),
                func.lower(cast(LedgerEntry.booking_id, String)).like(like),
            )
        )
    if exported is True:
        query = query.filter(LedgerEntry.pastel_synced == 1)
    elif exported is False:
        query = query.filter(or_(LedgerEntry.pastel_synced == 0, LedgerEntry.pastel_synced.is_(None)))

    total = query.count()
    total_amount = query.with_entities(func.sum(LedgerEntry.amount)).scalar() or 0.0
    entries = query.order_by(desc(LedgerEntry.created_at)).offset(skip).limit(limit).all()

    payload = {
        "total": total,
        "total_amount": float(total_amount),
        "ledger_entries": [
            {
                "id": le.id,
                "booking_id": le.booking_id,
                "description": le.description,
                "amount": float(le.amount),
                "pastel_synced": bool(le.pastel_synced),
                "pastel_transaction_id": le.pastel_transaction_id,
                "created_at": le.created_at.isoformat(),
            }
            for le in entries
        ],
    }
    ADMIN_LEDGER_CACHE.set(cache_key, payload)
    return payload
