from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Club, ClubMembership, ClubMembershipRole, ClubModule, Person, User, UserType
from app.schemas.session import (
    AvailableClubSummary,
    SelectedClubSummary,
    SessionBootstrapResponse,
    SessionUserSummary,
)
from app.tenancy.service import TenancyContext, TenancyService


class SessionBootstrapService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.tenancy = TenancyService(db)

    def build(
        self,
        user: User,
        *,
        raw_selected_club_id: uuid.UUID | None,
    ) -> SessionBootstrapResponse:
        hydrated_user = self.db.scalar(
            select(User)
            .options(
                selectinload(User.person)
                .selectinload(Person.memberships)
                .selectinload(ClubMembership.club)
            )
            .where(User.id == user.id)
        )
        assert hydrated_user is not None
        context = self.tenancy.resolve_context(
            hydrated_user,
            raw_selected_club_id,
            allow_unselected=True,
        )
        selected_club = (
            context.selected_membership.club
            if context.selected_membership
            else context.selected_club
        )
        role_shell, default_workspace, landing_path = self._resolve_shell(
            context,
            hydrated_user.user_type,
        )

        module_flags: dict[str, bool] = {}
        if selected_club is not None:
            rows = self.db.scalars(
                select(ClubModule).where(ClubModule.club_id == selected_club.id)
            ).all()
            module_flags = {row.module_key: row.enabled for row in rows}

        return SessionBootstrapResponse(
            user=SessionUserSummary.model_validate(hydrated_user),
            available_clubs=self._build_available_clubs(context, hydrated_user.user_type),
            selected_club_id=selected_club.id if selected_club else None,
            selected_club=self._build_selected_club(selected_club),
            club_selection_required=context.club_selection_required,
            role_shell=role_shell,
            default_workspace=default_workspace,
            landing_path=landing_path,
            module_flags=module_flags,
            permissions=self._build_permissions(context, hydrated_user.user_type),
            feature_flags={},
        )

    def _build_available_clubs(
        self, context: TenancyContext, user_type: UserType
    ) -> list[AvailableClubSummary]:
        if user_type == UserType.SUPERADMIN:
            memberships_by_club = {
                membership.club_id: membership for membership in context.all_memberships
            }
            clubs = self.db.scalars(select(Club).order_by(Club.name.asc())).all()
            return [
                AvailableClubSummary(
                    club_id=club.id,
                    club_name=club.name,
                    club_slug=club.slug,
                    membership_role=(
                        memberships_by_club.get(club.id).role
                        if club.id in memberships_by_club
                        else None
                    ),
                    membership_status=(
                        memberships_by_club.get(club.id).status
                        if club.id in memberships_by_club
                        else None
                    ),
                    selectable=True,
                    is_primary_hint=(
                        memberships_by_club.get(club.id).is_primary
                        if club.id in memberships_by_club
                        else False
                    ),
                )
                for club in clubs
            ]
        return [
            AvailableClubSummary(
                club_id=membership.club.id,
                club_name=membership.club.name,
                club_slug=membership.club.slug,
                membership_role=membership.role,
                membership_status=membership.status,
                selectable=context.is_selectable(membership),
                is_primary_hint=membership.is_primary,
            )
            for membership in context.all_memberships
        ]

    def _resolve_shell(
        self, context: TenancyContext, user_type: UserType
    ) -> tuple[str | None, str | None, str]:
        if user_type == UserType.SUPERADMIN:
            return "superadmin", "clubs", "/superadmin/clubs"

        if context.selected_membership is None:
            if context.club_selection_required:
                return None, None, "/select-club"
            return None, None, "/login"

        if context.selected_membership.role in {
            ClubMembershipRole.CLUB_ADMIN,
            ClubMembershipRole.CLUB_STAFF,
        }:
            return "admin", "dashboard", "/admin/dashboard"
        return "player", "home", "/player/home"

    def _build_selected_club(self, selected_club) -> SelectedClubSummary | None:
        if selected_club is None:
            return None
        return SelectedClubSummary(
            id=selected_club.id,
            name=selected_club.name,
            slug=selected_club.slug,
            location=selected_club.location,
            timezone=selected_club.timezone,
            branding={"logo_object_key": selected_club.logo_object_key, "name": selected_club.name},
        )

    def _build_permissions(self, context: TenancyContext, user_type: UserType) -> list[str]:
        if user_type == UserType.SUPERADMIN:
            base = ["platform:manage", "clubs:read", "people:read", "people:write"]
            if context.selected_club is not None:
                return base + [
                    "clubs:write",
                    "users:assign",
                    "memberships:manage",
                    "account_customers:manage",
                    "bulk_intake:process",
                ]
            return base
        if context.selected_membership is None:
            return []
        role = context.selected_membership.role
        if role == ClubMembershipRole.CLUB_ADMIN:
            return [
                "club:read",
                "club:write",
                "memberships:manage",
                "modules:manage",
                "people:read",
                "people:write",
                "account_customers:manage",
                "bulk_intake:preview",
                "bulk_intake:process",
            ]
        if role == ClubMembershipRole.CLUB_STAFF:
            return ["club:read", "workspace:staff", "people:read", "bulk_intake:preview"]
        return ["club:read", "workspace:member"]
