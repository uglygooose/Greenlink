from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.mixins import UUIDPrimaryKeyMixin


class OrderItem(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
        CheckConstraint(
            "unit_price_snapshot >= 0",
            name="ck_order_items_unit_price_snapshot_non_negative",
        ),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    item_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_price_snapshot: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        nullable=False,
        server_default=func.now(),
    )

    order = relationship("Order", back_populates="items")
