from __future__ import annotations

from datetime import date

from sqlalchemy import JSON, Date, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Person(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "people"

    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    last_name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    normalized_email: Mapped[str | None] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(64), index=True)
    normalized_phone: Mapped[str | None] = mapped_column(String(64), index=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(String(64))
    external_ref: Mapped[str | None] = mapped_column(String(120), index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    profile_metadata: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)

    user = relationship("User", back_populates="person", uselist=False)
    memberships = relationship(
        "ClubMembership",
        back_populates="person",
        cascade="all, delete-orphan",
    )
    account_customers = relationship(
        "AccountCustomer",
        back_populates="person",
        cascade="all, delete-orphan",
    )
