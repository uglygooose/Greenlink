# app/routers/tee.py
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, selectinload
from typing import List
from app.auth import get_db, get_current_user
from app import crud, models, schemas

router = APIRouter(prefix="/tsheet", tags=["tsheet"])

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
            "capacity": tt.capacity,
            "status": tt.status,
            "bookings": sorted(list(tt.bookings or []), key=lambda b: b.id or 0),
        }
        for tt in tee_times
    ]

@router.get("/", response_model=List[schemas.TeeTimeWithBookings])
def all_tee(db: Session = Depends(get_db)):
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
            "capacity": tt.capacity,
            "status": tt.status,
            "bookings": sorted(list(tt.bookings or []), key=lambda b: b.id or 0),
        }
        for tt in tee_times
    ]

@router.post("/booking", response_model=schemas.BookingOut)
def book(b: schemas.BookingCreate, db: Session = Depends(get_db)):
    return crud.create_booking(db, b)

@router.get("/bookings/{tee_id}", response_model=List[schemas.BookingOut])
def bookings_for_tee(tee_id: int, db: Session = Depends(get_db)):
    return crud.list_bookings_for_tee(db, tee_id)
