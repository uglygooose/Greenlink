from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.events.publisher import DatabaseEventPublisher
from app.models import Booking, BookingStatus
from app.schemas.bookings import (
    BookingNoShowDecision,
    BookingNoShowFailureDetail,
    BookingNoShowRequest,
    BookingNoShowResult,
    BookingSummary,
)

BLOCKED_NO_SHOW_STATUSES = {
    BookingStatus.CHECKED_IN,
    BookingStatus.CANCELLED,
    BookingStatus.COMPLETED,
}


class BookingNoShowService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.publisher = DatabaseEventPublisher(db)

    def mark_no_show(
        self,
        club_id: uuid.UUID,
        payload: BookingNoShowRequest,
        *,
        actor_user_id: uuid.UUID | None = None,
        source_channel: str = "system",
        correlation_id: str | None = None,
    ) -> BookingNoShowResult:
        booking = self._load_booking(club_id=club_id, booking_id=payload.booking_id)
        if booking is None:
            return BookingNoShowResult(
                booking_id=payload.booking_id,
                decision=BookingNoShowDecision.BLOCKED,
                transition_applied=False,
                failures=[
                    BookingNoShowFailureDetail(
                        code="booking_not_found",
                        message="booking_id was not found in the selected club",
                        field="booking_id",
                    )
                ],
            )

        if booking.status == BookingStatus.NO_SHOW:
            return BookingNoShowResult(
                booking_id=booking.id,
                decision=BookingNoShowDecision.ALLOWED,
                transition_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[],
            )

        if booking.status in BLOCKED_NO_SHOW_STATUSES:
            return BookingNoShowResult(
                booking_id=booking.id,
                decision=BookingNoShowDecision.BLOCKED,
                transition_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingNoShowFailureDetail(
                        code="booking_status_not_no_show_eligible",
                        message=("Only reserved bookings may transition to no_show in this phase"),
                        field="booking_id",
                        current_status=booking.status,
                    )
                ],
            )

        previous_status = booking.status.value
        booking.status = BookingStatus.NO_SHOW
        self.db.add(booking)
        self.publisher.publish(
            event_type="booking.no_show",
            aggregate_type="booking",
            aggregate_id=str(booking.id),
            payload={"booking_id": str(booking.id)},
            correlation_id=correlation_id,
            club_id=club_id,
            actor_user_id=actor_user_id,
            source_channel=source_channel,
            before={"status": previous_status},
            after={"status": BookingStatus.NO_SHOW.value},
        )
        self.db.commit()

        hydrated = self._load_booking(club_id=club_id, booking_id=booking.id)
        assert hydrated is not None
        return BookingNoShowResult(
            booking_id=hydrated.id,
            decision=BookingNoShowDecision.ALLOWED,
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
