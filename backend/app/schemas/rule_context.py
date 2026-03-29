from __future__ import annotations

import uuid
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import ClubMembershipRole, PricingDayType, PricingTimeBand
from app.models.enums import BookingRuleAppliesTo


class ContextNotice(BaseModel):
    code: str
    message: str


class RuleContextInput(BaseModel):
    club_id: uuid.UUID
    course_id: uuid.UUID | None = None
    tee_id: uuid.UUID | None = None
    applies_to: BookingRuleAppliesTo | None = None
    membership_role: ClubMembershipRole | None = None
    effective_datetime: datetime | None = None
    reference_datetime: datetime | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    day_type: PricingDayType | None = None
    time_band: PricingTimeBand | None = None
    time_band_ref: str | None = Field(default=None, max_length=120)

    @field_validator("effective_datetime", "reference_datetime")
    @classmethod
    def validate_timezone_aware_datetime(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return value
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Datetime values must include an explicit timezone offset")
        return value

    @model_validator(mode="after")
    def validate_time_band_contract(self) -> RuleContextInput:
        if self.time_band == PricingTimeBand.CUSTOM and not self.time_band_ref:
            raise ValueError("time_band_ref is required when time_band is custom")
        if self.time_band != PricingTimeBand.CUSTOM and self.time_band_ref is not None:
            raise ValueError("time_band_ref can only be supplied when time_band is custom")
        return self


class DayTypeResolution(BaseModel):
    value: PricingDayType | None
    source: Literal["supplied", "derived_weekday_weekend", "unresolved"]
    holiday_strategy: Literal[
        "supplied_override",
        "weekday_weekend_fallback_without_holiday_provider",
        "holiday_provider_required",
    ]
    holiday_provider: str | None = None
    warnings: list[ContextNotice] = Field(default_factory=list)


class TimeBandResolution(BaseModel):
    value: PricingTimeBand | None
    source: Literal["supplied", "derived_default_split", "unresolved"]
    contract: Literal["supplied", "default_split", "custom_ref_required", "input_required"]
    time_band_ref: str | None = None
    warnings: list[ContextNotice] = Field(default_factory=list)


class NormalizedScopeContext(BaseModel):
    club_ref: str
    course_ref: str | None = None
    tee_ref: str | None = None
    applies_to_bucket_ref: str | None = None
    membership_role_ref: str | None = None


class NormalizedRuleContext(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    club_id: uuid.UUID
    course_id: uuid.UUID | None = None
    tee_id: uuid.UUID | None = None
    applies_to: BookingRuleAppliesTo | None = None
    membership_role: ClubMembershipRole | None = None
    effective_datetime: datetime | None = None
    reference_datetime: datetime | None = None
    timezone: str
    local_date: date | None = None
    local_time: time | None = None
    local_day_name: str | None = None
    reference_local_date: date | None = None
    reference_local_time: time | None = None
    day_type: PricingDayType | None = None
    time_band: PricingTimeBand | None = None
    time_band_ref: str | None = None
    day_type_resolution: DayTypeResolution
    time_band_resolution: TimeBandResolution
    scope_context: NormalizedScopeContext
    warnings: list[ContextNotice] = Field(default_factory=list)
    unsupported: list[ContextNotice] = Field(default_factory=list)
