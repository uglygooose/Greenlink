from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session
from starlette.responses import Response as StarletteResponse

from app.auth.dependencies import (
    get_current_user,
    get_db,
    get_refresh_session,
    require_refresh_session,
)
from app.models import AuthSession, User
from app.schemas.auth import LoginRequest, TokenResponse, UserIdentity
from app.services.auth_service import build_auth_service

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> TokenResponse:
    service = build_auth_service(db)
    token_response, refresh_token = service.login(payload)
    service.set_refresh_cookie(response, refresh_token)
    return token_response


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    db: Session = Depends(get_db),
    refresh_session: tuple[AuthSession, str] = Depends(require_refresh_session),
) -> TokenResponse:
    service = build_auth_service(db)
    token_response, refresh_token = service.refresh(refresh_session)
    service.set_refresh_cookie(response, refresh_token)
    return token_response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    db: Session = Depends(get_db),
    refresh_session: tuple[AuthSession, str] | None = Depends(get_refresh_session),
) -> Response:
    service = build_auth_service(db)
    if refresh_session is not None:
        service.logout(refresh_session[0])
    cleared_response = StarletteResponse(status_code=status.HTTP_204_NO_CONTENT)
    service.clear_refresh_cookie(cleared_response)
    return cleared_response


@router.get("/me", response_model=UserIdentity)
def me(current_user: User = Depends(get_current_user)) -> UserIdentity:
    return UserIdentity.model_validate(current_user)
