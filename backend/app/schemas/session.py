from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models import ClubMembershipRole, ClubMembershipStatus, UserType


class AvailableClubSummary(BaseModel):
    club_id: uuid.UUID
    club_name: str
    club_slug: str
    membership_role: ClubMembershipRole | None
    membership_status: ClubMembershipStatus | None
    selectable: bool
    is_primary_hint: bool


class SelectedClubSummary(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    timezone: str
    branding: dict[str, str | None]


class SessionUserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    user_type: UserType


class SessionBootstrapResponse(BaseModel):
    user: SessionUserSummary
    available_clubs: list[AvailableClubSummary]
    selected_club_id: uuid.UUID | None
    selected_club: SelectedClubSummary | None
    club_selection_required: bool
    role_shell: Literal["admin", "player"] | None
    default_workspace: str | None
    landing_path: str
    module_flags: dict[str, bool]
    permissions: list[str]
    feature_flags: dict[str, bool]
