from __future__ import annotations

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import UserType
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    user_type: Mapped[UserType] = mapped_column(
        Enum(UserType),
        nullable=False,
        default=UserType.USER,
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    memberships = relationship(
        "ClubMembership",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    auth_sessions = relationship("AuthSession", back_populates="user", cascade="all, delete-orphan")
