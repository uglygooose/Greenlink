from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import TenderType
from app.models.mixins import UUIDPrimaryKeyMixin


class PosTransaction(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "pos_transactions"
    __table_args__ = (
        CheckConstraint("total_amount >= 0", name="ck_pos_transactions_total_non_negative"),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tender_type: Mapped[TenderType] = mapped_column(nullable=False)
    finance_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("finance_transactions.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        nullable=False,
        server_default=func.now(),
    )

    club = relationship("Club")
    finance_transaction = relationship(
        "FinanceTransaction",
        foreign_keys=[finance_transaction_id],
    )
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    items = relationship(
        "PosTransactionItem",
        back_populates="pos_transaction",
        cascade="all, delete-orphan",
        order_by="PosTransactionItem.created_at",
    )


class PosTransactionItem(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "pos_transaction_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_pos_transaction_items_quantity_positive"),
        CheckConstraint(
            "unit_price_snapshot >= 0",
            name="ck_pos_transaction_items_unit_price_non_negative",
        ),
    )

    pos_transaction_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pos_transactions.id", ondelete="CASCADE"),
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

    pos_transaction = relationship("PosTransaction", back_populates="items")
