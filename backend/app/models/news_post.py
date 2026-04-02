from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import NewsPostStatus, NewsPostVisibility
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin


class NewsPost(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "news_posts"

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_person_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("people.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(nullable=False)
    body: Mapped[str] = mapped_column(nullable=False)
    visibility: Mapped[NewsPostVisibility] = mapped_column(
        nullable=False,
        default=NewsPostVisibility.MEMBERS_ONLY,
    )
    status: Mapped[NewsPostStatus] = mapped_column(
        nullable=False,
        default=NewsPostStatus.DRAFT,
    )
    pinned: Mapped[bool] = mapped_column(nullable=False, default=False)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    club = relationship("Club")
    author = relationship("Person", foreign_keys=[author_person_id])
