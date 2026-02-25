# app/routers/admin.py
"""
Admin Dashboard API Routes
All endpoints require admin role
"""

from __future__ import annotations

import uuid
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import String, cast, desc, func, or_, case
from datetime import date, datetime, timedelta, time as Time
from pydantic import BaseModel
from typing import Any, Optional
from app import crud
from app.models import (
    User,
    Booking,
    TeeTime,
    Round,
    LedgerEntry,
    LedgerEntryMeta,
    DayClose,
    UserRole,
    BookingStatus,
    Member,
    ClubSetting,
    ImportBatch,
    RevenueTransaction,
    ProShopProduct,
    ProShopSale,
    ProShopSaleItem,
)
from app.fee_models import FeeCategory, FeeType
from app.auth import get_current_user, get_db, get_password_hash
from calendar import isleap
from app.club_config import club_config_response
from app.tee_profile import load_tee_sheet_profile, save_tee_sheet_profile, tee_sheet_plan_for_date
from app.tenancy import get_active_club_id

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(get_active_club_id)],
)


def _safe_rollback(db: Session | None) -> None:
    if db is None:
        return
    try:
        db.rollback()
    except Exception:
        pass


def verify_admin(current_user: User = Depends(get_current_user)) -> User:
    """Verify current user is admin"""
    if current_user.role not in {UserRole.super_admin, UserRole.admin}:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def verify_staff(current_user: User = Depends(get_current_user)) -> User:
    """
    Pro shop staff access (admin + club_staff).

    Used for operational endpoints needed during the 30-day parallel (mirror) test.
    """
    if current_user.role not in {UserRole.super_admin, UserRole.admin, UserRole.club_staff}:
        raise HTTPException(status_code=403, detail="Staff access required")
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
        club_id = db.info.get("club_id")
        if not club_id:
            return default
        row = (
            db.query(KpiTarget)
            .filter(KpiTarget.club_id == int(club_id), KpiTarget.year == year, KpiTarget.metric == metric)
            .first()
        )
        if row and row.annual_target is not None:
            return float(row.annual_target)
    except Exception:
        # In offline/demo modes or before tables exist, fall back to defaults.
        _safe_rollback(db)
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
        club_id = db.info.get("club_id")
        fee_q = db.query(FeeCategory).filter(FeeCategory.code == 1)
        if club_id:
            fee_q = fee_q.filter(or_(FeeCategory.club_id == int(club_id), FeeCategory.club_id.is_(None)))
        fee = fee_q.first()
        if fee and getattr(fee, "price", None) is not None:
            return float(fee.price)

        # Otherwise: any member golf fee for 18 holes without a restricted day kind.
        q = db.query(FeeCategory).filter(
            FeeCategory.active == 1,
            FeeCategory.fee_type == FeeType.GOLF,
            FeeCategory.audience == "member",
            FeeCategory.holes == 18,
            FeeCategory.day_kind.is_(None),
        )
        if club_id:
            q = q.filter(or_(FeeCategory.club_id == int(club_id), FeeCategory.club_id.is_(None)))
        fee = q.order_by(FeeCategory.priority.desc(), FeeCategory.code.asc()).first()
        if fee and getattr(fee, "price", None) is not None:
            return float(fee.price)
    except Exception:
        _safe_rollback(db)

    # Default from the 2026 price list (member 18 holes).
    return 340.0


def _float_setting(db: Session, key: str, default: float) -> float:
    """Read a float club setting from DB; fall back to default on any error."""
    try:
        from app.models import ClubSetting

        club_id = db.info.get("club_id")
        if not club_id:
            return float(default)
        row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == key).first()
        if not row:
            return float(default)
        raw = (row.value or "").strip()
        if not raw:
            return float(default)
        return float(raw)
    except Exception:
        _safe_rollback(db)
        return float(default)


def _int_setting(db: Session, key: str, default: int) -> int:
    try:
        return int(_float_setting(db, key, float(default)))
    except Exception:
        return int(default)


def _upsert_setting(db: Session, key: str, value: int | float | str) -> None:
    club_id = db.info.get("club_id")
    if not club_id:
        raise HTTPException(status_code=400, detail="club_id is required")
    row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == key).first()
    if row:
        row.value = str(value)
        row.updated_at = datetime.utcnow()
    else:
        db.add(ClubSetting(club_id=int(club_id), key=key, value=str(value)))


def _normalize_revenue_stream(raw: str | None) -> str:
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
    group_cancel_days: int = 10


