# app/routers/checkin.py
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.auth import get_db
from app import crud, schemas
from app.tenancy import get_active_club_id, require_staff_like

router = APIRouter(prefix="/checkin", tags=["checkin"])

@router.post("/{booking_id}")
def checkin(
    booking_id: int,
    payment_method: Optional[str] = Query(None, description="Optional: CARD/CASH/EFT/ONLINE/ACCOUNT"),
    db=Depends(get_db),
    _=Depends(require_staff_like),
    __=Depends(get_active_club_id),
):
    result = crud.checkin_booking(db, booking_id, payment_method=payment_method)
    booking = result.get("booking")
    round_row = result.get("round")
    return {
        "booking": schemas.BookingOut.model_validate(booking).model_dump(mode="json") if booking is not None else None,
        "round": schemas.RoundOut.model_validate(round_row).model_dump(mode="json") if round_row is not None else None,
        "handicap_sa": result.get("handicap_sa"),
    }
