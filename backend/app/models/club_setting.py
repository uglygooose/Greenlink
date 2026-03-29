from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ClubSetting(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "club_settings"
    __table_args__ = (UniqueConstraint("club_id", "key", name="uq_club_settings_club_key"),)

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    club = relationship("Club", back_populates="settings")
