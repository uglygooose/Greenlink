from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr, Field

from app.models import ClubMembershipRole, ClubMembershipStatus


class BootstrapSuperadminRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=255)


class BootstrapInitialClubRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=2, max_length=120)
    timezone: str = "Africa/Johannesburg"


class BootstrapRequest(BaseModel):
    superadmin: BootstrapSuperadminRequest
    initial_club: BootstrapInitialClubRequest | None = None
    initial_club_modules: list[str] = Field(default_factory=list)


class ClubCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=2, max_length=120)
    timezone: str = "Africa/Johannesburg"
    onboarding_state: str = "active"
    module_keys: list[str] = Field(default_factory=list)


class ClubMembershipAssignRequest(BaseModel):
    user_id: uuid.UUID
    club_id: uuid.UUID
    role: ClubMembershipRole
    status: ClubMembershipStatus = ClubMembershipStatus.ACTIVE
    is_primary: bool = False


class ClubModuleUpdateRequest(BaseModel):
    module_keys: list[str] = Field(default_factory=list)


class PlatformBootstrapResponse(BaseModel):
    status: str
    message: str
