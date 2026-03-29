from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.exceptions import AuthorizationError, NotFoundError
from app.models import Club, ClubMembership, ClubMembershipStatus, User, UserType


@dataclass(slots=True)
class TenancyContext:
    selected_club: Club | None
    selected_membership: ClubMembership | None
    all_memberships: list[ClubMembership]
    active_memberships: list[ClubMembership]
    club_selection_required: bool

    def is_selectable(self, membership: ClubMembership) -> bool:
        return membership in self.active_memberships


class TenancyService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def resolve_context(
        self,
        user: User,
        raw_selected_club_id: uuid.UUID | None,
        *,
        allow_unselected: bool,
    ) -> TenancyContext:
        memberships = sorted(
            user.memberships,
            key=lambda item: (not item.is_primary, item.club.name.lower()),
        )
        active_memberships = [
            membership
            for membership in memberships
            if membership.status == ClubMembershipStatus.ACTIVE and membership.club.active
        ]

        if user.user_type == UserType.SUPERADMIN:
            selected_club = None
            if raw_selected_club_id is not None:
                selected_club = self.db.get(Club, raw_selected_club_id)
                if selected_club is None or not selected_club.active:
                    raise NotFoundError("Selected club not found")
            elif not allow_unselected:
                raise AuthorizationError("Club selection is required")
            return TenancyContext(
                selected_club=selected_club,
                selected_membership=None,
                all_memberships=memberships,
                active_memberships=active_memberships,
                club_selection_required=selected_club is None,
            )

        if not active_memberships:
            if allow_unselected:
                return TenancyContext(
                    selected_club=None,
                    selected_membership=None,
                    all_memberships=memberships,
                    active_memberships=[],
                    club_selection_required=False,
                )
            raise AuthorizationError("No active club membership found")

        if len(active_memberships) == 1:
            membership = active_memberships[0]
            if raw_selected_club_id is not None and raw_selected_club_id != membership.club_id:
                raise AuthorizationError("Selected club is not available to this user")
            return TenancyContext(
                selected_club=membership.club,
                selected_membership=membership,
                all_memberships=memberships,
                active_memberships=active_memberships,
                club_selection_required=False,
            )

        if raw_selected_club_id is None:
            if allow_unselected:
                return TenancyContext(
                    selected_club=None,
                    selected_membership=None,
                    all_memberships=memberships,
                    active_memberships=active_memberships,
                    club_selection_required=True,
                )
            raise AuthorizationError("Club selection is required")

        membership = next(
            (item for item in active_memberships if item.club_id == raw_selected_club_id),
            None,
        )
        if membership is None:
            raise AuthorizationError("Selected club is not available to this user")
        return TenancyContext(
            selected_club=membership.club,
            selected_membership=membership,
            all_memberships=memberships,
            active_memberships=active_memberships,
            club_selection_required=False,
        )
