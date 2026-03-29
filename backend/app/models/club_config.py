from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ClubConfig(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "club_configs"
    __table_args__ = (UniqueConstraint("club_id", name="uq_club_configs_club"),)

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    operating_hours: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    booking_window_days: Mapped[int] = mapped_column(Integer, nullable=False, default=14)
    cancellation_policy_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    default_slot_interval_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=10,
    )
