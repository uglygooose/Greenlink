from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.booking_state import AvailabilityDecisionInput
from app.schemas.rule_context import ContextNotice
from app.schemas.rule_evaluation import RuleEvaluationResult


class AvailabilityStatus(StrEnum):
    ALLOWED = "allowed"
    BLOCKED = "blocked"
    INDETERMINATE = "indeterminate"


class AvailabilityTrace(BaseModel):
    code: str
    reason: str
    details: dict[str, Any] = Field(default_factory=dict)


class SlotPolicySummary(BaseModel):
    timezone: str
    local_day_name: str | None = None
    operating_window: dict[str, Any] | None = None
    booking_window_days: int | None = None
    cancellation_policy_hours: int | None = None
    default_slot_interval_minutes: int | None = None


class AvailabilityPolicyResult(BaseModel):
    decision_input: AvailabilityDecisionInput
    rule_evaluation: RuleEvaluationResult
    status: AvailabilityStatus
    slot_policy: SlotPolicySummary | None = None
    blockers: list[AvailabilityTrace] = Field(default_factory=list)
    resolved_checks: list[AvailabilityTrace] = Field(default_factory=list)
    unresolved_checks: list[AvailabilityTrace] = Field(default_factory=list)
    informational_traces: list[AvailabilityTrace] = Field(default_factory=list)
    warnings: list[ContextNotice] = Field(default_factory=list)
