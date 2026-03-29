from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import (
    BulkIntakeAction,
    ClubMembershipRole,
    ClubMembershipStatus,
    IntegrityIssueScope,
    IntegrityIssueSeverity,
    ReadinessStatus,
)


class PersonCreateRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(default="", max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=64)
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, max_length=64)
    external_ref: str | None = Field(default=None, max_length=120)
    notes: str | None = None
    profile_metadata: dict[str, Any] = Field(default_factory=dict)


class PersonUpdateRequest(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=64)
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, max_length=64)
    external_ref: str | None = Field(default=None, max_length=120)
    notes: str | None = None
    profile_metadata: dict[str, Any] | None = None


class PersonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    first_name: str
    last_name: str
    full_name: str
    email: str | None
    phone: str | None
    date_of_birth: date | None
    gender: str | None
    external_ref: str | None
    notes: str | None
    profile_metadata: dict[str, Any]
    linked_user_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class PersonSearchResponse(BaseModel):
    items: list[PersonResponse]
    total: int


class ClubMembershipCreateRequest(BaseModel):
    person_id: uuid.UUID
    role: ClubMembershipRole
    status: ClubMembershipStatus = ClubMembershipStatus.ACTIVE
    joined_at: datetime | None = None
    is_primary: bool = False
    membership_number: str | None = Field(default=None, max_length=64)
    membership_metadata: dict[str, Any] = Field(default_factory=dict)


class ClubMembershipUpdateRequest(BaseModel):
    role: ClubMembershipRole | None = None
    status: ClubMembershipStatus | None = None
    joined_at: datetime | None = None
    is_primary: bool | None = None
    membership_number: str | None = Field(default=None, max_length=64)
    membership_metadata: dict[str, Any] | None = None


class ClubMembershipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    person_id: uuid.UUID
    role: ClubMembershipRole
    status: ClubMembershipStatus
    joined_at: datetime
    is_primary: bool
    membership_number: str | None
    membership_metadata: dict[str, Any]
    club_name: str
    club_slug: str


class ClubPersonResponse(BaseModel):
    person: PersonResponse
    membership: ClubMembershipResponse


class AccountCustomerCreateRequest(BaseModel):
    person_id: uuid.UUID
    account_code: str = Field(min_length=1, max_length=64)
    active: bool = True
    billing_email: EmailStr | None = None
    billing_phone: str | None = Field(default=None, max_length=64)
    billing_metadata: dict[str, Any] = Field(default_factory=dict)


class AccountCustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    person_id: uuid.UUID
    account_code: str
    active: bool
    billing_email: str | None
    billing_phone: str | None
    billing_metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class DuplicateCandidate(BaseModel):
    person_id: uuid.UUID
    full_name: str
    email: str | None
    phone: str | None
    match_reason: str


class IntegrityIssue(BaseModel):
    code: str
    message: str
    severity: IntegrityIssueSeverity
    scope: IntegrityIssueScope
    resource_id: uuid.UUID | None = None


class ReadinessSummary(BaseModel):
    ready: bool
    status: ReadinessStatus
    warnings: list[IntegrityIssue] = Field(default_factory=list)
    blockers: list[IntegrityIssue] = Field(default_factory=list)


class MembershipReadinessSummary(ReadinessSummary):
    membership_id: uuid.UUID
    club_id: uuid.UUID
    role: ClubMembershipRole
    status_value: ClubMembershipStatus


class AccountCustomerReadinessSummary(ReadinessSummary):
    account_customer_id: uuid.UUID
    club_id: uuid.UUID


class PersonIntegrityResponse(BaseModel):
    person: PersonResponse
    duplicate_candidates: list[DuplicateCandidate]
    profile: ReadinessSummary
    memberships: list[MembershipReadinessSummary]
    account_customers: list[AccountCustomerReadinessSummary]
    exceptions: list[IntegrityIssue]


class BulkIntakeRow(BaseModel):
    source_row_id: str | None = Field(default=None, max_length=120)
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=64)
    membership_number: str | None = Field(default=None, max_length=64)
    role: ClubMembershipRole = ClubMembershipRole.MEMBER
    status: ClubMembershipStatus = ClubMembershipStatus.ACTIVE
    external_ref: str | None = Field(default=None, max_length=120)
    notes: str | None = None
    membership_metadata: dict[str, Any] = Field(default_factory=dict)
    profile_metadata: dict[str, Any] = Field(default_factory=dict)


class BulkIntakeRequest(BaseModel):
    rows: list[BulkIntakeRow] = Field(min_length=1)


class BulkIntakeOutcome(BaseModel):
    row_index: int
    source_row_id: str | None
    action: BulkIntakeAction
    matched_person_id: uuid.UUID | None = None
    matched_membership_id: uuid.UUID | None = None
    warnings: list[IntegrityIssue] = Field(default_factory=list)
    blockers: list[IntegrityIssue] = Field(default_factory=list)
    duplicate_candidates: list[DuplicateCandidate] = Field(default_factory=list)
    explanation: str


class BulkIntakeResult(BaseModel):
    mode: str
    club_id: uuid.UUID
    outcomes: list[BulkIntakeOutcome]
    counts: dict[str, int]
