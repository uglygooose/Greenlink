# app/routers/settings.py
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.auth import get_current_user, get_db
from app.booking_rules import get_booking_window_for_user

router = APIRouter(prefix="/settings", tags=["settings"])


class BookingWindowResponse(BaseModel):
    player_type: str
    window_days: int
    max_date: date


@router.get("/booking-window", response_model=BookingWindowResponse)
def get_booking_window(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    player_type, window_days, max_date = get_booking_window_for_user(db, current_user)
    return BookingWindowResponse(
        player_type=player_type,
        window_days=window_days,
        max_date=max_date,
    )
