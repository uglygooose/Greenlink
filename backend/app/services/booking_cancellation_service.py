from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Booking, BookingStatus
from app.schemas.bookings import (
    BookingCancelDecision,
    BookingCancelFailureDetail,
    BookingCancelRequest,
    BookingCancelResult,
    BookingSummary,
)

BLOCKED_CANCELLATION_STATUSES = {
    BookingStatus.CHECKED_IN,
    BookingStatus.COMPLETED,
    BookingStatus.NO_SHOW,
}


class BookingCancellationService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def cancel_booking(
        self,
        club_id: uuid.UUID,
        payload: BookingCancelRequest,
    ) -> BookingCancelResult:
        booking = self._load_booking(club_id=club_id, booking_id=payload.booking_id)
        if booking is None:
            return BookingCancelResult(
                booking_id=payload.booking_id,
                decision=BookingCancelDecision.BLOCKED,
                transition_applied=False,
                failures=[
                    BookingCancelFailureDetail(
                        code="booking_not_found",
                        message="booking_id was not found in the selected club",
                        field="booking_id",
                    )
                ],
            )

        if booking.status == BookingStatus.CANCELLED:
            return BookingCancelResult(
                booking_id=booking.id,
                decision=BookingCancelDecision.ALLOWED,
                transition_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[],
            )

        if booking.status in BLOCKED_CANCELLATION_STATUSES:
            return BookingCancelResult(
                booking_id=booking.id,
                decision=BookingCancelDecision.BLOCKED,
                transition_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingCancelFailureDetail(
                        code="booking_status_not_cancellable",
                        message=(
                            "Only reserved bookings may transition to cancelled in this phase"
                        ),
                        field="booking_id",
                        current_status=booking.status,
                    )
                ],
            )

        booking.status = BookingStatus.CANCELLED
        self.db.add(booking)
        self.db.commit()

        hydrated = self._load_booking(club_id=club_id, booking_id=booking.id)
        assert hydrated is not None
        return BookingCancelResult(
            booking_id=hydrated.id,
            decision=BookingCancelDecision.ALLOWED,
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
