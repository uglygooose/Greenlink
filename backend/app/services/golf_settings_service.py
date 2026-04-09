from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.routes.operations_support import to_pricing_matrix_response, to_rule_set_response
from app.core.exceptions import ConflictError, NotFoundError
from app.models import BookingRule, BookingRuleSet, ClubSetting, Course, PricingMatrix, PricingRule, Tee
from app.schemas.operations import (
    BookingRuleSetCreateRequest,
    BookingRuleWriteRequest,
    GolfSettingsPricingMutationResult,
    GolfSettingsReadinessResponse,
    GolfSettingsRulesMutationResult,
    PricingMatrixCreateRequest,
    PricingRuleWriteRequest,
)

RULES_SNAPSHOT_KEY = "golf_settings.rules.last_active"
PRICING_SNAPSHOT_KEY = "golf_settings.pricing.last_active"


class GolfSettingsService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_readiness(self, club_id: uuid.UUID) -> GolfSettingsReadinessResponse:
        courses_configured = self._has_courses(club_id)
        tees_configured = self._has_tees(club_id)
        rules_configured = self._has_active_rule_set(club_id)
        pricing_configured = self._has_active_pricing_matrix(club_id)
        return GolfSettingsReadinessResponse(
            courses_configured=courses_configured,
            tees_configured=tees_configured,
            rules_configured=rules_configured,
            pricing_configured=pricing_configured,
            overall_ready=all(
                (
                    courses_configured,
                    tees_configured,
                    rules_configured,
                    pricing_configured,
                )
            ),
        )

    def ensure_courses_exist_for_tees(self, club_id: uuid.UUID) -> None:
        if self._has_courses(club_id):
            return
        raise ConflictError(
            "Create at least one course before adding tees",
            code="golf_settings_courses_required",
        )

    def ensure_rules_prerequisites(self, club_id: uuid.UUID) -> None:
        readiness = self.get_readiness(club_id)
        if readiness.courses_configured and readiness.tees_configured:
            return
        raise ConflictError(
            "Courses and tees must be configured before publishing booking rules",
            code="golf_settings_rules_prerequisites_missing",
        )

    def ensure_pricing_prerequisites(self, club_id: uuid.UUID) -> None:
        readiness = self.get_readiness(club_id)
        if readiness.rules_configured:
            return
        raise ConflictError(
            "Booking rules must be active before publishing pricing",
            code="golf_settings_pricing_prerequisites_missing",
        )

    def publish_rule_set(
        self,
        club_id: uuid.UUID,
        rule_set_id: uuid.UUID,
    ) -> GolfSettingsRulesMutationResult:
        self.ensure_rules_prerequisites(club_id)
        target = self._load_rule_set(club_id, rule_set_id)
        current_active = self._load_current_active_rule_set(club_id, exclude_id=target.id)
        if current_active is not None:
            self._set_rule_snapshot(club_id, current_active)
        self._deactivate_other_rule_sets(club_id, keep_id=target.id)
        target.active = True
        self.db.commit()
        self.db.expire_all()
        reloaded = self._load_rule_set(club_id, target.id)
        return GolfSettingsRulesMutationResult(
            action="published",
            rule_set=to_rule_set_response(reloaded),
            readiness=self.get_readiness(club_id),
        )

    def rollback_rule_set(self, club_id: uuid.UUID) -> GolfSettingsRulesMutationResult:
        snapshot = self._get_snapshot(club_id, RULES_SNAPSHOT_KEY)
        if snapshot is None:
            raise ConflictError(
                "No previously active booking rule set is available to roll back",
                code="golf_settings_rules_rollback_unavailable",
            )

        current_active = self._load_current_active_rule_set(club_id)
        if current_active is not None:
            self._set_rule_snapshot(club_id, current_active)

        restored = self._restore_rule_snapshot(club_id, snapshot)
        self.db.commit()
        self.db.expire_all()
        reloaded = self._load_rule_set(club_id, restored.id)
        return GolfSettingsRulesMutationResult(
            action="rolled_back",
            rule_set=to_rule_set_response(reloaded),
            readiness=self.get_readiness(club_id),
        )

    def publish_pricing_matrix(
        self,
        club_id: uuid.UUID,
        matrix_id: uuid.UUID,
    ) -> GolfSettingsPricingMutationResult:
        self.ensure_pricing_prerequisites(club_id)
        target = self._load_pricing_matrix(club_id, matrix_id)
        current_active = self._load_current_active_pricing_matrix(club_id, exclude_id=target.id)
        if current_active is not None:
            self._set_pricing_snapshot(club_id, current_active)
        self._deactivate_other_pricing_matrices(club_id, keep_id=target.id)
        target.active = True
        self.db.commit()
        self.db.expire_all()
        reloaded = self._load_pricing_matrix(club_id, target.id)
        return GolfSettingsPricingMutationResult(
            action="published",
            pricing_matrix=to_pricing_matrix_response(reloaded),
            readiness=self.get_readiness(club_id),
        )

    def rollback_pricing_matrix(self, club_id: uuid.UUID) -> GolfSettingsPricingMutationResult:
        snapshot = self._get_snapshot(club_id, PRICING_SNAPSHOT_KEY)
        if snapshot is None:
            raise ConflictError(
                "No previously active pricing matrix is available to roll back",
                code="golf_settings_pricing_rollback_unavailable",
            )

        current_active = self._load_current_active_pricing_matrix(club_id)
        if current_active is not None:
            self._set_pricing_snapshot(club_id, current_active)

        restored = self._restore_pricing_snapshot(club_id, snapshot)
        self.db.commit()
        self.db.expire_all()
        reloaded = self._load_pricing_matrix(club_id, restored.id)
        return GolfSettingsPricingMutationResult(
            action="rolled_back",
            pricing_matrix=to_pricing_matrix_response(reloaded),
            readiness=self.get_readiness(club_id),
        )

    def _has_courses(self, club_id: uuid.UUID) -> bool:
        return self.db.scalar(select(Course.id).where(Course.club_id == club_id).limit(1)) is not None

    def _has_tees(self, club_id: uuid.UUID) -> bool:
        return (
            self.db.scalar(select(Tee.id).join(Tee.course).where(Course.club_id == club_id).limit(1))
            is not None
        )

    def _has_active_rule_set(self, club_id: uuid.UUID) -> bool:
        return (
            self.db.scalar(
                select(BookingRuleSet.id).where(
                    BookingRuleSet.club_id == club_id,
                    BookingRuleSet.active.is_(True),
                ).limit(1)
            )
            is not None
        )

    def _has_active_pricing_matrix(self, club_id: uuid.UUID) -> bool:
        return (
            self.db.scalar(
                select(PricingMatrix.id).where(
                    PricingMatrix.club_id == club_id,
                    PricingMatrix.active.is_(True),
                ).limit(1)
            )
            is not None
        )

    def _load_rule_set(self, club_id: uuid.UUID, rule_set_id: uuid.UUID) -> BookingRuleSet:
        ruleset = self.db.scalar(
            select(BookingRuleSet)
            .options(selectinload(BookingRuleSet.rules))
            .where(BookingRuleSet.id == rule_set_id, BookingRuleSet.club_id == club_id)
        )
        if ruleset is None:
            raise NotFoundError("Booking rule set not found")
        return ruleset

    def _load_pricing_matrix(self, club_id: uuid.UUID, matrix_id: uuid.UUID) -> PricingMatrix:
        matrix = self.db.scalar(
            select(PricingMatrix)
            .options(selectinload(PricingMatrix.rules))
            .where(PricingMatrix.id == matrix_id, PricingMatrix.club_id == club_id)
        )
        if matrix is None:
            raise NotFoundError("Pricing matrix not found")
        return matrix

    def _load_current_active_rule_set(
        self,
        club_id: uuid.UUID,
        *,
        exclude_id: uuid.UUID | None = None,
    ) -> BookingRuleSet | None:
        statement = (
            select(BookingRuleSet)
            .options(selectinload(BookingRuleSet.rules))
            .where(BookingRuleSet.club_id == club_id, BookingRuleSet.active.is_(True))
            .order_by(BookingRuleSet.updated_at.desc(), BookingRuleSet.created_at.desc())
        )
        if exclude_id is not None:
            statement = statement.where(BookingRuleSet.id != exclude_id)
        return self.db.scalars(statement).first()

    def _load_current_active_pricing_matrix(
        self,
        club_id: uuid.UUID,
        *,
        exclude_id: uuid.UUID | None = None,
    ) -> PricingMatrix | None:
        statement = (
            select(PricingMatrix)
            .options(selectinload(PricingMatrix.rules))
            .where(PricingMatrix.club_id == club_id, PricingMatrix.active.is_(True))
            .order_by(PricingMatrix.updated_at.desc(), PricingMatrix.created_at.desc())
        )
        if exclude_id is not None:
            statement = statement.where(PricingMatrix.id != exclude_id)
        return self.db.scalars(statement).first()

    def _deactivate_other_rule_sets(self, club_id: uuid.UUID, *, keep_id: uuid.UUID) -> None:
        for ruleset in self.db.scalars(
            select(BookingRuleSet).where(
                BookingRuleSet.club_id == club_id,
                BookingRuleSet.id != keep_id,
                BookingRuleSet.active.is_(True),
            )
        ):
            ruleset.active = False

    def _deactivate_other_pricing_matrices(self, club_id: uuid.UUID, *, keep_id: uuid.UUID) -> None:
        for matrix in self.db.scalars(
            select(PricingMatrix).where(
                PricingMatrix.club_id == club_id,
                PricingMatrix.id != keep_id,
                PricingMatrix.active.is_(True),
            )
        ):
            matrix.active = False

    def _set_rule_snapshot(self, club_id: uuid.UUID, ruleset: BookingRuleSet) -> None:
        payload = BookingRuleSetCreateRequest(
            name=ruleset.name,
            applies_to=ruleset.applies_to,
            scope_type=ruleset.scope_type,
            scope_ref_id=ruleset.scope_ref_id,
            conflict_strategy=ruleset.conflict_strategy,
            applies_from=ruleset.applies_from,
            applies_until=ruleset.applies_until,
            priority=ruleset.priority,
            active=True,
            rules=[
                BookingRuleWriteRequest(
                    type=rule.type,
                    evaluation_order=rule.evaluation_order,
                    config=dict(rule.config),
                    active=rule.active,
                )
                for rule in sorted(ruleset.rules, key=lambda item: (item.evaluation_order, item.created_at, str(item.id)))
            ],
        )
        self._set_snapshot(
            club_id,
            RULES_SNAPSHOT_KEY,
            {
                "source_id": str(ruleset.id),
                "payload": payload.model_dump(mode="json"),
            },
        )

    def _set_pricing_snapshot(self, club_id: uuid.UUID, matrix: PricingMatrix) -> None:
        payload = PricingMatrixCreateRequest(
            name=matrix.name,
            active=True,
            rules=[
                PricingRuleWriteRequest(
                    applies_to=rule.applies_to,
                    day_type=rule.day_type,
                    time_band=rule.time_band,
                    time_band_ref=rule.time_band_ref,
                    price=rule.price,
                    currency=rule.currency,
                    active=rule.active,
                )
                for rule in sorted(matrix.rules, key=lambda item: (item.created_at, str(item.id)))
            ],
        )
        self._set_snapshot(
            club_id,
            PRICING_SNAPSHOT_KEY,
            {
                "source_id": str(matrix.id),
                "payload": payload.model_dump(mode="json"),
            },
        )

    def _restore_rule_snapshot(self, club_id: uuid.UUID, snapshot: dict[str, object]) -> BookingRuleSet:
        payload = BookingRuleSetCreateRequest.model_validate(snapshot.get("payload", {}))
        source_id = self._parse_snapshot_id(snapshot.get("source_id"))
        target = self._load_rule_set_optional(club_id, source_id)
        if target is None:
            target = BookingRuleSet(club_id=club_id)
            self.db.add(target)
            self.db.flush()
        target.name = payload.name.strip()
        target.applies_to = payload.applies_to
        target.scope_type = payload.scope_type
        target.scope_ref_id = payload.scope_ref_id
        target.conflict_strategy = payload.conflict_strategy
        target.applies_from = payload.applies_from
        target.applies_until = payload.applies_until
        target.priority = payload.priority
        target.active = True
        self._replace_booking_rules(target, payload.rules)
        self._deactivate_other_rule_sets(club_id, keep_id=target.id)
        return target

    def _restore_pricing_snapshot(self, club_id: uuid.UUID, snapshot: dict[str, object]) -> PricingMatrix:
        payload = PricingMatrixCreateRequest.model_validate(snapshot.get("payload", {}))
        source_id = self._parse_snapshot_id(snapshot.get("source_id"))
        target = self._load_pricing_matrix_optional(club_id, source_id)
        if target is None:
            target = PricingMatrix(club_id=club_id)
            self.db.add(target)
            self.db.flush()
        target.name = payload.name.strip()
        target.active = True
        self._replace_pricing_rules(target, payload.rules)
        self._deactivate_other_pricing_matrices(club_id, keep_id=target.id)
        return target

    def _replace_booking_rules(
        self,
        ruleset: BookingRuleSet,
        payload_rules: list[BookingRuleWriteRequest],
    ) -> None:
        for existing in list(ruleset.rules):
            self.db.delete(existing)
        self.db.flush()
        for index, item in enumerate(payload_rules):
            self.db.add(
                BookingRule(
                    ruleset_id=ruleset.id,
                    type=item.type,
                    evaluation_order=item.evaluation_order if item.evaluation_order is not None else index,
                    config=dict(item.config),
                    active=item.active,
                )
            )
        self.db.flush()

    def _replace_pricing_rules(
        self,
        matrix: PricingMatrix,
        payload_rules: list[PricingRuleWriteRequest],
    ) -> None:
        for existing in list(matrix.rules):
            self.db.delete(existing)
        self.db.flush()
        for item in payload_rules:
            self.db.add(
                PricingRule(
                    matrix_id=matrix.id,
                    applies_to=item.applies_to,
                    day_type=item.day_type,
                    time_band=item.time_band,
                    time_band_ref=item.time_band_ref,
                    price=item.price,
                    currency=item.currency,
                    active=item.active,
                )
            )
        self.db.flush()

    def _set_snapshot(self, club_id: uuid.UUID, key: str, value: dict[str, object]) -> None:
        setting = self.db.scalar(
            select(ClubSetting).where(ClubSetting.club_id == club_id, ClubSetting.key == key)
        )
        if setting is None:
            setting = ClubSetting(club_id=club_id, key=key, value=value)
            self.db.add(setting)
            self.db.flush()
            return
        setting.value = value
        self.db.flush()

    def _get_snapshot(self, club_id: uuid.UUID, key: str) -> dict[str, object] | None:
        setting = self.db.scalar(
            select(ClubSetting).where(ClubSetting.club_id == club_id, ClubSetting.key == key)
        )
        if setting is None or not isinstance(setting.value, dict):
            return None
        return setting.value

    def _load_rule_set_optional(
        self,
        club_id: uuid.UUID,
        rule_set_id: uuid.UUID | None,
    ) -> BookingRuleSet | None:
        if rule_set_id is None:
            return None
        return self.db.scalar(
            select(BookingRuleSet)
            .options(selectinload(BookingRuleSet.rules))
            .where(BookingRuleSet.id == rule_set_id, BookingRuleSet.club_id == club_id)
        )

    def _load_pricing_matrix_optional(
        self,
        club_id: uuid.UUID,
        matrix_id: uuid.UUID | None,
    ) -> PricingMatrix | None:
        if matrix_id is None:
            return None
        return self.db.scalar(
            select(PricingMatrix)
            .options(selectinload(PricingMatrix.rules))
            .where(PricingMatrix.id == matrix_id, PricingMatrix.club_id == club_id)
        )

    def _parse_snapshot_id(self, raw_value: object) -> uuid.UUID | None:
        if not isinstance(raw_value, str):
            return None
        try:
            return uuid.UUID(raw_value)
        except ValueError:
            return None
