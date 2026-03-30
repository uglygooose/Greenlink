from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import OrderSource, OrderStatus
from app.models.mixins import UUIDPrimaryKeyMixin


class Order(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "orders"

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("bookings.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    finance_charge_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("finance_transactions.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )
    finance_payment_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("finance_transactions.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )
    source: Mapped[OrderSource] = mapped_column(nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        nullable=False,
        default=OrderStatus.PLACED,
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        nullable=False,
        server_default=func.now(),
    )

    club = relationship("Club")
    person = relationship("Person")
    booking = relationship("Booking")
    finance_charge_transaction = relationship(
        "FinanceTransaction",
        foreign_keys=[finance_charge_transaction_id],
    )
    finance_payment_transaction = relationship(
        "FinanceTransaction",
        foreign_keys=[finance_payment_transaction_id],
    )
    items = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderItem.created_at",
    )
