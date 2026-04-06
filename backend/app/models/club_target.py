from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ClubTarget(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "club_targets"

    club_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    domain_key: Mapped[str] = mapped_column(String(64), nullable=False)
    metric_key: Mapped[str] = mapped_column(String(64), nullable=False)
    period_key: Mapped[str] = mapped_column(String(32), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    target_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
