# app/routers/checkin.py
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.auth import get_db
from app import crud
from app.tenancy import get_active_club_id, require_staff_like

router = APIRouter(prefix="/checkin", tags=["checkin"])

@router.post("/{booking_id}")
def checkin(
    booking_id: int,
    payment_method: Optional[str] = Query(None, description="Optional: CARD/CASH/EFT/ONLINE"),
    db=Depends(get_db),
    _=Depends(require_staff_like),
    __=Depends(get_active_club_id),
):
    return crud.checkin_booking(db, booking_id, payment_method=payment_method)
