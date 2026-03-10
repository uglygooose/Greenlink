# app/routers/tee.py
from __future__ import annotations

from datetime import datetime, timedelta
from datetime import date as Date
from datetime import time as Time

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, load_only, selectinload
from typing import List
from pydantic import BaseModel
import re
from app.auth import get_db, get_current_user
from app import crud, models, schemas
from app.booking_rules import get_booking_window_for_user
from app.services.booking_pricing_service import repair_bookings_pricing
from app.tenancy import get_active_club_id

router = APIRouter(prefix="/tsheet", tags=["tsheet"])

def _verify_staff(current_user: models.User = Depends(get_current_user)) -> models.User:
    if getattr(current_user, "role", None) not in {models.UserRole.admin, models.UserRole.club_staff}:
        raise HTTPException(status_code=403, detail="Staff access required")
    return current_user


def _to_status_str(value) -> str:
    if value is None:
        return "booked"
    try:
        return str(getattr(value, "value", value))
    except Exception:
        return str(value)


def _normalize_tee_label(value) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    compact = re.sub(r"[^0-9a-z]+", "", raw.lower())
    if compact.startswith("10"):
        return "10"
    if compact.startswith("1"):
        return "1"
    match = re.match(r"^(\d+)", compact)
    if match:
        return str(int(match.group(1)))
    return raw


def _booking_payload(b: models.Booking, resolved_charge = None) -> dict:
    # Avoid response-model validation errors if older rows have NULLs.
    resolved_price = None if resolved_charge is None else float(getattr(resolved_charge, "price", 0.0) or 0.0)
    return {
        "id": b.id,
        "tee_time_id": b.tee_time_id,
        "party_size": int(getattr(b, "party_size", None) or 1),
        "member_id": getattr(b, "member_id", None),
        "created_by_user_id": getattr(b, "created_by_user_id", None),
        "player_name": getattr(b, "player_name", "") or "",
        "player_email": getattr(b, "player_email", None),
        "club_card": getattr(b, "club_card", None),
        "account_customer_id": getattr(b, "account_customer_id", None),
        "handicap_number": getattr(b, "handicap_number", None),
        "greenlink_id": getattr(b, "greenlink_id", None),
        "handicap_sa_id": getattr(b, "handicap_sa_id", None),
        "home_club": getattr(b, "home_club", None),
        "source": str(getattr(getattr(b, "source", None), "value", getattr(b, "source", None)) or ""),
        "external_provider": getattr(b, "external_provider", None),
        "external_booking_id": getattr(b, "external_booking_id", None),
        "fee_category_id": getattr(b, "fee_category_id", None),
        "price": float(resolved_price if resolved_price is not None else (getattr(b, "price", None) or 0.0)),
        "price_unresolved": bool(getattr(resolved_charge, "unresolved", False)) if resolved_charge is not None else None,
        "status": _to_status_str(getattr(b, "status", None)),
        "holes": getattr(b, "holes", None),
        "prepaid": getattr(b, "prepaid", None),
        "cart": getattr(b, "cart", None),
        "push_cart": getattr(b, "push_cart", None),
        "caddy": getattr(b, "caddy", None),
        "gender": getattr(b, "gender", None),
        "player_category": getattr(b, "player_category", None),
        "handicap_index_at_booking": getattr(b, "handicap_index_at_booking", None),
        "handicap_index_at_play": getattr(b, "handicap_index_at_play", None),
        "notes": getattr(b, "notes", None),
        "created_at": getattr(b, "created_at", None),
    }

def _is_occupying_booking(b: models.Booking) -> bool:
    """
    Whether a booking should occupy a tee sheet slot.

    Cancelled/no-show bookings should not block capacity/availability.
    """
    try:
        raw = getattr(b, "status", None)
        status = str(getattr(raw, "value", raw) or "")
    except Exception:
        status = ""
    return status not in {"cancelled", "no_show"}


