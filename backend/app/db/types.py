from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator

from app.core.datetime import ensure_utc


class UTCDateTime(TypeDecorator[datetime]):
    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:  # type: ignore[override]
        return ensure_utc(value)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:  # type: ignore[override]
        return ensure_utc(value)
