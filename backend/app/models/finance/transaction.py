from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, event, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import FinanceTransactionSource, FinanceTransactionType
from app.models.mixins import UUIDPrimaryKeyMixin


class FinanceTransaction(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "finance_transactions"

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("finance_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    type: Mapped[FinanceTransactionType] = mapped_column(nullable=False)
    source: Mapped[FinanceTransactionSource] = mapped_column(nullable=False)
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
