from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import BlastChannel, BlastStatus, BlastTargetSegment


class BlastAuthorResponse(BaseModel):
    person_id: uuid.UUID
    full_name: str

    model_config = {"from_attributes": True}


class BlastResponse(BaseModel):
    id: uuid.UUID
    club_id: uuid.UUID
    subject: str
    body: str
    target_segment: BlastTargetSegment
    channel: BlastChannel
    status: BlastStatus
    scheduled_at: datetime | None
    sent_at: datetime | None
    recipient_count: int | None
    delivery_note: str | None
    created_at: datetime
    updated_at: datetime
    created_by: BlastAuthorResponse | None

    model_config = {"from_attributes": True}


class BlastListResponse(BaseModel):
    blasts: list[BlastResponse]
    total_count: int


class BlastCreateRequest(BaseModel):
    subject: str
    body: str
    target_segment: BlastTargetSegment = BlastTargetSegment.ALL
    channel: BlastChannel = BlastChannel.IN_APP


class BlastSendResponse(BaseModel):
    id: uuid.UUID
    status: BlastStatus
    recipient_count: int
    delivery_note: str


# ---------- Phase 9E WI-12 — blast read-model schemas --------------------


class BlastSummaryResponse(BaseModel):
    """Club-wide rollup of blast activity over an optional window.

    ``average_target_size`` averages ``recipient_count`` across SENT blasts
    only (drafts have no recipient count yet). ``last_sent_at`` is the most
    recent ``sent_at`` across any blast in the window. Delivery / open /
    bounce metrics are intentionally absent; the model does not yet track
    them.
    """

    club_id: uuid.UUID
    window_start: datetime | None
    window_end: datetime | None
    total_blasts: int
    blasts_drafted: int
    blasts_sent: int
    blasts_failed: int
    average_target_size: int
    last_sent_at: datetime | None


class BlastListItemResponse(BaseModel):
    """Single-blast row for the history surface (Phase 11 surface 8).

    ``recipient_count`` is the realised count populated at send time; it is
    ``None`` for blasts still in DRAFT. The pre-send "target size" derived
    from the active membership segment is not surfaced here — a future
    phase exposes the segment-resolver count for drafts.
    """

    blast_id: uuid.UUID
    subject: str
    status: BlastStatus
    recipient_count: int | None
    sent_at: datetime | None
    created_at: datetime
    created_by_person_id: uuid.UUID | None
