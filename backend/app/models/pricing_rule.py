from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import Boolean, Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import PricingDayType, PricingRuleAppliesTo, PricingTimeBand
from app.models.enum_utils import enum_values
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PricingRule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pricing_rules"

    matrix_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pricing_matrices.id", ondelete="CASCADE"),
        nullable=False,
    )
    applies_to: Mapped[PricingRuleAppliesTo] = mapped_column(
        Enum(PricingRuleAppliesTo, values_callable=enum_values),
        nullable=False,
    )
    day_type: Mapped[PricingDayType] = mapped_column(
        Enum(PricingDayType, values_callable=enum_values),
        nullable=False,
    )
    time_band: Mapped[PricingTimeBand] = mapped_column(
        Enum(PricingTimeBand, values_callable=enum_values),
        nullable=False,
    )
    time_band_ref: Mapped[str | None] = mapped_column(String(120))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    matrix = relationship("PricingMatrix", back_populates="rules")
