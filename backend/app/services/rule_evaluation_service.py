from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    BookingRule,
    BookingRuleConflictStrategy,
    BookingRuleScopeType,
    BookingRuleSet,
    BookingRuleType,
    PricingDayType,
    PricingMatrix,
    PricingRule,
    PricingSeason,
    PricingTimeBand,
)
from app.schemas.rule_context import ContextNotice, NormalizedRuleContext
from app.schemas.rule_evaluation import (
    AppliedRuleTrace,
    IgnoredRuleTrace,
    PricingCandidate,
    PricingEvaluationResult,
    PricingIgnoredTrace,
    RuleEvaluationResult,
)


class RuleEvaluationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self._rule_sets_cache: dict[uuid.UUID, list[BookingRuleSet]] = {}

    def evaluate(self, context: NormalizedRuleContext) -> RuleEvaluationResult:
        candidate_rule_sets = self._load_rule_sets(context.club_id)
        booking_constraints: dict[str, Any] = {}
        limits: dict[str, Any] = {}
        time_restrictions: dict[str, Any] = {"windows": []}
        applicable_rules: list[AppliedRuleTrace] = []
        ignored_rules: list[IgnoredRuleTrace] = []

        stop_after_current = False

        for index, ruleset in enumerate(candidate_rule_sets):
            mismatch_reason = self._mismatch_reason(ruleset, context)
            if mismatch_reason is not None:
                for rule in self._sort_rules(ruleset.rules):
                    ignored_rules.append(self._ignored_trace(ruleset, rule, mismatch_reason))
                continue

            strategy = ruleset.conflict_strategy
            sorted_rules = self._sort_rules(ruleset.rules)
            if strategy == BookingRuleConflictStrategy.FIRST_MATCH and applicable_rules:
                for rule in sorted_rules:
                    ignored_rules.append(self._ignored_trace(ruleset, rule, "first_match_stopped"))
                break

            for rule in sorted_rules:
                section_name, payload = self._section_payload(rule)
                if strategy == BookingRuleConflictStrategy.FIRST_MATCH:
                    self._apply_override(
                        section_name, payload, booking_constraints, limits, time_restrictions
                    )
                    applicable_rules.append(
                        self._applied_trace(ruleset, rule, "first_match_applied")
                    )
                    stop_after_current = True
                    continue

                if strategy == BookingRuleConflictStrategy.OVERRIDE:
                    blocked = self._blocked_override_keys(
                        section_name,
                        payload,
                        booking_constraints,
                        limits,
                        time_restrictions,
                    )
                    if blocked == self._payload_keys(section_name, payload):
                        ignored_rules.append(
                            self._ignored_trace(
                                ruleset, rule, "higher_priority_override_already_applied"
                            )
                        )
                        continue
                    self._apply_override(
                        section_name,
                        payload,
                        booking_constraints,
                        limits,
                        time_restrictions,
                        blocked_keys=blocked,
                    )
                    applied_reason = (
                        "override_applied"
                        if not blocked
                        else "override_applied_with_partial_conflict"
                    )
                    applicable_rules.append(self._applied_trace(ruleset, rule, applied_reason))
                    continue

                merged = self._apply_merge(
                    section_name, payload, booking_constraints, limits, time_restrictions
                )
                if merged:
                    applicable_rules.append(self._applied_trace(ruleset, rule, "merge_applied"))
                else:
                    ignored_rules.append(
                        self._ignored_trace(
                            ruleset, rule, "merge_conflict_preserved_higher_priority"
                        )
                    )

            if stop_after_current:
                for remaining_ruleset in candidate_rule_sets[index + 1 :]:
                    for remaining_rule in self._sort_rules(remaining_ruleset.rules):
                        ignored_rules.append(
                            self._ignored_trace(
                                remaining_ruleset, remaining_rule, "first_match_stopped"
                            )
                        )
                break

        return RuleEvaluationResult(
            context=context,
            booking_constraints=booking_constraints,
            limits=limits,
            time_restrictions=time_restrictions,
            applicable_rules=applicable_rules,
            ignored_rules=ignored_rules,
            unresolved_rules=[],
            warnings=list(context.warnings),
            pricing=self.resolve_pricing(context),
        )

    def resolve_pricing(self, context: NormalizedRuleContext) -> PricingEvaluationResult:
        statement = (
            select(PricingMatrix)
            .options(selectinload(PricingMatrix.rules))
            .where(PricingMatrix.club_id == context.club_id, PricingMatrix.active.is_(True))
            .order_by(
                PricingMatrix.name.asc(), PricingMatrix.created_at.asc(), PricingMatrix.id.asc()
            )
        )
        matrices = list(self.db.scalars(statement).unique().all())

        candidates: list[PricingCandidate] = []
        ignored_rules: list[PricingIgnoredTrace] = []
        unresolved_rules: list[PricingIgnoredTrace] = []
        warnings: list[ContextNotice] = []
        candidate_specificity: dict[uuid.UUID, int] = {}

        for matrix in matrices:
            for rule in sorted(matrix.rules, key=lambda item: (item.created_at, str(item.id))):
                if not rule.active:
                    ignored_rules.append(self._pricing_trace(matrix, rule, "rule_inactive"))
                    continue
                if context.applies_to and rule.applies_to.value != context.applies_to.value:
                    ignored_rules.append(self._pricing_trace(matrix, rule, "applies_to_mismatch"))
                    continue
                if context.pricing_player_type is None:
                    unresolved_rules.append(
                        self._pricing_trace(matrix, rule, "pricing_player_type_unresolved")
                    )
                    continue
                if rule.player_type != context.pricing_player_type:
                    ignored_rules.append(self._pricing_trace(matrix, rule, "player_type_mismatch"))
                    continue
                if context.holes is None:
                    unresolved_rules.append(
                        self._pricing_trace(matrix, rule, "pricing_holes_unresolved")
                    )
                    continue
                if rule.holes != context.holes:
                    ignored_rules.append(self._pricing_trace(matrix, rule, "holes_mismatch"))
                    continue
                if not self._pricing_day_type_matches(rule, context):
                    ignored_rules.append(self._pricing_trace(matrix, rule, "day_type_mismatch"))
                    continue
                if not self._pricing_season_matches(rule, context):
                    ignored_rules.append(self._pricing_trace(matrix, rule, "season_mismatch"))
                    continue
                time_band_outcome = self._pricing_time_band_outcome(rule, context)
                if time_band_outcome == "ignored":
                    ignored_rules.append(self._pricing_trace(matrix, rule, "time_band_mismatch"))
                    continue
                if time_band_outcome == "ignored_custom_ref_mismatch":
                    ignored_rules.append(
                        self._pricing_trace(matrix, rule, "custom_time_band_ref_mismatch")
                    )
                    continue
                if time_band_outcome == "unresolved_missing_rule_ref":
                    unresolved_rules.append(
                        self._pricing_trace(matrix, rule, "custom_time_band_rule_missing_ref")
                    )
                    warnings.append(
                        ContextNotice(
                            code="custom_time_band_rule_missing_ref",
                            message=(
                                "A custom pricing rule is missing time_band_ref "
                                "and could not be matched deterministically"
                            ),
                        )
                    )
                    continue
                if time_band_outcome == "unresolved_missing_context_ref":
                    unresolved_rules.append(
                        self._pricing_trace(matrix, rule, "custom_time_band_context_ref_missing")
                    )
                    continue
                if time_band_outcome == "unresolved_missing_context_band":
                    unresolved_rules.append(
                        self._pricing_trace(matrix, rule, "custom_time_band_context_missing")
                    )
                    continue

                candidate = PricingCandidate(
                    matrix_id=matrix.id,
                    matrix_name=matrix.name,
                    rule_id=rule.id,
                    applies_to=rule.applies_to,
                    player_type=rule.player_type,
                    holes=rule.holes,
                    day_type=rule.day_type,
                    season=rule.season,
                    time_band=rule.time_band,
                    time_band_ref=rule.time_band_ref,
                    price=rule.price,
                    currency=rule.currency,
                    reason="pricing_rule_matches_context",
                )
                candidates.append(candidate)
                candidate_specificity[rule.id] = self._pricing_specificity(rule)

        selected_candidates = candidates
        if candidates:
            highest_specificity = max(
                candidate_specificity[candidate.rule_id] for candidate in candidates
            )
            selected_candidates = [
                candidate
                for candidate in candidates
                if candidate_specificity[candidate.rule_id] == highest_specificity
            ]
            if len(selected_candidates) > 1:
                warnings.append(
                    ContextNotice(
                        code="pricing_rule_collision",
                        message="More than one pricing rule matched with the same specificity",
                    )
                )
                unresolved_rules.extend(
                    self._pricing_trace(matrix, rule, "pricing_rule_collision")
                    for matrix in matrices
                    for rule in matrix.rules
                    if rule.id in {candidate.rule_id for candidate in selected_candidates}
                )
                selected_candidates = []

        return PricingEvaluationResult(
            context_player_type=context.pricing_player_type,
            context_holes=context.holes,
            context_day_type=context.day_type,
            context_season=context.season,
            context_time_band=context.time_band,
            context_time_band_ref=context.time_band_ref,
            candidate_rules=selected_candidates,
            ignored_rules=ignored_rules,
            unresolved_rules=unresolved_rules,
            warnings=warnings,
        )

    def _pricing_time_band_outcome(self, rule: PricingRule, context: NormalizedRuleContext) -> str:
        if rule.time_band == PricingTimeBand.ANY:
            return "matched"
        if context.time_band is None:
            if rule.time_band == PricingTimeBand.CUSTOM:
                return "unresolved_missing_context_band"
            return "matched"
        if rule.time_band != context.time_band:
            return "ignored"
        if rule.time_band != PricingTimeBand.CUSTOM:
            return "matched"
        if rule.time_band_ref is None:
            return "unresolved_missing_rule_ref"
        if context.time_band_ref is None:
            return "unresolved_missing_context_ref"
        if rule.time_band_ref != context.time_band_ref:
            return "ignored_custom_ref_mismatch"
        return "matched"

    def _pricing_day_type_matches(self, rule: PricingRule, context: NormalizedRuleContext) -> bool:
        if rule.day_type == PricingDayType.ANY:
            return True
        return context.day_type is not None and rule.day_type == context.day_type

    def _pricing_season_matches(self, rule: PricingRule, context: NormalizedRuleContext) -> bool:
        if rule.season == PricingSeason.ANY:
            return True
        return context.season is not None and rule.season == context.season

    def _pricing_specificity(self, rule: PricingRule) -> int:
        return (
            int(rule.day_type != PricingDayType.ANY)
            + int(rule.season != PricingSeason.ANY)
            + int(rule.time_band != PricingTimeBand.ANY)
        )

    def _load_rule_sets(self, club_id: uuid.UUID) -> list[BookingRuleSet]:
        if club_id not in self._rule_sets_cache:
            statement = (
                select(BookingRuleSet)
                .options(selectinload(BookingRuleSet.rules))
                .where(BookingRuleSet.club_id == club_id, BookingRuleSet.active.is_(True))
                .order_by(
                    BookingRuleSet.priority.desc(),
                    BookingRuleSet.created_at.asc(),
                    BookingRuleSet.id.asc(),
                )
            )
            self._rule_sets_cache[club_id] = list(self.db.scalars(statement).unique().all())
        return self._rule_sets_cache[club_id]

    def _mismatch_reason(
        self, ruleset: BookingRuleSet, context: NormalizedRuleContext
    ) -> str | None:
        if not self._matches_datetime(ruleset, context.effective_datetime):
            return "effective_datetime_outside_ruleset_window"
        if context.applies_to and ruleset.applies_to != context.applies_to:
            return "applies_to_mismatch"
        if not self._matches_scope(ruleset, context):
            return "scope_mismatch"
        return None

    def _matches_datetime(self, ruleset: BookingRuleSet, effective_datetime) -> bool:
        if effective_datetime is None:
            return ruleset.applies_from is None and ruleset.applies_until is None
        if ruleset.applies_from and effective_datetime < ruleset.applies_from:
            return False
        if ruleset.applies_until and effective_datetime > ruleset.applies_until:
            return False
        return True

    def _matches_scope(self, ruleset: BookingRuleSet, context: NormalizedRuleContext) -> bool:
        scope_context = context.scope_context
        if ruleset.scope_type == BookingRuleScopeType.CLUB:
            return True
        if ruleset.scope_type == BookingRuleScopeType.COURSE:
            return (
                scope_context.course_ref is not None
                and ruleset.scope_ref_id == scope_context.course_ref
            )
        if ruleset.scope_type == BookingRuleScopeType.TEE:
            return (
                scope_context.tee_ref is not None and ruleset.scope_ref_id == scope_context.tee_ref
            )
        if ruleset.scope_type == BookingRuleScopeType.MEMBERSHIP_ROLE:
            return (
                scope_context.membership_role_ref is not None
                and ruleset.scope_ref_id == scope_context.membership_role_ref
            )
        if ruleset.scope_type == BookingRuleScopeType.APPLIES_TO_BUCKET:
            return (
                scope_context.applies_to_bucket_ref is not None
                and ruleset.scope_ref_id == scope_context.applies_to_bucket_ref
            )
        return False

    def _sort_rules(self, rules: list[BookingRule]) -> list[BookingRule]:
        return sorted(
            rules, key=lambda item: (item.evaluation_order, item.created_at, str(item.id))
        )

    def _section_payload(self, rule: BookingRule) -> tuple[str, dict[str, Any]]:
        if rule.type == BookingRuleType.ADVANCE_WINDOW:
            return "booking_constraints", {"advance_window": dict(rule.config)}
        if rule.type == BookingRuleType.MAX_BOOKINGS_PER_DAY:
            return "limits", {"max_bookings_per_day": dict(rule.config)}
        if rule.type == BookingRuleType.MAX_FUTURE_BOOKINGS:
            return "limits", {"max_future_bookings": dict(rule.config)}
        if rule.type == BookingRuleType.GUEST_LIMIT:
            return "limits", {"guest_limit": dict(rule.config)}
        return "time_restrictions", {"windows": [dict(rule.config)]}

    def _apply_override(
        self,
        section_name: str,
        payload: dict[str, Any],
        booking_constraints: dict[str, Any],
        limits: dict[str, Any],
        time_restrictions: dict[str, Any],
        *,
        blocked_keys: set[str] | None = None,
    ) -> None:
        blocked_keys = blocked_keys or set()
        target = self._target_section(section_name, booking_constraints, limits, time_restrictions)
        if section_name == "time_restrictions":
            if "time_restrictions:windows" not in blocked_keys:
                target["windows"] = list(payload["windows"])
            return
        for key, value in payload.items():
            if f"{section_name}:{key}" not in blocked_keys:
                target[key] = value

    def _apply_merge(
        self,
        section_name: str,
        payload: dict[str, Any],
        booking_constraints: dict[str, Any],
        limits: dict[str, Any],
        time_restrictions: dict[str, Any],
    ) -> bool:
        target = self._target_section(section_name, booking_constraints, limits, time_restrictions)
        if section_name == "time_restrictions":
            target["windows"] = [*target.get("windows", []), *payload["windows"]]
            return True
        merged_any = False
        for key, value in payload.items():
            if key not in target:
                target[key] = value
                merged_any = True
                continue
            if target[key] == value:
                merged_any = True
        return merged_any

    def _target_section(
        self,
        section_name: str,
        booking_constraints: dict[str, Any],
        limits: dict[str, Any],
        time_restrictions: dict[str, Any],
    ) -> dict[str, Any]:
        if section_name == "booking_constraints":
            return booking_constraints
        if section_name == "limits":
            return limits
        return time_restrictions

    def _payload_keys(self, section_name: str, payload: dict[str, Any]) -> set[str]:
        if section_name == "time_restrictions":
            return {"time_restrictions:windows"}
        return {f"{section_name}:{key}" for key in payload}

    def _blocked_override_keys(
        self,
        section_name: str,
        payload: dict[str, Any],
        booking_constraints: dict[str, Any],
        limits: dict[str, Any],
        time_restrictions: dict[str, Any],
    ) -> set[str]:
        target = self._target_section(section_name, booking_constraints, limits, time_restrictions)
        if section_name == "time_restrictions":
            return {"time_restrictions:windows"} if target.get("windows") else set()
        return {f"{section_name}:{key}" for key in payload if key in target}

    def _applied_trace(
        self, ruleset: BookingRuleSet, rule: BookingRule, reason: str
    ) -> AppliedRuleTrace:
        return AppliedRuleTrace(
            rule_set_id=ruleset.id,
            rule_set_name=ruleset.name,
            rule_id=rule.id,
            rule_type=rule.type,
            applies_to=ruleset.applies_to,
            scope_type=ruleset.scope_type,
            scope_ref_id=ruleset.scope_ref_id,
            priority=ruleset.priority,
            evaluation_order=rule.evaluation_order,
            conflict_strategy=ruleset.conflict_strategy,
            reason=reason,
            config=dict(rule.config),
        )

    def _ignored_trace(
        self, ruleset: BookingRuleSet, rule: BookingRule, reason: str
    ) -> IgnoredRuleTrace:
        return IgnoredRuleTrace(
            rule_set_id=ruleset.id,
            rule_set_name=ruleset.name,
            rule_id=rule.id,
            rule_type=rule.type,
            applies_to=ruleset.applies_to,
            scope_type=ruleset.scope_type,
            scope_ref_id=ruleset.scope_ref_id,
            priority=ruleset.priority,
            evaluation_order=rule.evaluation_order,
            conflict_strategy=ruleset.conflict_strategy,
            reason=reason,
        )

    def _pricing_trace(
        self, matrix: PricingMatrix, rule: PricingRule, reason: str
    ) -> PricingIgnoredTrace:
        return PricingIgnoredTrace(
            matrix_id=matrix.id,
            matrix_name=matrix.name,
            rule_id=rule.id,
            applies_to=rule.applies_to,
            player_type=rule.player_type,
            holes=rule.holes,
            day_type=rule.day_type,
            season=rule.season,
            time_band=rule.time_band,
            time_band_ref=rule.time_band_ref,
            reason=reason,
        )
