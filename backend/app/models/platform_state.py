from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime


class PlatformState(Base):
    __tablename__ = "platform_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    is_initialized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    initialized_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    initialized_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"))
    initial_club_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("clubs.id"))
