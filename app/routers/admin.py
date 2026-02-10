# app/routers/admin.py
"""
Admin Dashboard API Routes
All endpoints require admin role
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import String, cast, desc, func, or_, case
from datetime import date, datetime, timedelta, time as Time
from pydantic import BaseModel
from typing import Optional
from app import crud
from app.models import User, Booking, TeeTime, Round, LedgerEntry, LedgerEntryMeta, DayClose, UserRole, BookingStatus, Member, ClubSetting
from app.fee_models import FeeCategory, FeeType
from app.auth import get_current_user, get_db
from calendar import isleap

router = APIRouter(prefix="/api/admin", tags=["admin"])


def verify_admin(current_user: User = Depends(get_current_user)) -> User:
    """Verify current user is admin"""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def assert_day_open(db: Session, target_date):
    if not target_date:
        return
    closed = db.query(DayClose).filter(
        DayClose.close_date == target_date,
        DayClose.status == "closed"
    ).first()
    if closed:
        raise HTTPException(status_code=403, detail="Day is closed. Reopen to edit.")


def _days_in_year(year: int) -> int:
    return 366 if isleap(year) else 365


def _week_start(d: date) -> date:
    # Monday-start week (South Africa standard in most reporting contexts)
    return d - timedelta(days=d.weekday())


def _period_window(period: str, anchor: date) -> tuple[date, date, int]:
    """
    Returns (start_date, end_date_inclusive, days_elapsed) for a period ending at anchor.
    days_elapsed is used to derive targets from annual targets.
    """
    p = (period or "").lower().strip()
    if p in {"day", "today"}:
        return anchor, anchor, 1
    if p in {"week", "wtd"}:
        start = _week_start(anchor)
        return start, anchor, (anchor - start).days + 1
    if p in {"month", "mtd"}:
        start = anchor.replace(day=1)
        return start, anchor, anchor.day
    if p in {"ytd", "year", "year_to_date"}:
        start = date(anchor.year, 1, 1)
        return start, anchor, (anchor - start).days + 1
    # Default to day
    return anchor, anchor, 1


def _annual_target(db: Session, year: int, metric: str, default: float | None = None) -> float | None:
    try:
        from app.models import KpiTarget
        row = db.query(KpiTarget).filter(KpiTarget.year == year, KpiTarget.metric == metric).first()
        if row and row.annual_target is not None:
            return float(row.annual_target)
    except Exception:
        # In offline/demo modes or before tables exist, fall back to defaults.
        pass
    return default


def _derive_target(annual: float | None, year: int, days_elapsed: int) -> float | None:
    if annual is None:
        return None
    denom = float(_days_in_year(year))
    if denom <= 0:
        return None
    d = max(0, int(days_elapsed or 0))
    return float(annual) * (float(d) / denom)


def _member_green_fee_18(db: Session) -> float:
    """
    Baseline member green fee used to derive revenue targets from rounds targets.

    We prefer a stable "member 18 holes" fee (code 1 in the default fee list).
    If fees aren't loaded, fall back to a sensible demo default.
    """
    try:
        fee = db.query(FeeCategory).filter(FeeCategory.code == 1).first()
        if fee and getattr(fee, "price", None) is not None:
            return float(fee.price)

        # Otherwise: any member golf fee for 18 holes without a restricted day kind.
        fee = (
            db.query(FeeCategory)
            .filter(
                FeeCategory.active == 1,
                FeeCategory.fee_type == FeeType.GOLF,
                FeeCategory.audience == "member",
                FeeCategory.holes == 18,
                FeeCategory.day_kind.is_(None),
            )
            .order_by(FeeCategory.priority.desc(), FeeCategory.code.asc())
            .first()
        )
        if fee and getattr(fee, "price", None) is not None:
            return float(fee.price)
    except Exception:
        pass

    # Default from the 2026 price list (member 18 holes).
    return 340.0


def _float_setting(db: Session, key: str, default: float) -> float:
    """Read a float club setting from DB; fall back to default on any error."""
    try:
        from app.models import ClubSetting

        row = db.query(ClubSetting).filter(ClubSetting.key == key).first()
        if not row:
            return float(default)
        raw = (row.value or "").strip()
        if not raw:
            return float(default)
        return float(raw)
    except Exception:
        return float(default)


def _int_setting(db: Session, key: str, default: int) -> int:
    try:
        return int(_float_setting(db, key, float(default)))
    except Exception:
        return int(default)


def _upsert_setting(db: Session, key: str, value: int | float | str) -> None:
    row = db.query(ClubSetting).filter(ClubSetting.key == key).first()
    if row:
        row.value = str(value)
        row.updated_at = datetime.utcnow()
    else:
        db.add(ClubSetting(key=key, value=str(value)))


def _derive_annual_revenue_target_from_mix(db: Session, year: int, annual_rounds_target: float | None) -> float | None:
    """
    Derive annual revenue target using a member/visitor mix model.

    Client assumption:
    - 50% of rounds are members (by volume)
    - 33% of revenue comes from members, 67% visitors

    If we assume "member revenue per round" ~ member 18-hole fee, then:
      total_revenue = member_rounds * member_fee / member_revenue_share
    """
    if annual_rounds_target is None:
        return None

    member_round_share = _float_setting(db, "target_member_round_share", 0.50)
    member_revenue_share = _float_setting(db, "target_member_revenue_share", 0.33)

    # Guard rails
    if member_round_share <= 0 or member_round_share >= 1:
        member_round_share = 0.50
    if member_revenue_share <= 0 or member_revenue_share >= 1:
        member_revenue_share = 0.33

    member_fee = float(_member_green_fee_18(db))
    member_rounds = float(annual_rounds_target) * float(member_round_share)
    return (member_rounds * member_fee) / float(member_revenue_share)


class BookingWindowSettings(BaseModel):
    member_days: int
    affiliated_days: int
    non_affiliated_days: int


@router.get("/booking-window", response_model=BookingWindowSettings)
def get_booking_window_settings(db: Session = Depends(get_db), admin: User = Depends(verify_admin)):
    return BookingWindowSettings(
        member_days=_int_setting(db, "booking_window_member_days", 14),
        affiliated_days=_int_setting(db, "booking_window_affiliated_days", 7),
        non_affiliated_days=_int_setting(db, "booking_window_non_affiliated_days", 5),
    )


@router.put("/booking-window", response_model=BookingWindowSettings)
def update_booking_window_settings(payload: BookingWindowSettings, db: Session = Depends(get_db), admin: User = Depends(verify_admin)):
    # Guard rails
    member_days = max(0, min(365, int(payload.member_days)))
    affiliated_days = max(0, min(365, int(payload.affiliated_days)))
    non_affiliated_days = max(0, min(365, int(payload.non_affiliated_days)))

    _upsert_setting(db, "booking_window_member_days", member_days)
    _upsert_setting(db, "booking_window_affiliated_days", affiliated_days)
    _upsert_setting(db, "booking_window_non_affiliated_days", non_affiliated_days)
    db.commit()

    return BookingWindowSettings(
        member_days=member_days,
        affiliated_days=affiliated_days,
        non_affiliated_days=non_affiliated_days,
    )

def _parse_hhmm(value: str) -> Time:
    raw = (value or "").strip()
    parts = raw.split(":")
    if len(parts) != 2:
        raise ValueError("invalid time")
    hh = int(parts[0])
    mm = int(parts[1])
    if hh < 0 or hh > 23 or mm < 0 or mm > 59:
        raise ValueError("invalid time")
    return Time(hour=hh, minute=mm)


class BulkTeeBookingRequest(BaseModel):
    date: date
    tees: list[str] = ["1", "10"]
    start_time: str = "06:30"
    end_time: str = "16:30"
    holes: int = 18
    slots_per_time: int = 4
    group_name: str
    price: float = 0.0


@router.post("/tee-sheet/bulk-book")
def bulk_book_tee_sheet(
    req: BulkTeeBookingRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    """
    Create placeholder bookings across a date/time range.
    Useful for golf days / group blocks (without needing to click each slot).
    """
    assert_day_open(db, req.date)

    group_name = (req.group_name or "").strip()
    if not group_name:
        raise HTTPException(status_code=400, detail="group_name is required")

    tees = [str(t).strip() for t in (req.tees or []) if str(t).strip()]
    if not tees:
        tees = ["1", "10"]

    try:
        start_t = _parse_hhmm(req.start_time)
        end_t = _parse_hhmm(req.end_time)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start_time/end_time (expected HH:MM)")

    start_dt = datetime.combine(req.date, start_t)
    end_dt = datetime.combine(req.date, end_t)
    if start_dt > end_dt:
        raise HTTPException(status_code=400, detail="start_time must be <= end_time")

    holes = 9 if int(req.holes or 18) == 9 else 18
    slots_per_time = max(1, min(4, int(req.slots_per_time or 1)))
    price = float(req.price or 0.0)
    if price < 0:
        raise HTTPException(status_code=400, detail="price must be >= 0")

    group_id = uuid.uuid4().hex[:12]

    tee_times = (
        db.query(TeeTime)
        .filter(
            TeeTime.tee_time >= start_dt,
            TeeTime.tee_time <= end_dt,
            cast(TeeTime.hole, String).in_(tees),
        )
        .order_by(TeeTime.tee_time.asc(), cast(TeeTime.hole, String).asc())
        .all()
    )
    if not tee_times:
        raise HTTPException(status_code=404, detail="No tee times found in this range. Generate the tee sheet first.")

    tee_time_ids = [tt.id for tt in tee_times if tt.id]
    occupying_statuses = [BookingStatus.booked, BookingStatus.checked_in, BookingStatus.completed]
    counts = dict(
        db.query(Booking.tee_time_id, func.count(Booking.id))
        .filter(
            Booking.tee_time_id.in_(tee_time_ids),
            or_(
                Booking.status.is_(None),
                Booking.status.in_(occupying_statuses),
            ),
        )
        .group_by(Booking.tee_time_id)
        .all()
    )

    created = 0
    skipped_full = 0
    new_rows: list[Booking] = []
    for tt in tee_times:
        cap = int(getattr(tt, "capacity", None) or 4)
        cap = max(1, min(6, cap))
        existing = int(counts.get(tt.id, 0) or 0)
        available = max(0, cap - existing)
        if available <= 0:
            skipped_full += 1
            continue

        to_add = min(available, slots_per_time)
        for _ in range(to_add):
            created += 1
            new_rows.append(
                Booking(
                    tee_time_id=tt.id,
                    created_by_user_id=getattr(admin, "id", None),
                    # Keep the tee sheet clean: show only the event/group name in the slot.
                    # Group/undo metadata lives on external_provider/external_booking_id.
                    player_name=group_name,
                    party_size=1,
                    price=price,
                    status=BookingStatus.booked,
                    holes=holes,
                    prepaid=False,
                    external_provider="bulk",
                    external_booking_id=group_id,
                    notes=f"Bulk booking: {group_name} (group {group_id})",
                )
            )

    if new_rows:
        db.add_all(new_rows)
        db.commit()

    return {
        "group_id": group_id,
        "created": created,
        "skipped_full": skipped_full,
        "tee_times": len(tee_times),
        "date": str(req.date),
        "start_time": req.start_time,
        "end_time": req.end_time,
        "tees": tees,
    }


@router.delete("/tee-sheet/bulk-book/{group_id}")
def undo_bulk_book_tee_sheet(
    group_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    gid = (group_id or "").strip()
    if not gid:
        raise HTTPException(status_code=400, detail="group_id is required")

    bookings = (
        db.query(Booking)
        .options(selectinload(Booking.tee_time))
        .filter(Booking.external_provider == "bulk", Booking.external_booking_id == gid)
        .all()
    )
    if not bookings:
        raise HTTPException(status_code=404, detail="Bulk booking group not found")

    paid_statuses = {BookingStatus.checked_in, BookingStatus.completed}
    if any(b.status in paid_statuses for b in bookings):
        raise HTTPException(status_code=409, detail="Cannot undo: some bookings are already checked-in/completed.")

    # Respect day close locks.
    for d in {b.tee_time.tee_time.date() for b in bookings if b.tee_time and b.tee_time.tee_time}:
        assert_day_open(db, d)

    ids = [b.id for b in bookings if b.id]
    if not ids:
        raise HTTPException(status_code=500, detail="Invalid bulk booking rows")

    le_ids = [row[0] for row in db.query(LedgerEntry.id).filter(LedgerEntry.booking_id.in_(ids)).all()]
    if le_ids:
        db.query(LedgerEntryMeta).filter(LedgerEntryMeta.ledger_entry_id.in_(le_ids)).delete(synchronize_session=False)
    db.query(LedgerEntry).filter(LedgerEntry.booking_id.in_(ids)).delete(synchronize_session=False)
    db.query(Round).filter(Round.booking_id.in_(ids)).delete(synchronize_session=False)
    db.query(Booking).filter(Booking.id.in_(ids)).delete(synchronize_session=False)
    db.commit()

    return {"status": "success", "group_id": gid, "deleted": len(ids)}


@router.get("/dashboard")
async def get_dashboard_stats(db: Session = Depends(get_db), admin: User = Depends(verify_admin)):
    """Get main dashboard statistics"""
    
    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]

    # Total bookings
    total_bookings = db.query(func.count(Booking.id)).scalar() or 0
    
    # Bookings by status
    booked_count = db.query(func.count(Booking.id)).filter(Booking.status == BookingStatus.booked).scalar() or 0
    checked_in_count = db.query(func.count(Booking.id)).filter(Booking.status == BookingStatus.checked_in).scalar() or 0
    completed_count = db.query(func.count(Booking.id)).filter(Booking.status == BookingStatus.completed).scalar() or 0
    cancelled_count = db.query(func.count(Booking.id)).filter(Booking.status == BookingStatus.cancelled).scalar() or 0
    no_show_count = db.query(func.count(Booking.id)).filter(Booking.status == BookingStatus.no_show).scalar() or 0
    
    # Total revenue (cashbook basis = payment date / ledger entries)
    total_revenue = (
        db.query(func.sum(LedgerEntry.amount))
        .filter(LedgerEntry.booking_id.isnot(None))
        .scalar()
        or 0.0
    )
    
    # Completed rounds (admin expectation = bookings marked completed)
    completed_rounds = completed_count
    
    # Registered players
    total_players = db.query(func.count(User.id)).filter(User.role == UserRole.player).scalar() or 0
    
    # Today's bookings
    today = datetime.utcnow().date()
    today_bookings = (
        db.query(func.count(Booking.id))
        .join(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(func.date(TeeTime.tee_time) == today)
        .scalar()
        or 0
    )
    
    # Today's revenue (payment date)
    today_revenue = (
        db.query(func.sum(LedgerEntry.amount))
        .filter(LedgerEntry.booking_id.isnot(None), func.date(LedgerEntry.created_at) == today)
        .scalar()
        or 0.0
    )
    
    # Last 7 days revenue (payment date)
    week_ago = datetime.utcnow() - timedelta(days=7)
    week_revenue = (
        db.query(func.sum(LedgerEntry.amount))
        .filter(LedgerEntry.booking_id.isnot(None), LedgerEntry.created_at >= week_ago)
        .scalar()
        or 0.0
    )
    
    # KPI targets vs actuals (Day/WTD/MTD/YTD)
    anchor = datetime.utcnow().date()
    year = int(anchor.year)
    # NOTE: For accounting, the transaction date is when the booking is marked paid/checked-in
    # (ledger_entries.created_at), not the tee time date.

    # Default targets (can be overridden via kpi_targets table):
    # - Rounds: 35,000/year (client target)
    # - Revenue: derived from rounds target * member 18-hole rate unless explicitly set
    annual_rounds_target = _annual_target(db, year, "rounds", default=35000.0)
    annual_revenue_target = _annual_target(db, year, "revenue", default=None)
    if annual_revenue_target is None and annual_rounds_target is not None:
        annual_revenue_target = _derive_annual_revenue_target_from_mix(db, year, float(annual_rounds_target))

    def _paid_window_actuals(start_d: date, end_d: date) -> tuple[float, int]:
        revenue = (
            db.query(func.sum(LedgerEntry.amount))
            .filter(
                LedgerEntry.booking_id.isnot(None),
                func.date(LedgerEntry.created_at) >= start_d,
                func.date(LedgerEntry.created_at) <= end_d,
            )
            .scalar()
            or 0.0
        )
        rounds = (
            db.query(func.count(LedgerEntry.id))
            .filter(
                LedgerEntry.booking_id.isnot(None),
                func.date(LedgerEntry.created_at) >= start_d,
                func.date(LedgerEntry.created_at) <= end_d,
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

    return {
        "total_bookings": total_bookings,
        "total_players": total_players,
        "total_revenue": float(total_revenue),
        "today_revenue": float(today_revenue),
        "week_revenue": float(week_revenue),
        "bookings_by_status": {
            "booked": booked_count,
            "checked_in": checked_in_count,
            "completed": completed_count,
            "no_show": no_show_count,
            "cancelled": cancelled_count
        },
        "completed_rounds": completed_rounds,
        "today_bookings": today_bookings,
        "targets": {
            "year": year,
        "annual": {
            "revenue": annual_revenue_target,
            "rounds": annual_rounds_target,
            "assumptions": {
                "member_round_share": _float_setting(db, "target_member_round_share", 0.50),
                "member_revenue_share": _float_setting(db, "target_member_revenue_share", 0.33),
                "member_fee_18": float(_member_green_fee_18(db)),
            },
        },
        "periods": kpis,
    },
    }


class KpiTargetUpsert(BaseModel):
    year: int
    metric: str
    annual_target: float


@router.put("/targets")
async def upsert_kpi_target(
    payload: KpiTargetUpsert,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    metric = (payload.metric or "").strip().lower()
    if metric not in {"revenue", "rounds"}:
        raise HTTPException(status_code=400, detail="metric must be 'revenue' or 'rounds'")
    if payload.year < 2000 or payload.year > 2100:
        raise HTTPException(status_code=400, detail="invalid year")
    if payload.annual_target < 0:
        raise HTTPException(status_code=400, detail="annual_target must be >= 0")

    from app.models import KpiTarget

    row = db.query(KpiTarget).filter(KpiTarget.year == payload.year, KpiTarget.metric == metric).first()
    if not row:
        row = KpiTarget(year=payload.year, metric=metric, annual_target=float(payload.annual_target))
        db.add(row)
    else:
        row.annual_target = float(payload.annual_target)
        row.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(row)

    return {"status": "ok", "year": row.year, "metric": row.metric, "annual_target": float(row.annual_target)}


@router.get("/bookings")
async def get_all_bookings(
    skip: int = 0,
    limit: int = 50,
    status: str = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    period: Optional[str] = None,  # day | week | month
    anchor_date: Optional[date] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get all bookings with filters"""
    
    query = (
        db.query(Booking)
        .options(selectinload(Booking.tee_time), selectinload(Booking.round))
        .outerjoin(TeeTime, Booking.tee_time_id == TeeTime.id)
    )
    
    if status:
        query = query.filter(Booking.status == status)

    # Filter by tee time range (inclusive start, exclusive end).
    # This is used by the admin UI for daily/weekly/monthly views.
    if start and end:
        query = query.filter(TeeTime.tee_time >= start, TeeTime.tee_time < end)
        query = query.order_by(TeeTime.tee_time, Booking.id)
    elif period and anchor_date:
        period = period.lower().strip()
        if period not in {"day", "week", "month"}:
            raise HTTPException(status_code=400, detail="Invalid period (use day, week, or month)")

        if period == "day":
            range_start = datetime.combine(anchor_date, datetime.min.time())
            range_end = range_start + timedelta(days=1)
        elif period == "week":
            # Monday-start week
            monday = anchor_date - timedelta(days=anchor_date.weekday())
            range_start = datetime.combine(monday, datetime.min.time())
            range_end = range_start + timedelta(days=7)
        else:  # month
            month_start = anchor_date.replace(day=1)
            if month_start.month == 12:
                next_month = date(month_start.year + 1, 1, 1)
            else:
                next_month = date(month_start.year, month_start.month + 1, 1)
            range_start = datetime.combine(month_start, datetime.min.time())
            range_end = datetime.combine(next_month, datetime.min.time())

        query = query.filter(TeeTime.tee_time >= range_start, TeeTime.tee_time < range_end)
        query = query.order_by(TeeTime.tee_time, Booking.id)
    else:
        query = query.order_by(desc(Booking.created_at))
    
    total = query.count()
    
    bookings = query.offset(skip).limit(limit).all()
    
    return {
        "total": total,
        "bookings": [
            {
                "id": b.id,
                "player_name": b.player_name,
                "player_email": b.player_email,
                "price": float(b.price),
                "status": b.status,
                "tee_time": b.tee_time.tee_time.isoformat() if b.tee_time else None,
                "created_at": b.created_at.isoformat(),
                "has_round": bool(b.round),
                "round_completed": b.round.closed if b.round else False,
                "holes": b.holes,
                "prepaid": bool(b.prepaid) if b.prepaid is not None else None,
                "handicap_sa_id": getattr(b, "handicap_sa_id", None),
                "home_club": getattr(b, "home_club", None),
                "gender": getattr(b, "gender", None),
                "player_category": getattr(b, "player_category", None),
                "handicap_index_at_booking": getattr(b, "handicap_index_at_booking", None),
                "cart": bool(b.cart) if b.cart is not None else None,
                "push_cart": bool(getattr(b, "push_cart", None)) if getattr(b, "push_cart", None) is not None else None,
                "caddy": bool(getattr(b, "caddy", None)) if getattr(b, "caddy", None) is not None else None,
            }
            for b in bookings
        ]
    }


