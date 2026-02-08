# app/routers/tee.py
from datetime import datetime

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload
from typing import List
from app.auth import get_db, get_current_user
from app import crud, models, schemas

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

@router.post("/create", response_model=schemas.TeeTimeOut)
def create_tee(tee: schemas.TeeTimeCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    tt = crud.create_tee_time(db, tee.tee_time, tee.hole, tee.capacity or 4, tee.status or "open")
    return tt

@router.get("/range", response_model=List[schemas.TeeTimeWithBookings])
def tee_range(
    start: datetime = Query(..., description="Inclusive range start (ISO datetime)"),
    end: datetime = Query(..., description="Exclusive range end (ISO datetime)"),
    db: Session = Depends(get_db),
):
    try:
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
                    _booking_payload(b) for b in sorted(list(tt.bookings or []), key=lambda b: b.id or 0)
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
                    _booking_payload(b) for b in sorted(list(tt.bookings or []), key=lambda b: b.id or 0)
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
def book(b: schemas.BookingCreate, db: Session = Depends(get_db)):
    return crud.create_booking(db, b)

@router.get("/bookings/{tee_id}", response_model=List[schemas.BookingOut])
def bookings_for_tee(tee_id: int, db: Session = Depends(get_db)):
    return crud.list_bookings_for_tee(db, tee_id)
