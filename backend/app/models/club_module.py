from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ClubModule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "club_modules"
    __table_args__ = (
        UniqueConstraint("club_id", "module_key", name="uq_club_modules_club_module"),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    module_key: Mapped[str] = mapped_column(String(120), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    club = relationship("Club", back_populates="modules")
