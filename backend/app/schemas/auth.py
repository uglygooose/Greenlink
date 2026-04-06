from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models import ClubInvitationStatus, ClubMembershipStatus, UserType
from app.schemas.email import GreenLinkEmail


class UserIdentity(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: GreenLinkEmail
    display_name: str
    user_type: UserType


class LoginRequest(BaseModel):
    email: GreenLinkEmail
    password: str = Field(min_length=8, max_length=128)


class InvitationAcceptRequest(BaseModel):
    token: str = Field(min_length=16, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=255)


class InvitationActivateRequest(BaseModel):
    token: str = Field(min_length=16, max_length=255)


class InvitationActivateResponse(BaseModel):
    invitation_id: uuid.UUID
    club_id: uuid.UUID
    membership_id: uuid.UUID
    status: ClubInvitationStatus
    membership_status: ClubMembershipStatus


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    user: UserIdentity
