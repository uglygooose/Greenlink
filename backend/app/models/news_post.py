from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enum_utils import enum_values
from app.models.enums import NewsPostStatus, NewsPostVisibility
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


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
    body: Mapped[str] = mapped_column(Text, nullable=False)
    visibility: Mapped[NewsPostVisibility] = mapped_column(
        Enum(NewsPostVisibility, values_callable=enum_values),
        nullable=False,
        default=NewsPostVisibility.MEMBERS_ONLY,
        server_default=text("'members_only'::newspostvisibility"),
    )
    status: Mapped[NewsPostStatus] = mapped_column(
        Enum(NewsPostStatus, values_callable=enum_values),
        nullable=False,
        index=True,
        default=NewsPostStatus.DRAFT,
        server_default=text("'draft'::newspoststatus"),
    )
    pinned: Mapped[bool] = mapped_column(
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    club = relationship("Club")
    author = relationship("Person", foreign_keys=[author_person_id])
