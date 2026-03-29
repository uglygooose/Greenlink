from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import BookingSource, BookingStatus
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Booking(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint("party_size > 0", name="ck_bookings_party_size_positive"),
        CheckConstraint("slot_interval_minutes > 0", name="ck_bookings_slot_interval_positive"),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
    )
    tee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tees.id", ondelete="CASCADE"))
    slot_datetime: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)
    slot_interval_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[BookingStatus] = mapped_column(Enum(BookingStatus), nullable=False)
    source: Mapped[BookingSource] = mapped_column(
        Enum(BookingSource),
        nullable=False,
        default=BookingSource.ADMIN,
    )
    party_size: Mapped[int] = mapped_column(Integer, nullable=False)
    primary_person_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("people.id", ondelete="SET NULL"))
    primary_membership_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("club_memberships.id", ondelete="SET NULL")
    )

    participants = relationship(
        "BookingParticipant",
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="BookingParticipant.sort_order",
    )
