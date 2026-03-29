from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models import (
    BookingRuleAppliesTo,
    BookingRuleConflictStrategy,
    BookingRuleScopeType,
    BookingRuleType,
    PricingDayType,
    PricingRuleAppliesTo,
    PricingTimeBand,
)
from app.schemas.rule_context import ContextNotice, NormalizedRuleContext


class AppliedRuleTrace(BaseModel):
    rule_set_id: uuid.UUID
    rule_set_name: str
    rule_id: uuid.UUID
    rule_type: BookingRuleType
    applies_to: BookingRuleAppliesTo
    scope_type: BookingRuleScopeType
    scope_ref_id: str | None
    priority: int
    evaluation_order: int
    conflict_strategy: BookingRuleConflictStrategy
    reason: str
    config: dict[str, Any]


class IgnoredRuleTrace(BaseModel):
    rule_set_id: uuid.UUID
    rule_set_name: str
    rule_id: uuid.UUID | None = None
    rule_type: BookingRuleType | None = None
    applies_to: BookingRuleAppliesTo
    scope_type: BookingRuleScopeType
    scope_ref_id: str | None
    priority: int
    evaluation_order: int | None = None
    conflict_strategy: BookingRuleConflictStrategy
    reason: str


class PricingCandidate(BaseModel):
    matrix_id: uuid.UUID
    matrix_name: str
    rule_id: uuid.UUID
    applies_to: PricingRuleAppliesTo
    day_type: PricingDayType
    time_band: PricingTimeBand
    time_band_ref: str | None = None
    price: Decimal
    currency: str
    reason: str


class PricingIgnoredTrace(BaseModel):
    matrix_id: uuid.UUID
    matrix_name: str
    rule_id: uuid.UUID
    applies_to: PricingRuleAppliesTo
    day_type: PricingDayType
    time_band: PricingTimeBand
    time_band_ref: str | None = None
    reason: str


class PricingEvaluationResult(BaseModel):
    context_day_type: PricingDayType | None = None
    context_time_band: PricingTimeBand | None = None
    context_time_band_ref: str | None = None
    candidate_rules: list[PricingCandidate]
    ignored_rules: list[PricingIgnoredTrace]
    unresolved_rules: list[PricingIgnoredTrace] = Field(default_factory=list)
    warnings: list[ContextNotice] = Field(default_factory=list)


class RuleEvaluationResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    context: NormalizedRuleContext
    booking_constraints: dict[str, Any]
    limits: dict[str, Any]
    time_restrictions: dict[str, Any]
    applicable_rules: list[AppliedRuleTrace]
    ignored_rules: list[IgnoredRuleTrace]
    unresolved_rules: list[IgnoredRuleTrace] = Field(default_factory=list)
    warnings: list[ContextNotice] = Field(default_factory=list)
    pricing: PricingEvaluationResult
