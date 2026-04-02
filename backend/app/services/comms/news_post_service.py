from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.datetime import utc_now
from app.core.exceptions import NotFoundError
from app.models.enums import NewsPostStatus
from app.models.news_post import NewsPost
from app.models.person import Person
from app.schemas.comms import (
    NewsPostAuthorResponse,
    NewsPostCreateRequest,
    NewsPostListResponse,
    NewsPostResponse,
    NewsPostUpdateRequest,
)


def _to_response(post: NewsPost) -> NewsPostResponse:
    author: NewsPostAuthorResponse | None = None
    if post.author is not None:
        author = NewsPostAuthorResponse(
            person_id=post.author.id,
            full_name=post.author.full_name,
        )
    return NewsPostResponse(
        id=post.id,
        club_id=post.club_id,
        title=post.title,
        body=post.body,
        visibility=post.visibility,
        status=post.status,
        pinned=post.pinned,
        published_at=post.published_at,
        created_at=post.created_at,
        updated_at=post.updated_at,
        author=author,
    )


class NewsPostService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_posts(
        self,
        *,
        club_id: uuid.UUID,
        status: NewsPostStatus | None = None,
    ) -> NewsPostListResponse:
        stmt = (
            select(NewsPost)
            .where(NewsPost.club_id == club_id)
            .options(selectinload(NewsPost.author))
            .order_by(NewsPost.pinned.desc(), NewsPost.created_at.desc())
        )
        if status is not None:
            stmt = stmt.where(NewsPost.status == status)

        posts = list(self.db.scalars(stmt).all())
        return NewsPostListResponse(
            posts=[_to_response(p) for p in posts],
            total_count=len(posts),
        )

    def get_post(self, *, club_id: uuid.UUID, post_id: uuid.UUID) -> NewsPostResponse:
        post = self._load(club_id=club_id, post_id=post_id)
        return _to_response(post)

    def create_post(
        self,
        *,
        club_id: uuid.UUID,
        author_person_id: uuid.UUID | None,
        payload: NewsPostCreateRequest,
    ) -> NewsPostResponse:
        now = utc_now()
        post = NewsPost(
            club_id=club_id,
            author_person_id=author_person_id,
            title=payload.title,
            body=payload.body,
            visibility=payload.visibility,
            pinned=payload.pinned,
            status=NewsPostStatus.PUBLISHED if payload.publish else NewsPostStatus.DRAFT,
            published_at=now if payload.publish else None,
        )
        self.db.add(post)
        self.db.commit()
        self.db.refresh(post)
        # reload with author
        return self.get_post(club_id=club_id, post_id=post.id)

    def update_post(
        self,
        *,
        club_id: uuid.UUID,
        post_id: uuid.UUID,
        payload: NewsPostUpdateRequest,
    ) -> NewsPostResponse:
        post = self._load(club_id=club_id, post_id=post_id)

        if payload.title is not None:
            post.title = payload.title
        if payload.body is not None:
            post.body = payload.body
        if payload.visibility is not None:
            post.visibility = payload.visibility
        if payload.pinned is not None:
            post.pinned = payload.pinned
        if payload.publish:
            post.status = NewsPostStatus.PUBLISHED
            post.published_at = post.published_at or utc_now()
        if payload.unpublish:
            post.status = NewsPostStatus.DRAFT
            post.published_at = None

        self.db.commit()
        self.db.refresh(post)
        return self.get_post(club_id=club_id, post_id=post.id)

    def delete_post(self, *, club_id: uuid.UUID, post_id: uuid.UUID) -> None:
        post = self._load(club_id=club_id, post_id=post_id)
        self.db.delete(post)
        self.db.commit()

    def _load(self, *, club_id: uuid.UUID, post_id: uuid.UUID) -> NewsPost:
        stmt = (
            select(NewsPost)
            .where(NewsPost.club_id == club_id, NewsPost.id == post_id)
            .options(selectinload(NewsPost.author))
        )
        post = self.db.scalars(stmt).first()
        if post is None:
            raise NotFoundError("News post not found")
        return post
