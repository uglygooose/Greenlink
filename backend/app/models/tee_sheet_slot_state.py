from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enum_utils import enum_values
from app.models.enums import StartLane
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class TeeSheetSlotState(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tee_sheet_slot_states"
    __table_args__ = (
        UniqueConstraint(
            "course_id", "tee_id", "start_lane", "slot_datetime",
            name="uq_tee_sheet_slot_states_scope_slot",
        ),
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
    start_lane: Mapped[StartLane | None] = mapped_column(
        Enum(StartLane, values_callable=enum_values),
        nullable=True,
    )
    slot_datetime: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)
    player_capacity: Mapped[int | None] = mapped_column(Integer)
    occupied_player_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reserved_player_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    confirmed_booking_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reserved_booking_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    member_count: Mapped[int | None] = mapped_column(Integer)
    guest_count: Mapped[int | None] = mapped_column(Integer)
    staff_count: Mapped[int | None] = mapped_column(Integer)
    manually_blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reserved_state_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    competition_controlled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    event_controlled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    externally_unavailable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    blocked_reason: Mapped[str | None] = mapped_column(String(255))
