from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import NotFoundError
from app.models import Booking, ClubConfig, Course, StartLane, Tee, TeeSheetSlotState
from app.schemas.rule_context import ContextNotice, RuleContextInput
from app.schemas.tee_sheet import (
    TeeSheetBookingParticipantSummary,
    TeeSheetBookingSummary,
    TeeSheetDayQuery,
    TeeSheetDayResponse,
    TeeSheetOccupancySummary,
    TeeSheetPartySummary,
    TeeSheetPolicySummary,
    TeeSheetRow,
    TeeSheetSlotDisplayStatus,
    TeeSheetSlotView,
)
from app.services.availability_service import AvailabilityService
from app.services.booking_state_service import LIVE_OCCUPANCY_STATUSES, BookingStateService
from app.services.rule_context_service import RuleContextService


class TeeSheetService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.rule_context_service = RuleContextService(db)
        self.booking_state_service = BookingStateService(db)
        self.availability_service = AvailabilityService(db)

    def load_day(self, query: TeeSheetDayQuery) -> TeeSheetDayResponse:
        club_config = self.db.scalar(select(ClubConfig).where(ClubConfig.club_id == query.club_id))
        if club_config is None:
            raise NotFoundError("Club config not found")
        course = self.db.scalar(
            select(Course).where(Course.id == query.course_id, Course.club_id == query.club_id)
        )
        if course is None:
            raise NotFoundError("Course not found")

        timezone_name = club_config.timezone
        zone = ZoneInfo(timezone_name)
        reference_datetime = (
            query.reference_datetime.astimezone(UTC)
            if query.reference_datetime
            else datetime.now(UTC)
        )
        warnings: list[ContextNotice] = []
        if query.reference_datetime is None:
            warnings.append(
                ContextNotice(
                    code="reference_datetime_defaulted_to_request_time",
                    message=(
                        "reference_datetime was not supplied and defaulted to current request time"
                    ),
                )
            )

        interval_minutes = club_config.default_slot_interval_minutes
        slot_datetimes = self._generate_slot_datetimes(
            query.date, zone, club_config.operating_hours, interval_minutes
        )
        row_scopes = self._load_row_scopes(query)
        slot_states = self._load_slot_states(query, slot_datetimes)
        bookings = self._load_bookings(query, slot_datetimes)
        rows: list[TeeSheetRow] = []
        for tee, start_lane in row_scopes:
            row_key = (
                f"{tee.id if tee is not None else f'course:{course.id}'}:{start_lane.value}"
            )
            row_label = tee.name if tee is not None else f"{course.name} sheet"
            color_code = tee.color_code if tee is not None else None
            slots: list[TeeSheetSlotView] = []
            for slot_datetime in slot_datetimes:
                persisted_state = slot_states[
                    (tee.id if tee is not None else None, start_lane, slot_datetime)
                ]
                slot_bookings = bookings[
                    (tee.id if tee is not None else None, start_lane, slot_datetime)
                ]
                live_slot_bookings = [
                    booking
                    for booking in slot_bookings
                    if booking.status in LIVE_OCCUPANCY_STATUSES
                ]
                normalized_context = self.rule_context_service.normalize_context(
                    RuleContextInput(
                        club_id=query.club_id,
                        course_id=course.id,
                        tee_id=tee.id if tee is not None else None,
                        applies_to=query.membership_type,
                        effective_datetime=slot_datetime,
                        reference_datetime=reference_datetime,
                    )
                )
                decision_input = (
                    self.booking_state_service.build_decision_input_from_persisted_state(
                        normalized_context,
                        bookings=slot_bookings,
                        slot_state=persisted_state,
                        slot_interval_minutes=interval_minutes,
                    )
                )
                availability = self.availability_service.preview_slot_availability(decision_input)
                slots.append(
                    TeeSheetSlotView(
                        slot_datetime=slot_datetime,
                        local_time=normalized_context.local_time or time(hour=0, minute=0),
                        display_status=self._display_status(availability),
                        state_flags={
                            "manually_blocked": bool(decision_input.booking_state.manually_blocked),
                            "reserved_state_active": bool(
                                decision_input.booking_state.reserved_state_active
                            ),
                            "competition_controlled": bool(
                                decision_input.booking_state.competition_controlled
                            ),
                            "event_controlled": bool(decision_input.booking_state.event_controlled),
                            "externally_unavailable": bool(
                                decision_input.booking_state.externally_unavailable
                            ),
                        },
                        occupancy=TeeSheetOccupancySummary(
                            player_capacity=decision_input.booking_state.occupancy.player_capacity,
                            occupied_player_count=decision_input.booking_state.occupancy.occupied_player_count,
                            reserved_player_count=decision_input.booking_state.occupancy.reserved_player_count,
                            confirmed_booking_count=decision_input.booking_state.occupancy.confirmed_booking_count,
                            reserved_booking_count=decision_input.booking_state.occupancy.reserved_booking_count,
                            remaining_player_capacity=decision_input.booking_state.occupancy.remaining_player_capacity,
                        ),
                        party_summary=TeeSheetPartySummary(
                            member_count=decision_input.party.member_count,
                            guest_count=decision_input.party.guest_count,
                            staff_count=decision_input.party.staff_count,
                            total_players=decision_input.party.requested_player_count,
                            has_activity=bool(decision_input.party.requested_player_count),
                        ),
                        policy_summary=TeeSheetPolicySummary(
                            applies_to=query.membership_type,
                            availability_status=availability.status.value,
                            blocker_count=len(availability.blockers),
                            unresolved_count=len(availability.unresolved_checks),
                            warning_count=len(availability.warnings),
                        ),
                        blockers=availability.blockers,
                        unresolved_checks=availability.unresolved_checks,
                        warnings=availability.warnings,
                        bookings=[
                            TeeSheetBookingSummary(
                                id=booking.id,
                                status=booking.status,
                                party_size=booking.party_size,
                                slot_datetime=booking.slot_datetime,
                                start_lane=self._normalize_start_lane(booking.start_lane),
                                cart_flag=booking.cart_flag,
                                caddie_flag=booking.caddie_flag,
                                fee_label=booking.fee_label,
                                payment_status=booking.payment_status,
                                participants=[
                                    TeeSheetBookingParticipantSummary(
                                        display_name=participant.display_name,
                                        participant_type=participant.participant_type,
                                        is_primary=participant.is_primary,
                                    )
                                    for participant in booking.participants
                                ],
                            )
                            for booking in live_slot_bookings
                        ],
                        decision_input=decision_input,
                        booking_state=decision_input.booking_state,
                        booking_party=decision_input.party,
                    )
                )
            rows.append(
                TeeSheetRow(
                    row_key=row_key,
                    tee_id=tee.id if tee is not None else None,
                    start_lane=start_lane,
                    label=row_label,
                    color_code=color_code,
                    slots=slots,
                )
            )

        return TeeSheetDayResponse(
            club_id=query.club_id,
            course_id=course.id,
            course_name=course.name,
            date=query.date,
            timezone=timezone_name,
            interval_minutes=interval_minutes,
            membership_type=query.membership_type,
            reference_datetime=reference_datetime,
            rows=rows,
            warnings=warnings,
        )

    def _load_row_scopes(
        self, query: TeeSheetDayQuery
    ) -> list[tuple[Tee | None, StartLane]]:
        lanes = [query.start_lane] if query.start_lane is not None else [
            StartLane.HOLE_1,
            StartLane.HOLE_10,
        ]
        if query.tee_id is not None:
            tee = self.db.scalar(
                select(Tee)
                .join(Tee.course)
                .where(Tee.id == query.tee_id, Course.club_id == query.club_id)
            )
            if tee is None:
                raise NotFoundError("Tee not found")
            return [(tee, lane) for lane in lanes]
        tees = list(
            self.db.scalars(
                select(Tee)
                .join(Tee.course)
                .where(
                    Course.club_id == query.club_id,
                    Tee.course_id == query.course_id,
                    Tee.active.is_(True),
                )
                .order_by(Tee.name.asc())
            ).all()
        )
        row_tees = tees or [None]
        return [(tee, lane) for tee in row_tees for lane in lanes]

    def _load_slot_states(
        self,
        query: TeeSheetDayQuery,
        slot_datetimes: list[datetime],
    ) -> dict[tuple[object, StartLane, datetime], TeeSheetSlotState | None]:
        if not slot_datetimes:
            return defaultdict(lambda: None)
        start_datetime = slot_datetimes[0]
        end_datetime = slot_datetimes[-1] + timedelta(minutes=1)
        statement = select(TeeSheetSlotState).where(
            TeeSheetSlotState.club_id == query.club_id,
            TeeSheetSlotState.course_id == query.course_id,
            TeeSheetSlotState.slot_datetime >= start_datetime,
            TeeSheetSlotState.slot_datetime < end_datetime,
        )
        if query.tee_id is not None:
            statement = statement.where(TeeSheetSlotState.tee_id == query.tee_id)
        if query.start_lane is not None:
            if query.start_lane == StartLane.HOLE_1:
                statement = statement.where(
                    or_(
                        TeeSheetSlotState.start_lane == StartLane.HOLE_1,
                        TeeSheetSlotState.start_lane.is_(None),
                    )
                )
            else:
                statement = statement.where(TeeSheetSlotState.start_lane == query.start_lane)
        states = list(self.db.scalars(statement).all())
        indexed = defaultdict(lambda: None)
        for state in states:
            lane = self._normalize_start_lane(state.start_lane)
            key = (state.tee_id, lane, state.slot_datetime)
            if indexed[key] is None or state.start_lane is not None:
                indexed[key] = state
        return indexed

    def _load_bookings(
        self,
        query: TeeSheetDayQuery,
        slot_datetimes: list[datetime],
    ) -> dict[tuple[object, StartLane, datetime], list[Booking]]:
        if not slot_datetimes:
            return defaultdict(list)
        start_datetime = slot_datetimes[0]
        end_datetime = slot_datetimes[-1] + timedelta(minutes=1)
        statement = (
            select(Booking)
            .options(selectinload(Booking.participants))
            .where(
                Booking.club_id == query.club_id,
                Booking.course_id == query.course_id,
                Booking.slot_datetime >= start_datetime,
                Booking.slot_datetime < end_datetime,
            )
        )
        if query.tee_id is not None:
            statement = statement.where(Booking.tee_id == query.tee_id)
        if query.start_lane is not None:
            if query.start_lane == StartLane.HOLE_1:
                statement = statement.where(
                    or_(
                        Booking.start_lane == StartLane.HOLE_1,
                        Booking.start_lane.is_(None),
                    )
                )
            else:
                statement = statement.where(Booking.start_lane == query.start_lane)
        records = list(self.db.scalars(statement).unique().all())
        indexed = defaultdict(list)
        for booking in records:
            lane = self._normalize_start_lane(booking.start_lane)
            indexed[(booking.tee_id, lane, booking.slot_datetime)].append(booking)
        return indexed

    def _generate_slot_datetimes(
        self,
        requested_date: date,
        zone: ZoneInfo,
        operating_hours: dict[str, object],
        interval_minutes: int,
    ) -> list[datetime]:
        day_name = requested_date.strftime("%A").lower()
        day_hours = operating_hours.get(day_name)
        if not isinstance(day_hours, dict) or day_hours.get("closed"):
            return []
        open_time = self._parse_hhmm(day_hours.get("open"))
        close_time = self._parse_hhmm(day_hours.get("close"))
        if open_time is None or close_time is None or open_time >= close_time:
            return []
        start_local = datetime.combine(requested_date, open_time, tzinfo=zone)
        close_local = datetime.combine(requested_date, close_time, tzinfo=zone)
        slot_datetimes: list[datetime] = []
        current_local = start_local
        while current_local < close_local:
            slot_datetimes.append(current_local.astimezone(UTC))
            current_local += timedelta(minutes=interval_minutes)
        return slot_datetimes

    def _display_status(self, availability) -> TeeSheetSlotDisplayStatus:
        booking_state = availability.decision_input.booking_state
        if booking_state.reserved_state_active:
            return TeeSheetSlotDisplayStatus.RESERVED
        if availability.blockers:
            return TeeSheetSlotDisplayStatus.BLOCKED
        if availability.status.value == "indeterminate":
            return TeeSheetSlotDisplayStatus.INDETERMINATE
        if availability.warnings:
            return TeeSheetSlotDisplayStatus.WARNING
        return TeeSheetSlotDisplayStatus.AVAILABLE

    def _parse_hhmm(self, value: object) -> time | None:
        if not isinstance(value, str) or ":" not in value:
            return None
        hours, minutes = value.split(":", 1)
        if not hours.isdigit() or not minutes.isdigit():
            return None
        return time(hour=int(hours), minute=int(minutes))

    def _normalize_start_lane(self, start_lane: StartLane | None) -> StartLane:
        return start_lane or StartLane.HOLE_1
