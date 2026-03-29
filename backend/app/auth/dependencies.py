from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Cookie, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import AuthenticationError, AuthorizationError
from app.core.security import decode_token
from app.db import get_db
from app.models import AuthSession, ClubMembership, Person, User, UserType

bearer_scheme = HTTPBearer(auto_error=False)


def _load_user(db: Session, user_id: uuid.UUID) -> User | None:
    statement = (
        select(User)
        .options(
            selectinload(User.person)
            .selectinload(Person.memberships)
            .selectinload(ClubMembership.club)
        )
        .where(User.id == user_id)
    )
    return db.scalar(statement)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise AuthenticationError("Missing bearer token")
    try:
        payload = decode_token(credentials.credentials)
    except Exception as exc:  # noqa: BLE001
        raise AuthenticationError("Invalid or expired token") from exc

    if payload.get("type") != "access":
        raise AuthenticationError("Invalid token type")

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise AuthenticationError("Token subject is invalid") from exc

    user = _load_user(db, user_id)
    if user is None or not user.active:
        raise AuthenticationError("User is not active")
    return user


def get_current_superadmin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.user_type != UserType.SUPERADMIN:
        raise AuthorizationError("Superadmin access required")
    return current_user


def get_refresh_session(
    refresh_token: str | None = Cookie(default=None, alias="greenlink_refresh_token"),
    db: Session = Depends(get_db),
) -> tuple[AuthSession, str] | None:
    if refresh_token is None:
        return None
    from app.services.auth_service import build_auth_service

    service = build_auth_service(db)
    session = service.get_refresh_session(refresh_token)
    return session, refresh_token


def require_refresh_session(
    refresh_session: tuple[AuthSession, str] | None = Depends(get_refresh_session),
) -> tuple[AuthSession, str]:
    if refresh_session is None:
        raise AuthenticationError("Refresh token is required")
    return refresh_session
