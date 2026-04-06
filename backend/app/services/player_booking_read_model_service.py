from __future__ import annotations

import uuid
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Booking, BookingParticipant, BookingStatus, Club, Course, Tee
from app.schemas.bookings import PlayerBookingReadModelItem, PlayerBookingReadModelResponse

UPCOMING_STATUSES = {BookingStatus.RESERVED, BookingStatus.CHECKED_IN}
HISTORY_STATUSES = {
    BookingStatus.CANCELLED,
    BookingStatus.COMPLETED,
    BookingStatus.NO_SHOW,
}


class PlayerBookingReadModelService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def load_for_person(
        self,
        *,
        club: Club,
        person_id: uuid.UUID,
        reference_datetime: datetime | None = None,
        upcoming_limit: int = 5,
        history_limit: int = 10,
    ) -> PlayerBookingReadModelResponse:
        normalized_reference = (
            reference_datetime.astimezone(UTC) if reference_datetime is not None else datetime.now(UTC)
        )
        upcoming_rows = self._load_upcoming_rows(
            club_id=club.id,
            person_id=person_id,
            reference_datetime=normalized_reference,
            limit=upcoming_limit,
        )
        history_rows = self._load_history_rows(
            club_id=club.id,
            person_id=person_id,
            reference_datetime=normalized_reference,
            limit=history_limit,
        )
        return PlayerBookingReadModelResponse(
            timezone=club.timezone,
            reference_datetime=normalized_reference,
            upcoming=[self._to_item(row=row, timezone_name=club.timezone) for row in upcoming_rows],
            history=[self._to_item(row=row, timezone_name=club.timezone) for row in history_rows],
        )

    def _base_statement(self, *, club_id: uuid.UUID, person_id: uuid.UUID):
        return (
            select(Booking, Course.name, Tee.name)
            .join(BookingParticipant, BookingParticipant.booking_id == Booking.id)
            .join(Course, Course.id == Booking.course_id)
            .outerjoin(Tee, Tee.id == Booking.tee_id)
            .options(selectinload(Booking.participants))
            .where(
                Booking.club_id == club_id,
                BookingParticipant.person_id == person_id,
            )
        )

    def _load_upcoming_rows(
        self,
        *,
        club_id: uuid.UUID,
        person_id: uuid.UUID,
        reference_datetime: datetime,
        limit: int,
    ) -> list[tuple[Booking, str, str | None]]:
        statement = (
            self._base_statement(club_id=club_id, person_id=person_id)
            .where(
                Booking.status.in_(tuple(UPCOMING_STATUSES)),
                Booking.slot_datetime >= reference_datetime,
            )
            .order_by(Booking.slot_datetime.asc(), Booking.created_at.asc())
            .limit(limit)
        )
        return list(self.db.execute(statement).all())

    def _load_history_rows(
        self,
        *,
        club_id: uuid.UUID,
        person_id: uuid.UUID,
        reference_datetime: datetime,
        limit: int,
    ) -> list[tuple[Booking, str, str | None]]:
        statement = (
            self._base_statement(club_id=club_id, person_id=person_id)
            .where(
                (Booking.slot_datetime < reference_datetime)
                | Booking.status.in_(tuple(HISTORY_STATUSES))
            )
            .order_by(Booking.slot_datetime.desc(), Booking.updated_at.desc())
            .limit(limit)
        )
        return list(self.db.execute(statement).all())

    def _to_item(
        self,
        *,
        row: tuple[Booking, str, str | None],
        timezone_name: str,
    ) -> PlayerBookingReadModelItem:
        booking, course_name, tee_name = row
        local_slot = booking.slot_datetime.astimezone(ZoneInfo(timezone_name))
        primary_participant = next(
            (participant for participant in booking.participants if participant.is_primary),
            None,
        )
        participant_names = [participant.display_name for participant in booking.participants]
        return PlayerBookingReadModelItem(
            id=booking.id,
            status=booking.status,
            source=booking.source,
            slot_datetime=booking.slot_datetime,
            local_date=local_slot.date().isoformat(),
            local_time=local_slot.strftime("%H:%M"),
            course_name=course_name,
            tee_name=tee_name,
            start_lane=booking.start_lane,
            party_size=booking.party_size,
            primary_participant_name=primary_participant.display_name if primary_participant else None,
            participant_names=participant_names,
            fee_label=booking.fee_label,
            payment_status=booking.payment_status,
        )
