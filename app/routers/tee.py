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

router = APIRouter(prefix="/tsheet", tags=["tsheet"])


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

@router.post("/create", response_model=schemas.TeeTimeOut)
def create_tee(tee: schemas.TeeTimeCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    tt = crud.create_tee_time(db, tee.tee_time, tee.hole, tee.capacity or 4, tee.status or "open")
    return tt


class TeeSheetGenerateRequest(BaseModel):
    date: Date
    tees: List[str] = ["1", "10"]
    start_time: str = "06:30"
    end_time: str = "16:30"
    interval_min: int = 10
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


@router.post("/generate")
def generate_tee_sheet(
    req: TeeSheetGenerateRequest,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
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

        interval = int(req.interval_min or 10)
        if interval < 1 or interval > 60:
            raise HTTPException(status_code=400, detail="interval_min must be between 1 and 60")

        capacity = int(req.capacity or 4)
        if capacity < 1 or capacity > 6:
            raise HTTPException(status_code=400, detail="capacity must be between 1 and 6")

        status = (req.status or "open").strip() or "open"

        existing_rows = (
            db.query(models.TeeTime.tee_time, models.TeeTime.hole)
            .filter(
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
                new_rows.append(models.TeeTime(tee_time=t_key, hole=tee, capacity=capacity, status=status))
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
):
    try:
        # Enforce booking window for non-admins by clamping the range.
        if getattr(current_user, "role", None) != models.UserRole.admin:
            _, _, max_date = get_booking_window_for_user(db, current_user)
            if start.date() > max_date:
                return []
            max_end = datetime.combine(max_date + timedelta(days=1), Time(0, 0))
            if end > max_end:
                end = max_end

        tee_times = (
            db.query(models.TeeTime)
            .options(selectinload(models.TeeTime.bookings))
            .filter(models.TeeTime.tee_time >= start, models.TeeTime.tee_time < end)
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
def all_tee(db: Session = Depends(get_db)):
    try:
        tee_times = (
            db.query(models.TeeTime)
            .options(selectinload(models.TeeTime.bookings))
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
def book(b: schemas.BookingCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return crud.create_booking(db, b, current_user=current_user)

@router.get("/bookings/{tee_id}", response_model=List[schemas.BookingOut])
def bookings_for_tee(tee_id: int, db: Session = Depends(get_db)):
    return crud.list_bookings_for_tee(db, tee_id)
