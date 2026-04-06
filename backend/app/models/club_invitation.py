from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum as PythonEnum

from sqlalchemy import Enum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import ClubInvitationStatus, ClubMembershipRole
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


def enum_values(enum_class: type[PythonEnum]) -> list[str]:
    return [item.value for item in enum_class]


class ClubInvitation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "club_invitations"

    club_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    membership_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("club_memberships.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    linked_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    accepted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[ClubMembershipRole] = mapped_column(
        Enum(ClubMembershipRole, values_callable=enum_values),
        nullable=False,
    )
    status: Mapped[ClubInvitationStatus] = mapped_column(
        Enum(ClubInvitationStatus, values_callable=enum_values),
        nullable=False,
        default=ClubInvitationStatus.PENDING,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    club = relationship("Club")
    person = relationship("Person")
    membership = relationship("ClubMembership")
    linked_user = relationship("User", foreign_keys=[linked_user_id])
    invited_by_user = relationship("User", foreign_keys=[invited_by_user_id])
    accepted_by_user = relationship("User", foreign_keys=[accepted_by_user_id])
