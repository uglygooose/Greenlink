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
