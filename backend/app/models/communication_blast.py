from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import BlastChannel, BlastStatus, BlastTargetSegment
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class CommunicationBlast(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "communication_blasts"

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_person_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("people.id", ondelete="SET NULL"),
        nullable=True,
    )
    subject: Mapped[str] = mapped_column(nullable=False)
    body: Mapped[str] = mapped_column(Text(), nullable=False)
    target_segment: Mapped[BlastTargetSegment] = mapped_column(
        nullable=False,
        default=BlastTargetSegment.ALL,
    )
    channel: Mapped[BlastChannel] = mapped_column(
        nullable=False,
        default=BlastChannel.IN_APP,
    )
    status: Mapped[BlastStatus] = mapped_column(
        nullable=False,
        default=BlastStatus.DRAFT,
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    recipient_count: Mapped[int | None] = mapped_column(nullable=True)
    delivery_note: Mapped[str | None] = mapped_column(nullable=True)

    club = relationship("Club")
    created_by = relationship("Person", foreign_keys=[created_by_person_id])
