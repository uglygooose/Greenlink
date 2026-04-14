from __future__ import annotations

import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import (
    BookingRuleAppliesTo,
    BookingRuleConflictStrategy,
    BookingRuleScopeType,
    BookingRuleType,
    PricingDayType,
    PricingPlayerType,
    PricingRuleAppliesTo,
    PricingSeason,
    PricingTimeBand,
)

TIME_PATTERN = re.compile(r"^\d{2}:\d{2}$")
OPERATING_DAYS = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)


def _validate_pricing_holes(value: int) -> int:
    if value not in {9, 18}:
        raise ValueError("holes must be 9 or 18")
    return value


def _pricing_dimension_specificity(
    *,
    day_type: PricingDayType,
    season: PricingSeason,
    time_band: PricingTimeBand,
) -> int:
    return int(day_type != PricingDayType.ANY) + int(season != PricingSeason.ANY) + int(time_band != PricingTimeBand.ANY)


def _pricing_rules_overlap(left: "PricingRuleWriteRequest", right: "PricingRuleWriteRequest") -> bool:
    if left.applies_to != right.applies_to:
        return False
    if left.player_type != right.player_type:
        return False
    if left.holes != right.holes:
        return False
    if left.day_type != PricingDayType.ANY and right.day_type != PricingDayType.ANY and left.day_type != right.day_type:
        return False
    if left.season != PricingSeason.ANY and right.season != PricingSeason.ANY and left.season != right.season:
        return False
    if left.time_band != PricingTimeBand.ANY and right.time_band != PricingTimeBand.ANY and left.time_band != right.time_band:
        return False
    if left.time_band == right.time_band == PricingTimeBand.CUSTOM:
        return left.time_band_ref == right.time_band_ref
    return True


def _pricing_rule_dominates(left: "PricingRuleWriteRequest", right: "PricingRuleWriteRequest") -> bool:
    if left.applies_to != right.applies_to or left.player_type != right.player_type or left.holes != right.holes:
        return False
    if right.day_type != PricingDayType.ANY and left.day_type != right.day_type:
        return False
    if right.season != PricingSeason.ANY and left.season != right.season:
        return False
    if right.time_band != PricingTimeBand.ANY:
        if left.time_band != right.time_band:
            return False
        if right.time_band == PricingTimeBand.CUSTOM and left.time_band_ref != right.time_band_ref:
            return False
    return _pricing_dimension_specificity(
        day_type=left.day_type,
        season=left.season,
        time_band=left.time_band,
    ) > _pricing_dimension_specificity(
        day_type=right.day_type,
        season=right.season,
        time_band=right.time_band,
    )


def _validate_pricing_rule_conflicts(rules: list["PricingRuleWriteRequest"]) -> None:
    active_rules = [rule for rule in rules if rule.active]
    for index, left in enumerate(active_rules):
        for other_index, right in enumerate(active_rules[index + 1 :], start=index + 1):
            if not _pricing_rules_overlap(left, right):
                continue
            if _pricing_rule_dominates(left, right) or _pricing_rule_dominates(right, left):
                continue
            raise ValueError(
                "pricing rules conflict for the same player_type/holes combination "
                f"(rows {index + 1} and {other_index + 1})"
            )


def _validate_pricing_player_type_bucket(
    applies_to: PricingRuleAppliesTo,
    player_type: PricingPlayerType,
) -> None:
    if player_type in {
        PricingPlayerType.SCHOLAR,
        PricingPlayerType.STUDENT,
        PricingPlayerType.PENSIONER,
        PricingPlayerType.MEMBER_STANDARD,
    } and applies_to != PricingRuleAppliesTo.MEMBER:
        raise ValueError("player_type requires applies_to member")
    if player_type in {
        PricingPlayerType.VISITOR_AFFILIATED,
        PricingPlayerType.VISITOR_NON_AFFILIATED,
    } and applies_to != PricingRuleAppliesTo.GUEST:
        raise ValueError("visitor player_type requires applies_to guest")
    if player_type == PricingPlayerType.STAFF_COURTESY and applies_to != PricingRuleAppliesTo.STAFF:
        raise ValueError("staff_courtesy player_type requires applies_to staff")


