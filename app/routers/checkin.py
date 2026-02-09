# app/routers/checkin.py
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.auth import get_db, get_current_user
from app import crud

router = APIRouter(prefix="/checkin", tags=["checkin"])

@router.post("/{booking_id}")
def checkin(
    booking_id: int,
    payment_method: Optional[str] = Query(None, description="Optional: CARD/CASH/EFT/ONLINE"),
    db=Depends(get_db),
    _=Depends(get_current_user),
):
    return crud.checkin_booking(db, booking_id, payment_method=payment_method)
