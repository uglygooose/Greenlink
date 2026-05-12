from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.events.publisher import DatabaseEventPublisher
from app.models import Booking, BookingStatus
from app.schemas.bookings import (
    BookingCompleteDecision,
    BookingCompleteFailureDetail,
    BookingCompleteRequest,
    BookingCompleteResult,
    BookingSummary,
)

BLOCKED_COMPLETION_STATUSES = {
    BookingStatus.RESERVED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
}


class BookingCompletionService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.publisher = DatabaseEventPublisher(db)

    def complete_booking(
        self,
        club_id: uuid.UUID,
        payload: BookingCompleteRequest,
        *,
        actor_user_id: uuid.UUID | None = None,
        source_channel: str = "system",
        correlation_id: str | None = None,
    ) -> BookingCompleteResult:
        booking = self._load_booking(club_id=club_id, booking_id=payload.booking_id)
        if booking is None:
            return BookingCompleteResult(
                booking_id=payload.booking_id,
                decision=BookingCompleteDecision.BLOCKED,
                transition_applied=False,
                failures=[
                    BookingCompleteFailureDetail(
                        code="booking_not_found",
                        message="booking_id was not found in the selected club",
                        field="booking_id",
                    )
                ],
            )

        if booking.status == BookingStatus.COMPLETED:
            return BookingCompleteResult(
                booking_id=booking.id,
                decision=BookingCompleteDecision.ALLOWED,
                transition_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[],
            )

        if booking.status in BLOCKED_COMPLETION_STATUSES:
            return BookingCompleteResult(
                booking_id=booking.id,
                decision=BookingCompleteDecision.BLOCKED,
                transition_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingCompleteFailureDetail(
                        code="booking_status_not_completable",
                        message=(
                            "Only checked_in bookings may transition to completed in this phase"
                        ),
                        field="booking_id",
                        current_status=booking.status,
                    )
                ],
            )

        previous_status = booking.status.value
        booking.status = BookingStatus.COMPLETED
        self.db.add(booking)
        self.publisher.publish(
            event_type="booking.completed",
            aggregate_type="booking",
            aggregate_id=str(booking.id),
            payload={"booking_id": str(booking.id)},
            correlation_id=correlation_id,
            club_id=club_id,
            actor_user_id=actor_user_id,
            source_channel=source_channel,
            before={"status": previous_status},
            after={"status": BookingStatus.COMPLETED.value},
        )
        self.db.commit()

        hydrated = self._load_booking(club_id=club_id, booking_id=booking.id)
        assert hydrated is not None
        return BookingCompleteResult(
            booking_id=hydrated.id,
            decision=BookingCompleteDecision.ALLOWED,
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
