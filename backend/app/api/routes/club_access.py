from __future__ import annotations

import uuid

from fastapi import Header, Query
from sqlalchemy.orm import Session

from app.core.exceptions import AuthorizationError
from app.models import ClubMembershipRole, User, UserType
from app.tenancy.service import TenancyContext, TenancyService


def get_requested_club_id(
    selected_club_id: uuid.UUID | None = Query(default=None),
    selected_club_header: uuid.UUID | None = Header(default=None, alias="X-Club-Id"),
) -> uuid.UUID | None:
    return selected_club_id or selected_club_header


def resolve_required_club_context(
    db: Session,
    user: User,
    raw_selected_club_id: uuid.UUID | None,
) -> TenancyContext:
    tenancy = TenancyService(db)
    return tenancy.resolve_context(
        user,
        raw_selected_club_id,
        allow_unselected=False,
        require_explicit_selection=True,
    )


def require_operations_read(user: User, context: TenancyContext) -> None:
    if user.user_type == UserType.SUPERADMIN:
        return
    if context.selected_membership is None:
        raise AuthorizationError("Selected club access is required")
    if context.selected_membership.role not in {
        ClubMembershipRole.CLUB_ADMIN,
        ClubMembershipRole.CLUB_STAFF,
    }:
        raise AuthorizationError(
            "Operational settings access is not available for this membership role"
        )


def require_operations_write(user: User, context: TenancyContext) -> None:
    require_operations_read(user, context)


def require_club_config_write(user: User, context: TenancyContext) -> None:
    if user.user_type == UserType.SUPERADMIN:
        return
    if context.selected_membership is None:
        raise AuthorizationError("Selected club access is required")
    if context.selected_membership.role != ClubMembershipRole.CLUB_ADMIN:
        raise AuthorizationError("Club admin access is required for club configuration changes")
