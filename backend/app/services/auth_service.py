from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi import Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.core.datetime import utc_now
from app.core.exceptions import AuthenticationError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models import AuthSession, ClubMembership, Person, User
from app.schemas.auth import LoginRequest, TokenResponse, UserIdentity

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
