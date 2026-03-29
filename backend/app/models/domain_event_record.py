from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.mixins import UUIDPrimaryKeyMixin


class DomainEventRecord(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "domain_event_records"

    event_type: Mapped[str] = mapped_column(String(120), nullable=False)
    aggregate_type: Mapped[str] = mapped_column(String(120), nullable=False)
    aggregate_id: Mapped[str] = mapped_column(String(120), nullable=False)
    club_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("clubs.id"))
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"))
    correlation_id: Mapped[str | None] = mapped_column(String(120))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    published_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        server_default=func.now(),
    )
