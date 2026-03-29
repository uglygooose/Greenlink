from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ClubMembershipRole, ClubMembershipStatus
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ClubMembership(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "club_memberships"
    __table_args__ = (UniqueConstraint("user_id", "club_id", name="uq_club_memberships_user_club"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[ClubMembershipRole] = mapped_column(Enum(ClubMembershipRole), nullable=False)
    status: Mapped[ClubMembershipStatus] = mapped_column(
        Enum(ClubMembershipStatus), nullable=False, default=ClubMembershipStatus.ACTIVE
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    user = relationship("User", back_populates="memberships")
    club = relationship("Club", back_populates="memberships")
