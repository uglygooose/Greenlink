from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, Boolean, Enum, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import BookingRuleType
from app.models.enum_utils import enum_values
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class BookingRule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "booking_rules"

    ruleset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("booking_rule_sets.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[BookingRuleType] = mapped_column(
        Enum(BookingRuleType, values_callable=enum_values),
        nullable=False,
    )
    evaluation_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    ruleset = relationship("BookingRuleSet", back_populates="rules")
