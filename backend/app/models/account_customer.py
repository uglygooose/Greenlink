from __future__ import annotations

import uuid

from sqlalchemy import JSON, Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class AccountCustomer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "account_customers"
    __table_args__ = (
        UniqueConstraint("club_id", "account_code", name="uq_account_customers_club_account_code"),
        UniqueConstraint("club_id", "person_id", name="uq_account_customers_club_person"),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_code: Mapped[str] = mapped_column(String(64), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    billing_email: Mapped[str | None] = mapped_column(String(255))
    billing_phone: Mapped[str | None] = mapped_column(String(64))
    billing_metadata: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)

    club = relationship("Club", back_populates="account_customers")
    person = relationship("Person", back_populates="account_customers")