def _as_naive_datetime(value: datetime) -> datetime:
    """
    Normalize ISO query datetimes to naive datetimes.
    Handles clients that send timezone-qualified strings (e.g. trailing 'Z').
    """
    if value is not None and getattr(value, "tzinfo", None) is not None:
        return value.replace(tzinfo=None)
    return value


def _blocked_status_for_tee_time(db: Session, tee_time: models.TeeTime) -> str:
    raw_status = str(getattr(tee_time, "status", None) or "open").strip().lower()
    tee_dt = getattr(tee_time, "tee_time", None)
    if raw_status == "blocked":
        return "blocked"
    if tee_dt and crud.is_day_closed(db, tee_dt.date()):
        return "blocked"
    return raw_status or "open"

@router.post("/create", response_model=schemas.TeeTimeOut)
def create_tee(
    tee: schemas.TeeTimeCreate,
    db: Session = Depends(get_db),
    _=Depends(_verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    tt = crud.create_tee_time(db, tee.tee_time, _normalize_tee_label(tee.hole), tee.capacity or 4, tee.status or "open")
    return tt


class TeeSheetGenerateRequest(BaseModel):
    date: Date
    tees: List[str] = ["1", "10"]
    start_time: str = "06:30"
    end_time: str = "16:30"
    interval_min: int = 8
    capacity: int = 4
    status: str = "open"


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

class BookingMoveRequest(BaseModel):
    to_tee_time_id: int

@router.put("/bookings/{booking_id}/move")
def move_booking(
    booking_id: int,
    payload: BookingMoveRequest,
    db: Session = Depends(get_db),
    staff: models.User = Depends(_verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    """
    Move a booking to a different tee time (drag-and-drop support).
    """
    booking = (
        db.query(models.Booking)
        .options(selectinload(models.Booking.tee_time))
        .filter(models.Booking.id == booking_id, models.Booking.club_id == club_id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    to_id = int(getattr(payload, "to_tee_time_id", None) or 0)
    if to_id <= 0:
        raise HTTPException(status_code=400, detail="to_tee_time_id is required")

    to_tt = db.query(models.TeeTime).filter(models.TeeTime.id == to_id, models.TeeTime.club_id == club_id).first()
    if not to_tt:
        raise HTTPException(status_code=404, detail="Target tee time not found")

    from_tt = getattr(booking, "tee_time", None)
    if from_tt and getattr(from_tt, "tee_time", None):
        if crud.is_day_closed(db, from_tt.tee_time.date()):
            raise HTTPException(status_code=403, detail="Tee sheet is closed for the original date")
    if getattr(to_tt, "tee_time", None):
        if crud.is_day_closed(db, to_tt.tee_time.date()):
            raise HTTPException(status_code=403, detail="Tee sheet is closed for the target date")

    if booking.tee_time_id == to_tt.id:
        return {"status": "success", "booking_id": booking.id, "from_tee_time_id": booking.tee_time_id, "to_tee_time_id": to_tt.id}

    # Capacity enforcement on destination tee time.
    occupying_statuses = [models.BookingStatus.booked, models.BookingStatus.checked_in, models.BookingStatus.completed]
    dest_bookings = (
        db.query(models.Booking)
        .filter(
            models.Booking.tee_time_id == to_tt.id,
            models.Booking.id != booking.id,
            models.Booking.status.in_(occupying_statuses),
        )
        .all()
    )
    existing_total = sum((b.party_size or 1) for b in dest_bookings)
    party_size = int(getattr(booking, "party_size", None) or 1)
    cap = int(getattr(to_tt, "capacity", None) or 4)
    if existing_total + party_size > cap:
        raise HTTPException(status_code=409, detail="Target tee time capacity exceeded")

    old_id = booking.tee_time_id
    booking.tee_time_id = to_tt.id
    db.commit()

    return {"status": "success", "booking_id": booking.id, "from_tee_time_id": old_id, "to_tee_time_id": to_tt.id}


@router.post("/generate")
def generate_tee_sheet(
    req: TeeSheetGenerateRequest,
    db: Session = Depends(get_db),
    staff: models.User = Depends(_verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    """
    Create tee times for a date in one request.
    This avoids hammering the DB with hundreds of /tsheet/create calls.
    """
    try:
        target_date = req.date
        block_reason = crud.get_day_block_reason(db, target_date)
        if block_reason == "manual_close":
            raise HTTPException(status_code=403, detail="Tee sheet is closed for this date")

        tees = [_normalize_tee_label(t) for t in (req.tees or [])]
        tees = [str(t).strip() for t in tees if str(t or "").strip()]
        if not tees:
            raise HTTPException(status_code=400, detail="No tees provided")

        start_t = _parse_hhmm(req.start_time)
        end_t = _parse_hhmm(req.end_time)
        start_dt = datetime.combine(target_date, start_t)
        end_dt = datetime.combine(target_date, end_t)
        if start_dt > end_dt:
            raise HTTPException(status_code=400, detail="start_time must be <= end_time")

        interval = int(req.interval_min or 8)
        if interval < 1 or interval > 60:
            raise HTTPException(status_code=400, detail="interval_min must be between 1 and 60")

        capacity = int(req.capacity or 4)
        if capacity < 1 or capacity > 6:
            raise HTTPException(status_code=400, detail="capacity must be between 1 and 6")

        status = (req.status or "open").strip() or "open"
        if block_reason == "golf_day":
            status = "blocked"

        existing_rows = (
            db.query(models.TeeTime.tee_time, models.TeeTime.hole)
            .filter(
                models.TeeTime.club_id == club_id,
                models.TeeTime.tee_time >= start_dt,
                models.TeeTime.tee_time <= end_dt,
                models.TeeTime.hole.in_(tees),
            )
            .all()
        )
        existing = set()
        for tee_time, hole in existing_rows:
            if tee_time is None:
                continue
            existing.add((tee_time.replace(second=0, microsecond=0), str(_normalize_tee_label(hole) or "")))

        created = 0
        new_rows: list[models.TeeTime] = []
        t = start_dt
        while t <= end_dt:
            t_key = t.replace(second=0, microsecond=0)
            for tee in tees:
                key = (t_key, tee)
                if key in existing:
                    continue
                existing.add(key)
                new_rows.append(
                    models.TeeTime(club_id=club_id, tee_time=t_key, hole=tee, capacity=capacity, status=status)
                )
                created += 1
            t = t + timedelta(minutes=interval)

        if new_rows:
            db.add_all(new_rows)
            db.commit()

        return {"created": created, "date": str(target_date), "start_time": req.start_time, "end_time": req.end_time}
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        print(f"[TSHEET] DB error (generate): {str(e)[:240]}")
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        print(f"[TSHEET] Unexpected error (generate): {str(e)[:240]}")
        raise HTTPException(status_code=500, detail="Failed to generate tee sheet")

@router.get("/range", response_model=List[schemas.TeeTimeWithBookings])
def tee_range(
    start: datetime = Query(..., description="Inclusive range start (ISO datetime)"),
    end: datetime = Query(..., description="Exclusive range end (ISO datetime)"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    club_id: int = Depends(get_active_club_id),
):
    return _tee_range_payload(
        start=start,
        end=end,
        db=db,
        club_id=club_id,
        current_user=current_user,
        enforce_booking_window=True,
    )


@router.get("/staff-range", response_model=List[schemas.TeeTimeWithBookings])
def tee_staff_range(
    start: datetime = Query(..., description="Inclusive range start (ISO datetime)"),
    end: datetime = Query(..., description="Exclusive range end (ISO datetime)"),
    db: Session = Depends(get_db),
    _: models.User = Depends(_verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    return _tee_range_payload(
        start=start,
        end=end,
        db=db,
        club_id=club_id,
        current_user=None,
        enforce_booking_window=False,
    )


def _tee_range_payload(
    *,
    start: datetime,
    end: datetime,
    db: Session,
    club_id: int,
    current_user: models.User | None,
    enforce_booking_window: bool,
):
    try:
        start = _as_naive_datetime(start)
        end = _as_naive_datetime(end)
        if end <= start:
            raise HTTPException(status_code=400, detail="Invalid range: end must be after start")

        # Enforce booking window only on the shared/public view route.
        if enforce_booking_window and getattr(current_user, "role", None) not in {
            models.UserRole.super_admin,
            models.UserRole.admin,
            models.UserRole.club_staff,
        }:
            _, _, max_date = get_booking_window_for_user(db, current_user)
            if start.date() > max_date:
                return []
            max_end = datetime.combine(max_date + timedelta(days=1), Time(0, 0))
            if end > max_end:
                end = max_end

        tee_times = (
            db.query(models.TeeTime)
            .options(
                load_only(
                    models.TeeTime.id,
                    models.TeeTime.tee_time,
                    models.TeeTime.hole,
                    models.TeeTime.capacity,
                    models.TeeTime.status,
                )
            )
            .filter(
                models.TeeTime.club_id == club_id,
                models.TeeTime.tee_time >= start,
                models.TeeTime.tee_time < end,
            )
            .order_by(models.TeeTime.tee_time, models.TeeTime.id)
            .all()
        )
        tee_time_ids = [int(getattr(tt, "id", 0) or 0) for tt in tee_times if int(getattr(tt, "id", 0) or 0) > 0]
        tee_dates = sorted({getattr(tt, "tee_time", None).date() for tt in tee_times if getattr(tt, "tee_time", None) is not None})
        blocked_dates: set[Date] = set()
        if tee_dates:
            blocked_dates.update(
                row[0]
                for row in (
                    db.query(models.DayClose.close_date)
                    .filter(
                        models.DayClose.club_id == club_id,
                        models.DayClose.status == "closed",
                        models.DayClose.close_date.in_(tee_dates),
                    )
                    .all()
                )
                if row and row[0] is not None
            )
            start_date = tee_dates[0]
            end_date = tee_dates[-1]
            golf_day_rows = (
                db.query(
                    models.GolfDayBooking.event_date,
                    func.coalesce(models.GolfDayBooking.event_end_date, models.GolfDayBooking.event_date),
                )
                .filter(
                    models.GolfDayBooking.club_id == club_id,
                    models.GolfDayBooking.event_date.isnot(None),
                    func.coalesce(models.GolfDayBooking.payment_status, "pending") != "cancelled",
                    models.GolfDayBooking.event_date <= end_date,
                    func.coalesce(models.GolfDayBooking.event_end_date, models.GolfDayBooking.event_date) >= start_date,
                )
                .all()
            )
            for event_start, event_end in golf_day_rows:
                if event_start is None or event_end is None:
                    continue
                current = max(event_start, start_date)
                final = min(event_end, end_date)
                while current <= final:
                    blocked_dates.add(current)
                    current = current + timedelta(days=1)
        bookings_by_tee_time_id: dict[int, list[models.Booking]] = {}
        if tee_time_ids:
            occupying_statuses = [
                models.BookingStatus.booked,
                models.BookingStatus.checked_in,
                models.BookingStatus.completed,
            ]
            booking_rows = (
                db.query(models.Booking)
                .options(
                    load_only(
                        models.Booking.id,
                        models.Booking.tee_time_id,
                        models.Booking.party_size,
                        models.Booking.member_id,
                        models.Booking.created_by_user_id,
                        models.Booking.player_name,
                        models.Booking.player_email,
                        models.Booking.club_card,
                        models.Booking.account_customer_id,
                        models.Booking.handicap_number,
                        models.Booking.greenlink_id,
                        models.Booking.handicap_sa_id,
                        models.Booking.home_club,
                        models.Booking.source,
                        models.Booking.external_provider,
                        models.Booking.external_booking_id,
                        models.Booking.fee_category_id,
                        models.Booking.price,
                        models.Booking.status,
                        models.Booking.holes,
                        models.Booking.prepaid,
                        models.Booking.cart,
                        models.Booking.push_cart,
                        models.Booking.caddy,
                        models.Booking.gender,
                        models.Booking.player_category,
                        models.Booking.handicap_index_at_booking,
                        models.Booking.handicap_index_at_play,
                        models.Booking.notes,
                        models.Booking.created_at,
                    )
                )
                .filter(
                    models.Booking.club_id == club_id,
                    models.Booking.tee_time_id.in_(tee_time_ids),
                    models.Booking.status.in_(occupying_statuses),
                )
                .order_by(models.Booking.tee_time_id, models.Booking.id)
                .all()
            )
            for booking in booking_rows:
                tee_time_id = int(getattr(booking, "tee_time_id", 0) or 0)
                if tee_time_id <= 0:
                    continue
                bookings_by_tee_time_id.setdefault(tee_time_id, []).append(booking)
            pricing_result = repair_bookings_pricing(
                db,
                booking_rows,
                tee_times_by_id={
                    int(getattr(tt, "id", 0) or 0): getattr(tt, "tee_time", None)
                    for tt in tee_times
                    if int(getattr(tt, "id", 0) or 0) > 0 and getattr(tt, "tee_time", None) is not None
                },
                persist=False,
            )
            resolved_charges = pricing_result.resolved_by_booking_id
        else:
            resolved_charges = {}

        # Ensure bookings are stable-ordered for frontend slot rendering.
        return [
            {
                "id": tt.id,
                "tee_time": tt.tee_time,
                "hole": _normalize_tee_label(tt.hole),
                "capacity": int(getattr(tt, "capacity", None) or 4),
                "status": (
                    "blocked"
                    if str(getattr(tt, "status", None) or "open").strip().lower() == "blocked"
                    or (getattr(tt, "tee_time", None) is not None and tt.tee_time.date() in blocked_dates)
                    else str(getattr(tt, "status", None) or "open").strip().lower() or "open"
                ),
                "bookings": [
                    _booking_payload(b, resolved_charges.get(int(getattr(b, "id", 0) or 0)))
                    for b in bookings_by_tee_time_id.get(int(getattr(tt, "id", 0) or 0), [])
                ],
            }
            for tt in tee_times
        ]
    except SQLAlchemyError as e:
        print(f"[TSHEET] DB error: {str(e)[:240]}")
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        print(f"[TSHEET] Unexpected error: {str(e)[:240]}")
        raise HTTPException(status_code=500, detail="Failed to load tee sheet")

@router.get("/", response_model=List[schemas.TeeTimeWithBookings])
def all_tee(
    db: Session = Depends(get_db),
    _=Depends(_verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    try:
        tee_times = (
            db.query(models.TeeTime)
            .options(selectinload(models.TeeTime.bookings))
            .filter(models.TeeTime.club_id == club_id)
            .order_by(models.TeeTime.tee_time)
            .all()
        )
        return [
            {
                "id": tt.id,
                "tee_time": tt.tee_time,
                "hole": _normalize_tee_label(tt.hole),
                "capacity": int(getattr(tt, "capacity", None) or 4),
                "status": _blocked_status_for_tee_time(db, tt),
                "bookings": [
                    _booking_payload(b)
                    for b in [
                        b for b in sorted(list(tt.bookings or []), key=lambda b: b.id or 0)
                        if _is_occupying_booking(b)
                    ]
                ],
            }
            for tt in tee_times
        ]
    except SQLAlchemyError as e:
        print(f"[TSHEET] DB error: {str(e)[:240]}")
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        print(f"[TSHEET] Unexpected error: {str(e)[:240]}")
        raise HTTPException(status_code=500, detail="Failed to load tee sheet")

@router.post("/booking", response_model=schemas.BookingOut)
def book(
    b: schemas.BookingCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    club_id: int = Depends(get_active_club_id),
):
    return crud.create_booking(db, b, current_user=current_user)

@router.get("/bookings/{tee_id}", response_model=List[schemas.BookingOut])
def bookings_for_tee(
    tee_id: int,
    db: Session = Depends(get_db),
    _=Depends(_verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    return crud.list_bookings_for_tee(db, tee_id)
