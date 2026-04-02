from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr, Field

from app.models import (
    ClubMembershipRole,
    ClubMembershipStatus,
    ClubOnboardingState,
    ClubOnboardingStep,
)


class BootstrapSuperadminRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=255)


class BootstrapInitialClubRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=2, max_length=120)
    location: str = Field(default="", max_length=255)
    timezone: str = "Africa/Johannesburg"


class BootstrapRequest(BaseModel):
    superadmin: BootstrapSuperadminRequest
    initial_club: BootstrapInitialClubRequest | None = None
    initial_club_modules: list[str] = Field(default_factory=list)


class ClubCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=2, max_length=120)
    location: str = Field(default="", max_length=255)
    timezone: str = "Africa/Johannesburg"
    onboarding_state: ClubOnboardingState = ClubOnboardingState.ONBOARDING_STARTED
    onboarding_current_step: ClubOnboardingStep = ClubOnboardingStep.BASIC_INFO
    module_keys: list[str] = Field(default_factory=list)


class ClubMembershipAssignRequest(BaseModel):
    person_id: uuid.UUID
    club_id: uuid.UUID
    role: ClubMembershipRole
    status: ClubMembershipStatus = ClubMembershipStatus.ACTIVE
    is_primary: bool = False
    membership_number: str | None = Field(default=None, max_length=64)


class ClubModuleUpdateRequest(BaseModel):
    module_keys: list[str] = Field(default_factory=list)


class PlatformBootstrapResponse(BaseModel):
    status: str
    message: str
