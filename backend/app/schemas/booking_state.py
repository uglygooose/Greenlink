from __future__ import annotations

import uuid
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import ClubMembershipRole, PricingDayType, PricingTimeBand
from app.models.enums import BookingRuleAppliesTo
from app.schemas.rule_context import ContextNotice, NormalizedRuleContext


class SlotCandidateInput(BaseModel):
    slot_interval_minutes: int | None = Field(default=None, ge=1, le=240)


class SlotCandidate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    club_id: uuid.UUID
    course_id: uuid.UUID | None = None
    tee_id: uuid.UUID | None = None
    slot_datetime: datetime | None = None
    timezone: str
    local_date: date | None = None
    local_time: time | None = None
    local_day_name: str | None = None
    slot_interval_minutes: int | None = None
    slot_interval_source: Literal["input", "club_config_default", "unresolved"]


class BookingPartyContextInput(BaseModel):
    member_count: int | None = Field(default=None, ge=0)
    guest_count: int | None = Field(default=None, ge=0)
    staff_count: int | None = Field(default=None, ge=0)
    requested_player_count: int | None = Field(default=None, ge=0, le=32)
    requester_applies_to: BookingRuleAppliesTo | None = None
    requester_membership_role: ClubMembershipRole | None = None

    @model_validator(mode="after")
    def validate_requested_player_count(self) -> BookingPartyContextInput:
        bucket_values = [value for value in (self.member_count, self.guest_count, self.staff_count) if value is not None]
        if self.requested_player_count is not None and bucket_values and self.requested_player_count != sum(bucket_values):
            raise ValueError("requested_player_count must match the sum of explicit party buckets")
        return self


class BookingPartyContext(BaseModel):
    member_count: int | None = None
    guest_count: int | None = None
    staff_count: int | None = None
    requested_player_count: int | None = None
    requester_applies_to: BookingRuleAppliesTo | None = None
    requester_membership_role: ClubMembershipRole | None = None
    bucket_counts_complete: bool = False


class OccupancyStateInput(BaseModel):
    player_capacity: int | None = Field(default=None, ge=1, le=64)
    occupied_player_count: int | None = Field(default=None, ge=0, le=64)
    reserved_player_count: int | None = Field(default=None, ge=0, le=64)
    confirmed_booking_count: int | None = Field(default=None, ge=0)
    reserved_booking_count: int | None = Field(default=None, ge=0)


class OccupancyState(BaseModel):
    player_capacity: int | None = None
    occupied_player_count: int | None = None
    reserved_player_count: int | None = None
    confirmed_booking_count: int | None = None
    reserved_booking_count: int | None = None
    remaining_player_capacity: int | None = None


class BookingStateSnapshotInput(BaseModel):
    occupancy: OccupancyStateInput = Field(default_factory=OccupancyStateInput)
    manually_blocked: bool | None = None
    reserved_state_active: bool | None = None
    competition_controlled: bool | None = None
    event_controlled: bool | None = None
    externally_unavailable: bool | None = None
    current_bookings_for_day: int | None = Field(default=None, ge=0)
    current_future_bookings: int | None = Field(default=None, ge=0)
    blocked_reason: str | None = Field(default=None, max_length=255)


class BookingStateSnapshot(BaseModel):
    occupancy: OccupancyState
    manually_blocked: bool | None = None
    reserved_state_active: bool | None = None
    competition_controlled: bool | None = None
    event_controlled: bool | None = None
    externally_unavailable: bool | None = None
    current_bookings_for_day: int | None = None
    current_future_bookings: int | None = None
    blocked_reason: str | None = None


class AvailabilityDecisionInput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    context: NormalizedRuleContext
    slot: SlotCandidate
    party: BookingPartyContext
    booking_state: BookingStateSnapshot
    warnings: list[ContextNotice] = Field(default_factory=list)


class SlotPreviewRequest(BaseModel):
    course_id: uuid.UUID | None = None
    tee_id: uuid.UUID | None = None
    membership_type: BookingRuleAppliesTo | None = None
    membership_role: ClubMembershipRole | None = None
    effective_datetime: datetime | None = None
    reference_datetime: datetime | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    day_type: PricingDayType | None = None
    time_band: PricingTimeBand | None = None
    time_band_ref: str | None = Field(default=None, max_length=120)
    slot: SlotCandidateInput = Field(default_factory=SlotCandidateInput)
    party: BookingPartyContextInput = Field(default_factory=BookingPartyContextInput)
    booking_state: BookingStateSnapshotInput = Field(default_factory=BookingStateSnapshotInput)
