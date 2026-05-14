"""TeeSheetLock — Phase 10 / Slice 8.5 optimistic-lock primitive.

Slot-level advisory locks for tee-sheet UI coordination. One lock per
(course_id, slot_datetime) enforced by the database unique constraint.
TTL is 60 seconds (TeeSheetLockService.TTL_SECONDS). Locks expire by
filtering on expires_at at read time and are deleted on demand when a
new acquire on the same slot finds an expired row (Approach A: clean
audit trail — the expired lock's release is its own event).

Locks are ADVISORY — booking endpoints do not consult them. They are
purely a UI-coordination signal so operators can see when another
operator is editing a slot. Two operators dropping different parties on
the same slot still both fire POST /api/golf/bookings; the second is
rejected by the existing capacity check (Slice 8A's documented v1
concurrency gap).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class TeeSheetLock(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tee_sheet_locks"
    __table_args__ = (
        UniqueConstraint(
            "course_id",
            "slot_datetime",
            name="uq_tee_sheet_locks_course_slot",
        ),
        Index(
            "ix_tee_sheet_locks_course_slot_expires",
            "course_id",
            "slot_datetime",
            "expires_at",
        ),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slot_datetime: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        nullable=False,
    )
    holder_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        nullable=False,
    )