@router.get("/bookings/{booking_id}")
async def get_booking_detail(
    booking_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get detailed booking information"""
    
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    round_info = None
    if booking.round:
        round_info = {
            "id": booking.round.id,
            "scores": booking.round.scores_json,
            "handicap_sa_round_id": booking.round.handicap_sa_round_id,
            "handicap_synced": bool(booking.round.handicap_synced),
            "closed": bool(booking.round.closed),
            "created_at": booking.round.created_at.isoformat()
        }
    
    ledger_entries = db.query(LedgerEntry).filter(LedgerEntry.booking_id == booking_id).all()
    entry_ids = [le.id for le in ledger_entries]
    meta_by_entry_id = {}
    if entry_ids:
        metas = db.query(LedgerEntryMeta).filter(LedgerEntryMeta.ledger_entry_id.in_(entry_ids)).all()
        meta_by_entry_id = {m.ledger_entry_id: m for m in metas}

    fee_category = None
    if booking.fee_category_id:
        fee_cat = db.query(FeeCategory).filter(FeeCategory.id == booking.fee_category_id).first()
        if fee_cat:
            fee_category = {
                "id": fee_cat.id,
                "code": fee_cat.code,
                "description": fee_cat.description,
                "price": float(fee_cat.price),
                "fee_type": fee_cat.fee_type,
            }
     
    return {
        "id": booking.id,
        "tee_time_id": booking.tee_time_id,
        "member_id": booking.member_id,
        "player_name": booking.player_name,
        "player_email": booking.player_email,
        "club_card": booking.club_card,
        "handicap_number": booking.handicap_number,
        "handicap_sa_id": getattr(booking, "handicap_sa_id", None),
        "home_club": getattr(booking, "home_club", None),
        "gender": getattr(booking, "gender", None),
        "player_category": getattr(booking, "player_category", None),
        "handicap_index_at_booking": getattr(booking, "handicap_index_at_booking", None),
        "handicap_index_at_play": getattr(booking, "handicap_index_at_play", None),
        "holes": booking.holes,
        "prepaid": bool(booking.prepaid) if booking.prepaid is not None else None,
        "requirements": {
            "cart": bool(getattr(booking, "cart", False)),
            "push_cart": bool(getattr(booking, "push_cart", False)),
            "caddy": bool(getattr(booking, "caddy", False)),
        },
        "fee_category_id": booking.fee_category_id,
        "fee_category": fee_category,
        "price": float(booking.price),
        "status": booking.status,
        "tee_time": booking.tee_time.tee_time.isoformat() if booking.tee_time else None,
        "created_at": booking.created_at.isoformat(),
        "round": round_info,
        "ledger_entries": [
            {
                "id": le.id,
                "description": le.description,
                "amount": float(le.amount),
                "pastel_synced": bool(le.pastel_synced),
                "payment_method": getattr(meta_by_entry_id.get(le.id), "payment_method", None),
                "created_at": le.created_at.isoformat()
            }
            for le in ledger_entries
        ]
    }


class BookingStatusUpdate(BaseModel):
    status: str
    payment_method: Optional[str] = None


class BookingPaymentMethodUpdate(BaseModel):
    payment_method: str


@router.put("/bookings/{booking_id}/status")
async def update_booking_status(
    booking_id: int,
    payload: BookingStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Update booking status (admin quick actions)"""

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.tee_time:
        assert_day_open(db, booking.tee_time.tee_time.date())

    allowed = {s.value for s in BookingStatus}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status: {payload.status}")

    booking.status = BookingStatus(payload.status)
    paid_statuses = {BookingStatus.checked_in, BookingStatus.completed}

    if booking.status in paid_statuses:
        crud.ensure_paid_ledger_entry(db, booking, payment_method=payload.payment_method)
    else:
        # If a booking is moved back to an unpaid state, remove its payment record.
        ids = [row[0] for row in db.query(LedgerEntry.id).filter(LedgerEntry.booking_id == booking.id).all()]
        if ids:
            db.query(LedgerEntryMeta).filter(LedgerEntryMeta.ledger_entry_id.in_(ids)).delete(synchronize_session=False)
        db.query(LedgerEntry).filter(LedgerEntry.booking_id == booking.id).delete(synchronize_session=False)

    db.commit()
    db.refresh(booking)

    return {
        "status": "success",
        "booking_id": booking.id,
        "new_status": booking.status
    }


@router.delete("/bookings/{booking_id}")
async def delete_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Delete a booking and related records (admin only)"""

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.tee_time:
        assert_day_open(db, booking.tee_time.tee_time.date())

    # Remove related records
    ids = [row[0] for row in db.query(LedgerEntry.id).filter(LedgerEntry.booking_id == booking_id).all()]
    if ids:
        db.query(LedgerEntryMeta).filter(LedgerEntryMeta.ledger_entry_id.in_(ids)).delete(synchronize_session=False)
    db.query(LedgerEntry).filter(LedgerEntry.booking_id == booking_id).delete(synchronize_session=False)
    db.query(Round).filter(Round.booking_id == booking_id).delete()

    db.delete(booking)
    db.commit()

    return {"status": "success", "booking_id": booking_id}


@router.put("/bookings/{booking_id}/payment-method")
async def update_booking_payment_method(
    booking_id: int,
    payload: BookingPaymentMethodUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ledger_entry = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.booking_id == booking_id)
        .order_by(desc(LedgerEntry.id))
        .first()
    )
    if not ledger_entry:
        raise HTTPException(status_code=400, detail="Booking has no payment record yet")

    method = (payload.payment_method or "").strip().upper()
    if method not in {"CARD", "CASH", "EFT", "ONLINE"}:
        raise HTTPException(status_code=400, detail="Invalid payment method. Use CARD/CASH/EFT/ONLINE")

    meta = db.query(LedgerEntryMeta).filter(LedgerEntryMeta.ledger_entry_id == ledger_entry.id).first()
    if meta:
        meta.payment_method = method
        meta.updated_at = datetime.utcnow()
    else:
        db.add(LedgerEntryMeta(ledger_entry_id=ledger_entry.id, payment_method=method))

    db.commit()
    return {"status": "success", "booking_id": booking_id, "ledger_entry_id": ledger_entry.id, "payment_method": method}


@router.get("/players")
async def get_all_players(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get all registered players"""

    base_query = db.query(User).filter(User.role == UserRole.player)
    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        base_query = base_query.filter(
            or_(
                func.lower(User.name).like(like),
                func.lower(User.email).like(like),
                func.lower(User.handicap_number).like(like),
                func.lower(User.greenlink_id).like(like),
            )
        )

    total = base_query.count()

    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]
    bookings_count_expr = func.count(Booking.id)
    total_spent_expr = func.coalesce(
        func.sum(case((Booking.status.in_(paid_statuses), Booking.price), else_=0.0)),
        0.0,
    )

    players = (
        db.query(
            User.id.label("id"),
            User.name.label("name"),
            User.email.label("email"),
            User.handicap_number.label("handicap_number"),
            User.greenlink_id.label("greenlink_id"),
            User.handicap_sa_id.label("handicap_sa_id"),
            User.home_course.label("home_course"),
            User.gender.label("gender"),
            User.player_category.label("player_category"),
            User.handicap_index.label("handicap_index"),
            bookings_count_expr.label("bookings_count"),
            total_spent_expr.label("total_spent"),
        )
        .outerjoin(Booking, Booking.player_email == User.email)
        .filter(User.role == UserRole.player)
    )
    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        players = players.filter(
            or_(
                func.lower(User.name).like(like),
                func.lower(User.email).like(like),
                func.lower(User.handicap_number).like(like),
                func.lower(User.greenlink_id).like(like),
            )
        )

    players = (
        players.group_by(
            User.id,
            User.name,
            User.email,
            User.handicap_number,
            User.greenlink_id,
            User.handicap_sa_id,
            User.home_course,
            User.gender,
            User.player_category,
            User.handicap_index,
        )
        .order_by(desc(User.id))
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "players": [
            {
                "id": p.id,
                "name": p.name,
                "email": p.email,
                "handicap_number": p.handicap_number,
                "greenlink_id": p.greenlink_id,
                "handicap_sa_id": getattr(p, "handicap_sa_id", None),
                "home_course": getattr(p, "home_course", None),
                "gender": getattr(p, "gender", None),
                "player_category": getattr(p, "player_category", None),
                "handicap_index": float(getattr(p, "handicap_index", None)) if getattr(p, "handicap_index", None) is not None else None,
                "bookings_count": int(p.bookings_count or 0),
                "total_spent": float(p.total_spent or 0.0),
            }
            for p in players
        ]
    }


