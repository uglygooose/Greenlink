# app/routers/tee.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.auth import get_db, get_current_user
from app import crud, schemas

router = APIRouter(prefix="/tsheet", tags=["tsheet"])

@router.post("/create", response_model=schemas.TeeTimeOut)
def create_tee(tee: schemas.TeeTimeCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    tt = crud.create_tee_time(db, tee.tee_time)
    return tt

@router.get("/", response_model=List[schemas.TeeTimeWithBookings])
def all_tee(db: Session = Depends(get_db)):
    tee_times = crud.list_tee_times(db)
    result = []
    for tt in tee_times:
        bookings = crud.list_bookings_for_tee(db, tt.id)
        result.append({
            "id": tt.id,
            "tee_time": tt.tee_time,
            "hole": tt.hole,
            "bookings": bookings
        })
    return result

@router.post("/booking", response_model=schemas.BookingOut)
def book(b: schemas.BookingCreate, db: Session = Depends(get_db)):
    return crud.create_booking(db, b)

@router.get("/bookings/{tee_id}", response_model=List[schemas.BookingOut])
def bookings_for_tee(tee_id: int, db: Session = Depends(get_db)):
    return crud.list_bookings_for_tee(db, tee_id)
