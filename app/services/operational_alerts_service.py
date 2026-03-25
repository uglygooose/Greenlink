from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from app.models import Booking, BookingStatus, ImportBatch, LedgerEntry, ProShopProduct, TeeTime
from app.ttl_cache import TTLCache

ADMIN_ALERTS_CACHE = TTLCache[str, dict[str, Any]](ttl_seconds=30, max_entries=96)


def clear_admin_operational_alerts_cache() -> None:
    ADMIN_ALERTS_CACHE.clear()


def get_operational_alerts_payload(
    db: Session,
    *,
    club_id: int,
    lookahead_days: int = 7,
) -> dict[str, Any]:
    safe_days = max(1, min(14, int(lookahead_days or 7)))
    cache_key = f"alerts:{int(club_id)}:{safe_days}"
    cached = ADMIN_ALERTS_CACHE.get(cache_key)
    if cached is not None:
        return cached

    now = datetime.utcnow()
    start_of_today = datetime.combine(now.date(), datetime.min.time())
    lookahead_end = now + timedelta(days=safe_days)
    severity_weight = {"high": 3, "medium": 2, "low": 1}
    alerts: list[dict[str, Any]] = []

    def add_alert(
        *,
        severity: str,
        title: str,
        message: str,
        metric_key: str,
        metric_value: int | float,
        context: dict[str, Any] | None = None,
    ) -> None:
        level = str(severity or "").strip().lower()
        if level not in {"high", "medium", "low"}:
            level = "low"
        alerts.append(
            {
                "severity": level,
                "title": str(title or "").strip() or "Operational alert",
                "message": str(message or "").strip() or "Attention required",
                "metric_key": str(metric_key or "").strip() or "metric",
                "metric_value": metric_value,
                "context": context or {},
            }
        )

    def hours_old(value: datetime | None) -> float | None:
        if not isinstance(value, datetime):
            return None
        return max(0.0, (now - value).total_seconds() / 3600.0)

    last_booking_import = (
        db.query(ImportBatch.imported_at)
        .filter(ImportBatch.club_id == club_id, ImportBatch.kind == "bookings")
        .order_by(desc(ImportBatch.imported_at))
        .first()
    )
    last_revenue_import = (
        db.query(ImportBatch.imported_at)
        .filter(ImportBatch.club_id == club_id, ImportBatch.kind == "revenue")
        .order_by(desc(ImportBatch.imported_at))
        .first()
    )

    booking_import_dt = last_booking_import[0] if last_booking_import else None
    revenue_import_dt = last_revenue_import[0] if last_revenue_import else None
    booking_import_hours = hours_old(booking_import_dt)
    revenue_import_hours = hours_old(revenue_import_dt)

    if booking_import_dt is None:
        add_alert(
            severity="high",
            title="Bookings import missing",
            message="No bookings mirror import has been recorded for this club.",
            metric_key="bookings_import_hours",
            metric_value=-1,
        )
    elif booking_import_hours is not None and booking_import_hours > 24:
        add_alert(
            severity="medium",
            title="Bookings import stale",
            message="Bookings import is older than 24 hours. Sync latest upstream sheet.",
            metric_key="bookings_import_hours",
            metric_value=round(float(booking_import_hours), 1),
        )

    if revenue_import_dt is None:
        add_alert(
            severity="medium",
            title="Revenue import missing",
            message="No revenue import has been recorded for this club.",
            metric_key="revenue_import_hours",
            metric_value=-1,
        )
    elif revenue_import_hours is not None and revenue_import_hours > 24:
        add_alert(
            severity="medium",
            title="Revenue import stale",
            message="Revenue import is older than 24 hours. Upload the latest operational revenues.",
            metric_key="revenue_import_hours",
            metric_value=round(float(revenue_import_hours), 1),
        )

    occupying_statuses = [BookingStatus.booked, BookingStatus.checked_in, BookingStatus.completed]
    capacity_conflicts = (
        db.query(func.count(Booking.id))
        .join(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(
            Booking.club_id == club_id,
            Booking.capacity_conflict == True,  # noqa: E712
            Booking.status.in_(occupying_statuses),
            TeeTime.tee_time >= now,
            TeeTime.tee_time < lookahead_end,
        )
        .scalar()
        or 0
    )
    if int(capacity_conflicts) > 0:
        add_alert(
            severity="high",
            title="Capacity conflicts detected",
            message=f"{int(capacity_conflicts)} booking(s) exceed tee capacity in the next {safe_days} day(s).",
            metric_key="capacity_conflicts",
            metric_value=int(capacity_conflicts),
            context={"lookahead_days": safe_days},
        )

    stale_unexported_ledger = (
        db.query(func.count(LedgerEntry.id))
        .filter(
            LedgerEntry.club_id == club_id,
            LedgerEntry.booking_id.isnot(None),
            or_(LedgerEntry.pastel_synced == 0, LedgerEntry.pastel_synced.is_(None)),
            LedgerEntry.created_at < start_of_today,
        )
        .scalar()
        or 0
    )
    if int(stale_unexported_ledger) > 0:
        add_alert(
            severity="medium",
            title="Cashbook export backlog",
            message=f"{int(stale_unexported_ledger)} paid ledger entries are still not exported.",
            metric_key="stale_unexported_ledger",
            metric_value=int(stale_unexported_ledger),
        )

    low_stock_count = (
        db.query(func.count(ProShopProduct.id))
        .filter(
            ProShopProduct.club_id == club_id,
            ProShopProduct.active == 1,
            ProShopProduct.reorder_level > 0,
            ProShopProduct.stock_qty <= ProShopProduct.reorder_level,
        )
        .scalar()
        or 0
    )
    out_of_stock_count = (
        db.query(func.count(ProShopProduct.id))
        .filter(
            ProShopProduct.club_id == club_id,
            ProShopProduct.active == 1,
            ProShopProduct.stock_qty <= 0,
        )
        .scalar()
        or 0
    )
    if int(low_stock_count) > 0:
        add_alert(
            severity="high" if int(out_of_stock_count) > 0 else "low",
            title="Pro shop stock risk",
            message=(
                f"{int(low_stock_count)} product(s) are at or below reorder level, "
                f"including {int(out_of_stock_count)} out of stock."
            ),
            metric_key="low_stock_products",
            metric_value=int(low_stock_count),
            context={"out_of_stock": int(out_of_stock_count)},
        )

    alerts.sort(
        key=lambda row: (
            -int(severity_weight.get(str(row.get("severity", "low")), 1)),
            str(row.get("title", "")),
        )
    )

    summary = {
        "total": len(alerts),
        "high": sum(1 for row in alerts if str(row.get("severity")) == "high"),
        "medium": sum(1 for row in alerts if str(row.get("severity")) == "medium"),
        "low": sum(1 for row in alerts if str(row.get("severity")) == "low"),
    }
    payload = {
        "generated_at": now.isoformat(),
        "lookahead_days": int(safe_days),
        "summary": summary,
        "alerts": alerts,
    }
    ADMIN_ALERTS_CACHE.set(cache_key, payload)
    return payload
