from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.routes.club_access import (
    get_requested_club_id,
    require_club_config_write,
    require_operations_read,
    resolve_required_club_context,
)
from app.auth.dependencies import get_current_user, get_db
from app.core.exceptions import AuthorizationError
from app.models import ClubMembershipRole, User, UserType
from app.models.enums import NewsPostStatus
from app.schemas.comms import (
    NewsPostCreateRequest,
    NewsPostListResponse,
    NewsPostResponse,
    NewsPostUpdateRequest,
)
from app.services.comms.news_post_service import NewsPostService

router = APIRouter()


def _require_news_feed_read(current_user: User, context) -> None:
    if current_user.user_type == UserType.SUPERADMIN:
        return
    if context.selected_membership is None:
        raise AuthorizationError("Selected club access is required")
    if context.selected_membership.role not in {
        ClubMembershipRole.CLUB_ADMIN,
        ClubMembershipRole.CLUB_STAFF,
        ClubMembershipRole.MEMBER,
    }:
        raise AuthorizationError("Published news is not available for this membership role")


@router.get("/feed", response_model=NewsPostListResponse)
def list_published_news_feed(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> NewsPostListResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    _require_news_feed_read(current_user, context)
    assert context.selected_club is not None
    service = NewsPostService(db)
    return service.list_published_feed(club_id=context.selected_club.id)


@router.get("/posts", response_model=NewsPostListResponse)
def list_news_posts(
    status: NewsPostStatus | None = Query(default=None),
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> NewsPostListResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = NewsPostService(db)
    return service.list_posts(club_id=context.selected_club.id, status=status)


@router.post("/posts", response_model=NewsPostResponse, status_code=201)
def create_news_post(
    payload: NewsPostCreateRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> NewsPostResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_club_config_write(current_user, context)
    assert context.selected_club is not None
    service = NewsPostService(db)
    return service.create_post(
        club_id=context.selected_club.id,
        author_person_id=current_user.person_id,
        payload=payload,
    )


@router.get("/posts/{post_id}", response_model=NewsPostResponse)
def get_news_post(
    post_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> NewsPostResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = NewsPostService(db)
    return service.get_post(club_id=context.selected_club.id, post_id=post_id)


@router.patch("/posts/{post_id}", response_model=NewsPostResponse)
def update_news_post(
    post_id: uuid.UUID,
    payload: NewsPostUpdateRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> NewsPostResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_club_config_write(current_user, context)
    assert context.selected_club is not None
    service = NewsPostService(db)
    return service.update_post(
        club_id=context.selected_club.id,
        post_id=post_id,
        payload=payload,
    )


@router.delete("/posts/{post_id}", status_code=204)
def delete_news_post(
    post_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> None:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_club_config_write(current_user, context)
    assert context.selected_club is not None
    service = NewsPostService(db)
    service.delete_post(club_id=context.selected_club.id, post_id=post_id)
