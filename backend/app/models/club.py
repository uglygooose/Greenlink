from __future__ import annotations

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ClubOnboardingState, ClubOnboardingStep
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Club(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "clubs"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    location: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Africa/Johannesburg")
    onboarding_state: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=ClubOnboardingState.ONBOARDING_STARTED.value,
    )
    onboarding_current_step: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=ClubOnboardingStep.BASIC_INFO.value,
    )
    logo_object_key: Mapped[str | None] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    memberships = relationship(
        "ClubMembership",
        back_populates="club",
        cascade="all, delete-orphan",
    )
    account_customers = relationship(
        "AccountCustomer",
        back_populates="club",
        cascade="all, delete-orphan",
    )
    finance_accounts = relationship(
        "FinanceAccount",
        back_populates="club",
        cascade="all, delete-orphan",
    )
    settings = relationship("ClubSetting", back_populates="club", cascade="all, delete-orphan")
    modules = relationship("ClubModule", back_populates="club", cascade="all, delete-orphan")
