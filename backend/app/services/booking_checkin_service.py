from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Booking, BookingStatus
from app.schemas.bookings import (
    BookingCheckInDecision,
    BookingCheckInFailureDetail,
    BookingCheckInRequest,
    BookingCheckInResult,
    BookingSummary,
)

BLOCKED_CHECKIN_STATUSES = {
    BookingStatus.CANCELLED,
    BookingStatus.COMPLETED,
    BookingStatus.NO_SHOW,
}


class BookingCheckInService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def check_in_booking(
        self,
        club_id: uuid.UUID,
        payload: BookingCheckInRequest,
    ) -> BookingCheckInResult:
        booking = self._load_booking(club_id=club_id, booking_id=payload.booking_id)
        if booking is None:
            return BookingCheckInResult(
                booking_id=payload.booking_id,
                decision=BookingCheckInDecision.BLOCKED,
                transition_applied=False,
                failures=[
                    BookingCheckInFailureDetail(
                        code="booking_not_found",
                        message="booking_id was not found in the selected club",
                        field="booking_id",
                    )
                ],
            )

        if booking.status == BookingStatus.CHECKED_IN:
            return BookingCheckInResult(
                booking_id=booking.id,
                decision=BookingCheckInDecision.ALLOWED,
                transition_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[],
            )

        if booking.status in BLOCKED_CHECKIN_STATUSES:
            return BookingCheckInResult(
                booking_id=booking.id,
                decision=BookingCheckInDecision.BLOCKED,
                transition_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingCheckInFailureDetail(
                        code="booking_status_not_checkin_eligible",
                        message=(
                            "Only reserved bookings may transition to checked_in in this phase"
                        ),
                        field="booking_id",
                        current_status=booking.status,
                    )
                ],
            )

        booking.status = BookingStatus.CHECKED_IN
        self.db.add(booking)
        self.db.commit()

        hydrated = self._load_booking(club_id=club_id, booking_id=booking.id)
        assert hydrated is not None
        return BookingCheckInResult(
            booking_id=hydrated.id,
            decision=BookingCheckInDecision.ALLOWED,
            transition_applied=True,
            booking=BookingSummary.model_validate(hydrated),
            failures=[],
        )

    def _load_booking(
        self,
        *,
        club_id: uuid.UUID,
        booking_id: uuid.UUID,
    ) -> Booking | None:
        return self.db.scalar(
            select(Booking)
            .options(selectinload(Booking.participants))
            .where(
                Booking.id == booking_id,
                Booking.club_id == club_id,
            )
        )
