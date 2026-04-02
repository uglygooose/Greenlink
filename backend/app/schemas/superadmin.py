from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import ClubMembershipRole, ClubMembershipStatus, ClubOnboardingState, ClubOnboardingStep


class SuperadminClubCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    location: str = Field(min_length=1, max_length=255)
    timezone: str = Field(min_length=1, max_length=64)


class SuperadminClubSummary(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    location: str
    timezone: str
    active: bool
    onboarding_state: ClubOnboardingState
    onboarding_current_step: ClubOnboardingStep
    registry_status: Literal["active", "onboarding", "paused"]
    finance_ready: bool
    finance_profile_count: int
    active_assignment_count: int
    created_at: datetime
    updated_at: datetime


class SuperadminClubListResponse(BaseModel):
    items: list[SuperadminClubSummary]
    total_count: int


class OnboardingStepStatus(BaseModel):
    key: ClubOnboardingStep
    label: str
    status: Literal["complete", "current", "upcoming"]
    ready: bool


class SuperadminFinanceProfileSummary(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    target_system: str
    is_active: bool


class SuperadminFinanceSetupSummary(BaseModel):
    selected_accounting_profile_id: uuid.UUID | None
    selected_accounting_profile_name: str | None
    profile_count: int
    active_profile_count: int
    setup_complete: bool
    mapping_ready: bool
    profiles: list[SuperadminFinanceProfileSummary]


class SuperadminRulesSetupSummary(BaseModel):
    rule_set_count: int
    pricing_matrix_count: int
    setup_complete: bool


class SuperadminModuleSetupSummary(BaseModel):
    enabled_module_keys: list[str]
    setup_complete: bool


class SuperadminAssignedUserSummary(BaseModel):
    membership_id: uuid.UUID
    user_id: uuid.UUID
    person_id: uuid.UUID
    display_name: str
    email: str
    role: ClubMembershipRole
    status: ClubMembershipStatus
    is_primary: bool


class SuperadminAssignmentCandidate(BaseModel):
    user_id: uuid.UUID
    person_id: uuid.UUID
    display_name: str
    email: str


class SuperadminAssignmentCandidateListResponse(BaseModel):
    items: list[SuperadminAssignmentCandidate]
    total_count: int


class SuperadminClubOnboardingDetailResponse(BaseModel):
    club: SuperadminClubSummary
    progress_percent: int
    steps: list[OnboardingStepStatus]
    finance: SuperadminFinanceSetupSummary
    rules: SuperadminRulesSetupSummary
    modules: SuperadminModuleSetupSummary
    assignments: list[SuperadminAssignedUserSummary]


class SuperadminClubOnboardingUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    location: str | None = Field(default=None, min_length=1, max_length=255)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    onboarding_state: ClubOnboardingState | None = None
    onboarding_current_step: ClubOnboardingStep | None = None
    preferred_accounting_profile_id: uuid.UUID | None = None


class SuperadminClubAssignmentUpsertRequest(BaseModel):
    person_id: uuid.UUID
    role: ClubMembershipRole


class SuperadminClubAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    membership_id: uuid.UUID
    club_id: uuid.UUID
    person_id: uuid.UUID
    role: ClubMembershipRole
    status: ClubMembershipStatus
    is_primary: bool