class OperatingHoursEntry(BaseModel):
    open: str | None = None
    close: str | None = None
    closed: bool = False

    @field_validator("open", "close")
    @classmethod
    def validate_time_value(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not TIME_PATTERN.match(value):
            raise ValueError("Time values must use HH:MM format")
        return value

    @model_validator(mode="after")
    def validate_entry_shape(self) -> OperatingHoursEntry:
        if self.closed:
            return self
        if self.open is None or self.close is None:
            raise ValueError("Open and close times are required when a day is not closed")
        if self.open >= self.close:
            raise ValueError("Open time must be earlier than close time")
        return self


class ClubConfigUpsertRequest(BaseModel):
    timezone: str = Field(min_length=1, max_length=64)
    operating_hours: dict[str, OperatingHoursEntry]
    booking_window_days: int = Field(ge=0, le=730)
    cancellation_policy_hours: int = Field(ge=0, le=720)
    default_slot_interval_minutes: int = Field(ge=1, le=240)

    @field_validator("operating_hours")
    @classmethod
    def validate_operating_hours_shape(
        cls, value: dict[str, OperatingHoursEntry]
    ) -> dict[str, OperatingHoursEntry]:
        provided_days = set(value.keys())
        expected_days = set(OPERATING_DAYS)
        if provided_days != expected_days:
            missing_days = sorted(expected_days - provided_days)
            extra_days = sorted(provided_days - expected_days)
            details: list[str] = []
            if missing_days:
                details.append(f"missing: {', '.join(missing_days)}")
            if extra_days:
                details.append(f"extra: {', '.join(extra_days)}")
            raise ValueError(f"Operating hours must define all weekdays exactly ({'; '.join(details)})")
        return value


class ClubConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    timezone: str
    operating_hours: dict[str, OperatingHoursEntry]
    booking_window_days: int
    cancellation_policy_hours: int
    default_slot_interval_minutes: int
    preferred_accounting_profile_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class CourseCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    holes: int
    active: bool = True

    @field_validator("holes")
    @classmethod
    def validate_holes(cls, value: int) -> int:
        if value not in {9, 18}:
            raise ValueError("Course holes must be 9 or 18")
        return value


class CourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    name: str
    holes: int
    active: bool
    created_at: datetime
    updated_at: datetime


class TeeCreateRequest(BaseModel):
    course_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    gender: str | None = Field(default=None, max_length=32)
    slope_rating: int = Field(ge=1, le=200)
    course_rating: Decimal = Field(ge=0, le=200)
    color_code: str = Field(min_length=1, max_length=32)
    active: bool = True


class TeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    course_name: str
    name: str
    gender: str | None
    slope_rating: int
    course_rating: Decimal
    color_code: str
    active: bool
    created_at: datetime
    updated_at: datetime


class BookingRuleWriteRequest(BaseModel):
    type: BookingRuleType
    evaluation_order: int | None = Field(default=None, ge=0)
    config: dict[str, object] = Field(default_factory=dict)
    active: bool = True

    @field_validator("config")
    @classmethod
    def validate_rule_config(cls, value: dict[str, object], info) -> dict[str, object]:
        rule_type = info.data.get("type")
        if rule_type == BookingRuleType.ADVANCE_WINDOW:
            cls._require_non_negative_integer(value, "days")
        elif rule_type in {
            BookingRuleType.MAX_BOOKINGS_PER_DAY,
            BookingRuleType.MAX_FUTURE_BOOKINGS,
            BookingRuleType.GUEST_LIMIT,
        }:
            cls._require_non_negative_integer(value, "count")
        elif rule_type == BookingRuleType.TIME_RESTRICTION:
            cls._require_time(value, "start_time")
            cls._require_time(value, "end_time")
            allowed_days = value.get("days")
            if allowed_days is not None:
                if not isinstance(allowed_days, list) or any(
                    not isinstance(item, str) or item not in OPERATING_DAYS for item in allowed_days
                ):
                    raise ValueError("time_restriction days must be a list of weekday names")
        return value

    @staticmethod
    def _require_non_negative_integer(value: dict[str, object], key: str) -> None:
        raw = value.get(key)
        if not isinstance(raw, int) or raw < 0:
            raise ValueError(f"{key} must be a non-negative integer")

    @staticmethod
    def _require_time(value: dict[str, object], key: str) -> None:
        raw = value.get(key)
        if not isinstance(raw, str) or not TIME_PATTERN.match(raw):
            raise ValueError(f"{key} must use HH:MM format")


class BookingRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: BookingRuleType
    evaluation_order: int
    config: dict[str, object]
    active: bool
    created_at: datetime
    updated_at: datetime


class BookingRuleSetCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    applies_to: BookingRuleAppliesTo
    scope_type: BookingRuleScopeType = BookingRuleScopeType.CLUB
    scope_ref_id: str | None = Field(default=None, max_length=120)
    conflict_strategy: BookingRuleConflictStrategy = BookingRuleConflictStrategy.FIRST_MATCH
    applies_from: datetime | None = None
    applies_until: datetime | None = None
    priority: int = Field(ge=0, le=1000)
    active: bool = True
    rules: list[BookingRuleWriteRequest] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_scope_and_window(self) -> BookingRuleSetCreateRequest:
        if self.applies_from and self.applies_until and self.applies_from > self.applies_until:
            raise ValueError("applies_from must be before applies_until")
        if self.scope_type == BookingRuleScopeType.CLUB and self.scope_ref_id is not None:
            raise ValueError("scope_ref_id must be null when scope_type is club")
        if self.scope_type != BookingRuleScopeType.CLUB and not self.scope_ref_id:
            raise ValueError("scope_ref_id is required when scope_type is not club")
        return self


class BookingRuleSetUpdateRequest(BookingRuleSetCreateRequest):
    pass


class BookingRuleSetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    name: str
    applies_to: BookingRuleAppliesTo
    scope_type: BookingRuleScopeType
    scope_ref_id: str | None
    conflict_strategy: BookingRuleConflictStrategy
    applies_from: datetime | None
    applies_until: datetime | None
    priority: int
    active: bool
    status: Literal["draft", "active"]
    rules: list[BookingRuleResponse]
    created_at: datetime
    updated_at: datetime


class PricingRuleWriteRequest(BaseModel):
    applies_to: PricingRuleAppliesTo
    player_type: PricingPlayerType
    holes: int
    day_type: PricingDayType = PricingDayType.ANY
    season: PricingSeason = PricingSeason.ANY
    time_band: PricingTimeBand = PricingTimeBand.ANY
    time_band_ref: str | None = Field(default=None, max_length=120)
    price: Decimal = Field(ge=0)
    currency: str = Field(min_length=3, max_length=3)
    active: bool = True

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper()

    @field_validator("holes")
    @classmethod
    def validate_holes(cls, value: int) -> int:
        return _validate_pricing_holes(value)

    @model_validator(mode="after")
    def validate_time_band_contract(self) -> PricingRuleWriteRequest:
        _validate_pricing_player_type_bucket(self.applies_to, self.player_type)
        if self.time_band == PricingTimeBand.CUSTOM and not self.time_band_ref:
            raise ValueError("time_band_ref is required when time_band is custom")
        if self.time_band != PricingTimeBand.CUSTOM and self.time_band_ref is not None:
            raise ValueError("time_band_ref can only be supplied when time_band is custom")
        return self


class PricingRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    applies_to: PricingRuleAppliesTo
    player_type: PricingPlayerType
    holes: int
    day_type: PricingDayType
    season: PricingSeason
    time_band: PricingTimeBand
    time_band_ref: str | None
    price: Decimal
    currency: str
    active: bool
    created_at: datetime
    updated_at: datetime


class PricingMatrixCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    active: bool = True
    rules: list[PricingRuleWriteRequest] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_rule_conflicts(self) -> "PricingMatrixCreateRequest":
        _validate_pricing_rule_conflicts(self.rules)
        return self


class PricingMatrixUpdateRequest(PricingMatrixCreateRequest):
    pass


class PricingMatrixResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    name: str
    active: bool
    status: Literal["draft", "active"]
    rules: list[PricingRuleResponse]
    created_at: datetime
    updated_at: datetime


class GolfSettingsReadinessResponse(BaseModel):
    courses_configured: bool
    tees_configured: bool
    rules_configured: bool
    pricing_configured: bool
    overall_ready: bool


class GolfSettingsRulesPublishRequest(BaseModel):
    rule_set_id: uuid.UUID


class GolfSettingsPricingPublishRequest(BaseModel):
    matrix_id: uuid.UUID


class GolfSettingsRulesMutationResult(BaseModel):
    action: Literal["published", "rolled_back"]
    rule_set: BookingRuleSetResponse
    readiness: GolfSettingsReadinessResponse


class GolfSettingsPricingMutationResult(BaseModel):
    action: Literal["published", "rolled_back"]
    pricing_matrix: PricingMatrixResponse
    readiness: GolfSettingsReadinessResponse
