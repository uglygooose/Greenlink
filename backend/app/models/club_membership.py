from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.datetime import utc_now
from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import ClubMembershipRole, ClubMembershipStatus
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ClubMembership(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "club_memberships"
    __table_args__ = (
        UniqueConstraint("person_id", "club_id", name="uq_club_memberships_person_club"),
        UniqueConstraint(
            "club_id",
            "membership_number",
            name="uq_club_memberships_club_membership_number",
        ),
    )

    person_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"),
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
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, default=utc_now)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    membership_number: Mapped[str | None] = mapped_column(String(64))
    membership_metadata: Mapped[dict[str, object]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )

    person = relationship("Person", back_populates="memberships")
    club = relationship("Club", back_populates="memberships")
