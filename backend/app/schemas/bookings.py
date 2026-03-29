from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import BookingParticipantType, BookingSource, BookingStatus
from app.models.enums import BookingRuleAppliesTo
from app.schemas.availability import AvailabilityPolicyResult


class BookingCreateParticipantInput(BaseModel):
    participant_type: BookingParticipantType
    person_id: uuid.UUID | None = None
    guest_name: str | None = Field(default=None, max_length=255)
    is_primary: bool = False

    @model_validator(mode="after")
    def validate_shape(self) -> BookingCreateParticipantInput:
        if self.participant_type == BookingParticipantType.GUEST:
            if self.person_id is not None:
                raise ValueError("guest participants cannot include person_id in this phase")
            if not self.guest_name or not self.guest_name.strip():
                raise ValueError("guest_name is required for guest participants")
            self.guest_name = self.guest_name.strip()
            return self
        if self.person_id is None:
            raise ValueError("person_id is required for member and staff participants")
        if self.guest_name is not None:
            raise ValueError("guest_name can only be supplied for guest participants")
        return self


class BookingCreateRequest(BaseModel):
    course_id: uuid.UUID
    tee_id: uuid.UUID | None = None
    slot_datetime: datetime
    slot_interval_minutes: int | None = Field(default=None, ge=1, le=240)
    source: BookingSource = BookingSource.ADMIN
    applies_to: BookingRuleAppliesTo | None = None
    reference_datetime: datetime | None = None
    participants: list[BookingCreateParticipantInput] = Field(min_length=1, max_length=32)

    @field_validator("slot_datetime", "reference_datetime")
    @classmethod
    def validate_timezone_aware_datetime(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return value
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Datetime values must include an explicit timezone offset")
        return value

    @model_validator(mode="after")
    def validate_participants(self) -> BookingCreateRequest:
        primary_participants = [participant for participant in self.participants if participant.is_primary]
        if len(primary_participants) != 1:
            raise ValueError("exactly one primary participant is required")
        if primary_participants[0].participant_type == BookingParticipantType.GUEST:
            raise ValueError("primary participant must be a member or staff participant in this phase")
        if self.applies_to is not None:
            expected_applies_to = (
                BookingRuleAppliesTo.STAFF
                if primary_participants[0].participant_type == BookingParticipantType.STAFF
                else BookingRuleAppliesTo.MEMBER
            )
            if self.applies_to != expected_applies_to:
                raise ValueError("applies_to must match the primary participant bucket in this phase")
        return self


class BookingCreateFailureDetail(BaseModel):
    code: str
    message: str
    field: str | None = None


class BookingCreateDecision(StrEnum):
    ALLOWED = "allowed"
    BLOCKED = "blocked"
    INDETERMINATE = "indeterminate"


class BookingParticipantSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    participant_type: BookingParticipantType
    person_id: uuid.UUID | None = None
    club_membership_id: uuid.UUID | None = None
    display_name: str
    guest_name: str | None = None
    sort_order: int
    is_primary: bool


class BookingSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    course_id: uuid.UUID
    tee_id: uuid.UUID | None = None
    slot_datetime: datetime
    slot_interval_minutes: int
    status: BookingStatus
    source: BookingSource
    party_size: int
    primary_person_id: uuid.UUID | None = None
    primary_membership_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    participants: list[BookingParticipantSummary] = Field(default_factory=list)


class BookingCreateResult(BaseModel):
    decision: BookingCreateDecision
    booking: BookingSummary | None = None
    availability: AvailabilityPolicyResult | None = None
    failures: list[BookingCreateFailureDetail] = Field(default_factory=list)
