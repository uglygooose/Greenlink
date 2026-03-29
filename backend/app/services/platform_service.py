from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.datetime import utc_now
from app.core.exceptions import ConflictError, NotFoundError
from app.domain.people.normalization import build_full_name, normalize_email, split_display_name
from app.events.publisher import DatabaseEventPublisher
from app.models import (
    Club,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    ClubModule,
    Person,
    PlatformState,
    User,
    UserType,
)
from app.schemas.platform import (
    BootstrapRequest,
    ClubCreateRequest,
    ClubMembershipAssignRequest,
    ClubModuleUpdateRequest,
    PlatformBootstrapResponse,
)
from app.services.auth_service import AuthService


class PlatformService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.auth_service = AuthService(db)
        self.publisher = DatabaseEventPublisher(db)

    def bootstrap_platform(
        self, payload: BootstrapRequest, *, correlation_id: str | None = None
    ) -> PlatformBootstrapResponse:
        platform_state = self._get_or_create_platform_state()
        if platform_state.is_initialized:
            raise ConflictError(
                "Platform bootstrap is permanently locked",
                code="platform_initialized",
            )
        self._ensure_unique_email(payload.superadmin.email)
        first_name, last_name = split_display_name(
            payload.superadmin.display_name,
            payload.superadmin.email,
        )
        person = Person(
            first_name=first_name,
            last_name=last_name,
            full_name=build_full_name(first_name, last_name),
            email=normalize_email(payload.superadmin.email),
            normalized_email=normalize_email(payload.superadmin.email),
            profile_metadata={},
        )
        self.db.add(person)
        self.db.flush()

        superadmin = self.auth_service.create_user(
            email=payload.superadmin.email,
            password=payload.superadmin.password,
            display_name=payload.superadmin.display_name,
            user_type=UserType.SUPERADMIN,
            person_id=person.id,
        )
        initial_club: Club | None = None
        if payload.initial_club is not None:
            self._ensure_unique_club_slug(payload.initial_club.slug)
            initial_club = Club(
                name=payload.initial_club.name,
                slug=payload.initial_club.slug,
                timezone=payload.initial_club.timezone,
            )
            self.db.add(initial_club)
            self.db.flush()
            self.db.add(
                ClubMembership(
                    person_id=person.id,
                    club_id=initial_club.id,
                    role=ClubMembershipRole.CLUB_ADMIN,
                    status=ClubMembershipStatus.ACTIVE,
                    is_primary=True,
                )
            )
            self._replace_modules(initial_club.id, payload.initial_club_modules)

        platform_state.is_initialized = True
        platform_state.initialized_at = utc_now()
        platform_state.initialized_by_user_id = superadmin.id
        platform_state.initial_club_id = initial_club.id if initial_club else None
        self.db.add(platform_state)
        self.publisher.publish(
            event_type="platform.bootstrapped",
            aggregate_type="platform_state",
            aggregate_id=str(platform_state.id),
            payload={"initial_club_id": str(initial_club.id) if initial_club else None},
            correlation_id=correlation_id,
            actor_user_id=superadmin.id,
            club_id=initial_club.id if initial_club else None,
        )
        self.db.commit()
        return PlatformBootstrapResponse(
            status="initialized",
            message="Platform bootstrap completed and is now permanently locked.",
        )

    def create_club(
        self, payload: ClubCreateRequest, *, correlation_id: str | None = None
    ) -> PlatformBootstrapResponse:
        self._assert_initialized()
        self._ensure_unique_club_slug(payload.slug)
        club = Club(
            name=payload.name,
            slug=payload.slug,
            timezone=payload.timezone,
            onboarding_state=payload.onboarding_state,
        )
        self.db.add(club)
        self.db.flush()
        self._replace_modules(club.id, payload.module_keys)
        self.publisher.publish(
            event_type="club.created",
            aggregate_type="club",
            aggregate_id=str(club.id),
            payload={"slug": club.slug},
            correlation_id=correlation_id,
            club_id=club.id,
        )
        self.db.commit()
        return PlatformBootstrapResponse(status="created", message="Club created.")

    def assign_membership(
        self, payload: ClubMembershipAssignRequest, *, correlation_id: str | None = None
    ) -> None:
        self._assert_initialized()
        person = self.db.get(Person, payload.person_id)
        club = self.db.get(Club, payload.club_id)
        if person is None:
            raise NotFoundError("Person not found")
        if club is None:
            raise NotFoundError("Club not found")
        membership = self.db.scalar(
            select(ClubMembership).where(
                ClubMembership.person_id == payload.person_id,
                ClubMembership.club_id == payload.club_id,
            )
        )
        if membership is None:
            membership = ClubMembership(
                person_id=payload.person_id,
                club_id=payload.club_id,
                role=payload.role,
                status=payload.status,
                is_primary=payload.is_primary,
                membership_number=payload.membership_number,
            )
            self.db.add(membership)
            self.db.flush()
        else:
            membership.role = payload.role
            membership.status = payload.status
            membership.is_primary = payload.is_primary
            membership.membership_number = payload.membership_number
        self.publisher.publish(
            event_type="club_membership.upserted",
            aggregate_type="club_membership",
            aggregate_id=str(membership.id),
            payload={"role": payload.role.value, "status": payload.status.value},
            correlation_id=correlation_id,
            club_id=club.id,
        )
        self.db.commit()

    def update_modules(
        self,
        club_id: uuid.UUID,
        payload: ClubModuleUpdateRequest,
        *,
        correlation_id: str | None = None,
    ) -> None:
        self._assert_initialized()
        club = self.db.get(Club, club_id)
        if club is None:
            raise NotFoundError("Club not found")
        self._replace_modules(club_id, payload.module_keys)
        self.publisher.publish(
            event_type="club.modules_updated",
            aggregate_type="club",
            aggregate_id=str(club_id),
            payload={"module_keys": payload.module_keys},
            correlation_id=correlation_id,
            club_id=club_id,
        )
        self.db.commit()

    def _replace_modules(self, club_id: uuid.UUID, module_keys: list[str]) -> None:
        existing = self.db.scalars(select(ClubModule).where(ClubModule.club_id == club_id)).all()
        for module in existing:
            self.db.delete(module)
        for key in sorted(set(module_keys)):
            self.db.add(ClubModule(club_id=club_id, module_key=key, enabled=True))

    def _get_or_create_platform_state(self) -> PlatformState:
        state = self.db.get(PlatformState, 1)
        if state is None:
            state = PlatformState(id=1, is_initialized=False)
            self.db.add(state)
            self.db.flush()
        return state

    def _assert_initialized(self) -> None:
        state = self.db.get(PlatformState, 1)
        if state is None or not state.is_initialized:
            raise ConflictError("Platform is not initialized", code="platform_not_initialized")

    def _ensure_unique_email(self, email: str) -> None:
        existing = self.db.scalar(select(User.id).where(User.email == email.lower()))
        if existing is not None:
            raise ConflictError("Email is already in use", code="email_in_use")

    def _ensure_unique_club_slug(self, slug: str) -> None:
        existing = self.db.scalar(select(Club.id).where(Club.slug == slug))
        if existing is not None:
            raise ConflictError("Club slug is already in use", code="club_slug_in_use")
