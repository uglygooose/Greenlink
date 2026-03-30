from __future__ import annotations

import uuid
from datetime import date, datetime, time
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BookingParticipantType, BookingRuleAppliesTo, BookingStatus
from app.schemas.availability import AvailabilityTrace
from app.schemas.booking_state import (
    AvailabilityDecisionInput,
    BookingPartyContext,
    BookingStateSnapshot,
)
from app.schemas.rule_context import ContextNotice


class TeeSheetSlotDisplayStatus(StrEnum):
    AVAILABLE = "available"
    BLOCKED = "blocked"
    RESERVED = "reserved"
    INDETERMINATE = "indeterminate"
    WARNING = "warning"


class TeeSheetDayQuery(BaseModel):
    club_id: uuid.UUID
    course_id: uuid.UUID
    date: date
    tee_id: uuid.UUID | None = None
    membership_type: BookingRuleAppliesTo = BookingRuleAppliesTo.MEMBER
    reference_datetime: datetime | None = None


class TeeSheetPartySummary(BaseModel):
    member_count: int | None = None
    guest_count: int | None = None
    staff_count: int | None = None
    total_players: int | None = None
    has_activity: bool


class TeeSheetOccupancySummary(BaseModel):
    player_capacity: int | None = None
    occupied_player_count: int | None = None
    reserved_player_count: int | None = None
    confirmed_booking_count: int | None = None
    reserved_booking_count: int | None = None
    remaining_player_capacity: int | None = None


class TeeSheetPolicySummary(BaseModel):
    applies_to: BookingRuleAppliesTo
    availability_status: str
    blocker_count: int
    unresolved_count: int
    warning_count: int


class TeeSheetBookingParticipantSummary(BaseModel):
    display_name: str
    participant_type: BookingParticipantType
    is_primary: bool


class TeeSheetBookingSummary(BaseModel):
    id: uuid.UUID
    status: BookingStatus
    party_size: int
    slot_datetime: datetime
    participants: list[TeeSheetBookingParticipantSummary] = Field(default_factory=list)


class TeeSheetSlotView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slot_datetime: datetime
    local_time: time
    display_status: TeeSheetSlotDisplayStatus
    state_flags: dict[str, bool]
    occupancy: TeeSheetOccupancySummary
    party_summary: TeeSheetPartySummary
    policy_summary: TeeSheetPolicySummary
    blockers: list[AvailabilityTrace] = Field(default_factory=list)
    unresolved_checks: list[AvailabilityTrace] = Field(default_factory=list)
    warnings: list[ContextNotice] = Field(default_factory=list)
    bookings: list[TeeSheetBookingSummary] = Field(default_factory=list)
    decision_input: AvailabilityDecisionInput
    booking_state: BookingStateSnapshot
    booking_party: BookingPartyContext


class TeeSheetRow(BaseModel):
    row_key: str
    tee_id: uuid.UUID | None = None
    label: str
    color_code: str | None = None
    slots: list[TeeSheetSlotView]


class TeeSheetDayResponse(BaseModel):
    club_id: uuid.UUID
    course_id: uuid.UUID
    course_name: str
    date: date
    timezone: str
    interval_minutes: int
    membership_type: BookingRuleAppliesTo
    reference_datetime: datetime
    rows: list[TeeSheetRow]
    warnings: list[ContextNotice] = Field(default_factory=list)
