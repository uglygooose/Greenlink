from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Club, ClubMembership, ClubMembershipRole, ClubModule, Person, User, UserType
from app.schemas.session import (
    AvailableClubSummary,
    SelectedClubSummary,
    SessionBootstrapResponse,
    SessionMenuItem,
    SessionUserSummary,
)
from app.tenancy.service import TenancyContext, TenancyService

MENU_ITEMS: tuple[dict[str, str | None], ...] = (
    {"key": "overview", "label": "Overview", "path": "/superadmin/overview", "shell": "superadmin", "domain": "overview", "module_key": None},
    {"key": "clubs", "label": "Clubs", "path": "/superadmin/clubs", "shell": "superadmin", "domain": "clubs", "module_key": None},
    {"key": "dashboard", "label": "Overview", "path": "/admin/dashboard", "shell": "admin", "domain": "overview", "module_key": None},
    {"key": "golf_dashboard", "label": "Dashboard", "path": "/admin/golf/dashboard", "shell": "admin", "domain": "golf", "module_key": "golf"},
    {"key": "golf_tee_sheet", "label": "Tee Sheet", "path": "/admin/golf/tee-sheet", "shell": "admin", "domain": "golf", "module_key": "golf"},
    {"key": "settings_hub", "label": "Settings", "path": "/admin/settings", "shell": "admin", "domain": "settings", "module_key": None},
    {"key": "people_dashboard", "label": "Dashboard", "path": "/admin/people/dashboard", "shell": "admin", "domain": "people", "module_key": None},
    {"key": "members", "label": "Members", "path": "/admin/members", "shell": "admin", "domain": "members", "module_key": None},
    {"key": "finance_dashboard", "label": "Dashboard", "path": "/admin/finance/dashboard", "shell": "admin", "domain": "finance", "module_key": "finance"},
    {"key": "finance", "label": "Close Day", "path": "/admin/finance", "shell": "admin", "domain": "finance", "module_key": "finance"},
    {"key": "reports", "label": "Reports", "path": "/admin/reports", "shell": "admin", "domain": "reports", "module_key": None},
    {"key": "communications", "label": "Communications", "path": "/admin/communications", "shell": "admin", "domain": "communications", "module_key": "communications"},
    {"key": "halfway", "label": "Halfway", "path": "/admin/halfway", "shell": "admin", "domain": "operations", "module_key": "pos"},
    {"key": "pro_shop", "label": "Pro Shop", "path": "/admin/pro-shop", "shell": "admin", "domain": "operations", "module_key": "pos"},
    {"key": "orders", "label": "Order Queue", "path": "/admin/orders", "shell": "admin", "domain": "operations", "module_key": "pos"},
    {"key": "pos_terminal", "label": "POS Terminal", "path": "/admin/pos-terminal", "shell": "admin", "domain": "operations", "module_key": "pos"},
    {"key": "targets", "label": "Targets", "path": "/admin/targets", "shell": "admin", "domain": "targets", "module_key": None},
    {"key": "home", "label": "Home", "path": "/player/home", "shell": "player", "domain": "home", "module_key": None},
    {"key": "book", "label": "Book", "path": "/player/book", "shell": "player", "domain": "bookings", "module_key": "golf"},
    {"key": "order", "label": "Order", "path": "/player/order", "shell": "player", "domain": "orders", "module_key": "pos"},
    {"key": "profile", "label": "Profile", "path": "/player/profile", "shell": "player", "domain": "profile", "module_key": None},
)


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
            menu_items=self._build_menu_items(role_shell=role_shell, module_flags=module_flags),
            permissions=self._build_permissions(context, hydrated_user.user_type),
            feature_flags={"ux_rebuild_v1": True},
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

    def _build_menu_items(
        self,
        *,
        role_shell: str | None,
        module_flags: dict[str, bool],
    ) -> list[SessionMenuItem]:
        if role_shell is None:
            return []
        items: list[SessionMenuItem] = []
        for item in MENU_ITEMS:
            if item["shell"] != role_shell:
                continue
            module_key = item["module_key"]
            if module_key is not None and not module_flags.get(module_key, False):
                continue
            items.append(
                SessionMenuItem(
                    key=item["key"],
                    label=item["label"],
                    path=item["path"],
                    shell=item["shell"],
                    domain=item["domain"],
                    module_key=module_key,
                )
            )
        return items
