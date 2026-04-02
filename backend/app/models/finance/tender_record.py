from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import FinanceTransactionSource, TenderType
from app.models.mixins import UUIDPrimaryKeyMixin


class FinanceTenderRecord(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "finance_tender_records"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_finance_tender_records_amount_positive"),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("finance_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source: Mapped[FinanceTransactionSource] = mapped_column(nullable=False)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    tender_type: Mapped[TenderType] = mapped_column(nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    charge_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("finance_transactions.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )
    settlement_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("finance_transactions.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        nullable=False,
        server_default=func.now(),
    )

    account = relationship("FinanceAccount")
    charge_transaction = relationship(
        "FinanceTransaction",
        foreign_keys=[charge_transaction_id],
    )
    settlement_transaction = relationship(
        "FinanceTransaction",
        foreign_keys=[settlement_transaction_id],
    )
