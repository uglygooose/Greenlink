from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Tee(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tees"

    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    gender: Mapped[str | None] = mapped_column(String(32))
    slope_rating: Mapped[int] = mapped_column(nullable=False)
    course_rating: Mapped[Decimal] = mapped_column(Numeric(5, 1), nullable=False)
    color_code: Mapped[str] = mapped_column(String(32), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    course = relationship("Course", back_populates="tees")
