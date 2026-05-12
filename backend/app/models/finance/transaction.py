from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    event,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enum_utils import enum_values
from app.models.enums import FinanceTransactionSource, FinanceTransactionType
from app.models.mixins import UUIDPrimaryKeyMixin


class FinanceTransaction(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "finance_transactions"
    __table_args__ = (
        CheckConstraint(
            "amount <> 0",
            name="ck_finance_transactions_amount_non_zero",
        ),
        Index(
            "ix_finance_transactions_account_created_at",
            "account_id",
            "created_at",
        ),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("finance_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    type: Mapped[FinanceTransactionType] = mapped_column(
        Enum(FinanceTransactionType, values_callable=enum_values),
        nullable=False,
    )
    source: Mapped[FinanceTransactionSource] = mapped_column(
        Enum(FinanceTransactionSource, values_callable=enum_values),
        nullable=False,
    )
    reference_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        nullable=False,
        server_default=func.now(),
    )

    account = relationship("FinanceAccount", back_populates="transactions")


@event.listens_for(FinanceTransaction, "before_update", propagate=True)
def prevent_finance_transaction_update(*_args: object, **_kwargs: object) -> None:
    raise ValueError("finance transactions are immutable and cannot be updated")


@event.listens_for(FinanceTransaction, "before_delete", propagate=True)
def prevent_finance_transaction_delete(*_args: object, **_kwargs: object) -> None:
    raise ValueError("finance transactions are immutable and cannot be deleted")
