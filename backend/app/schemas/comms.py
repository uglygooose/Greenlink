from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import NewsPostStatus, NewsPostVisibility


class NewsPostAuthorResponse(BaseModel):
    person_id: uuid.UUID
    full_name: str

    model_config = {"from_attributes": True}


class NewsPostResponse(BaseModel):
    id: uuid.UUID
    club_id: uuid.UUID
    title: str
    body: str
    visibility: NewsPostVisibility
    status: NewsPostStatus
    pinned: bool
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
    author: NewsPostAuthorResponse | None

    model_config = {"from_attributes": True}


class NewsPostListResponse(BaseModel):
    posts: list[NewsPostResponse]
    total_count: int


class NewsPostCreateRequest(BaseModel):
    title: str
    body: str
    visibility: NewsPostVisibility = NewsPostVisibility.MEMBERS_ONLY
    pinned: bool = False
    publish: bool = False


class NewsPostUpdateRequest(BaseModel):
    title: str | None = None
    body: str | None = None
    visibility: NewsPostVisibility | None = None
    pinned: bool | None = None
    publish: bool | None = None
    unpublish: bool | None = None
