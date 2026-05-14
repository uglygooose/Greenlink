"""TeeSheetLock request/response schemas — Phase 10 / Slice 8.5.

Optimistic-lock primitive payloads. The response carries a derived
``remaining_seconds`` so the frontend selection footer can render the
countdown without computing TTL itself (backend remains the source of
truth for clock arithmetic).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.datetime import utc_now


class TeeSheetLockAcquireRequest(BaseModel):
    """POST /api/golf/tee-sheet/locks body."""

    model_config = ConfigDict(extra="forbid")

    course_id: uuid.UUID
    slot_datetime: datetime


class TeeSheetLockResponse(BaseModel):
    """Canonical lock response. ``remaining_seconds`` is computed at
    serialisation time from ``expires_at``; clients read it directly."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    course_id: uuid.UUID
    slot_datetime: datetime
    holder_user_id: uuid.UUID
    holder_display_name: str
    acquired_at: datetime
    expires_at: datetime
    remaining_seconds: int


class TeeSheetLockConflictDetail(BaseModel):
    """409 response body when acquire conflicts with an existing active
    lock. Carries the existing lock so the frontend can render
    "Slot 06:46 held by {holder} · {remaining_seconds}s remaining"."""

    existing_lock: TeeSheetLockResponse
    message: str = Field(default="Slot is currently held by another operator.")


class TeeSheetLockListResponse(BaseModel):
    """GET /api/golf/tee-sheet/locks response — active locks for a
    course on a date, ordered by slot_datetime ascending."""

    locks: list[TeeSheetLockResponse]


def remaining_seconds_for(expires_at: datetime) -> int:
    """Compute ``max(0, (expires_at - utc_now()).total_seconds())``,
    rounded down to whole seconds. Shared by route serializers so both
    acquire (returns the freshly-issued lock) and list (returns all
    active locks) produce identical counter values for the same row."""

    delta = (expires_at - utc_now()).total_seconds()
    if delta < 0:
        return 0
    return int(delta)