@router.get("/members")
async def get_members(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    """List member profiles (with basic booking stats)."""

    base_query = db.query(Member)
    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        base_query = base_query.filter(
            or_(
                func.lower(Member.first_name).like(like),
                func.lower(Member.last_name).like(like),
                func.lower(Member.email).like(like),
                func.lower(Member.member_number).like(like),
                func.lower(Member.phone).like(like),
                func.lower(Member.handicap_number).like(like),
            )
        )

    total = base_query.count()

    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]
    stats = (
        db.query(
            Booking.member_id.label("member_id"),
            func.count(Booking.id).label("bookings_count"),
            func.coalesce(
                func.sum(case((Booking.status.in_(paid_statuses), Booking.price), else_=0.0)),
                0.0,
            ).label("total_spent"),
            func.max(TeeTime.tee_time).label("last_seen"),
        )
        .outerjoin(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(Booking.member_id.isnot(None))
        .group_by(Booking.member_id)
        .subquery()
    )

    query = (
        db.query(
            Member,
            func.coalesce(stats.c.bookings_count, 0).label("bookings_count"),
            func.coalesce(stats.c.total_spent, 0.0).label("total_spent"),
            stats.c.last_seen.label("last_seen"),
        )
        .outerjoin(stats, stats.c.member_id == Member.id)
    )
    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        query = query.filter(
            or_(
                func.lower(Member.first_name).like(like),
                func.lower(Member.last_name).like(like),
                func.lower(Member.email).like(like),
                func.lower(Member.member_number).like(like),
                func.lower(Member.phone).like(like),
                func.lower(Member.handicap_number).like(like),
            )
        )

    rows = (
        query.order_by(desc(Member.active), Member.last_name, Member.first_name)
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "members": [
            {
                "id": m.id,
                "member_number": m.member_number,
                "first_name": m.first_name,
                "last_name": m.last_name,
                "name": f"{m.first_name} {m.last_name}".strip(),
                "email": m.email,
                "phone": m.phone,
                "handicap_number": m.handicap_number,
                "home_club": m.home_club,
                "active": bool(m.active),
                "bookings_count": int(bookings_count or 0),
                "total_spent": float(total_spent or 0.0),
                "last_seen": last_seen.isoformat() if last_seen else None,
            }
            for (m, bookings_count, total_spent, last_seen) in rows
        ],
    }


@router.get("/guests")
async def get_guest_players(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    """Aggregate non-member bookings into guest profiles."""

    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]

    guest_key = func.lower(func.coalesce(Booking.player_email, cast(Booking.player_name, String)))
    last_seen_expr = func.max(TeeTime.tee_time)

    query = (
        db.query(
            guest_key.label("guest_key"),
            func.max(Booking.player_name).label("name"),
            func.max(Booking.player_email).label("email"),
            func.max(Booking.handicap_number).label("handicap_number"),
            func.count(Booking.id).label("bookings_count"),
            func.coalesce(
                func.sum(case((Booking.status.in_(paid_statuses), Booking.price), else_=0.0)),
                0.0,
            ).label("total_spent"),
            last_seen_expr.label("last_seen"),
        )
        .outerjoin(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(Booking.member_id.is_(None))
    )

    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        query = query.filter(
            or_(
                func.lower(Booking.player_name).like(like),
                func.lower(Booking.player_email).like(like),
                func.lower(Booking.handicap_number).like(like),
            )
        )

    query = query.group_by(guest_key)

    total = query.count()

    rows = query.order_by(desc(last_seen_expr)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "guests": [
            {
                "key": guest_key_value,
                "name": name,
                "email": email,
                "handicap_number": handicap_number,
                "bookings_count": int(bookings_count or 0),
                "total_spent": float(total_spent or 0.0),
                "last_seen": last_seen.isoformat() if last_seen else None,
            }
            for (
                guest_key_value,
                name,
                email,
                handicap_number,
                bookings_count,
                total_spent,
                last_seen,
            ) in rows
        ],
    }


@router.get("/players/{player_id}")
async def get_player_detail(
    player_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get detailed player information with booking history"""
    
    player = db.query(User).filter(User.id == player_id, User.role == UserRole.player).first()
    
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    bookings = db.query(Booking).filter(Booking.player_email == player.email).order_by(desc(Booking.created_at)).all()
    
    total_spent = db.query(func.sum(Booking.price)).filter(Booking.player_email == player.email).scalar() or 0.0
    completed_rounds = db.query(func.count(Round.id)).join(Booking).filter(
        Booking.player_email == player.email,
        Round.closed == 1
    ).scalar() or 0
    
    return {
        "id": player.id,
        "name": player.name,
        "email": player.email,
        "handicap_number": player.handicap_number,
        "greenlink_id": player.greenlink_id,
        "handicap_sa_id": getattr(player, "handicap_sa_id", None),
        "home_course": getattr(player, "home_course", None),
        "gender": getattr(player, "gender", None),
        "player_category": getattr(player, "player_category", None),
        "handicap_index": float(getattr(player, "handicap_index", None)) if getattr(player, "handicap_index", None) is not None else None,
        "total_spent": float(total_spent),
        "bookings_count": len(bookings),
        "completed_rounds": completed_rounds,
        "recent_bookings": [
            {
                "id": b.id,
                "price": float(b.price),
                "status": b.status,
                "tee_time": b.tee_time.tee_time.isoformat() if b.tee_time else None,
                "created_at": b.created_at.isoformat()
            }
            for b in bookings[:10]
        ]
    }

@router.get("/members/search")
async def search_members(
    q: str,
    limit: int = 10,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    """Search members for quick booking (pro shop)."""

    needle = (q or "").strip().lower()
    if not needle:
        return {"members": []}

    like = f"%{needle}%"
    members = (
        db.query(Member)
        .filter(
            or_(
                func.lower(Member.first_name).like(like),
                func.lower(Member.last_name).like(like),
                func.lower(Member.email).like(like),
                func.lower(Member.member_number).like(like),
                func.lower(Member.phone).like(like),
                func.lower(Member.handicap_number).like(like),
            )
        )
        .order_by(desc(Member.active), Member.last_name, Member.first_name)
        .limit(max(1, min(limit, 25)))
        .all()
    )

    return {
        "members": [
            {
                "id": m.id,
                "member_number": m.member_number,
                "first_name": m.first_name,
                "last_name": m.last_name,
                "name": f"{m.first_name} {m.last_name}".strip(),
                "email": m.email,
                "phone": m.phone,
                "handicap_number": m.handicap_number,
                "home_club": m.home_club,
                "active": bool(m.active),
            }
            for m in members
        ]
    }


@router.get("/revenue")
async def get_revenue_analytics(
    days: int = 30,
    period: Optional[str] = None,  # day | wtd | mtd | ytd
    anchor_date: Optional[date] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get revenue analytics for last N days or a named period ending at anchor_date."""

    anchor = anchor_date or datetime.utcnow().date()
    if period:
        start_d, end_d, elapsed_days = _period_window(period, anchor)
        start_date = datetime.combine(start_d, datetime.min.time())
        end_date_exclusive = datetime.combine(end_d + timedelta(days=1), datetime.min.time())
        period_days = (end_d - start_d).days + 1
    else:
        # "Last N days" mode (use tee-time date for bookings, payment date for ledger).
        start_date = datetime.utcnow() - timedelta(days=days)
        end_date_exclusive = None
        elapsed_days = None
        period_days = days
    
    # Daily booked revenue (tee-time date)
    daily_revenue_query = db.query(
        func.date(TeeTime.tee_time).label("date"),
        func.sum(Booking.price).label("amount"),
        func.count(Booking.id).label("bookings")
    ).join(TeeTime, Booking.tee_time_id == TeeTime.id).filter(TeeTime.tee_time >= start_date)

    if end_date_exclusive is not None:
        daily_revenue_query = daily_revenue_query.filter(TeeTime.tee_time < end_date_exclusive)

    daily_revenue = (
        daily_revenue_query.group_by(func.date(TeeTime.tee_time))
        .order_by(func.date(TeeTime.tee_time))
        .all()
    )

    # Daily paid revenue (payment date / ledger entry date)
    daily_paid_revenue_query = db.query(
        func.date(LedgerEntry.created_at).label("date"),
        func.sum(LedgerEntry.amount).label("amount"),
        func.count(LedgerEntry.id).label("bookings")
    ).filter(LedgerEntry.booking_id.isnot(None), LedgerEntry.created_at >= start_date)

    if end_date_exclusive is not None:
        daily_paid_revenue_query = daily_paid_revenue_query.filter(LedgerEntry.created_at < end_date_exclusive)

    daily_paid_revenue = (
        daily_paid_revenue_query.group_by(func.date(LedgerEntry.created_at))
        .order_by(func.date(LedgerEntry.created_at))
        .all()
    )
    
    # Revenue by booking status
    status_revenue_query = db.query(
        Booking.status,
        func.sum(Booking.price).label("amount"),
        func.count(Booking.id).label("count")
    ).join(TeeTime, Booking.tee_time_id == TeeTime.id).filter(TeeTime.tee_time >= start_date)

    if end_date_exclusive is not None:
        status_revenue_query = status_revenue_query.filter(TeeTime.tee_time < end_date_exclusive)

    status_revenue = status_revenue_query.group_by(Booking.status).all()

    year = int(anchor.year)
    annual_revenue_target = _annual_target(db, year, "revenue", default=None)
    annual_rounds_target = _annual_target(db, year, "rounds", default=35000.0)
    if annual_revenue_target is None and annual_rounds_target is not None:
        annual_revenue_target = _derive_annual_revenue_target_from_mix(db, year, float(annual_rounds_target))

    derived_target = _derive_target(annual_revenue_target, year, elapsed_days) if elapsed_days is not None else None
    daily_required = (float(annual_revenue_target) / float(_days_in_year(year))) if annual_revenue_target is not None else None
	    
    return {
        "period_days": int(period_days or days),
        "period": (period or "").lower().strip() or None,
        "anchor_date": anchor.isoformat(),
        "target_revenue": derived_target,
        "annual_revenue_target": annual_revenue_target,
        "daily_revenue_required": daily_required,
        "daily_revenue": [
            {
                "date": str(dr[0]),
                "amount": float(dr[1]) if dr[1] else 0.0,
                "bookings": dr[2]
            }
            for dr in daily_revenue
        ],
        "daily_paid_revenue": [
            {
                "date": str(dr[0]),
                "amount": float(dr[1]) if dr[1] else 0.0,
                "bookings": dr[2]
            }
            for dr in daily_paid_revenue
        ],
        "revenue_by_status": [
            {
                "status": sr[0],
                "amount": float(sr[1]) if sr[1] else 0.0,
                "count": sr[2]
            }
            for sr in status_revenue
        ]
    }


@router.get("/tee-times")
async def get_tee_times(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get all tee times with booking info"""
    
    tee_times = db.query(TeeTime).order_by(desc(TeeTime.tee_time)).offset(skip).limit(limit).all()
    total = db.query(func.count(TeeTime.id)).scalar()
    
    return {
        "total": total,
        "tee_times": [
            {
                "id": tt.id,
                "tee_time": tt.tee_time.isoformat(),
                "hole": tt.hole,
                "bookings": [
                    {
                        "id": b.id,
                        "player_name": b.player_name,
                        "status": b.status,
                        "price": float(b.price)
                    }
                    for b in tt.bookings
                ],
                "total_bookings": len(tt.bookings),
                "total_revenue": sum(b.price for b in tt.bookings)
            }
            for tt in tee_times
        ]
    }


@router.get("/ledger")
async def get_ledger_entries(
    skip: int = 0,
    limit: int = 50,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get all ledger entries (transaction history)"""
    
    query = db.query(LedgerEntry)

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

    total = query.count()
    total_amount = query.with_entities(func.sum(LedgerEntry.amount)).scalar() or 0.0

    entries = query.order_by(desc(LedgerEntry.created_at)).offset(skip).limit(limit).all()
    
    return {
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
                "created_at": le.created_at.isoformat()
            }
            for le in entries
        ]
    }


@router.get("/summary")
async def get_admin_summary(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get comprehensive summary for admin"""
    
    # Basic stats
    total_players = db.query(func.count(User.id)).filter(User.role == UserRole.player).scalar() or 0
    total_bookings = db.query(func.count(Booking.id)).scalar() or 0
    total_revenue = (
        db.query(func.sum(LedgerEntry.amount))
        .filter(LedgerEntry.booking_id.isnot(None))
        .scalar()
        or 0.0
    )
    completed_rounds = db.query(func.count(Round.id)).filter(Round.closed == 1).scalar() or 0
    
    # This month
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_bookings = db.query(func.count(Booking.id)).filter(Booking.created_at >= month_start).scalar() or 0
    month_revenue = (
        db.query(func.sum(LedgerEntry.amount))
        .filter(LedgerEntry.booking_id.isnot(None), LedgerEntry.created_at >= month_start)
        .scalar()
        or 0.0
    )
    
    # Top players by spending
    top_players = db.query(
        User.name,
        User.email,
        func.count(LedgerEntry.id).label("bookings"),
        func.sum(LedgerEntry.amount).label("total_spent")
    ).join(
        Booking, User.email == Booking.player_email
    ).join(
        LedgerEntry, LedgerEntry.booking_id == Booking.id
    ).group_by(
        User.email
    ).order_by(
        desc("total_spent")
    ).limit(10).all()
    
    # Recent bookings
    recent_bookings = db.query(Booking).order_by(desc(Booking.created_at)).limit(10).all()
    
    return {
        "total_players": total_players,
        "total_bookings": total_bookings,
        "total_revenue": float(total_revenue),
        "completed_rounds": completed_rounds,
        "this_month": {
            "bookings": month_bookings,
            "revenue": float(month_revenue)
        },
        "top_players": [
            {
                "name": tp[0],
                "email": tp[1],
                "bookings": tp[2],
                "total_spent": float(tp[3]) if tp[3] else 0.0
            }
            for tp in top_players
        ],
        "recent_bookings": [
            {
                "id": b.id,
                "player_name": b.player_name,
                "player_email": b.player_email,
                "price": float(b.price),
                "status": b.status,
                "created_at": b.created_at.isoformat()
            }
            for b in recent_bookings
        ]
    }


# ========================
# Price Management Models
# ========================

class PlayerPriceUpdate(BaseModel):
    """Update player's fee/price"""
    fee_category_id: Optional[int] = None  # Fee category to apply
    custom_price: Optional[float] = None   # Or set custom price directly

class AvailableFeeResponse(BaseModel):
    """Available fee category"""
    id: int
    code: int
    description: str
    price: float
    fee_type: str

# ========================
# Price Management Endpoints
# ========================

@router.get("/fee-categories")
async def get_fee_categories(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get all available fee categories for pricing players"""
    
    categories = db.query(FeeCategory).filter(FeeCategory.active == 1).all()
    
    return [
        {
            "id": cat.id,
            "code": cat.code,
            "description": cat.description,
            "price": float(cat.price),
            "fee_type": cat.fee_type
        }
        for cat in categories
    ]


@router.put("/players/{player_id}/price")
async def update_player_price(
    player_id: int,
    price_update: PlayerPriceUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Update a player's fee/price"""
    
    player = db.query(User).filter(User.id == player_id, User.role == UserRole.player).first()
    
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    # Validate input
    if price_update.fee_category_id is None and price_update.custom_price is None:
        raise HTTPException(status_code=400, detail="Either fee_category_id or custom_price must be provided")
    
    # Update based on input
    if price_update.fee_category_id:
        fee_category = db.query(FeeCategory).filter(FeeCategory.id == price_update.fee_category_id).first()
        if not fee_category:
            raise HTTPException(status_code=404, detail="Fee category not found")
        
        # Get all bookings for this player and update their fee_category_id
        bookings = db.query(Booking).filter(
            Booking.player_email == player.email,
            Booking.status.in_([BookingStatus.booked, BookingStatus.checked_in])
        ).all()
        
        for booking in bookings:
            booking.fee_category_id = fee_category.id
            booking.price = fee_category.price
            if booking.status in {BookingStatus.checked_in, BookingStatus.completed}:
                crud.ensure_paid_ledger_entry(db, booking)
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Updated {len(bookings)} bookings with fee category: {fee_category.description}",
            "player_id": player_id,
            "fee_category": {
                "id": fee_category.id,
                "code": fee_category.code,
                "description": fee_category.description,
                "price": float(fee_category.price)
            }
        }
    
    elif price_update.custom_price:
        if price_update.custom_price < 0:
            raise HTTPException(status_code=400, detail="Price cannot be negative")
        
        # Update all active bookings for this player with custom price
        bookings = db.query(Booking).filter(
            Booking.player_email == player.email,
            Booking.status.in_([BookingStatus.booked, BookingStatus.checked_in])
        ).all()
        
        for booking in bookings:
            booking.price = price_update.custom_price
            booking.fee_category_id = None  # Clear fee category when using custom price
            if booking.status in {BookingStatus.checked_in, BookingStatus.completed}:
                crud.ensure_paid_ledger_entry(db, booking)
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Updated {len(bookings)} bookings with custom price: R{price_update.custom_price:.2f}",
            "player_id": player_id,
            "custom_price": price_update.custom_price
        }


@router.get("/players/{player_id}/price-info")
async def get_player_price_info(
    player_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get price info for a specific player (admin only)"""
    
    player = db.query(User).filter(User.id == player_id, User.role == UserRole.player).first()
    
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    # Get recent bookings to see current pricing
    recent_bookings = db.query(Booking).filter(
        Booking.player_email == player.email
    ).order_by(desc(Booking.created_at)).limit(5).all()
    
    # Get current pricing info from most recent booking
    current_price = None
    current_fee_category = None
    
    if recent_bookings:
        latest = recent_bookings[0]
        current_price = latest.price
        
        if latest.fee_category_id:
            fee_cat = db.query(FeeCategory).filter(FeeCategory.id == latest.fee_category_id).first()
            if fee_cat:
                current_fee_category = {
                    "id": fee_cat.id,
                    "code": fee_cat.code,
                    "description": fee_cat.description,
                    "price": float(fee_cat.price)
                }
    
    return {
        "player_id": player_id,
        "player_name": player.name,
        "player_email": player.email,
        "current_price": current_price,
        "current_fee_category": current_fee_category,
        "recent_bookings": [
            {
                "id": b.id,
                "price": float(b.price),
                "status": b.status,
                "created_at": b.created_at.isoformat()
            }
            for b in recent_bookings
        ]
    }


@router.put("/bookings/{booking_id}/price")
async def update_booking_price(
    booking_id: int,
    price_update: PlayerPriceUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Update price for a specific booking (admin only)"""
    
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.tee_time:
        assert_day_open(db, booking.tee_time.tee_time.date())
    
    # Validate input
    if price_update.fee_category_id is None and price_update.custom_price is None:
        raise HTTPException(status_code=400, detail="Either fee_category_id or custom_price must be provided")
    
    # Update based on input
    if price_update.fee_category_id:
        fee_category = db.query(FeeCategory).filter(FeeCategory.id == price_update.fee_category_id).first()
        if not fee_category:
            raise HTTPException(status_code=404, detail="Fee category not found")
        
        booking.fee_category_id = fee_category.id
        booking.price = fee_category.price
        if booking.status in {BookingStatus.checked_in, BookingStatus.completed}:
            crud.ensure_paid_ledger_entry(db, booking)
        
        db.commit()
        db.refresh(booking)
        
        return {
            "status": "success",
            "message": f"Booking #{booking.id} price updated to {fee_category.description}",
            "booking_id": booking_id,
            "new_price": float(booking.price),
            "fee_category": {
                "id": fee_category.id,
                "code": fee_category.code,
                "description": fee_category.description,
                "price": float(fee_category.price)
            }
        }
    
    elif price_update.custom_price:
        if price_update.custom_price < 0:
            raise HTTPException(status_code=400, detail="Price cannot be negative")
        
        booking.price = price_update.custom_price
        booking.fee_category_id = None  # Clear fee category when using custom price
        if booking.status in {BookingStatus.checked_in, BookingStatus.completed}:
            crud.ensure_paid_ledger_entry(db, booking)
        
        db.commit()
        db.refresh(booking)
        
        return {
            "status": "success",
            "message": f"Booking #{booking.id} price updated to R{price_update.custom_price:.2f}",
            "booking_id": booking_id,
            "new_price": float(booking.price)
        }
