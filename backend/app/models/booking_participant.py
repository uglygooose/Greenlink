from __future__ import annotations

import uuid

from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import BookingParticipantType
from app.models.enum_utils import enum_values
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class BookingParticipant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "booking_participants"
    __table_args__ = (CheckConstraint("sort_order >= 0", name="ck_booking_participants_sort_order_non_negative"),)

    booking_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"),
        nullable=False,
    )
    person_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("people.id", ondelete="SET NULL"))
    club_membership_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("club_memberships.id", ondelete="SET NULL")
    )
    participant_type: Mapped[BookingParticipantType] = mapped_column(
        Enum(BookingParticipantType, values_callable=enum_values),
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    guest_name: Mapped[str | None] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    booking = relationship("Booking", back_populates="participants")
