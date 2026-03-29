from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Booking,
    BookingParticipantType,
    BookingStatus,
    ClubConfig,
    TeeSheetSlotState,
)
from app.schemas.booking_state import (
    AvailabilityDecisionInput,
    BookingPartyContext,
    BookingPartyContextInput,
    BookingStateSnapshot,
    BookingStateSnapshotInput,
    OccupancyState,
    SlotCandidate,
    SlotCandidateInput,
)
from app.schemas.rule_context import ContextNotice, NormalizedRuleContext

LIVE_OCCUPANCY_STATUSES = {BookingStatus.RESERVED, BookingStatus.CHECKED_IN}
RESERVED_OCCUPANCY_STATUSES = {BookingStatus.RESERVED}
CONFIRMED_OCCUPANCY_STATUSES = {BookingStatus.CHECKED_IN}


class BookingStateService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def build_decision_input(
        self,
        context: NormalizedRuleContext,
        *,
        slot: SlotCandidateInput | None = None,
        party: BookingPartyContextInput | None = None,
        booking_state: BookingStateSnapshotInput | None = None,
    ) -> AvailabilityDecisionInput:
        slot = slot or SlotCandidateInput()
        party = party or BookingPartyContextInput()
        booking_state = booking_state or BookingStateSnapshotInput()
        warnings: list[ContextNotice] = []

        club_config = self.db.scalar(select(ClubConfig).where(ClubConfig.club_id == context.club_id))
        slot_interval_minutes = slot.slot_interval_minutes
        slot_interval_source = "input"
        if slot_interval_minutes is None:
            if club_config is not None:
                slot_interval_minutes = club_config.default_slot_interval_minutes
                slot_interval_source = "club_config_default"
            else:
                slot_interval_source = "unresolved"
                warnings.append(
                    ContextNotice(
                        code="slot_interval_unresolved",
                        message="Slot interval is unresolved because no slot interval was supplied and club config is missing",
                    )
                )
        normalized_slot = SlotCandidate(
            club_id=context.club_id,
            course_id=context.course_id,
            tee_id=context.tee_id,
            slot_datetime=context.effective_datetime,
            timezone=context.timezone,
            local_date=context.local_date,
            local_time=context.local_time,
            local_day_name=context.local_day_name,
            slot_interval_minutes=slot_interval_minutes,
            slot_interval_source=slot_interval_source,
        )

        normalized_party, party_warnings = self._normalize_party_context(context, party)
        warnings.extend(party_warnings)
        normalized_booking_state = self._normalize_booking_state(booking_state)
        return AvailabilityDecisionInput(
            context=context,
            slot=normalized_slot,
            party=normalized_party,
            booking_state=normalized_booking_state,
            warnings=warnings,
        )

    def build_decision_input_from_persisted_state(
        self,
        context: NormalizedRuleContext,
        *,
        bookings: Sequence[Booking],
        slot_state: TeeSheetSlotState | None,
        slot_interval_minutes: int | None = None,
    ) -> AvailabilityDecisionInput:
        party_input, booking_state_input = self.build_inputs_from_persisted_state(bookings=bookings, slot_state=slot_state)
        return self.build_decision_input(
            context,
            slot=SlotCandidateInput(slot_interval_minutes=slot_interval_minutes),
            party=party_input,
            booking_state=booking_state_input,
        )

    def build_inputs_from_persisted_state(
        self,
        *,
        bookings: Sequence[Booking],
        slot_state: TeeSheetSlotState | None,
    ) -> tuple[BookingPartyContextInput, BookingStateSnapshotInput]:
        member_count = 0
        guest_count = 0
        staff_count = 0
        reserved_player_count = 0
        occupied_player_count = 0
        confirmed_booking_count = 0
        reserved_booking_count = 0

        for booking in bookings:
            if booking.status not in LIVE_OCCUPANCY_STATUSES:
                continue
            booking_party_size = 0
            for participant in booking.participants:
                booking_party_size += 1
                if participant.participant_type == BookingParticipantType.MEMBER:
                    member_count += 1
                elif participant.participant_type == BookingParticipantType.GUEST:
                    guest_count += 1
                else:
                    staff_count += 1
            if booking.status in RESERVED_OCCUPANCY_STATUSES:
                reserved_player_count += booking_party_size
                reserved_booking_count += 1
            if booking.status in CONFIRMED_OCCUPANCY_STATUSES:
                occupied_player_count += booking_party_size
                confirmed_booking_count += 1

        return (
            BookingPartyContextInput(
                member_count=member_count,
                guest_count=guest_count,
                staff_count=staff_count,
            ),
            BookingStateSnapshotInput(
                occupancy={
                    "player_capacity": slot_state.player_capacity if slot_state is not None else None,
                    "occupied_player_count": occupied_player_count,
                    "reserved_player_count": reserved_player_count,
                    "confirmed_booking_count": confirmed_booking_count,
                    "reserved_booking_count": reserved_booking_count,
                },
                manually_blocked=slot_state.manually_blocked if slot_state is not None else False,
                reserved_state_active=slot_state.reserved_state_active if slot_state is not None else False,
                competition_controlled=slot_state.competition_controlled if slot_state is not None else False,
                event_controlled=slot_state.event_controlled if slot_state is not None else False,
                externally_unavailable=slot_state.externally_unavailable if slot_state is not None else False,
                blocked_reason=slot_state.blocked_reason if slot_state is not None else None,
            ),
        )

    def _normalize_party_context(
        self,
        context: NormalizedRuleContext,
        party: BookingPartyContextInput,
    ) -> tuple[BookingPartyContext, list[ContextNotice]]:
        warnings: list[ContextNotice] = []
        bucket_values = (party.member_count, party.guest_count, party.staff_count)
        complete = all(value is not None for value in bucket_values)
        requested_player_count = party.requested_player_count
        if requested_player_count is None and complete:
            requested_player_count = sum(value for value in bucket_values if value is not None)
        if requested_player_count is None:
            warnings.append(
                ContextNotice(
                    code="requested_player_count_unresolved",
                    message="Requested player count was not supplied and could not be derived from party buckets",
                )
            )

        return (
            BookingPartyContext(
                member_count=party.member_count,
                guest_count=party.guest_count,
                staff_count=party.staff_count,
                requested_player_count=requested_player_count,
                requester_applies_to=party.requester_applies_to or context.applies_to,
                requester_membership_role=party.requester_membership_role or context.membership_role,
                bucket_counts_complete=complete,
            ),
            warnings,
        )

    def _normalize_booking_state(self, booking_state: BookingStateSnapshotInput) -> BookingStateSnapshot:
        occupancy = booking_state.occupancy
        remaining_player_capacity = None
        if (
            occupancy.player_capacity is not None
            and occupancy.occupied_player_count is not None
            and occupancy.reserved_player_count is not None
        ):
            remaining_player_capacity = max(
                occupancy.player_capacity - occupancy.occupied_player_count - occupancy.reserved_player_count,
                0,
            )

        return BookingStateSnapshot(
            occupancy=OccupancyState(
                player_capacity=occupancy.player_capacity,
                occupied_player_count=occupancy.occupied_player_count,
                reserved_player_count=occupancy.reserved_player_count,
                confirmed_booking_count=occupancy.confirmed_booking_count,
                reserved_booking_count=occupancy.reserved_booking_count,
                remaining_player_capacity=remaining_player_capacity,
            ),
            manually_blocked=booking_state.manually_blocked,
            reserved_state_active=booking_state.reserved_state_active,
            competition_controlled=booking_state.competition_controlled,
            event_controlled=booking_state.event_controlled,
            externally_unavailable=booking_state.externally_unavailable,
            current_bookings_for_day=booking_state.current_bookings_for_day,
            current_future_bookings=booking_state.current_future_bookings,
            blocked_reason=booking_state.blocked_reason,
        )
