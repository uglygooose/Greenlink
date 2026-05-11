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
    BookingStatus,
    ClubConfig,
    Course,
    StartLane,
    Tee,
    TeeSheetSlotState,
)
from app.schemas.booking_state import (
    BookingPartyContextInput,
    SlotCandidateInput,
)
from app.schemas.bookings import (
    BookingCreateDecision,
    BookingCreateFailureDetail,
    BookingCreateRequest,
    BookingCreateResult,
    BookingSummary,
)
from app.schemas.rule_context import RuleContextInput
from app.services.availability_service import AvailabilityService
from app.services.booking_commercial_service import BookingCommercialService
from app.services.booking_participant_resolver import (
    BookingParticipantResolver,
    ResolvedBookingParticipant,
    derive_applies_to,
)
from app.services.booking_state_service import (
    LIVE_OCCUPANCY_STATUSES,
    BookingStateService,
)
from app.services.rule_context_service import RuleContextService

TOLERATED_CREATE_UNRESOLVED_CODES = {"live_concurrency_not_evaluated"}


class BookingService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.rule_context_service = RuleContextService(db)
        self.booking_state_service = BookingStateService(db)
        self.availability_service = AvailabilityService(db)
        self.booking_commercial_service = BookingCommercialService(db)
        self.participant_resolver = BookingParticipantResolver(db)

    def create_booking(
        self, club_id: uuid.UUID, payload: BookingCreateRequest
    ) -> BookingCreateResult:
        failures: list[BookingCreateFailureDetail] = []

        course = self.db.scalar(
            select(Course).where(
                Course.id == payload.course_id,
                Course.club_id == club_id,
            )
        )
        if course is None:
            failures.append(
                BookingCreateFailureDetail(
                    code="course_not_found",
                    message="course_id does not belong to the selected club",
                    field="course_id",
                )
            )
            return BookingCreateResult(decision=BookingCreateDecision.BLOCKED, failures=failures)

        tee = None
        if payload.tee_id is not None:
            tee = self.db.scalar(
                select(Tee)
                .join(Tee.course)
                .where(Tee.id == payload.tee_id, Tee.course_id == course.id)
            )
            if tee is None:
                failures.append(
                    BookingCreateFailureDetail(
                        code="tee_not_found",
                        message="tee_id does not belong to the supplied course",
                        field="tee_id",
                    )
                )
                return BookingCreateResult(
                    decision=BookingCreateDecision.BLOCKED,
                    failures=failures,
                )

        resolved_participants, primary_participant, failures = self.participant_resolver.resolve(
            club_id=club_id,
            participants=payload.participants,
        )
        if failures:
            return BookingCreateResult(
                decision=BookingCreateDecision.BLOCKED,
                failures=failures,
            )
        assert primary_participant is not None

        applies_to = payload.applies_to or derive_applies_to(primary_participant.participant_type)
        membership_role, pricing_player_type = (
            self.booking_commercial_service.resolve_pricing_player_type_for_membership_id(
                primary_participant.club_membership_id,
                participant_type=primary_participant.participant_type,
            )
        )
        try:
            booking_holes = self.booking_commercial_service.resolve_booking_holes(
                course_holes=course.holes,
                requested_holes=payload.holes,
            )
        except ValueError as exc:
            return BookingCreateResult(
                decision=BookingCreateDecision.BLOCKED,
                failures=[
                    BookingCreateFailureDetail(
                        code="booking_holes_invalid",
                        message=str(exc),
                        field="holes",
                    )
                ],
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
                    course_id=course.id,
                    tee_id=tee.id if tee is not None else None,
                    applies_to=applies_to,
                    membership_role=membership_role,
                    pricing_player_type=pricing_player_type,
                    holes=booking_holes,
                    effective_datetime=payload.slot_datetime,
                    reference_datetime=reference_datetime,
                )
            )
        except AppError as exc:
            return BookingCreateResult(
                decision=BookingCreateDecision.BLOCKED,
                failures=[BookingCreateFailureDetail(code=exc.code, message=exc.message)],
            )

        slot_interval_minutes = self._resolve_slot_interval_minutes(
            club_id,
            payload.slot_interval_minutes,
        )
        if slot_interval_minutes is None:
            return BookingCreateResult(
                decision=BookingCreateDecision.INDETERMINATE,
                failures=[
                    BookingCreateFailureDetail(
                        code="slot_interval_unresolved",
                        message=(
                            "slot interval is unresolved because no club default exists "
                            "and no explicit slot interval was supplied"
                        ),
                        field="slot_interval_minutes",
                    )
                ],
            )

        slot_bookings = self._load_slot_bookings(
            club_id=club_id,
            course_id=course.id,
            tee_id=tee.id if tee is not None else None,
            start_lane=payload.start_lane,
            slot_datetime=context.effective_datetime,
        )
        slot_state = self._load_slot_state(
            club_id=club_id,
            course_id=course.id,
            tee_id=tee.id if tee is not None else None,
            start_lane=payload.start_lane,
            slot_datetime=context.effective_datetime,
        )
        _, booking_state = self.booking_state_service.build_inputs_from_persisted_state(
            bookings=slot_bookings,
            slot_state=slot_state,
        )
        booking_state.current_bookings_for_day = self._count_bookings_for_local_day(
            club_id=club_id,
            person_id=primary_participant.person_id,
            local_date=context.local_date,
            timezone_name=context.timezone,
        )
        booking_state.current_future_bookings = self._count_future_bookings(
            club_id=club_id,
            person_id=primary_participant.person_id,
            reference_datetime=reference_datetime,
        )

        decision_input = self.booking_state_service.build_decision_input(
            context,
            slot=SlotCandidateInput(slot_interval_minutes=slot_interval_minutes),
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
        decision = self._resolve_create_decision(availability)
        if decision != BookingCreateDecision.ALLOWED:
            return BookingCreateResult(
                decision=decision,
                availability=availability,
                failures=failures,
            )
        commercial_snapshot = self.booking_commercial_service.snapshot_from_availability(
            availability
        )

        booking = Booking(
            club_id=club_id,
            course_id=course.id,
            tee_id=tee.id if tee is not None else None,
            start_lane=payload.start_lane,
            slot_datetime=context.effective_datetime,
            slot_interval_minutes=slot_interval_minutes,
            holes=booking_holes,
            status=BookingStatus.RESERVED,
            source=payload.source,
            party_size=len(resolved_participants),
            primary_person_id=primary_participant.person_id,
            primary_membership_id=primary_participant.club_membership_id,
            cart_flag=payload.cart_flag,
            caddie_flag=payload.caddie_flag,
            fee_amount=commercial_snapshot.fee_amount,
            fee_currency=commercial_snapshot.fee_currency,
            participants=[
                self._to_booking_participant(participant) for participant in resolved_participants
            ],
        )
        self.db.add(booking)
        self.db.commit()

        hydrated = self.db.scalar(
            select(Booking)
            .options(selectinload(Booking.participants))
            .where(Booking.id == booking.id)
        )
        assert hydrated is not None
        return BookingCreateResult(
            decision=BookingCreateDecision.ALLOWED,
            booking=BookingSummary.model_validate(hydrated),
            availability=availability,
            failures=[],
        )

    def _resolve_slot_interval_minutes(
        self, club_id: uuid.UUID, requested_interval: int | None
    ) -> int | None:
        if requested_interval is not None:
            return requested_interval
        return self.db.scalar(
            select(ClubConfig.default_slot_interval_minutes).where(ClubConfig.club_id == club_id)
        )

    def _load_slot_bookings(
        self,
        *,
        club_id: uuid.UUID,
        course_id: uuid.UUID,
        tee_id: uuid.UUID | None,
        start_lane: StartLane | None,
        slot_datetime: datetime | None,
    ) -> list[Booking]:
        if slot_datetime is None:
            return []
        statement = (
            select(Booking)
            .options(selectinload(Booking.participants))
            .where(
                Booking.club_id == club_id,
                Booking.course_id == course_id,
                Booking.slot_datetime == slot_datetime,
            )
        )
        if tee_id is None:
            statement = statement.where(Booking.tee_id.is_(None))
        else:
            statement = statement.where(Booking.tee_id == tee_id)
        if start_lane is None or start_lane == StartLane.HOLE_1:
            statement = statement.where(
                or_(Booking.start_lane == StartLane.HOLE_1, Booking.start_lane.is_(None))
            )
        else:
            statement = statement.where(Booking.start_lane == start_lane)
        return list(self.db.scalars(statement).unique().all())

    def _load_slot_state(
        self,
        *,
        club_id: uuid.UUID,
        course_id: uuid.UUID,
        tee_id: uuid.UUID | None,
        start_lane: StartLane | None,
        slot_datetime: datetime | None,
    ) -> TeeSheetSlotState | None:
        if slot_datetime is None:
            return None
        statement = select(TeeSheetSlotState).where(
            TeeSheetSlotState.club_id == club_id,
            TeeSheetSlotState.course_id == course_id,
            TeeSheetSlotState.slot_datetime == slot_datetime,
        )
        if tee_id is None:
            statement = statement.where(TeeSheetSlotState.tee_id.is_(None))
        else:
            statement = statement.where(TeeSheetSlotState.tee_id == tee_id)
        if start_lane is None or start_lane == StartLane.HOLE_1:
            statement = statement.where(
                or_(
                    TeeSheetSlotState.start_lane == StartLane.HOLE_1,
                    TeeSheetSlotState.start_lane.is_(None),
                )
            )
        else:
            statement = statement.where(TeeSheetSlotState.start_lane == start_lane)
        return self.db.scalar(statement)

    def _count_bookings_for_local_day(
        self,
        *,
        club_id: uuid.UUID,
        person_id: uuid.UUID | None,
        local_date,
        timezone_name: str,
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
                )
            )
            or 0
        )

    def _resolve_create_decision(self, availability) -> BookingCreateDecision:
        if availability.blockers:
            return BookingCreateDecision.BLOCKED
        unresolved_codes = {trace.code for trace in availability.unresolved_checks}
        if unresolved_codes - TOLERATED_CREATE_UNRESOLVED_CODES:
            return BookingCreateDecision.INDETERMINATE
        return BookingCreateDecision.ALLOWED

    def _to_booking_participant(
        self,
        participant: ResolvedBookingParticipant,
    ) -> BookingParticipant:
        return BookingParticipant(
            person_id=participant.person_id,
            club_membership_id=participant.club_membership_id,
            participant_type=participant.participant_type,
            display_name=participant.display_name,
            guest_name=participant.guest_name,
            sort_order=participant.sort_order,
            is_primary=participant.is_primary,
        )
