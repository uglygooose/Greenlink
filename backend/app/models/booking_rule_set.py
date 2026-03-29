from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import (
    BookingRuleAppliesTo,
    BookingRuleConflictStrategy,
    BookingRuleScopeType,
)
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class BookingRuleSet(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "booking_rule_sets"

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    applies_to: Mapped[BookingRuleAppliesTo] = mapped_column(
        Enum(BookingRuleAppliesTo),
        nullable=False,
    )
    scope_type: Mapped[BookingRuleScopeType] = mapped_column(
        Enum(BookingRuleScopeType),
        nullable=False,
        default=BookingRuleScopeType.CLUB,
    )
    scope_ref_id: Mapped[str | None] = mapped_column(String(120))
    conflict_strategy: Mapped[BookingRuleConflictStrategy] = mapped_column(
        Enum(BookingRuleConflictStrategy),
        nullable=False,
        default=BookingRuleConflictStrategy.FIRST_MATCH,
    )
    applies_from: Mapped[datetime | None] = mapped_column(UTCDateTime())
    applies_until: Mapped[datetime | None] = mapped_column(UTCDateTime())
    priority: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    rules = relationship("BookingRule", back_populates="ruleset", cascade="all, delete-orphan")
