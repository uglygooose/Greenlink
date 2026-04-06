from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi import Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.core.datetime import utc_now
from app.core.exceptions import AppError, AuthenticationError, NotFoundError
from app.core.security import (
    create_access_token,
    hash_one_time_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.domain.people.normalization import build_full_name, split_display_name
from app.models import (
    AuthSession,
    ClubInvitation,
    ClubInvitationStatus,
    ClubMembership,
    ClubMembershipStatus,
    Person,
    User,
    UserType,
)
from app.schemas.auth import InvitationAcceptRequest, LoginRequest, TokenResponse, UserIdentity
from app.schemas.auth import InvitationActivateRequest, InvitationActivateResponse

REFRESH_COOKIE_NAME = "greenlink_refresh_token"


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()

    def _access_token_ttl(self) -> timedelta:
        return timedelta(minutes=self.settings.access_token_ttl_minutes)

    def _refresh_token_ttl(self) -> timedelta:
        return timedelta(days=self.settings.refresh_token_ttl_days)

    def login(self, payload: LoginRequest) -> tuple[TokenResponse, str]:
        user = self.db.scalar(
            select(User)
            .options(
                selectinload(User.person)
                .selectinload(Person.memberships)
                .selectinload(ClubMembership.club)
            )
            .where(User.email == payload.email.lower())
        )
        if user is None or not user.active:
            raise AuthenticationError("Invalid email or password")
        if not verify_password(payload.password, user.password_hash):
            raise AuthenticationError("Invalid email or password")
        token_response, refresh_token, _ = self._issue_tokens(user)
        return token_response, refresh_token

    def refresh(self, refresh_session: tuple[AuthSession, str]) -> tuple[TokenResponse, str]:
        session, _ = refresh_session
        if session.revoked_at is not None or session.expires_at <= utc_now():
            raise AuthenticationError("Refresh token is no longer valid")
        user = self.db.scalar(
            select(User)
            .options(
                selectinload(User.person)
                .selectinload(Person.memberships)
                .selectinload(ClubMembership.club)
            )
            .where(User.id == session.user_id)
        )
        if user is None or not user.active:
            raise AuthenticationError("User is not active")
        session.revoked_at = utc_now()
        token_response, refresh_token, new_session = self._issue_tokens(
            user,
            user_agent=session.user_agent,
            ip_address=session.ip_address,
        )
        session.replaced_by_session_id = new_session.id
        self.db.add(session)
        self.db.commit()
        return token_response, refresh_token

    def logout(self, session: AuthSession) -> None:
        session.revoked_at = utc_now()
        self.db.add(session)
        self.db.commit()

    def get_refresh_session(self, refresh_token: str) -> AuthSession:
        token_hash = hash_refresh_token(refresh_token)
        session = self.db.scalar(
            select(AuthSession).where(AuthSession.refresh_token_hash == token_hash)
        )
        if session is None:
            raise AuthenticationError("Refresh token not recognized")
        return session

    def set_refresh_cookie(self, response: Response, refresh_token: str) -> None:
        response.set_cookie(
            key=REFRESH_COOKIE_NAME,
            value=refresh_token,
            httponly=True,
            secure=self.settings.secure_cookies,
            samesite="lax",
            max_age=int(self._refresh_token_ttl().total_seconds()),
            path="/",
        )

    def clear_refresh_cookie(self, response: Response) -> None:
        response.delete_cookie(REFRESH_COOKIE_NAME, path="/")

    def create_user(
        self,
        *,
        email: str,
        password: str,
        display_name: str,
        user_type,
        person_id: uuid.UUID | None = None,
    ) -> User:
        user = User(
            email=email.lower(),
            password_hash=hash_password(password),
            display_name=display_name,
            user_type=user_type,
            person_id=person_id,
        )
        self.db.add(user)
        self.db.flush()
        return user

    def accept_invitation(self, payload: InvitationAcceptRequest) -> tuple[TokenResponse, str]:
        invitation = self.db.scalar(
            select(ClubInvitation).where(
                ClubInvitation.token_hash == hash_one_time_token(payload.token),
                ClubInvitation.status == ClubInvitationStatus.PENDING,
            )
        )
        if invitation is None:
            raise AuthenticationError("Invitation is not valid")
        if invitation.expires_at <= utc_now():
            invitation.status = ClubInvitationStatus.EXPIRED
            self.db.add(invitation)
            self.db.commit()
            raise AuthenticationError("Invitation is no longer valid")
        if invitation.linked_user_id is not None:
            raise AppError(
                code="invitation_existing_user_login_required",
                message="This invitation belongs to an existing user. Sign in first to complete access activation.",
                status_code=400,
            )
        if self.db.scalar(select(User.id).where(User.email == invitation.normalized_email)) is not None:
            raise AppError(
                code="invitation_existing_user_login_required",
                message="This invitation email is already linked to a user. Sign in first to complete access activation.",
                status_code=400,
            )

        person = self.db.get(Person, invitation.person_id)
        membership = self.db.get(ClubMembership, invitation.membership_id)
        if person is None or membership is None:
            raise NotFoundError("Invitation provisioning target not found")

        first_name, last_name = split_display_name(payload.display_name, fallback_email=invitation.email)
        person.first_name = first_name
        person.last_name = last_name
        person.full_name = build_full_name(first_name, last_name)
        person.email = invitation.normalized_email
        person.normalized_email = invitation.normalized_email
        self.db.add(person)

        user = self.create_user(
            email=invitation.email,
            password=payload.password,
            display_name=person.full_name,
            user_type=UserType.USER,
            person_id=person.id,
        )
        membership.status = ClubMembershipStatus.ACTIVE
        if not any(
            existing.status == ClubMembershipStatus.ACTIVE and existing.is_primary
            for existing in person.memberships
            if existing.id != membership.id
        ):
            membership.is_primary = True
        self.db.add(membership)

        invitation.status = ClubInvitationStatus.ACCEPTED
        invitation.accepted_at = utc_now()
        invitation.accepted_by_user_id = user.id
        invitation.linked_user_id = user.id
        self.db.add(invitation)
        self.db.commit()
        self.db.refresh(user)
        return self._issue_tokens(user)[:2]

    def activate_invitation(
        self,
        payload: InvitationActivateRequest,
        *,
        current_user: User,
    ) -> InvitationActivateResponse:
        invitation = self.db.scalar(
            select(ClubInvitation).where(
                ClubInvitation.token_hash == hash_one_time_token(payload.token),
                ClubInvitation.status == ClubInvitationStatus.PENDING,
            )
        )
        if invitation is None:
            raise AuthenticationError("Invitation is not valid")
        if invitation.expires_at <= utc_now():
            invitation.status = ClubInvitationStatus.EXPIRED
            self.db.add(invitation)
            self.db.commit()
            raise AuthenticationError("Invitation is no longer valid")
        if invitation.linked_user_id is not None and invitation.linked_user_id != current_user.id:
            raise AppError(
                code="invitation_user_mismatch",
                message="This invitation belongs to a different user.",
                status_code=403,
            )
        if invitation.linked_user_id is None and current_user.email.lower() != invitation.normalized_email:
            raise AppError(
                code="invitation_user_mismatch",
                message="This invitation belongs to a different user.",
                status_code=403,
            )

        membership = self.db.get(ClubMembership, invitation.membership_id)
        if membership is None:
            raise NotFoundError("Invitation provisioning target not found")

        membership.status = ClubMembershipStatus.ACTIVE
        if not any(
            existing.status == ClubMembershipStatus.ACTIVE and existing.is_primary
            for existing in current_user.person.memberships
            if existing.id != membership.id
        ):
            membership.is_primary = True
        self.db.add(membership)

        invitation.status = ClubInvitationStatus.ACCEPTED
        invitation.accepted_at = utc_now()
        invitation.accepted_by_user_id = current_user.id
        invitation.linked_user_id = current_user.id
        self.db.add(invitation)
        self.db.commit()
        return InvitationActivateResponse(
            invitation_id=invitation.id,
            club_id=invitation.club_id,
            membership_id=invitation.membership_id,
            status=invitation.status,
            membership_status=membership.status,
        )

    def _issue_tokens(
        self,
        user: User,
        *,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> tuple[TokenResponse, str, AuthSession]:
        refresh_token = create_refresh_token()
        refresh_session = AuthSession(
            user_id=user.id,
            refresh_token_hash=hash_refresh_token(refresh_token),
            expires_at=utc_now() + self._refresh_token_ttl(),
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.db.add(refresh_session)
        self.db.flush()

        access_ttl = self._access_token_ttl()
        access_token = create_access_token(
            subject=str(user.id),
            expires_delta=access_ttl,
            extra_claims={"user_type": user.user_type.value},
        )
        self.db.commit()
        self.db.refresh(user)
        return (
            TokenResponse(
                access_token=access_token,
                expires_in_seconds=int(access_ttl.total_seconds()),
                user=UserIdentity.model_validate(user),
            ),
            refresh_token,
            refresh_session,
        )


def build_auth_service(db: Session) -> AuthService:
    return AuthService(db)
