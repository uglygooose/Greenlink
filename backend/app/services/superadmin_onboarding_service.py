from __future__ import annotations

import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.routes.operations_support import build_default_operating_hours
from app.core.exceptions import AppError, NotFoundError
from app.events.publisher import DatabaseEventPublisher
from app.models import (
    AccountingExportProfile,
    BookingRuleSet,
    Club,
    ClubConfig,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    ClubModule,
    ClubOnboardingState,
    ClubOnboardingStep,
    Person,
    PricingMatrix,
    User,
)
from app.schemas.superadmin import (
    OnboardingStepStatus,
    SuperadminAssignmentCandidate,
    SuperadminAssignmentCandidateListResponse,
    SuperadminAssignedUserSummary,
    SuperadminClubAssignmentResponse,
    SuperadminClubAssignmentUpsertRequest,
    SuperadminClubCreateRequest,
    SuperadminClubListResponse,
    SuperadminClubOnboardingDetailResponse,
    SuperadminClubOnboardingUpdateRequest,
    SuperadminClubSummary,
    SuperadminFinanceProfileSummary,
    SuperadminFinanceSetupSummary,
    SuperadminModuleSetupSummary,
    SuperadminRulesSetupSummary,
)

STEP_ORDER = [
    ClubOnboardingStep.BASIC_INFO,
    ClubOnboardingStep.FINANCE,
    ClubOnboardingStep.RULES,
    ClubOnboardingStep.MODULES,
]

STEP_LABELS = {
    ClubOnboardingStep.BASIC_INFO: "Basic Info",
    ClubOnboardingStep.FINANCE: "Finance",
    ClubOnboardingStep.RULES: "Rules",
    ClubOnboardingStep.MODULES: "Modules",
}