@router.get("/booking-window", response_model=BookingWindowSettings)
def get_booking_window_settings(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    return BookingWindowSettings(
        member_days=_int_setting(db, "booking_window_member_days", 28),
        affiliated_days=_int_setting(db, "booking_window_affiliated_days", 28),
        non_affiliated_days=_int_setting(db, "booking_window_non_affiliated_days", 28),
        group_cancel_days=_int_setting(db, "booking_window_group_cancel_days", 10),
    )


@router.put("/booking-window", response_model=BookingWindowSettings)
def update_booking_window_settings(
    payload: BookingWindowSettings,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    # Guard rails
    member_days = max(0, min(365, int(payload.member_days)))
    affiliated_days = max(0, min(365, int(payload.affiliated_days)))
    non_affiliated_days = max(0, min(365, int(payload.non_affiliated_days)))
    group_cancel_days = max(0, min(365, int(getattr(payload, "group_cancel_days", 10))))

    _upsert_setting(db, "booking_window_member_days", member_days)
    _upsert_setting(db, "booking_window_affiliated_days", affiliated_days)
    _upsert_setting(db, "booking_window_non_affiliated_days", non_affiliated_days)
    _upsert_setting(db, "booking_window_group_cancel_days", group_cancel_days)
    db.commit()

    return BookingWindowSettings(
        member_days=member_days,
        affiliated_days=affiliated_days,
        non_affiliated_days=non_affiliated_days,
        group_cancel_days=group_cancel_days,
    )


class TeeSheetProfilePayload(BaseModel):
    profile: dict[str, Any]


@router.get("/tee-sheet-profile")
def get_tee_sheet_profile(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    profile = load_tee_sheet_profile(db, club_id=club_id)
    today = date.today()
    return {
        "profile": profile,
        "today_plan_18": tee_sheet_plan_for_date(today, profile, holes=18),
        "today_plan_9": tee_sheet_plan_for_date(today, profile, holes=9),
    }


@router.put("/tee-sheet-profile")
def update_tee_sheet_profile(
    payload: TeeSheetProfilePayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    if not isinstance(payload.profile, dict):
        raise HTTPException(status_code=400, detail="profile must be an object")
    normalized = save_tee_sheet_profile(db, club_id=club_id, profile=payload.profile)
    db.commit()
    return {"status": "success", "profile": normalized}


class ClubProfileSettings(BaseModel):
    club_name: str | None = None
    club_slug: str | None = None
    logo_url: str | None = None
    currency_symbol: str | None = None
    member_label: str | None = None
    visitor_label: str | None = None
    non_affiliated_label: str | None = None
    home_club_keywords: list[str] | None = None
    suggested_home_clubs: list[str] | None = None


@router.get("/club-profile")
def get_club_profile_settings(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    # Admin-visible view of the current club config, sourced from club_settings/env/defaults.
    return club_config_response(db, club_id=club_id)


@router.put("/club-profile")
def update_club_profile_settings(
    payload: ClubProfileSettings,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    """
    Update club profile settings used for branding + membership detection.

    Stored in `club_settings` so each club deployment can be configured without code changes.
    """
    if payload.club_name is not None:
        name = str(payload.club_name).strip()
        if not name:
            raise HTTPException(status_code=400, detail="club_name cannot be empty")
        _upsert_setting(db, "club_name", name)
    if payload.club_slug is not None:
        _upsert_setting(db, "club_slug", str(payload.club_slug).strip() or "")
    if payload.logo_url is not None:
        _upsert_setting(db, "club_logo_url", str(payload.logo_url).strip() or "")
    if payload.currency_symbol is not None:
        _upsert_setting(db, "club_currency_symbol", str(payload.currency_symbol).strip() or "")

    if payload.member_label is not None:
        _upsert_setting(db, "club_member_label", str(payload.member_label).strip() or "")
    if payload.visitor_label is not None:
        _upsert_setting(db, "club_visitor_label", str(payload.visitor_label).strip() or "")
    if payload.non_affiliated_label is not None:
        _upsert_setting(db, "club_non_affiliated_label", str(payload.non_affiliated_label).strip() or "")

    if payload.home_club_keywords is not None:
        keywords = [str(v or "").strip() for v in payload.home_club_keywords]
        keywords = [v for v in keywords if v]
        _upsert_setting(db, "club_home_club_keywords", json.dumps(keywords))

    if payload.suggested_home_clubs is not None:
        clubs = [str(v or "").strip() for v in payload.suggested_home_clubs]
        clubs = [v for v in clubs if v]
        _upsert_setting(db, "club_suggested_home_clubs", json.dumps(clubs))

    db.commit()
    return club_config_response(db, club_id=club_id)

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
    event_type: str = "group"
    account_code: str | None = None
    price: float = 0.0


def _bulk_event_type_value(raw: str | None, default: str = "group") -> str:
    value = str(raw or "").strip().lower()
    if value in {"group", "golf_day", "pmg", "event"}:
        return value
    return default


def _bulk_booking_event_type(booking: Booking) -> str:
    from_group_id = _bulk_event_type_value(getattr(booking, "external_group_id", None), default="")
    if from_group_id in {"group", "golf_day", "pmg"}:
        return from_group_id

    provider = str(getattr(booking, "external_provider", "") or "").strip().lower()
    if provider == "bulk_pmg":
        return "pmg"
    if provider == "bulk_golf_day":
        return "golf_day"

    marker = f"{getattr(booking, 'player_name', '')} {getattr(booking, 'notes', '')}".lower()
    if "pmg" in marker:
        return "pmg"
    if "golf day" in marker:
        return "golf_day"
    return "group" if provider == "bulk" else "event"


def _enforce_group_cancel_window(db: Session, booking: Booking, actor: User) -> None:
    if str(getattr(booking, "external_provider", "") or "").strip().lower() != "bulk":
        return
    if getattr(actor, "role", None) == UserRole.super_admin:
        return

    event_type = _bulk_booking_event_type(booking)
    if event_type not in {"group", "golf_day"}:
        return

    tee_dt = getattr(getattr(booking, "tee_time", None), "tee_time", None)
    if tee_dt is None:
        return
    min_days = max(0, _int_setting(db, "booking_window_group_cancel_days", 10))
    days_out = (tee_dt.date() - date.today()).days
    if days_out < min_days:
        label = "Golf day" if event_type == "golf_day" else "Group"
        raise HTTPException(
            status_code=409,
            detail=f"{label} cancellations require at least {min_days} days notice.",
        )


@router.post("/tee-sheet/bulk-book")
def bulk_book_tee_sheet(
    req: BulkTeeBookingRequest,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
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
    event_type = _bulk_event_type_value(req.event_type, default="group")
    account_code = str(req.account_code or "").strip() or None

    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

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
                    club_id=club_id,
                    tee_time_id=tt.id,
                    created_by_user_id=getattr(staff, "id", None),
                    # Keep the tee sheet clean: show only the event/group name in the slot.
                    # Group/undo metadata lives on external_provider/external_booking_id.
                    player_name=group_name,
                    club_card=account_code,
                    party_size=1,
                    price=price,
                    status=BookingStatus.booked,
                    holes=holes,
                    prepaid=False,
                    external_provider="bulk",
                    external_booking_id=group_id,
                    external_group_id=event_type,
                    notes=f"Bulk booking ({event_type}): {group_name} (group {group_id})",
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
        "event_type": event_type,
        "account_code": account_code,
    }


@router.delete("/tee-sheet/bulk-book/{group_id}")
def undo_bulk_book_tee_sheet(
    group_id: str,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
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

    first_booking = bookings[0]
    _enforce_group_cancel_window(db, first_booking, staff)

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
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    """Get main dashboard statistics"""
    
    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]

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
                if start_d is not None:
                    q = q.filter(func.date(TeeTime.tee_time) >= start_d)
                if end_d is not None:
                    q = q.filter(func.date(TeeTime.tee_time) <= end_d)

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

    # Total other revenue (mirrored via daily CSV imports).
    # Keep non-blocking so older DBs without the table can still load the dashboard.
    try:
        other_total_revenue = (
            db.query(func.sum(RevenueTransaction.amount))
            .filter(RevenueTransaction.club_id == club_id)
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
    today = datetime.utcnow().date()
    today_bookings = (
        db.query(func.count(Booking.id))
        .join(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(TeeTime.club_id == club_id, func.date(TeeTime.tee_time) == today)
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
                .filter(RevenueTransaction.club_id == club_id)
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
    imported_pro_shop_total = float(other_total_by_stream.get("pro_shop", 0.0))
    golf_total_revenue = float(total_revenue) + imported_golf_total
    pro_shop_total_revenue = imported_pro_shop_total

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
        try:
            paid_revenue = (
                db.query(func.sum(LedgerEntry.amount))
                .filter(
                    LedgerEntry.club_id == club_id,
                    LedgerEntry.booking_id.isnot(None),
                    func.date(LedgerEntry.created_at) >= start_d,
                    func.date(LedgerEntry.created_at) <= end_d,
                )
                .scalar()
                or 0.0
            )
            paid_rounds = (
                db.query(func.count(LedgerEntry.id))
                .filter(
                    LedgerEntry.club_id == club_id,
                    LedgerEntry.booking_id.isnot(None),
                    func.date(LedgerEntry.created_at) >= start_d,
                    func.date(LedgerEntry.created_at) <= end_d,
                )
                .scalar()
                or 0
            )
            return float(paid_revenue), int(paid_rounds)
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
                func.date(TeeTime.tee_time) == today,
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
                func.date(TeeTime.tee_time) == today,
                Booking.status == BookingStatus.no_show,
            )
            .scalar()
            or 0
        )
        golf_today_slot_capacity = (
            db.query(func.sum(TeeTime.capacity))
            .filter(TeeTime.club_id == club_id, func.date(TeeTime.tee_time) == today)
            .scalar()
            or 0
        )
        golf_today_slot_booked = (
            db.query(func.count(Booking.id))
            .join(TeeTime, Booking.tee_time_id == TeeTime.id)
            .filter(
                TeeTime.club_id == club_id,
                Booking.club_id == club_id,
                func.date(TeeTime.tee_time) == today,
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
            _stream_amount(day_stream_stats, "pro_shop"),
            _stream_txns(day_stream_stats, "pro_shop"),
            _stream_amount(prior_day_stream_stats, "pro_shop"),
        ),
        "week": _period_rollup(
            _stream_amount(week_stream_stats, "pro_shop"),
            _stream_txns(week_stream_stats, "pro_shop"),
            _stream_amount(prior_week_stream_stats, "pro_shop"),
        ),
        "month": _period_rollup(
            _stream_amount(month_stream_stats, "pro_shop"),
            _stream_txns(month_stream_stats, "pro_shop"),
            _stream_amount(prior_month_stream_stats, "pro_shop"),
        ),
        "ytd": _period_rollup(
            _stream_amount(ytd_stream_stats, "pro_shop"),
            _stream_txns(ytd_stream_stats, "pro_shop"),
            _stream_amount(prior_ytd_stream_stats, "pro_shop"),
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
            "note": "Executive view across golf, pro shop, and imported operations. Switch streams above for operational detail.",
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
        "total_members": total_members,
        "golf_revenue_total": float(golf_total_revenue),
        "golf_revenue_today": float(golf_today_revenue),
        "golf_revenue_week": float(golf_week_revenue),
        "pro_shop_revenue_total": float(pro_shop_total_revenue),
        "pro_shop_revenue_today": float(pro_shop_today_revenue),
        "pro_shop_revenue_week": float(pro_shop_week_revenue),
        "other_revenue_total": float(other_total_revenue),
        "other_revenue_today": float(today_other_revenue),
        "other_revenue_week": float(week_other_revenue),
        "total_revenue": float(combined_total_revenue),
        "today_revenue": float(combined_today_revenue),
        "week_revenue": float(combined_week_revenue),
        "revenue_streams": revenue_streams,
        "operation_insights": operation_insights,
        "imports": imports,
        "bookings_by_status": bookings_by_status,
        "bookings_by_status_periods": bookings_by_status_periods,
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
    period: Optional[str] = None,  # day | week | month | ytd
    date_basis: Optional[str] = "tee_time",  # tee_time | created
    anchor_date: Optional[date] = None,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff)
):
    """Get all bookings with filters"""
    
    query = (
        db.query(Booking)
        .options(selectinload(Booking.tee_time), selectinload(Booking.round))
        .outerjoin(TeeTime, Booking.tee_time_id == TeeTime.id)
    )
    
    if status:
        query = query.filter(Booking.status == status)

    basis = str(date_basis or "tee_time").strip().lower()
    if basis not in {"tee_time", "created"}:
        raise HTTPException(status_code=400, detail="Invalid date_basis (use tee_time or created)")

    # Filter by selected date basis range (inclusive start, exclusive end).
    # Used by admin UI day/week/month/ytd views.
    if start and end:
        if basis == "created":
            query = query.filter(Booking.created_at >= start, Booking.created_at < end)
            query = query.order_by(desc(Booking.created_at), desc(Booking.id))
        else:
            query = query.filter(TeeTime.tee_time >= start, TeeTime.tee_time < end)
            query = query.order_by(TeeTime.tee_time, Booking.id)
    elif period and anchor_date:
        period = period.lower().strip()
        if period not in {"day", "week", "month", "ytd"}:
            raise HTTPException(status_code=400, detail="Invalid period (use day, week, month, or ytd)")

        if period == "day":
            range_start = datetime.combine(anchor_date, datetime.min.time())
            range_end = range_start + timedelta(days=1)
        elif period == "week":
            # Monday-start week
            monday = anchor_date - timedelta(days=anchor_date.weekday())
            range_start = datetime.combine(monday, datetime.min.time())
            range_end = range_start + timedelta(days=7)
        elif period == "month":
            month_start = anchor_date.replace(day=1)
            if month_start.month == 12:
                next_month = date(month_start.year + 1, 1, 1)
            else:
                next_month = date(month_start.year, month_start.month + 1, 1)
            range_start = datetime.combine(month_start, datetime.min.time())
            range_end = datetime.combine(next_month, datetime.min.time())
        else:  # ytd
            ytd_start = date(anchor_date.year, 1, 1)
            range_start = datetime.combine(ytd_start, datetime.min.time())
            range_end = datetime.combine(anchor_date + timedelta(days=1), datetime.min.time())

        if basis == "created":
            query = query.filter(Booking.created_at >= range_start, Booking.created_at < range_end)
            query = query.order_by(desc(Booking.created_at), desc(Booking.id))
        else:
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
    staff: User = Depends(verify_staff)
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
        club_id = int(getattr(db, "info", {}).get("club_id") or 0)
        fee_q = db.query(FeeCategory).filter(FeeCategory.id == booking.fee_category_id)
        if club_id > 0:
            fee_q = fee_q.filter(or_(FeeCategory.club_id == club_id, FeeCategory.club_id.is_(None)))
        fee_cat = fee_q.first()
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


class BookingAccountCodeUpdate(BaseModel):
    account_code: Optional[str] = None


@router.put("/bookings/{booking_id}/status")
async def update_booking_status(
    booking_id: int,
    payload: BookingStatusUpdate,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff)
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

    if payload.status == BookingStatus.cancelled.value:
        _enforce_group_cancel_window(db, booking, staff)

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

    _enforce_group_cancel_window(db, booking, admin)

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
    staff: User = Depends(verify_staff),
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
    if method not in {"CARD", "CASH", "EFT", "ONLINE", "ACCOUNT"}:
        raise HTTPException(status_code=400, detail="Invalid payment method. Use CARD/CASH/EFT/ONLINE/ACCOUNT")

    meta = db.query(LedgerEntryMeta).filter(LedgerEntryMeta.ledger_entry_id == ledger_entry.id).first()
    if meta:
        meta.payment_method = method
        meta.updated_at = datetime.utcnow()
    else:
        db.add(LedgerEntryMeta(ledger_entry_id=ledger_entry.id, payment_method=method))

    db.commit()
    return {"status": "success", "booking_id": booking_id, "ledger_entry_id": ledger_entry.id, "payment_method": method}


@router.put("/bookings/{booking_id}/account-code")
async def update_booking_account_code(
    booking_id: int,
    payload: BookingAccountCodeUpdate,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.tee_time:
        assert_day_open(db, booking.tee_time.tee_time.date())

    code = str(payload.account_code or "").strip()
    booking.club_card = code or None
    db.commit()
    return {"status": "success", "booking_id": booking_id, "account_code": booking.club_card}


@router.get("/players")
async def get_all_players(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff)
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
    staff: User = Depends(verify_staff),
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


class MemberUpsertPayload(BaseModel):
    member_number: str | None = None
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    handicap_number: str | None = None
    home_club: str | None = None
    gender: str | None = None
    player_category: str | None = None
    student: bool | None = None
    handicap_index: float | None = None
    handicap_sa_id: str | None = None
    active: bool | None = True


@router.post("/members")
async def create_member(
    payload: MemberUpsertPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

    first = (payload.first_name or "").strip()
    last = (payload.last_name or "").strip()
    if not first or not last:
        raise HTTPException(status_code=400, detail="first_name and last_name are required")

    email = (payload.email or "").strip().lower() or None
    phone = (payload.phone or "").strip() or None
    member_number = (payload.member_number or "").strip() or None
    handicap_number = (payload.handicap_number or "").strip() or None
    home_club = (payload.home_club or "").strip() or None
    gender = (payload.gender or "").strip() or None
    player_category = (payload.player_category or "").strip() or None
    handicap_sa_id = (payload.handicap_sa_id or "").strip() or None

    row = Member(
        club_id=club_id,
        member_number=member_number,
        first_name=first,
        last_name=last,
        email=email,
        phone=phone,
        handicap_number=handicap_number,
        home_club=home_club,
        active=1 if bool(payload.active) else 0,
        gender=gender,
        player_category=player_category,
        student=payload.student,
        handicap_index=float(payload.handicap_index) if payload.handicap_index is not None else None,
        handicap_sa_id=handicap_sa_id,
    )
    db.add(row)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        msg = str(getattr(e, "orig", e) or "")[:180]
        raise HTTPException(status_code=409, detail=f"Member create failed (duplicate?): {msg}")

    db.refresh(row)
    return {"status": "success", "member_id": row.id}


@router.put("/members/{member_id}")
async def update_member(
    member_id: int,
    payload: MemberUpsertPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    row = db.query(Member).filter(Member.id == int(member_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Member not found")

    first = (payload.first_name or "").strip()
    last = (payload.last_name or "").strip()
    if not first or not last:
        raise HTTPException(status_code=400, detail="first_name and last_name are required")

    row.first_name = first
    row.last_name = last
    row.member_number = (payload.member_number or "").strip() or None
    row.email = (payload.email or "").strip().lower() or None
    row.phone = (payload.phone or "").strip() or None
    row.handicap_number = (payload.handicap_number or "").strip() or None
    row.home_club = (payload.home_club or "").strip() or None
    row.gender = (payload.gender or "").strip() or None
    row.player_category = (payload.player_category or "").strip() or None
    row.student = payload.student
    row.handicap_index = float(payload.handicap_index) if payload.handicap_index is not None else None
    row.handicap_sa_id = (payload.handicap_sa_id or "").strip() or None
    if payload.active is not None:
        row.active = 1 if bool(payload.active) else 0

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        msg = str(getattr(e, "orig", e) or "")[:180]
        raise HTTPException(status_code=409, detail=f"Member update failed (duplicate?): {msg}")

    return {"status": "success"}


@router.get("/members/{member_id}")
async def get_member_detail(
    member_id: int,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    """
    Member profile view (the imported club membership list).

    This is distinct from "players" (registered user accounts).
    """
    member = db.query(Member).filter(Member.id == int(member_id)).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    linked_account = None
    email = (getattr(member, "email", None) or "").strip().lower()
    if email:
        acct = (
            db.query(User)
            .filter(func.lower(User.email) == email, User.role == UserRole.player)
            .first()
        )
        if acct:
            linked_account = {
                "id": acct.id,
                "name": acct.name,
                "email": acct.email,
                "handicap_sa_id": getattr(acct, "handicap_sa_id", None),
                "handicap_index": float(getattr(acct, "handicap_index", None)) if getattr(acct, "handicap_index", None) is not None else None,
            }

    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]

    stats = (
        db.query(
            func.count(Booking.id).label("bookings_count"),
            func.coalesce(
                func.sum(case((Booking.status.in_(paid_statuses), Booking.price), else_=0.0)),
                0.0,
            ).label("total_spent"),
            func.max(TeeTime.tee_time).label("last_seen"),
        )
        .outerjoin(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(Booking.member_id == member.id)
        .first()
    )

    bookings = (
        db.query(Booking)
        .options(selectinload(Booking.tee_time))
        .filter(Booking.member_id == member.id)
        .order_by(desc(Booking.created_at))
        .limit(15)
        .all()
    )

    return {
        "member": {
            "id": member.id,
            "member_number": member.member_number,
            "first_name": member.first_name,
            "last_name": member.last_name,
            "name": f"{member.first_name} {member.last_name}".strip(),
            "email": member.email,
            "phone": member.phone,
            "handicap_number": member.handicap_number,
            "handicap_sa_id": getattr(member, "handicap_sa_id", None),
            "handicap_index": float(getattr(member, "handicap_index", None)) if getattr(member, "handicap_index", None) is not None else None,
            "home_club": member.home_club,
            "gender": getattr(member, "gender", None),
            "player_category": getattr(member, "player_category", None),
            "student": bool(getattr(member, "student", False)) if getattr(member, "student", None) is not None else None,
            "active": bool(member.active),
        },
        "linked_account": linked_account,
        "stats": {
            "bookings_count": int(getattr(stats, "bookings_count", 0) or 0),
            "total_spent": float(getattr(stats, "total_spent", 0.0) or 0.0),
            "last_seen": getattr(stats, "last_seen", None).isoformat() if getattr(stats, "last_seen", None) else None,
        },
        "recent_bookings": [
            {
                "id": b.id,
                "tee_time": b.tee_time.tee_time.isoformat() if b.tee_time and b.tee_time.tee_time else None,
                "status": b.status,
                "holes": b.holes,
                "price": float(b.price or 0.0),
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in bookings
        ],
    }


@router.get("/guests")
async def get_guest_players(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    guest_type: Optional[str] = None,  # all | affiliated | non_affiliated
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
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

    gt = (guest_type or "").strip().lower()
    if gt in {"affiliated", "affiliate", "visitor"}:
        # Treat NULL as "visitor" for legacy bookings.
        query = query.filter(or_(Booking.player_type.is_(None), Booking.player_type.in_(["visitor", "reciprocity"])))
    elif gt in {"non_affiliated", "non-affiliated", "nonaffiliated"}:
        query = query.filter(Booking.player_type == "non_affiliated")

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
    staff: User = Depends(verify_staff)
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
    staff: User = Depends(verify_staff),
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


@router.get("/staff")
async def get_staff_users(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    """
    List staff accounts for the current club (admins + club_staff).

    Note: "Super admin" users are global and are managed via /api/super.
    """
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

    query = (
        db.query(User)
        .filter(User.role.in_([UserRole.admin, UserRole.club_staff]))
        .filter(User.club_id == club_id)
    )
    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        query = query.filter(or_(func.lower(User.name).like(like), func.lower(User.email).like(like)))

    total = query.count()
    rows = (
        query.order_by(func.lower(cast(User.role, String)).asc(), func.lower(User.name).asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "staff": [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "role": getattr(u.role, "value", u.role),
            }
            for u in rows
        ],
    }


class StaffUpsertPayload(BaseModel):
    name: str
    email: str
    password: str | None = None
    role: str = "club_staff"  # club_staff only (admin managed by super admin)
    force_reset: bool | None = False


def _parse_staff_role_for_club_admin(raw: str | None) -> UserRole:
    r = (raw or "").strip().lower()
    if r in {"club_staff", "staff", "proshop"}:
        return UserRole.club_staff
    # Only super admins should create/promote admins.
    raise HTTPException(status_code=400, detail="role must be 'club_staff'")


def _find_user_by_email_global(db: Session, email: str) -> User | None:
    """
    Lookup a user by email without tenant scoping.

    The admin router sets `db.info["club_id"]`, and the tenant scoping hook applies
    `User.club_id == club_id` automatically on SELECTs. For uniqueness checks we must
    query globally (email is unique across all clubs).
    """
    normalized = (email or "").strip().lower()
    if not normalized:
        return None

    had_scope = "club_id" in getattr(db, "info", {})
    saved_scope = getattr(db, "info", {}).get("club_id")
    if had_scope:
        db.info.pop("club_id", None)
    try:
        return db.query(User).filter(func.lower(User.email) == normalized).first()
    finally:
        if had_scope:
            db.info["club_id"] = saved_scope


@router.post("/staff")
async def create_staff_user_for_club(
    payload: StaffUpsertPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="valid email is required")
    name = (payload.name or "").strip() or email

    role = _parse_staff_role_for_club_admin(payload.role)

    existing = _find_user_by_email_global(db, email)
    if existing:
        if existing.role == UserRole.super_admin:
            raise HTTPException(status_code=409, detail="Cannot modify super admin user")
        if existing.role == UserRole.admin:
            raise HTTPException(status_code=409, detail="Admin users are managed by Super Admin")

        existing_club_id = int(getattr(existing, "club_id", 0) or 0)
        if existing_club_id and existing_club_id != int(club_id):
            raise HTTPException(status_code=409, detail="User exists in another club")

        # Legacy: player accounts created before multi-club may have no club_id.
        if not existing_club_id and existing.role == UserRole.player and bool(payload.force_reset):
            existing.club_id = int(club_id)
            existing_club_id = int(club_id)

        if existing_club_id != int(club_id):
            raise HTTPException(status_code=409, detail="User exists but is not assigned to this club")
        if existing.role not in {UserRole.club_staff, UserRole.player}:
            raise HTTPException(status_code=409, detail="User exists with a non-staff role")
        if not bool(payload.force_reset):
            raise HTTPException(status_code=409, detail="User already exists (set force_reset=true to update)")

        existing.name = name
        existing.role = role
        if payload.password:
            existing.password = get_password_hash(payload.password)
        db.commit()
        db.refresh(existing)
        return {"status": "success", "user_id": existing.id}

    if not payload.password:
        raise HTTPException(status_code=400, detail="password is required for new staff users")

    u = User(
        name=name,
        email=email,
        password=get_password_hash(payload.password),
        role=role,
        club_id=club_id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"status": "success", "user_id": u.id}


@router.put("/staff/{user_id}")
async def update_staff_user_for_club(
    user_id: int,
    payload: StaffUpsertPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == UserRole.super_admin:
        raise HTTPException(status_code=409, detail="Cannot modify super admin user")
    if user.role == UserRole.admin:
        raise HTTPException(status_code=409, detail="Admin users are managed by Super Admin")
    if user.role != UserRole.club_staff:
        raise HTTPException(status_code=409, detail="Only club_staff users can be modified here")
    if int(getattr(user, "club_id", 0) or 0) != int(club_id):
        raise HTTPException(status_code=403, detail="Cannot edit another club's staff")

    user.name = (payload.name or "").strip() or user.name
    # Do not allow role changes beyond club_staff here.
    user.role = _parse_staff_role_for_club_admin(payload.role)
    if payload.password:
        user.password = get_password_hash(payload.password)

    # email changes are risky (linking + auth); disallow in club admin UI for now.
    if (payload.email or "").strip() and (payload.email or "").strip().lower() != str(user.email or "").lower():
        raise HTTPException(status_code=400, detail="email cannot be changed; create a new staff user instead")

    db.commit()
    return {"status": "success"}


class ProShopProductUpsertPayload(BaseModel):
    sku: str
    name: str
    category: Optional[str] = None
    unit_price: float = 0.0
    cost_price: Optional[float] = None
    stock_qty: int = 0
    reorder_level: int = 0
    active: bool = True


class ProShopProductUpdatePayload(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    unit_price: Optional[float] = None
    cost_price: Optional[float] = None
    stock_qty: Optional[int] = None
    reorder_level: Optional[int] = None
    active: Optional[bool] = None


class ProShopStockAdjustPayload(BaseModel):
    delta: int
    reason: Optional[str] = None


class ProShopSaleItemPayload(BaseModel):
    product_id: int
    quantity: int
    unit_price: Optional[float] = None


class ProShopSaleCreatePayload(BaseModel):
    customer_name: Optional[str] = None
    payment_method: Optional[str] = "card"
    notes: Optional[str] = None
    discount: Optional[float] = 0.0
    tax: Optional[float] = 0.0
    items: list[ProShopSaleItemPayload]


def _serialize_pro_shop_product(product: ProShopProduct) -> dict:
    return {
        "id": int(product.id),
        "sku": str(product.sku or ""),
        "name": str(product.name or ""),
        "category": str(product.category or "") if product.category else None,
        "unit_price": float(product.unit_price or 0.0),
        "cost_price": float(product.cost_price) if product.cost_price is not None else None,
        "stock_qty": int(product.stock_qty or 0),
        "reorder_level": int(product.reorder_level or 0),
        "active": bool(int(product.active or 0) == 1),
        "updated_at": product.updated_at.isoformat() if product.updated_at else None,
    }


def _serialize_pro_shop_sale(sale: ProShopSale) -> dict:
    return {
        "id": int(sale.id),
        "sold_at": sale.sold_at.isoformat() if sale.sold_at else None,
        "customer_name": sale.customer_name,
        "payment_method": sale.payment_method,
        "subtotal": float(sale.subtotal or 0.0),
        "discount": float(sale.discount or 0.0),
        "tax": float(sale.tax or 0.0),
        "total": float(sale.total or 0.0),
        "items": [
            {
                "id": int(item.id),
                "product_id": int(item.product_id) if item.product_id is not None else None,
                "sku": item.sku_snapshot,
                "name": item.name_snapshot,
                "category": item.category_snapshot,
                "quantity": int(item.quantity or 0),
                "unit_price": float(item.unit_price or 0.0),
                "line_total": float(item.line_total or 0.0),
            }
            for item in sorted((sale.items or []), key=lambda row: int(row.id or 0))
        ],
    }


def _normalize_payment_method(raw: str | None) -> str:
    value = (raw or "").strip().lower()
    if value in {"cash", "card", "account", "eft"}:
        return value
    return "other"


@router.get("/pro-shop/products")
async def list_pro_shop_products(
    q: Optional[str] = None,
    active_only: bool = False,
    limit: int = 250,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    q = (q or "").strip()
    safe_limit = max(1, min(int(limit or 250), 500))
    query = db.query(ProShopProduct).filter(ProShopProduct.club_id == club_id)
    if active_only:
        query = query.filter(ProShopProduct.active == 1)
    if q:
        q_like = f"%{q.lower()}%"
        query = query.filter(
            or_(
                func.lower(ProShopProduct.sku).like(q_like),
                func.lower(ProShopProduct.name).like(q_like),
                func.lower(func.coalesce(ProShopProduct.category, "")).like(q_like),
            )
        )

    rows = (
        query
        .order_by(ProShopProduct.active.desc(), ProShopProduct.name.asc(), ProShopProduct.id.asc())
        .limit(safe_limit)
        .all()
    )
    low_stock_count = (
        db.query(func.count(ProShopProduct.id))
        .filter(
            ProShopProduct.club_id == club_id,
            ProShopProduct.active == 1,
            ProShopProduct.stock_qty <= func.coalesce(ProShopProduct.reorder_level, 0),
        )
        .scalar()
        or 0
    )

    return {
        "products": [_serialize_pro_shop_product(row) for row in rows],
        "low_stock_count": int(low_stock_count or 0),
    }


@router.post("/pro-shop/products")
async def create_pro_shop_product(
    payload: ProShopProductUpsertPayload,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    sku = (payload.sku or "").strip()
    name = (payload.name or "").strip()
    if not sku:
        raise HTTPException(status_code=400, detail="sku is required")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    unit_price = float(payload.unit_price or 0.0)
    cost_price = payload.cost_price
    stock_qty = int(payload.stock_qty or 0)
    reorder_level = int(payload.reorder_level or 0)
    if unit_price < 0:
        raise HTTPException(status_code=400, detail="unit_price must be >= 0")
    if cost_price is not None and float(cost_price) < 0:
        raise HTTPException(status_code=400, detail="cost_price must be >= 0")
    if stock_qty < 0:
        raise HTTPException(status_code=400, detail="stock_qty must be >= 0")
    if reorder_level < 0:
        raise HTTPException(status_code=400, detail="reorder_level must be >= 0")

    exists = (
        db.query(ProShopProduct.id)
        .filter(ProShopProduct.club_id == club_id, func.lower(ProShopProduct.sku) == sku.lower())
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail=f"Product with sku '{sku}' already exists")

    now = datetime.utcnow()
    row = ProShopProduct(
        club_id=club_id,
        sku=sku,
        name=name,
        category=(payload.category or "").strip() or None,
        unit_price=unit_price,
        cost_price=(float(cost_price) if cost_price is not None else None),
        stock_qty=stock_qty,
        reorder_level=reorder_level,
        active=1 if payload.active else 0,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {"status": "success", "product": _serialize_pro_shop_product(row)}


@router.put("/pro-shop/products/{product_id}")
async def update_pro_shop_product(
    product_id: int,
    payload: ProShopProductUpdatePayload,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    row = db.query(ProShopProduct).filter(ProShopProduct.club_id == club_id, ProShopProduct.id == int(product_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")

    if payload.sku is not None:
        sku = (payload.sku or "").strip()
        if not sku:
            raise HTTPException(status_code=400, detail="sku cannot be empty")
        dup = (
            db.query(ProShopProduct.id)
            .filter(
                ProShopProduct.club_id == club_id,
                func.lower(ProShopProduct.sku) == sku.lower(),
                ProShopProduct.id != row.id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail=f"Product with sku '{sku}' already exists")
        row.sku = sku

    if payload.name is not None:
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        row.name = name

    if payload.category is not None:
        row.category = (payload.category or "").strip() or None

    if payload.unit_price is not None:
        unit_price = float(payload.unit_price)
        if unit_price < 0:
            raise HTTPException(status_code=400, detail="unit_price must be >= 0")
        row.unit_price = unit_price

    if payload.cost_price is not None:
        cost_price = float(payload.cost_price)
        if cost_price < 0:
            raise HTTPException(status_code=400, detail="cost_price must be >= 0")
        row.cost_price = cost_price

    if payload.stock_qty is not None:
        stock_qty = int(payload.stock_qty)
        if stock_qty < 0:
            raise HTTPException(status_code=400, detail="stock_qty must be >= 0")
        row.stock_qty = stock_qty

    if payload.reorder_level is not None:
        reorder_level = int(payload.reorder_level)
        if reorder_level < 0:
            raise HTTPException(status_code=400, detail="reorder_level must be >= 0")
        row.reorder_level = reorder_level

    if payload.active is not None:
        row.active = 1 if payload.active else 0

    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return {"status": "success", "product": _serialize_pro_shop_product(row)}


@router.post("/pro-shop/products/{product_id}/adjust-stock")
async def adjust_pro_shop_stock(
    product_id: int,
    payload: ProShopStockAdjustPayload,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    row = db.query(ProShopProduct).filter(ProShopProduct.club_id == club_id, ProShopProduct.id == int(product_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")

    delta = int(payload.delta or 0)
    if delta == 0:
        raise HTTPException(status_code=400, detail="delta must be non-zero")

    next_qty = int(row.stock_qty or 0) + delta
    if next_qty < 0:
        raise HTTPException(status_code=409, detail="Stock cannot be negative")

    row.stock_qty = next_qty
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return {
        "status": "success",
        "reason": (payload.reason or "").strip() or None,
        "product": _serialize_pro_shop_product(row),
    }


@router.get("/pro-shop/sales")
async def list_pro_shop_sales(
    limit: int = 25,
    days: int = 30,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    safe_limit = max(1, min(int(limit or 25), 200))
    safe_days = max(1, min(int(days or 30), 365))
    start_dt = datetime.utcnow() - timedelta(days=safe_days)
    today = datetime.utcnow().date()

    query = (
        db.query(ProShopSale)
        .options(selectinload(ProShopSale.items))
        .filter(ProShopSale.club_id == club_id, ProShopSale.sold_at >= start_dt)
    )
    rows = query.order_by(desc(ProShopSale.sold_at), desc(ProShopSale.id)).limit(safe_limit).all()

    period_total = (
        db.query(func.sum(ProShopSale.total))
        .filter(ProShopSale.club_id == club_id, ProShopSale.sold_at >= start_dt)
        .scalar()
        or 0.0
    )
    period_transactions = (
        db.query(func.count(ProShopSale.id))
        .filter(ProShopSale.club_id == club_id, ProShopSale.sold_at >= start_dt)
        .scalar()
        or 0
    )
    today_total = (
        db.query(func.sum(ProShopSale.total))
        .filter(ProShopSale.club_id == club_id, func.date(ProShopSale.sold_at) == today)
        .scalar()
        or 0.0
    )
    today_transactions = (
        db.query(func.count(ProShopSale.id))
        .filter(ProShopSale.club_id == club_id, func.date(ProShopSale.sold_at) == today)
        .scalar()
        or 0
    )

    return {
        "sales": [_serialize_pro_shop_sale(row) for row in rows],
        "summary": {
            "today_total": float(today_total or 0.0),
            "today_transactions": int(today_transactions or 0),
            "period_total": float(period_total or 0.0),
            "period_transactions": int(period_transactions or 0),
            "period_days": int(safe_days),
        },
    }


@router.post("/pro-shop/sales")
async def create_pro_shop_sale(
    payload: ProShopSaleCreatePayload,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    items = payload.items or []
    if not items:
        raise HTTPException(status_code=400, detail="At least one sale item is required")

    discount = max(0.0, float(payload.discount or 0.0))
    tax = max(0.0, float(payload.tax or 0.0))
    payment_method = _normalize_payment_method(payload.payment_method)
    sold_at = datetime.utcnow()

    try:
        line_items: list[dict] = []
        for raw_item in items:
            product = (
                db.query(ProShopProduct)
                .filter(ProShopProduct.club_id == club_id, ProShopProduct.id == int(raw_item.product_id))
                .first()
            )
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {raw_item.product_id} not found")

            quantity = int(raw_item.quantity or 0)
            if quantity <= 0:
                raise HTTPException(status_code=400, detail="quantity must be >= 1")

            stock_qty = int(product.stock_qty or 0)
            if stock_qty < quantity:
                raise HTTPException(
                    status_code=409,
                    detail=f"Insufficient stock for '{product.name}' (available {stock_qty}, requested {quantity})",
                )

            unit_price = float(raw_item.unit_price) if raw_item.unit_price is not None else float(product.unit_price or 0.0)
            if unit_price < 0:
                raise HTTPException(status_code=400, detail="unit_price must be >= 0")

            line_total = round(unit_price * float(quantity), 2)
            line_items.append(
                {
                    "product": product,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "line_total": line_total,
                }
            )

        subtotal = round(sum(float(item["line_total"]) for item in line_items), 2)
        total = round(subtotal - discount + tax, 2)
        if total < 0:
            raise HTTPException(status_code=400, detail="Total cannot be negative")

        sale = ProShopSale(
            club_id=club_id,
            sold_by_user_id=int(staff.id),
            customer_name=(payload.customer_name or "").strip() or None,
            notes=(payload.notes or "").strip() or None,
            payment_method=payment_method,
            subtotal=subtotal,
            discount=discount,
            tax=tax,
            total=total,
            sold_at=sold_at,
            created_at=sold_at,
        )
        db.add(sale)
        db.flush()

        for line in line_items:
            product = line["product"]
            quantity = int(line["quantity"])
            unit_price = float(line["unit_price"])
            line_total = float(line["line_total"])

            db.add(
                ProShopSaleItem(
                    club_id=club_id,
                    sale_id=int(sale.id),
                    product_id=int(product.id),
                    sku_snapshot=str(product.sku or ""),
                    name_snapshot=str(product.name or ""),
                    category_snapshot=str(product.category or "") if product.category else None,
                    quantity=quantity,
                    unit_price=unit_price,
                    line_total=line_total,
                    created_at=sold_at,
                )
            )

            product.stock_qty = int(product.stock_qty or 0) - quantity
            product.updated_at = sold_at

        db.add(
            RevenueTransaction(
                club_id=club_id,
                source="pro_shop",
                transaction_date=sold_at.date(),
                external_id=f"proshop-sale-{int(sale.id)}",
                description=f"Pro shop sale #{int(sale.id)}",
                category=payment_method,
                amount=total,
                created_at=sold_at,
            )
        )

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    saved = (
        db.query(ProShopSale)
        .options(selectinload(ProShopSale.items))
        .filter(ProShopSale.club_id == club_id, ProShopSale.id == int(sale.id))
        .first()
    )
    if not saved:
        raise HTTPException(status_code=500, detail="Sale created but could not be reloaded")

    return {"status": "success", "sale": _serialize_pro_shop_sale(saved)}


@router.get("/revenue")
async def get_revenue_analytics(
    days: int = 30,
    period: Optional[str] = None,  # day | wtd | mtd | ytd
    anchor_date: Optional[date] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
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
    ).join(TeeTime, Booking.tee_time_id == TeeTime.id).filter(
        TeeTime.club_id == club_id,
        Booking.club_id == club_id,
        TeeTime.tee_time >= start_date,
    )

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

    # Daily other revenue (mirrored CSV; transaction_date). Keep non-blocking for older DBs.
    other_daily_revenue = []
    try:
        other_daily_query = db.query(
            RevenueTransaction.transaction_date.label("date"),
            func.sum(RevenueTransaction.amount).label("amount"),
            func.count(RevenueTransaction.id).label("transactions"),
        ).filter(
            RevenueTransaction.club_id == club_id,
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

    other_by_stream = []
    try:
        other_stream_query = db.query(
            RevenueTransaction.source,
            func.sum(RevenueTransaction.amount).label("amount"),
            func.count(RevenueTransaction.id).label("transactions"),
        ).filter(
            RevenueTransaction.club_id == club_id,
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
            stream = _normalize_revenue_stream(source)
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
        "daily_other_revenue": [
            {
                "date": str(dr[0]),
                "amount": float(dr[1]) if dr[1] else 0.0,
                "transactions": int(dr[2] or 0),
            }
            for dr in other_daily_revenue
        ],
        "other_revenue_by_stream": other_by_stream,
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
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    q = db.query(FeeCategory).filter(FeeCategory.active == 1)
    if club_id > 0:
        q = q.filter(or_(FeeCategory.club_id == club_id, FeeCategory.club_id.is_(None)))

    categories = q.all()
    
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

    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    
    player = db.query(User).filter(User.id == player_id, User.role == UserRole.player).first()
    
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    # Validate input
    if price_update.fee_category_id is None and price_update.custom_price is None:
        raise HTTPException(status_code=400, detail="Either fee_category_id or custom_price must be provided")
    
    # Update based on input
    if price_update.fee_category_id:
        fee_q = db.query(FeeCategory).filter(FeeCategory.id == price_update.fee_category_id)
        if club_id > 0:
            fee_q = fee_q.filter(or_(FeeCategory.club_id == club_id, FeeCategory.club_id.is_(None)))
        fee_category = fee_q.first()
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

    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    
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
            fee_q = db.query(FeeCategory).filter(FeeCategory.id == latest.fee_category_id)
            if club_id > 0:
                fee_q = fee_q.filter(or_(FeeCategory.club_id == club_id, FeeCategory.club_id.is_(None)))
            fee_cat = fee_q.first()
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

    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    
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
        fee_q = db.query(FeeCategory).filter(FeeCategory.id == price_update.fee_category_id)
        if club_id > 0:
            fee_q = fee_q.filter(or_(FeeCategory.club_id == club_id, FeeCategory.club_id.is_(None)))
        fee_category = fee_q.first()
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
