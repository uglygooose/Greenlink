from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import FinanceAccountStatus
from app.models.mixins import UUIDPrimaryKeyMixin


class FinanceAccount(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "finance_accounts"
    __table_args__ = (
        UniqueConstraint(
            "club_id",
            "account_customer_id",
            name="uq_finance_accounts_club_account_customer",
        ),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("account_customers.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[FinanceAccountStatus] = mapped_column(
        nullable=False,
        default=FinanceAccountStatus.ACTIVE,
    )
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        nullable=False,
        server_default=func.now(),
    )

    club = relationship("Club", back_populates="finance_accounts")
    account_customer = relationship("AccountCustomer", back_populates="finance_account")
    transactions = relationship("FinanceTransaction", back_populates="account")