class SuperadminOnboardingService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.publisher = DatabaseEventPublisher(db)

    def list_clubs(self) -> SuperadminClubListResponse:
        clubs = list(self.db.scalars(select(Club).order_by(Club.created_at.desc(), Club.name.asc())).all())
        items = [self._club_summary(club) for club in clubs]
        return SuperadminClubListResponse(items=items, total_count=len(items))

    def create_club(
        self,
        *,
        payload: SuperadminClubCreateRequest,
        actor_user_id: uuid.UUID,
        correlation_id: str | None = None,
    ) -> SuperadminClubSummary:
        club = Club(
            name=payload.name.strip(),
            slug=self._unique_slug(payload.name),
            location=payload.location.strip(),
            timezone=payload.timezone.strip(),
            onboarding_state=ClubOnboardingState.ONBOARDING_STARTED.value,
            onboarding_current_step=ClubOnboardingStep.BASIC_INFO.value,
            active=True,
        )
        self.db.add(club)
        self.db.flush()
        self.db.add(
            ClubConfig(
                club_id=club.id,
                timezone=club.timezone,
                operating_hours=build_default_operating_hours(),
                booking_window_days=14,
                cancellation_policy_hours=24,
                default_slot_interval_minutes=10,
                preferred_accounting_profile_id=None,
            )
        )
        self.publisher.publish(
            event_type="club.created",
            aggregate_type="club",
            aggregate_id=str(club.id),
            payload={"slug": club.slug, "onboarding_state": club.onboarding_state},
            correlation_id=correlation_id,
            club_id=club.id,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        self.db.refresh(club)
        return self._club_summary(club)

    def get_onboarding_detail(self, *, club_id: uuid.UUID) -> SuperadminClubOnboardingDetailResponse:
        club = self._get_club(club_id)
        config = self._get_or_create_config(club, persist=False)
        finance_profiles = self._finance_profiles(club_id)
        selected_finance_profile = next(
            (profile for profile in finance_profiles if profile.id == config.preferred_accounting_profile_id),
            None,
        )
        rules_count = self._count_rule_sets(club_id)
        pricing_count = self._count_pricing_matrices(club_id)
        enabled_modules = self._enabled_module_keys(club_id)
        assignments = self._assignments(club_id)
        finance_summary = self._finance_summary(finance_profiles, selected_finance_profile)
        rules_summary = SuperadminRulesSetupSummary(
            rule_set_count=rules_count,
            pricing_matrix_count=pricing_count,
            setup_complete=rules_count > 0 and pricing_count > 0,
        )
        modules_summary = SuperadminModuleSetupSummary(
            enabled_module_keys=enabled_modules,
            setup_complete=len(enabled_modules) > 0,
        )
        steps = self._build_steps(
            current_step=ClubOnboardingStep(club.onboarding_current_step),
            basic_info_ready=self._basic_info_ready(club),
            finance_ready=finance_summary.setup_complete,
            rules_ready=rules_summary.setup_complete,
            modules_ready=modules_summary.setup_complete,
            live=ClubOnboardingState(club.onboarding_state) == ClubOnboardingState.LIVE,
        )
        return SuperadminClubOnboardingDetailResponse(
            club=self._club_summary(
                club,
                finance_profiles=finance_profiles,
                assignments=assignments,
            ),
            progress_percent=self._progress_percent(steps),
            steps=steps,
            finance=finance_summary,
            rules=rules_summary,
            modules=modules_summary,
            assignments=assignments,
        )

    def update_onboarding(
        self,
        *,
        club_id: uuid.UUID,
        payload: SuperadminClubOnboardingUpdateRequest,
        actor_user_id: uuid.UUID,
        correlation_id: str | None = None,
    ) -> SuperadminClubOnboardingDetailResponse:
        club = self._get_club(club_id)
        config = self._get_or_create_config(club, persist=True)

        if payload.name is not None:
            club.name = payload.name.strip()
        if payload.location is not None:
            club.location = payload.location.strip()
        if payload.timezone is not None:
            club.timezone = payload.timezone.strip()
            config.timezone = club.timezone
        if payload.onboarding_current_step is not None:
            club.onboarding_current_step = payload.onboarding_current_step.value
        if payload.onboarding_state is not None:
            club.onboarding_state = payload.onboarding_state.value
        if payload.preferred_accounting_profile_id is not None:
            profile = self.db.scalar(
                select(AccountingExportProfile).where(
                    AccountingExportProfile.club_id == club.id,
                    AccountingExportProfile.id == payload.preferred_accounting_profile_id,
                )
            )
            if profile is None:
                raise NotFoundError("Accounting export profile not found")
            config.preferred_accounting_profile_id = profile.id

        if payload.preferred_accounting_profile_id is None and "preferred_accounting_profile_id" in payload.model_fields_set:
            config.preferred_accounting_profile_id = None
        if payload.enabled_module_keys is not None:
            self._replace_modules(club_id=club.id, module_keys=payload.enabled_module_keys)

        if payload.onboarding_state is None:
            club.onboarding_state = self._derive_onboarding_state(club=club, config=config).value

        self.db.add(club)
        self.db.add(config)
        self.publisher.publish(
            event_type="club.onboarding_updated",
            aggregate_type="club",
            aggregate_id=str(club.id),
            payload={
                "onboarding_state": club.onboarding_state,
                "onboarding_current_step": club.onboarding_current_step,
                "preferred_accounting_profile_id": (
                    str(config.preferred_accounting_profile_id)
                    if config.preferred_accounting_profile_id is not None
                    else None
                ),
                "enabled_module_keys": self._enabled_module_keys(club.id),
            },
            correlation_id=correlation_id,
            club_id=club.id,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        return self.get_onboarding_detail(club_id=club.id)

    def search_assignment_candidates(
        self, *, query: str | None = None, limit: int = 12
    ) -> SuperadminAssignmentCandidateListResponse:
        statement = (
            select(Person)
            .options(selectinload(Person.user))
            .join(Person.user)
            .order_by(Person.full_name.asc())
            .limit(limit)
        )
        if query:
            like = f"%{query.strip().lower()}%"
            statement = statement.where(
                (Person.full_name.ilike(like))
                | (Person.normalized_email.ilike(like))
                | (User.email.ilike(like))
            )
        people = list(self.db.scalars(statement).unique().all())
        items = [
            SuperadminAssignmentCandidate(
                user_id=person.user.id,
                person_id=person.id,
                display_name=person.full_name,
                email=person.user.email,
            )
            for person in people
            if person.user is not None
        ]
        return SuperadminAssignmentCandidateListResponse(items=items, total_count=len(items))

    def assign_user_to_club(
        self,
        *,
        club_id: uuid.UUID,
        payload: SuperadminClubAssignmentUpsertRequest,
        actor_user_id: uuid.UUID,
        correlation_id: str | None = None,
    ) -> SuperadminClubAssignmentResponse:
        if payload.role not in {ClubMembershipRole.CLUB_ADMIN, ClubMembershipRole.CLUB_STAFF}:
            raise AppError(
                code="superadmin_assignment_role_invalid",
                message="Only club_admin and club_staff roles may be assigned in onboarding",
                status_code=400,
            )

        club = self._get_club(club_id)
        person = self.db.scalar(
            select(Person).options(selectinload(Person.user)).where(Person.id == payload.person_id)
        )
        if person is None or person.user is None:
            raise AppError(
                code="superadmin_assignment_person_not_linked",
                message="Only existing linked users can be assigned during onboarding",
                status_code=400,
            )

        membership = self.db.scalar(
            select(ClubMembership).where(
                ClubMembership.club_id == club.id,
                ClubMembership.person_id == person.id,
            )
        )
        if membership is None:
            membership = ClubMembership(
                club_id=club.id,
                person_id=person.id,
                role=payload.role,
                status=ClubMembershipStatus.ACTIVE,
                is_primary=False,
            )
            self.db.add(membership)
            self.db.flush()
        else:
            membership.role = payload.role
            membership.status = ClubMembershipStatus.ACTIVE

        self.publisher.publish(
            event_type="club_membership.upserted",
            aggregate_type="club_membership",
            aggregate_id=str(membership.id),
            payload={"club_id": str(club.id), "person_id": str(person.id), "role": payload.role.value},
            correlation_id=correlation_id,
            club_id=club.id,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        return SuperadminClubAssignmentResponse(
            membership_id=membership.id,
            club_id=membership.club_id,
            person_id=membership.person_id,
            role=membership.role,
            status=membership.status,
            is_primary=membership.is_primary,
        )

    def _club_summary(
        self,
        club: Club,
        *,
        finance_profiles: list[AccountingExportProfile] | None = None,
        assignments: list[SuperadminAssignedUserSummary] | None = None,
    ) -> SuperadminClubSummary:
        profiles = finance_profiles if finance_profiles is not None else self._finance_profiles(club.id)
        assigned = assignments if assignments is not None else self._assignments(club.id)
        return SuperadminClubSummary(
            id=club.id,
            name=club.name,
            slug=club.slug,
            location=club.location,
            timezone=club.timezone,
            active=club.active,
            onboarding_state=ClubOnboardingState(club.onboarding_state),
            onboarding_current_step=ClubOnboardingStep(club.onboarding_current_step),
            registry_status=self._registry_status(club),
            finance_ready=self._finance_summary(profiles, self._selected_profile(club.id, profiles)).setup_complete,
            finance_profile_count=len(profiles),
            active_assignment_count=len([item for item in assigned if item.status == ClubMembershipStatus.ACTIVE]),
            created_at=club.created_at,
            updated_at=club.updated_at,
        )

    def _get_club(self, club_id: uuid.UUID) -> Club:
        club = self.db.get(Club, club_id)
        if club is None:
            raise NotFoundError("Club not found")
        return club

    def _get_or_create_config(self, club: Club, *, persist: bool) -> ClubConfig:
        config = self.db.scalar(select(ClubConfig).where(ClubConfig.club_id == club.id))
        if config is not None:
            return config
        config = ClubConfig(
            club_id=club.id,
            timezone=club.timezone,
            operating_hours=build_default_operating_hours(),
            booking_window_days=14,
            cancellation_policy_hours=24,
            default_slot_interval_minutes=10,
            preferred_accounting_profile_id=None,
        )
        if persist:
            self.db.add(config)
            self.db.flush()
        return config

    def _selected_profile(
        self, club_id: uuid.UUID, profiles: list[AccountingExportProfile]
    ) -> AccountingExportProfile | None:
        config = self.db.scalar(select(ClubConfig).where(ClubConfig.club_id == club_id))
        if config is None:
            return None
        return next(
            (profile for profile in profiles if profile.id == config.preferred_accounting_profile_id),
            None,
        )

    def _finance_profiles(self, club_id: uuid.UUID) -> list[AccountingExportProfile]:
        return list(
            self.db.scalars(
                select(AccountingExportProfile)
                .where(AccountingExportProfile.club_id == club_id)
                .order_by(AccountingExportProfile.is_active.desc(), AccountingExportProfile.name.asc())
            ).all()
        )

    def _finance_summary(
        self,
        profiles: list[AccountingExportProfile],
        selected_profile: AccountingExportProfile | None,
    ) -> SuperadminFinanceSetupSummary:
        return SuperadminFinanceSetupSummary(
            selected_accounting_profile_id=selected_profile.id if selected_profile else None,
            selected_accounting_profile_name=selected_profile.name if selected_profile else None,
            profile_count=len(profiles),
            active_profile_count=len([profile for profile in profiles if profile.is_active]),
            setup_complete=selected_profile is not None and selected_profile.is_active,
            mapping_ready=len(profiles) > 0,
            profiles=[
                SuperadminFinanceProfileSummary(
                    id=profile.id,
                    code=profile.code,
                    name=profile.name,
                    target_system=profile.target_system,
                    is_active=profile.is_active,
                )
                for profile in profiles
            ],
        )

    def _assignments(self, club_id: uuid.UUID) -> list[SuperadminAssignedUserSummary]:
        memberships = list(
            self.db.scalars(
                select(ClubMembership)
                .options(selectinload(ClubMembership.person).selectinload(Person.user))
                .where(ClubMembership.club_id == club_id)
                .order_by(ClubMembership.is_primary.desc(), ClubMembership.created_at.asc())
            ).all()
        )
        return [
            SuperadminAssignedUserSummary(
                membership_id=membership.id,
                user_id=membership.person.user.id,
                person_id=membership.person_id,
                display_name=membership.person.full_name,
                email=membership.person.user.email,
                role=membership.role,
                status=membership.status,
                is_primary=membership.is_primary,
            )
            for membership in memberships
            if membership.person.user is not None
            and membership.role in {ClubMembershipRole.CLUB_ADMIN, ClubMembershipRole.CLUB_STAFF}
        ]

    def _count_rule_sets(self, club_id: uuid.UUID) -> int:
        return len(
            list(
                self.db.scalars(select(BookingRuleSet.id).where(BookingRuleSet.club_id == club_id)).all()
            )
        )

    def _count_pricing_matrices(self, club_id: uuid.UUID) -> int:
        return len(
            list(self.db.scalars(select(PricingMatrix.id).where(PricingMatrix.club_id == club_id)).all())
        )

    def _enabled_module_keys(self, club_id: uuid.UUID) -> list[str]:
        return sorted(
            list(
                self.db.scalars(
                    select(ClubModule.module_key).where(
                        ClubModule.club_id == club_id,
                        ClubModule.enabled.is_(True),
                    )
                ).all()
            )
        )

    def _replace_modules(self, *, club_id: uuid.UUID, module_keys: list[str]) -> None:
        existing = self.db.scalars(select(ClubModule).where(ClubModule.club_id == club_id)).all()
        for module in existing:
            self.db.delete(module)
        for key in sorted({item.strip() for item in module_keys if item and item.strip()}):
            self.db.add(ClubModule(club_id=club_id, module_key=key, enabled=True))

    def _registry_status(self, club: Club) -> str:
        if not club.active:
            return "paused"
        if ClubOnboardingState(club.onboarding_state) == ClubOnboardingState.LIVE:
            return "active"
        return "onboarding"

    def _basic_info_ready(self, club: Club) -> bool:
        return bool(club.name.strip() and club.location.strip() and club.timezone.strip())

    def _build_steps(
        self,
        *,
        current_step: ClubOnboardingStep,
        basic_info_ready: bool,
        finance_ready: bool,
        rules_ready: bool,
        modules_ready: bool,
        live: bool,
    ) -> list[OnboardingStepStatus]:
        readiness = {
            ClubOnboardingStep.BASIC_INFO: basic_info_ready,
            ClubOnboardingStep.FINANCE: finance_ready,
            ClubOnboardingStep.RULES: rules_ready,
            ClubOnboardingStep.MODULES: modules_ready,
        }
        current_index = STEP_ORDER.index(current_step)
        if live:
            return [
                OnboardingStepStatus(key=step, label=STEP_LABELS[step], status="complete", ready=True)
                for step in STEP_ORDER
            ]
        items: list[OnboardingStepStatus] = []
        for index, step in enumerate(STEP_ORDER):
            status: str
            if index < current_index:
                status = "complete"
            elif index == current_index:
                status = "current"
            else:
                status = "upcoming"
            items.append(
                OnboardingStepStatus(
                    key=step,
                    label=STEP_LABELS[step],
                    status=status,  # type: ignore[arg-type]
                    ready=readiness[step],
                )
            )
        return items

    def _progress_percent(self, steps: list[OnboardingStepStatus]) -> int:
        score = 0.0
        for step in steps:
            if step.status == "complete":
                score += 1.0
            elif step.status == "current":
                score += 0.5 if step.ready else 0.25
        return round((score / len(steps)) * 100)

    def _derive_onboarding_state(self, *, club: Club, config: ClubConfig) -> ClubOnboardingState:
        if not self._basic_info_ready(club):
            return ClubOnboardingState.DATA_PENDING
        profiles = self._finance_profiles(club.id)
        selected_profile = next(
            (profile for profile in profiles if profile.id == config.preferred_accounting_profile_id and profile.is_active),
            None,
        )
        rules_ready = self._count_rule_sets(club.id) > 0 and self._count_pricing_matrices(club.id) > 0
        modules_ready = len(self._enabled_module_keys(club.id)) > 0
        if selected_profile is not None and rules_ready and modules_ready:
            return ClubOnboardingState.READY_FOR_GO_LIVE
        return ClubOnboardingState.SETUP_IN_PROGRESS

    def _unique_slug(self, name: str) -> str:
        root = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
        root = root or "club"
        attempt = root
        suffix = 2
        while self.db.scalar(select(Club.id).where(Club.slug == attempt)) is not None:
            attempt = f"{root}-{suffix}"
            suffix += 1
        return attempt
