from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import UserType
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.club_membership import ClubMembership


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
    person_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("people.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )

    person = relationship("Person", back_populates="user", uselist=False)
    auth_sessions = relationship("AuthSession", back_populates="user", cascade="all, delete-orphan")

    @property
    def memberships(self) -> list[ClubMembership]:
        if self.person is None:
            return []
        return list(self.person.memberships)
