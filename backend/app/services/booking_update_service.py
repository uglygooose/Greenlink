from __future__ import annotations

import uuid
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import distinct, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import AppError
from app.models import (
    Booking,
    BookingParticipant,
    BookingParticipantType,
    BookingRuleAppliesTo,
    BookingStatus,
    ClubConfig,
    ClubMembership,
    StartLane,
    TeeSheetSlotState,
)
from app.schemas.booking_state import BookingPartyContextInput, SlotCandidateInput
from app.schemas.bookings import (
    BookingSummary,
    BookingUpdateDecision,
    BookingUpdateFailureDetail,
    BookingUpdateRequest,
    BookingUpdateResult,
)
from app.schemas.rule_context import RuleContextInput
from app.services.availability_service import AvailabilityService
from app.services.booking_participant_resolver import (
    BookingParticipantResolver,
    ResolvedBookingParticipant,
    derive_applies_to,
)
from app.services.booking_state_service import LIVE_OCCUPANCY_STATUSES, BookingStateService
from app.services.rule_context_service import RuleContextService

EDITABLE_STATUSES = {BookingStatus.RESERVED}
TOLERATED_UPDATE_UNRESOLVED_CODES = {"live_concurrency_not_evaluated"}


class BookingUpdateService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.rule_context_service = RuleContextService(db)
        self.booking_state_service = BookingStateService(db)
        self.availability_service = AvailabilityService(db)
        self.participant_resolver = BookingParticipantResolver(db)

    def update_booking(
        self,
        club_id: uuid.UUID,
        *,
        booking_id: uuid.UUID,
        payload: BookingUpdateRequest,
    ) -> BookingUpdateResult:
        booking = self._load_booking(club_id=club_id, booking_id=booking_id)
        if booking is None:
            return BookingUpdateResult(
                booking_id=booking_id,
                decision=BookingUpdateDecision.BLOCKED,
                failures=[
                    BookingUpdateFailureDetail(
                        code="booking_not_found",
                        message="booking_id was not found in the selected club",
                        field="booking_id",
                    )
                ],
            )

        if booking.status not in EDITABLE_STATUSES:
            return BookingUpdateResult(
                booking_id=booking.id,
                decision=BookingUpdateDecision.BLOCKED,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingUpdateFailureDetail(
                        code="booking_status_not_editable",
                        message="Only reserved bookings may be edited in this phase",
                        field="booking_id",
                        current_status=booking.status,
                    )
                ],
            )

        resolved_participants, primary_participant, failures = self.participant_resolver.resolve(
            club_id=club_id,
            participants=payload.participants,
        )
        if failures:
            return BookingUpdateResult(
                booking_id=booking.id,
                decision=BookingUpdateDecision.BLOCKED,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingUpdateFailureDetail(
                        code=failure.code,
                        message=failure.message,
                        field=failure.field,
                    )
                    for failure in failures
                ],
            )
        assert primary_participant is not None

        applies_to = payload.applies_to or derive_applies_to(primary_participant.participant_type)
        membership_role = None
        if primary_participant.club_membership_id is not None:
            membership_role = self.db.scalar(
                select(ClubMembership.role).where(
                    ClubMembership.id == primary_participant.club_membership_id
                )
            )

        reference_datetime = (
            payload.reference_datetime.astimezone(UTC)
            if payload.reference_datetime
            else datetime.now(UTC)
        )
        try:
            context = self.rule_context_service.normalize_context(
                RuleContextInput(
                    club_id=club_id,
                    course_id=booking.course_id,
                    tee_id=booking.tee_id,
                    applies_to=applies_to,
                    membership_role=membership_role,
                    effective_datetime=booking.slot_datetime,
                    reference_datetime=reference_datetime,
                )
            )
        except AppError as exc:
            return BookingUpdateResult(
                booking_id=booking.id,
                decision=BookingUpdateDecision.BLOCKED,
                booking=BookingSummary.model_validate(booking),
                failures=[BookingUpdateFailureDetail(code=exc.code, message=exc.message)],
            )

        slot_bookings = self._load_slot_bookings_excluding_current(club_id=club_id, booking=booking)
        slot_state = self._load_slot_state(club_id=club_id, booking=booking)
        _, booking_state = self.booking_state_service.build_inputs_from_persisted_state(
            bookings=slot_bookings,
            slot_state=slot_state,
        )
        booking_state.current_bookings_for_day = self._count_bookings_for_local_day(
            club_id=club_id,
            person_id=primary_participant.person_id,
            local_date=context.local_date,
            timezone_name=context.timezone,
            exclude_booking_id=booking.id,
        )
        booking_state.current_future_bookings = self._count_future_bookings(
            club_id=club_id,
            person_id=primary_participant.person_id,
            reference_datetime=reference_datetime,
            exclude_booking_id=booking.id,
        )
        decision_input = self.booking_state_service.build_decision_input(
            context,
            slot=SlotCandidateInput(slot_interval_minutes=booking.slot_interval_minutes),
            party=BookingPartyContextInput(
                member_count=sum(
                    1
                    for participant in resolved_participants
                    if participant.participant_type == BookingParticipantType.MEMBER
                ),
                guest_count=sum(
                    1
                    for participant in resolved_participants
                    if participant.participant_type == BookingParticipantType.GUEST
                ),
                staff_count=sum(
                    1
                    for participant in resolved_participants
                    if participant.participant_type == BookingParticipantType.STAFF
                ),
                requested_player_count=len(resolved_participants),
                requester_applies_to=applies_to,
                requester_membership_role=membership_role,
            ),
            booking_state=booking_state,
        )
        availability = self.availability_service.preview_slot_availability(decision_input)
        decision = self._resolve_update_decision(availability)
        if decision != BookingUpdateDecision.ALLOWED:
            return BookingUpdateResult(
                booking_id=booking.id,
                decision=decision,
                booking=BookingSummary.model_validate(booking),
                availability=availability,
                failures=[],
            )

        booking.primary_person_id = primary_participant.person_id
        booking.primary_membership_id = primary_participant.club_membership_id
        booking.party_size = len(resolved_participants)
        booking.participants = [
            self._to_booking_participant(booking_id=booking.id, participant=participant)
            for participant in resolved_participants
        ]
        self.db.add(booking)
        self.db.commit()

        hydrated = self._load_booking(club_id=club_id, booking_id=booking.id)
        assert hydrated is not None
        return BookingUpdateResult(
            booking_id=hydrated.id,
            decision=BookingUpdateDecision.ALLOWED,
            booking=BookingSummary.model_validate(hydrated),
            availability=availability,
            failures=[],
        )

    def _load_booking(self, *, club_id: uuid.UUID, booking_id: uuid.UUID) -> Booking | None:
        return self.db.scalar(
            select(Booking)
            .options(selectinload(Booking.participants))
            .where(Booking.id == booking_id, Booking.club_id == club_id)
        )

    def _load_slot_bookings_excluding_current(
        self,
        *,
        club_id: uuid.UUID,
        booking: Booking,
    ) -> list[Booking]:
        statement = (
            select(Booking)
            .options(selectinload(Booking.participants))
            .where(
                Booking.club_id == club_id,
                Booking.course_id == booking.course_id,
                Booking.slot_datetime == booking.slot_datetime,
                Booking.id != booking.id,
            )
        )
        if booking.tee_id is None:
            statement = statement.where(Booking.tee_id.is_(None))
        else:
            statement = statement.where(Booking.tee_id == booking.tee_id)
        if booking.start_lane is None or booking.start_lane == StartLane.HOLE_1:
            statement = statement.where(
                or_(Booking.start_lane == StartLane.HOLE_1, Booking.start_lane.is_(None))
            )
        else:
            statement = statement.where(Booking.start_lane == booking.start_lane)
        return list(self.db.scalars(statement).unique().all())

    def _load_slot_state(self, *, club_id: uuid.UUID, booking: Booking) -> TeeSheetSlotState | None:
        statement = select(TeeSheetSlotState).where(
            TeeSheetSlotState.club_id == club_id,
            TeeSheetSlotState.course_id == booking.course_id,
            TeeSheetSlotState.slot_datetime == booking.slot_datetime,
        )
        if booking.tee_id is None:
            statement = statement.where(TeeSheetSlotState.tee_id.is_(None))
        else:
            statement = statement.where(TeeSheetSlotState.tee_id == booking.tee_id)
        if booking.start_lane is None or booking.start_lane == StartLane.HOLE_1:
            statement = statement.where(
                or_(
                    TeeSheetSlotState.start_lane == StartLane.HOLE_1,
                    TeeSheetSlotState.start_lane.is_(None),
                )
            )
        else:
            statement = statement.where(TeeSheetSlotState.start_lane == booking.start_lane)
        return self.db.scalar(statement)

    def _count_bookings_for_local_day(
        self,
        *,
        club_id: uuid.UUID,
        person_id: uuid.UUID | None,
        local_date,
        timezone_name: str,
        exclude_booking_id: uuid.UUID,
    ) -> int | None:
        if person_id is None or local_date is None:
            return None
        zone = ZoneInfo(timezone_name)
        start_local = datetime.combine(local_date, time.min, tzinfo=zone)
        end_local = start_local + timedelta(days=1)
        return int(
            self.db.scalar(
                select(func.count(distinct(Booking.id)))
                .join(BookingParticipant, BookingParticipant.booking_id == Booking.id)
                .where(
                    Booking.club_id == club_id,
                    Booking.status.in_(tuple(LIVE_OCCUPANCY_STATUSES)),
                    BookingParticipant.person_id == person_id,
                    Booking.slot_datetime >= start_local.astimezone(UTC),
                    Booking.slot_datetime < end_local.astimezone(UTC),
                    Booking.id != exclude_booking_id,
                )
            )
            or 0
        )

    def _count_future_bookings(
        self,
        *,
        club_id: uuid.UUID,
        person_id: uuid.UUID | None,
        reference_datetime: datetime,
        exclude_booking_id: uuid.UUID,
    ) -> int | None:
        if person_id is None:
            return None
        return int(
            self.db.scalar(
                select(func.count(distinct(Booking.id)))
                .join(BookingParticipant, BookingParticipant.booking_id == Booking.id)
                .where(
                    Booking.club_id == club_id,
                    Booking.status.in_(tuple(LIVE_OCCUPANCY_STATUSES)),
                    BookingParticipant.person_id == person_id,
                    Booking.slot_datetime >= reference_datetime,
                    Booking.id != exclude_booking_id,
                )
            )
            or 0
        )

    def _resolve_update_decision(self, availability) -> BookingUpdateDecision:
        if availability.blockers:
            return BookingUpdateDecision.BLOCKED
        unresolved_codes = {trace.code for trace in availability.unresolved_checks}
        if unresolved_codes - TOLERATED_UPDATE_UNRESOLVED_CODES:
            return BookingUpdateDecision.INDETERMINATE
        return BookingUpdateDecision.ALLOWED

    def _to_booking_participant(
        self,
        *,
        booking_id: uuid.UUID,
        participant: ResolvedBookingParticipant,
    ) -> BookingParticipant:
        return BookingParticipant(
            booking_id=booking_id,
            person_id=participant.person_id,
            club_membership_id=participant.club_membership_id,
            participant_type=participant.participant_type,
            display_name=participant.display_name,
            guest_name=participant.guest_name,
            sort_order=participant.sort_order,
            is_primary=participant.is_primary,
        )
