from __future__ import annotations

from datetime import time

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import ClubConfig, Course, Tee
from app.schemas.availability import (
    AvailabilityPolicyResult,
    AvailabilityStatus,
    AvailabilityTrace,
    SlotPolicySummary,
)
from app.schemas.booking_state import AvailabilityDecisionInput, BookingStateSnapshot
from app.schemas.rule_context import ContextNotice, NormalizedRuleContext
from app.services.rule_evaluation_service import RuleEvaluationService


class AvailabilityService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.rule_evaluation_service = RuleEvaluationService(db)

    def preview_slot_availability(self, decision_input: AvailabilityDecisionInput) -> AvailabilityPolicyResult:
        context = decision_input.context
        rule_evaluation = self.rule_evaluation_service.evaluate(context)
        blockers: list[AvailabilityTrace] = []
        resolved_checks: list[AvailabilityTrace] = []
        unresolved_checks: list[AvailabilityTrace] = []
        informational_traces: list[AvailabilityTrace] = []
        warnings: list[ContextNotice] = [*context.warnings, *decision_input.warnings, *rule_evaluation.pricing.warnings]

        club_config = self.db.scalar(select(ClubConfig).where(ClubConfig.club_id == context.club_id))
        slot_policy: SlotPolicySummary | None = None
        if club_config is None:
            unresolved_checks.append(
                AvailabilityTrace(
                    code="club_config_missing",
                    reason="Club config is required before availability can be interpreted fully",
                )
            )
        else:
            slot_policy = self._build_slot_policy(club_config, context)
            self._record_outcome(
                self._evaluate_operating_window(club_config, context),
                blockers,
                resolved_checks,
                unresolved_checks,
            )

        course = self._load_course(context.course_id) if context.course_id is not None else None
        tee = self._load_tee(context.tee_id) if context.tee_id is not None else None
        if course is not None:
            if course.active:
                informational_traces.append(
                    AvailabilityTrace(
                        code="course_active",
                        reason="Requested course is active",
                        details={"course_id": str(course.id), "course_name": course.name},
                    )
                )
            else:
                blockers.append(
                    AvailabilityTrace(
                        code="course_inactive",
                        reason="Requested course is inactive",
                        details={"course_id": str(course.id), "course_name": course.name},
                    )
                )
        if tee is not None:
            if tee.active:
                informational_traces.append(
                    AvailabilityTrace(
                        code="tee_active",
                        reason="Requested tee is active",
                        details={"tee_id": str(tee.id), "tee_name": tee.name},
                    )
                )
            else:
                blockers.append(
                    AvailabilityTrace(
                        code="tee_inactive",
                        reason="Requested tee is inactive",
                        details={"tee_id": str(tee.id), "tee_name": tee.name},
                    )
                )

        self._record_outcome(
            self._evaluate_state_flags(decision_input.booking_state),
            blockers,
            resolved_checks,
            unresolved_checks,
        )
        self._record_outcome(
            self._evaluate_advance_window(slot_policy, rule_evaluation, context),
            blockers,
            resolved_checks,
            unresolved_checks,
        )
        self._record_outcome(
            self._evaluate_time_restrictions(rule_evaluation.time_restrictions, context),
            blockers,
            resolved_checks,
            unresolved_checks,
        )
        self._record_outcome(
            self._evaluate_occupancy(decision_input),
            blockers,
            resolved_checks,
            unresolved_checks,
        )

        self._evaluate_limit_checks(
            decision_input,
            rule_evaluation.limits,
            blockers,
            resolved_checks,
            unresolved_checks,
        )
        unresolved_checks.append(
            AvailabilityTrace(
                code="live_concurrency_not_evaluated",
                reason="Availability preview does not evaluate concurrent booking writes or inventory locking",
            )
        )
        status = self._resolve_status(blockers, unresolved_checks)
        return AvailabilityPolicyResult(
            decision_input=decision_input,
            rule_evaluation=rule_evaluation,
            status=status,
            slot_policy=slot_policy,
            blockers=blockers,
            resolved_checks=resolved_checks,
            unresolved_checks=unresolved_checks,
            informational_traces=informational_traces,
            warnings=warnings,
        )

    def preview(self, decision_input: AvailabilityDecisionInput) -> AvailabilityPolicyResult:
        return self.preview_slot_availability(decision_input)

    def _evaluate_state_flags(
        self,
        booking_state: BookingStateSnapshot,
    ) -> tuple[str, AvailabilityTrace] | list[tuple[str, AvailabilityTrace]] | None:
        outcomes: list[tuple[str, AvailabilityTrace]] = []
        unknown_flags = [
            name
            for name in (
                "manually_blocked",
                "reserved_state_active",
                "competition_controlled",
                "event_controlled",
                "externally_unavailable",
            )
            if getattr(booking_state, name) is None
        ]
        if unknown_flags:
            outcomes.append(
                (
                    "unresolved",
                    AvailabilityTrace(
                        code="slot_state_flags_incomplete",
                        reason="Slot state flags were not fully supplied",
                        details={"missing_flags": unknown_flags},
                    ),
                )
            )
        else:
            outcomes.append(
                (
                    "resolved",
                    AvailabilityTrace(
                        code="slot_state_flags_clear",
                        reason="Slot state flags were supplied",
                    ),
                )
            )
        flag_blockers = {
            "manually_blocked": "slot_manually_blocked",
            "reserved_state_active": "slot_reserved_state_active",
            "competition_controlled": "slot_competition_controlled",
            "event_controlled": "slot_event_controlled",
            "externally_unavailable": "slot_externally_unavailable",
        }
        for field_name, code in flag_blockers.items():
            if getattr(booking_state, field_name) is True:
                outcomes.append(
                    (
                        "blocked",
                        AvailabilityTrace(
                            code=code,
                            reason="Slot state blocks booking in principle",
                            details={"blocked_reason": booking_state.blocked_reason},
                        ),
                    )
                )
        return outcomes

    def _evaluate_advance_window(
        self,
        slot_policy: SlotPolicySummary | None,
        rule_evaluation,
        context: NormalizedRuleContext,
    ) -> tuple[str, AvailabilityTrace]:
        advance_window_days = rule_evaluation.booking_constraints.get("advance_window", {}).get("days")
        config_booking_window_days = slot_policy.booking_window_days if slot_policy is not None else None
        effective_booking_window_days = (
            advance_window_days if advance_window_days is not None else config_booking_window_days
        )
        if effective_booking_window_days is None:
            return (
                "unresolved",
                AvailabilityTrace(
                    code="booking_window_missing",
                    reason="No booking window policy is available yet",
                ),
            )
        if context.effective_datetime is None:
            return (
                "unresolved",
                AvailabilityTrace(
                    code="effective_datetime_missing",
                    reason="Slot availability requires effective_datetime to evaluate the booking window",
                ),
            )
        if context.reference_datetime is None:
            return (
                "unresolved",
                AvailabilityTrace(
                    code="advance_window_reference_required",
                    reason="Advance window requires explicit reference_datetime for deterministic evaluation",
                    details={"booking_window_days": effective_booking_window_days},
                ),
            )
        requested_days_ahead = (
            context.local_date - context.reference_local_date
            if context.local_date is not None and context.reference_local_date is not None
            else None
        )
        if requested_days_ahead is None:
            return (
                "unresolved",
                AvailabilityTrace(
                    code="advance_window_local_date_missing",
                    reason="Advance window could not be checked because local dates are unavailable",
                ),
            )
        if requested_days_ahead.days < 0 or requested_days_ahead.days > effective_booking_window_days:
            return (
                "blocked",
                AvailabilityTrace(
                    code="advance_window_blocked",
                    reason="Effective datetime falls outside the booking window",
                    details={
                        "booking_window_days": effective_booking_window_days,
                        "requested_days_ahead": requested_days_ahead.days,
                    },
                ),
            )
        return (
            "resolved",
            AvailabilityTrace(
                code="advance_window_satisfied",
                reason="Effective datetime falls within the booking window",
                details={
                    "booking_window_days": effective_booking_window_days,
                    "requested_days_ahead": requested_days_ahead.days,
                },
            ),
        )

    def _build_slot_policy(self, club_config: ClubConfig, context: NormalizedRuleContext) -> SlotPolicySummary:
        operating_window = (
            dict(club_config.operating_hours.get(context.local_day_name, {}))
            if context.local_day_name is not None
            else None
        )
        return SlotPolicySummary(
            timezone=club_config.timezone,
            local_day_name=context.local_day_name,
            operating_window=operating_window,
            booking_window_days=club_config.booking_window_days,
            cancellation_policy_hours=club_config.cancellation_policy_hours,
            default_slot_interval_minutes=club_config.default_slot_interval_minutes,
        )

    def _evaluate_operating_window(
        self,
        club_config: ClubConfig,
        context: NormalizedRuleContext,
    ) -> tuple[str, AvailabilityTrace]:
        if context.local_day_name is None:
            return (
                "unresolved",
                AvailabilityTrace(
                    code="operating_window_context_missing",
                    reason="Operating hours could not be checked without local booking date",
                ),
            )
        operating_hours = club_config.operating_hours.get(context.local_day_name)
        if operating_hours is None:
            return (
                "unresolved",
                AvailabilityTrace(
                    code="operating_window_missing",
                    reason="Operating hours are missing for the requested weekday",
                    details={"weekday": context.local_day_name},
                ),
            )
        if operating_hours.get("closed"):
            return (
                "blocked",
                AvailabilityTrace(
                    code="operating_day_closed",
                    reason="Requested day is closed in club operating hours",
                    details={"weekday": context.local_day_name},
                ),
            )
        if context.local_time is None:
            return (
                "unresolved",
                AvailabilityTrace(
                    code="operating_window_time_missing",
                    reason="Operating hours could not be checked without local booking time",
                ),
            )
        open_time = self._parse_hhmm(operating_hours.get("open"))
        close_time = self._parse_hhmm(operating_hours.get("close"))
        if open_time is None or close_time is None:
            return (
                "unresolved",
                AvailabilityTrace(
                    code="operating_window_invalid",
                    reason="Operating hours are incomplete for the requested weekday",
                    details={"weekday": context.local_day_name},
                ),
            )
        if context.local_time < open_time or context.local_time >= close_time:
            return (
                "blocked",
                AvailabilityTrace(
                    code="outside_operating_hours",
                    reason="Requested time falls outside club operating hours",
                    details={
                        "weekday": context.local_day_name,
                        "open": operating_hours.get("open"),
                        "close": operating_hours.get("close"),
                    },
                ),
            )
        return (
            "resolved",
            AvailabilityTrace(
                code="within_operating_hours",
                reason="Requested time falls within club operating hours",
                details={
                    "weekday": context.local_day_name,
                    "open": operating_hours.get("open"),
                    "close": operating_hours.get("close"),
                },
            ),
        )

    def _evaluate_time_restrictions(
        self,
        time_restrictions: dict[str, object],
        context: NormalizedRuleContext,
    ) -> tuple[str, AvailabilityTrace] | None:
        windows = list(time_restrictions.get("windows", []))
        if not windows:
            return None
        if context.local_time is None or context.local_day_name is None:
            return (
                "unresolved",
                AvailabilityTrace(
                    code="time_restriction_context_missing",
                    reason="Time restrictions require local booking date and time",
                ),
            )
        applicable_windows = []
        for window in windows:
            if not isinstance(window, dict):
                continue
            window_days = window.get("days")
            if window_days and context.local_day_name not in window_days:
                continue
            applicable_windows.append(window)
        if not applicable_windows:
            return (
                "resolved",
                AvailabilityTrace(
                    code="time_restriction_not_applicable",
                    reason="Time restriction windows do not apply to the requested weekday",
                    details={"weekday": context.local_day_name},
                ),
            )
        for window in applicable_windows:
            start_time = self._parse_hhmm(window.get("start_time"))
            end_time = self._parse_hhmm(window.get("end_time"))
            if start_time is None or end_time is None:
                continue
            if start_time <= context.local_time < end_time:
                return (
                    "resolved",
                    AvailabilityTrace(
                        code="time_restriction_satisfied",
                        reason="Requested time falls within an allowed restriction window",
                        details=dict(window),
                    ),
                )
        return (
            "blocked",
            AvailabilityTrace(
                code="time_restriction_blocked",
                reason="Requested time falls outside all applicable restriction windows",
                details={"windows": applicable_windows},
            ),
        )

    def _evaluate_occupancy(
        self,
        decision_input: AvailabilityDecisionInput,
    ) -> tuple[str, AvailabilityTrace]:
        occupancy = decision_input.booking_state.occupancy
        requested_player_count = decision_input.party.requested_player_count
        if requested_player_count is None:
            return (
                "unresolved",
                AvailabilityTrace(
                    code="requested_player_count_missing",
                    reason="Requested player count is required to evaluate slot occupancy",
                ),
            )
        if (
            occupancy.player_capacity is None
            or occupancy.occupied_player_count is None
            or occupancy.reserved_player_count is None
        ):
            return (
                "unresolved",
                AvailabilityTrace(
                    code="occupancy_state_incomplete",
                    reason="Occupancy state is incomplete for slot capacity evaluation",
                ),
            )
        committed_players = occupancy.occupied_player_count + occupancy.reserved_player_count
        if committed_players + requested_player_count > occupancy.player_capacity:
            return (
                "blocked",
                AvailabilityTrace(
                    code="slot_capacity_exceeded",
                    reason="Requested party exceeds remaining slot capacity",
                    details={
                        "player_capacity": occupancy.player_capacity,
                        "occupied_player_count": occupancy.occupied_player_count,
                        "reserved_player_count": occupancy.reserved_player_count,
                        "requested_player_count": requested_player_count,
                    },
                ),
            )
        return (
            "resolved",
            AvailabilityTrace(
                code="slot_capacity_available",
                reason="Slot capacity can accommodate the requested party",
                details={
                    "player_capacity": occupancy.player_capacity,
                    "occupied_player_count": occupancy.occupied_player_count,
                    "reserved_player_count": occupancy.reserved_player_count,
                    "requested_player_count": requested_player_count,
                    "remaining_player_capacity": occupancy.remaining_player_capacity,
                },
            ),
        )

    def _evaluate_limit_checks(
        self,
        decision_input: AvailabilityDecisionInput,
        limits: dict[str, object],
        blockers: list[AvailabilityTrace],
        resolved_checks: list[AvailabilityTrace],
        unresolved_checks: list[AvailabilityTrace],
    ) -> None:
        booking_state = decision_input.booking_state
        party = decision_input.party
        if "max_bookings_per_day" in limits:
            limit = limits["max_bookings_per_day"].get("count")
            if booking_state.current_bookings_for_day is None:
                unresolved_checks.append(
                    AvailabilityTrace(
                        code="max_bookings_per_day_requires_booking_state",
                        reason="max_bookings_per_day requires current_bookings_for_day",
                        details=limits["max_bookings_per_day"],
                    )
                )
            elif booking_state.current_bookings_for_day >= limit:
                blockers.append(
                    AvailabilityTrace(
                        code="max_bookings_per_day_exceeded",
                        reason="Current daily booking count meets or exceeds the rule limit",
                        details={
                            "current_bookings_for_day": booking_state.current_bookings_for_day,
                            "limit": limit,
                        },
                    )
                )
            else:
                resolved_checks.append(
                    AvailabilityTrace(
                        code="max_bookings_per_day_satisfied",
                        reason="Current daily booking count is below the rule limit",
                        details={
                            "current_bookings_for_day": booking_state.current_bookings_for_day,
                            "limit": limit,
                        },
                    )
                )
        if "max_future_bookings" in limits:
            limit = limits["max_future_bookings"].get("count")
            if booking_state.current_future_bookings is None:
                unresolved_checks.append(
                    AvailabilityTrace(
                        code="max_future_bookings_requires_booking_state",
                        reason="max_future_bookings requires current_future_bookings",
                        details=limits["max_future_bookings"],
                    )
                )
            elif booking_state.current_future_bookings >= limit:
                blockers.append(
                    AvailabilityTrace(
                        code="max_future_bookings_exceeded",
                        reason="Current future booking count meets or exceeds the rule limit",
                        details={
                            "current_future_bookings": booking_state.current_future_bookings,
                            "limit": limit,
                        },
                    )
                )
            else:
                resolved_checks.append(
                    AvailabilityTrace(
                        code="max_future_bookings_satisfied",
                        reason="Current future booking count is below the rule limit",
                        details={
                            "current_future_bookings": booking_state.current_future_bookings,
                            "limit": limit,
                        },
                    )
                )
        if "guest_limit" in limits:
            limit = limits["guest_limit"].get("count")
            if party.guest_count is None:
                unresolved_checks.append(
                    AvailabilityTrace(
                        code="guest_limit_requires_party_context",
                        reason="guest_limit requires explicit guest_count in the party context",
                        details=limits["guest_limit"],
                    )
                )
            elif party.guest_count > limit:
                blockers.append(
                    AvailabilityTrace(
                        code="guest_limit_exceeded",
                        reason="Guest count exceeds the configured guest limit",
                        details={"guest_count": party.guest_count, "limit": limit},
                    )
                )
            else:
                resolved_checks.append(
                    AvailabilityTrace(
                        code="guest_limit_satisfied",
                        reason="Guest count is within the configured guest limit",
                        details={"guest_count": party.guest_count, "limit": limit},
                    )
                )

    def _load_course(self, course_id):
        return self.db.scalar(select(Course).where(Course.id == course_id))

    def _load_tee(self, tee_id):
        return self.db.scalar(select(Tee).options(selectinload(Tee.course)).where(Tee.id == tee_id))

    def _parse_hhmm(self, value: object) -> time | None:
        if not isinstance(value, str) or ":" not in value:
            return None
        hours, minutes = value.split(":", 1)
        if not hours.isdigit() or not minutes.isdigit():
            return None
        return time(hour=int(hours), minute=int(minutes))

    def _record_outcome(
        self,
        outcome,
        blockers: list[AvailabilityTrace],
        resolved_checks: list[AvailabilityTrace],
        unresolved_checks: list[AvailabilityTrace],
    ) -> None:
        if outcome is None:
            return
        if isinstance(outcome, list):
            for item in outcome:
                self._record_outcome(item, blockers, resolved_checks, unresolved_checks)
            return
        bucket, trace = outcome
        if bucket == "blocked":
            blockers.append(trace)
            return
        if bucket == "resolved":
            resolved_checks.append(trace)
            return
        unresolved_checks.append(trace)

    def _resolve_status(
        self,
        blockers: list[AvailabilityTrace],
        unresolved_checks: list[AvailabilityTrace],
    ) -> AvailabilityStatus:
        if blockers:
            return AvailabilityStatus.BLOCKED
        if unresolved_checks:
            return AvailabilityStatus.INDETERMINATE
        return AvailabilityStatus.ALLOWED
