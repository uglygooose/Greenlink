from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import (
    ClubInvitationStatus,
    ClubMembershipRole,
    ClubMembershipStatus,
    ClubOnboardingState,
    ClubOnboardingStep,
)
from app.schemas.finance import AccountingExportProfileMappingConfig


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
    active_rule_set_count: int
    pricing_matrix_count: int
    active_pricing_matrix_count: int
    setup_complete: bool
    rule_sets: list["SuperadminRuleSetSummary"]
    pricing_matrices: list["SuperadminPricingMatrixSummary"]


class SuperadminRuleSetSummary(BaseModel):
    id: uuid.UUID
    name: str
    applies_to: str
    priority: int
    active: bool
    rule_count: int


class SuperadminPricingMatrixSummary(BaseModel):
    id: uuid.UUID
    name: str
    active: bool
    rule_count: int


class SuperadminModuleCatalogItem(BaseModel):
    key: str
    label: str
    description: str


class SuperadminModuleSetupSummary(BaseModel):
    enabled_module_keys: list[str]
    enabled_module_count: int
    setup_complete: bool
    available_modules: list[SuperadminModuleCatalogItem]


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
    action: Literal["save_draft", "complete_step", "return_to_previous_step"]
    acted_step: ClubOnboardingStep
    name: str | None = Field(default=None, min_length=1, max_length=255)
    location: str | None = Field(default=None, min_length=1, max_length=255)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    preferred_accounting_profile_id: uuid.UUID | None = None
    enabled_module_keys: list[str] | None = None


class SuperadminClubStatusUpdateRequest(BaseModel):
    active: bool


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


class SuperadminClubInvitationCreateRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    role: ClubMembershipRole


class SuperadminClubInvitationResponse(BaseModel):
    invitation_id: uuid.UUID
    club_id: uuid.UUID
    person_id: uuid.UUID
    membership_id: uuid.UUID
    linked_user_id: uuid.UUID | None
    email: str
    role: ClubMembershipRole
    status: ClubInvitationStatus
    membership_status: ClubMembershipStatus
    expires_at: datetime
    created_at: datetime
    accept_token: str | None = None


class SuperadminClubInvitationListResponse(BaseModel):
    items: list[SuperadminClubInvitationResponse]
    total_count: int


class SuperadminAccountingProfileSummary(BaseModel):
    id: uuid.UUID
    club_id: uuid.UUID
    club_name: str
    club_slug: str
    code: str
    name: str
    target_system: str
    is_active: bool
    mapping_config: AccountingExportProfileMappingConfig
    created_by_person_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class SuperadminAccountingProfileListResponse(BaseModel):
    profiles: list[SuperadminAccountingProfileSummary]
    total_count: int


class SuperadminAccountingProfileCreateRequest(BaseModel):
    club_id: uuid.UUID
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    target_system: str = Field(min_length=1, max_length=64)
    is_active: bool = True
    mapping_config: AccountingExportProfileMappingConfig


class SuperadminAccountingProfileActivationRequest(BaseModel):
    is_active: bool


class SuperadminAccountingProfileBindRequest(BaseModel):
    profile_id: uuid.UUID


class SuperadminAccountingTemplateColumnSample(BaseModel):
    values: list[str]


class SuperadminAccountingTemplateParseResponse(BaseModel):
    file_name: str
    headers_detected: list[str]
    headerless: bool
    suggested_target_system: str
    suggested_mapping: dict[str, str]
    sample_rows: list[SuperadminAccountingTemplateColumnSample]
    warnings: list[str]


class SuperadminAccountingSampleLayoutResponse(BaseModel):
    target_system: str
    file_name: str
    headerless: bool
    delimiter: str
    headers: list[str]
    sample_csv: str
    notes: list[str]
