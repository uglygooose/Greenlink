# app/routers/tee.py
from __future__ import annotations

from datetime import datetime, timedelta
from datetime import date as Date
from datetime import time as Time

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload
from typing import List
from pydantic import BaseModel
from app.auth import get_db, get_current_user
from app import crud, models, schemas
from app.booking_rules import get_booking_window_for_user
from app.tenancy import get_active_club_id

router = APIRouter(prefix="/tsheet", tags=["tsheet"])

def _verify_staff(current_user: models.User = Depends(get_current_user)) -> models.User:
    if getattr(current_user, "role", None) not in {models.UserRole.super_admin, models.UserRole.admin, models.UserRole.club_staff}:
        raise HTTPException(status_code=403, detail="Staff access required")
    return current_user


def _to_status_str(value) -> str:
    if value is None:
        return "booked"
    try:
        return str(getattr(value, "value", value))
    except Exception:
        return str(value)


def _booking_payload(b: models.Booking) -> dict:
    # Avoid response-model validation errors if older rows have NULLs.
    return {
        "id": b.id,
        "tee_time_id": b.tee_time_id,
        "party_size": int(getattr(b, "party_size", None) or 1),
        "member_id": getattr(b, "member_id", None),
        "created_by_user_id": getattr(b, "created_by_user_id", None),
        "player_name": getattr(b, "player_name", "") or "",
        "player_email": getattr(b, "player_email", None),
        "club_card": getattr(b, "club_card", None),
        "handicap_number": getattr(b, "handicap_number", None),
        "greenlink_id": getattr(b, "greenlink_id", None),
        "handicap_sa_id": getattr(b, "handicap_sa_id", None),
        "home_club": getattr(b, "home_club", None),
        "source": str(getattr(getattr(b, "source", None), "value", getattr(b, "source", None)) or ""),
        "external_provider": getattr(b, "external_provider", None),
        "external_booking_id": getattr(b, "external_booking_id", None),
        "fee_category_id": getattr(b, "fee_category_id", None),
        "price": float(getattr(b, "price", None) or 0.0),
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

@router.post("/create", response_model=schemas.TeeTimeOut)
def create_tee(
    tee: schemas.TeeTimeCreate,
    db: Session = Depends(get_db),
    _=Depends(_verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    tt = crud.create_tee_time(db, tee.tee_time, tee.hole, tee.capacity or 4, tee.status or "open")
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
        if crud.is_day_closed(db, target_date):
            raise HTTPException(status_code=403, detail="Tee sheet is closed for this date")

        tees = [str(t).strip() for t in (req.tees or []) if str(t).strip()]
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
            existing.add((tee_time.replace(second=0, microsecond=0), str(hole or "")))

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
    try:
        start = _as_naive_datetime(start)
        end = _as_naive_datetime(end)
        if end <= start:
            raise HTTPException(status_code=400, detail="Invalid range: end must be after start")

        # Enforce booking window for non-admins by clamping the range.
        if getattr(current_user, "role", None) not in {models.UserRole.super_admin, models.UserRole.admin, models.UserRole.club_staff}:
            _, _, max_date = get_booking_window_for_user(db, current_user)
            if start.date() > max_date:
                return []
            max_end = datetime.combine(max_date + timedelta(days=1), Time(0, 0))
            if end > max_end:
                end = max_end

        tee_times = (
            db.query(models.TeeTime)
            .options(selectinload(models.TeeTime.bookings))
            .filter(
                models.TeeTime.club_id == club_id,
                models.TeeTime.tee_time >= start,
                models.TeeTime.tee_time < end,
            )
            .order_by(models.TeeTime.tee_time)
            .all()
        )

        # Ensure bookings are stable-ordered for frontend slot rendering.
        return [
            {
                "id": tt.id,
                "tee_time": tt.tee_time,
                "hole": tt.hole,
                "capacity": int(getattr(tt, "capacity", None) or 4),
                "status": getattr(tt, "status", None) or "open",
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
                "hole": tt.hole,
                "capacity": int(getattr(tt, "capacity", None) or 4),
                "status": getattr(tt, "status", None) or "open",
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
