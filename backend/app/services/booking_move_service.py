"""Booking move service.

Adjudicates and applies same-day booking moves (time and/or lane changes).
Backend owns all move validation — frontend receives decision + reason.

Validation rules (in order):
1. Booking must belong to the club and exist.
2. Booking must be in a moveable status (RESERVED or CHECKED_IN).
3. Target slot must be within the same local day as the original slot.
4. Target (slot_datetime + start_lane + tee_id) must differ from the current
   booking — a no-op move is rejected explicitly.
5. Target slot must not be hard-blocked (manually_blocked, competition_controlled,
   event_controlled, or externally_unavailable).
6. Target slot must not have a reserved_state_active flag set.
7. Target slot must have remaining player capacity for this booking's party_size.
   Capacity is checked against the TeeSheetSlotState (if present) and live bookings
   at the target slot.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Booking,
    BookingStatus,
    ClubConfig,
    Course,
    StartLane,
    TeeSheetSlotState,
    Tee,
)
from app.services.booking_state_service import LIVE_OCCUPANCY_STATUSES
from app.schemas.bookings import (
    BookingMoveDecision,
    BookingMoveFailureDetail,
    BookingMoveRequest,
    BookingMoveResult,
    BookingSummary,
)

MOVEABLE_STATUSES = {BookingStatus.RESERVED, BookingStatus.CHECKED_IN}


class BookingMoveService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def move_booking(
        self,
        club_id: uuid.UUID,
        payload: BookingMoveRequest,
    ) -> BookingMoveResult:
        booking = self._load_booking(club_id=club_id, booking_id=payload.booking_id)
        if booking is None:
            return BookingMoveResult(
                booking_id=payload.booking_id,
                decision=BookingMoveDecision.BLOCKED,
                failures=[
                    BookingMoveFailureDetail(
                        code="booking_not_found",
                        message="booking_id was not found in the selected club",
                        field="booking_id",
                    )
                ],
            )

        if booking.status not in MOVEABLE_STATUSES:
            return BookingMoveResult(
                booking_id=booking.id,
                decision=BookingMoveDecision.BLOCKED,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingMoveFailureDetail(
                        code="booking_status_not_moveable",
                        message=(
                            "Only reserved or checked_in bookings may be moved"
                        ),
                        field="booking_id",
                        current_status=booking.status,
                    )
                ],
            )

        club_config = self.db.scalar(
            select(ClubConfig).where(ClubConfig.club_id == club_id)
        )
        if club_config is None:
            return BookingMoveResult(
                booking_id=booking.id,
                decision=BookingMoveDecision.BLOCKED,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingMoveFailureDetail(
                        code="club_config_not_found",
                        message="Club configuration is missing — cannot validate same-day constraint",
                    )
                ],
            )

        # Resolve target lane and tee (defaults to booking's current values when not supplied)
        target_start_lane = (
            payload.target_start_lane
            if payload.target_start_lane is not None
            else self._normalize_start_lane(booking.start_lane)
        )
        current_start_lane = self._normalize_start_lane(booking.start_lane)
        target_tee_id = (
            payload.target_tee_id
            if payload.target_tee_id is not None
            else booking.tee_id
        )
        target_slot_datetime = payload.target_slot_datetime.astimezone(UTC)

        # No-op guard
        if (
            target_slot_datetime == booking.slot_datetime
            and target_start_lane == current_start_lane
            and target_tee_id == booking.tee_id
        ):
            return BookingMoveResult(
                booking_id=booking.id,
                decision=BookingMoveDecision.BLOCKED,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingMoveFailureDetail(
                        code="move_is_no_op",
                        message=(
                            "The requested move produces no change — "
                            "target slot, lane, and tee are identical to the current booking"
                        ),
                    )
                ],
            )

        # Validate target tee belongs to club (when changing tee)
        if target_tee_id != booking.tee_id and target_tee_id is not None:
            tee = self.db.scalar(
                select(Tee)
                .join(Tee.course)
                .where(
                    Tee.id == target_tee_id,
                    Course.club_id == club_id,
                )
            )
            if tee is None:
                return BookingMoveResult(
                    booking_id=booking.id,
                    decision=BookingMoveDecision.BLOCKED,
                    booking=BookingSummary.model_validate(booking),
                    failures=[
                        BookingMoveFailureDetail(
                            code="target_tee_not_found",
                            message="target_tee_id does not belong to the selected club",
                            field="target_tee_id",
                        )
                    ],
                )

        # Same-day constraint
        zone = ZoneInfo(club_config.timezone)
        original_local_date = booking.slot_datetime.astimezone(zone).date()
        target_local_date = target_slot_datetime.astimezone(zone).date()
        if target_local_date != original_local_date:
            return BookingMoveResult(
                booking_id=booking.id,
                decision=BookingMoveDecision.BLOCKED,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingMoveFailureDetail(
                        code="move_crosses_day_boundary",
                        message=(
                            "Booking moves must stay within the same local date — "
                            f"original date is {original_local_date.isoformat()}, "
                            f"target date is {target_local_date.isoformat()}"
                        ),
                        field="target_slot_datetime",
                    )
                ],
            )

        # Slot state checks
        slot_state = self._load_slot_state(
            club_id=club_id,
            course_id=booking.course_id,
            tee_id=target_tee_id,
            start_lane=target_start_lane,
            slot_datetime=target_slot_datetime,
        )
        if slot_state is not None:
            if slot_state.manually_blocked:
                return BookingMoveResult(
                    booking_id=booking.id,
                    decision=BookingMoveDecision.BLOCKED,
                    booking=BookingSummary.model_validate(booking),
                    failures=[
                        BookingMoveFailureDetail(
                            code="target_slot_manually_blocked",
                            message=(
                                slot_state.blocked_reason
                                or "Target slot is manually blocked"
                            ),
                            field="target_slot_datetime",
                        )
                    ],
                )
            if slot_state.competition_controlled:
                return BookingMoveResult(
                    booking_id=booking.id,
                    decision=BookingMoveDecision.BLOCKED,
                    booking=BookingSummary.model_validate(booking),
                    failures=[
                        BookingMoveFailureDetail(
                            code="target_slot_competition_controlled",
                            message="Target slot is reserved for competition use",
                            field="target_slot_datetime",
                        )
                    ],
                )
            if slot_state.event_controlled:
                return BookingMoveResult(
                    booking_id=booking.id,
                    decision=BookingMoveDecision.BLOCKED,
                    booking=BookingSummary.model_validate(booking),
                    failures=[
                        BookingMoveFailureDetail(
                            code="target_slot_event_controlled",
                            message="Target slot is reserved for an event",
                            field="target_slot_datetime",
                        )
                    ],
                )
            if slot_state.externally_unavailable:
                return BookingMoveResult(
                    booking_id=booking.id,
                    decision=BookingMoveDecision.BLOCKED,
                    booking=BookingSummary.model_validate(booking),
                    failures=[
                        BookingMoveFailureDetail(
                            code="target_slot_externally_unavailable",
                            message="Target slot is marked as externally unavailable",
                            field="target_slot_datetime",
                        )
                    ],
                )
            if slot_state.reserved_state_active:
                return BookingMoveResult(
                    booking_id=booking.id,
                    decision=BookingMoveDecision.BLOCKED,
                    booking=BookingSummary.model_validate(booking),
                    failures=[
                        BookingMoveFailureDetail(
                            code="target_slot_reserved_state_active",
                            message="Target slot is in reserved state and not available for moves",
                            field="target_slot_datetime",
                        )
                    ],
                )

        # Capacity check at target slot
        capacity_failure = self._check_target_capacity(
            club_id=club_id,
            course_id=booking.course_id,
            tee_id=target_tee_id,
            start_lane=target_start_lane,
            slot_datetime=target_slot_datetime,
            party_size=booking.party_size,
            exclude_booking_id=booking.id,
            slot_state=slot_state,
        )
        if capacity_failure is not None:
            return BookingMoveResult(
                booking_id=booking.id,
                decision=BookingMoveDecision.BLOCKED,
                booking=BookingSummary.model_validate(booking),
                failures=[capacity_failure],
            )

        # Apply the move
        booking.slot_datetime = target_slot_datetime
        booking.start_lane = target_start_lane
        booking.tee_id = target_tee_id
        self.db.add(booking)
        self.db.commit()

        hydrated = self._load_booking(club_id=club_id, booking_id=booking.id)
        assert hydrated is not None
        return BookingMoveResult(
            booking_id=hydrated.id,
            decision=BookingMoveDecision.ALLOWED,
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

    def _load_slot_state(
        self,
        *,
        club_id: uuid.UUID,
        course_id: uuid.UUID,
        tee_id: uuid.UUID | None,
        start_lane: StartLane,
        slot_datetime: datetime,
    ) -> TeeSheetSlotState | None:
        statement = (
            select(TeeSheetSlotState)
            .where(
                TeeSheetSlotState.club_id == club_id,
                TeeSheetSlotState.course_id == course_id,
                TeeSheetSlotState.slot_datetime == slot_datetime,
            )
            .order_by(TeeSheetSlotState.start_lane.is_(None).asc())
        )
        if tee_id is None:
            statement = statement.where(TeeSheetSlotState.tee_id.is_(None))
        else:
            statement = statement.where(TeeSheetSlotState.tee_id == tee_id)
        if start_lane == StartLane.HOLE_1:
            statement = statement.where(
                or_(
                    TeeSheetSlotState.start_lane == StartLane.HOLE_1,
                    TeeSheetSlotState.start_lane.is_(None),
                )
            )
        else:
            statement = statement.where(TeeSheetSlotState.start_lane == start_lane)
        return self.db.scalars(statement).first()

    def _check_target_capacity(
        self,
        *,
        club_id: uuid.UUID,
        course_id: uuid.UUID,
        tee_id: uuid.UUID | None,
        start_lane: StartLane,
        slot_datetime: datetime,
        party_size: int,
        exclude_booking_id: uuid.UUID,
        slot_state: TeeSheetSlotState | None,
    ) -> BookingMoveFailureDetail | None:
        """Return a failure detail if the target slot cannot accommodate the party, else None."""
        if slot_state is None or slot_state.player_capacity is None:
            # No capacity constraint configured — allow
            return None

        # Count live players at target slot, excluding the booking being moved
        live_bookings = list(
            self.db.scalars(
                select(Booking).where(
                    Booking.club_id == club_id,
                    Booking.course_id == course_id,
                    Booking.tee_id == tee_id if tee_id is not None else Booking.tee_id.is_(None),
                    Booking.slot_datetime == slot_datetime,
                    Booking.status.in_(tuple(LIVE_OCCUPANCY_STATUSES)),
                    Booking.id != exclude_booking_id,
                    (
                        or_(
                            Booking.start_lane == StartLane.HOLE_1,
                            Booking.start_lane.is_(None),
                        )
                        if start_lane == StartLane.HOLE_1
                        else Booking.start_lane == start_lane
                    ),
                )
            ).all()
        )
        occupied = sum(b.party_size for b in live_bookings)
        remaining = slot_state.player_capacity - occupied
        if party_size > remaining:
            return BookingMoveFailureDetail(
                code="target_slot_capacity_exceeded",
                message=(
                    f"Target slot has {remaining} player spot(s) remaining "
                    f"but the booking party size is {party_size}"
                ),
                field="target_slot_datetime",
            )
        return None

    def _normalize_start_lane(self, start_lane: StartLane | None) -> StartLane:
        return start_lane or StartLane.HOLE_1
