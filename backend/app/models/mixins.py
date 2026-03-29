from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime import utc_now
from app.db.types import UTCDateTime


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        server_default=func.now(),
        onupdate=utc_now,
    )
