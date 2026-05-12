"""Window-resolution helper for semantic-layer metrics.

Mirrors the FinanceReadModelService.SummaryWindow pattern but tighter:
each metric accepts a (date_from, date_to) pair via params, and this helper
converts those local-date bounds to UTC instants in the club's timezone.
Local dates are inclusive on the lower bound, exclusive on the upper bound.

If date_from / date_to are omitted, the window defaults to "today" in the
club's timezone — matches what the 9F sentinel exercises (empty club →
zero).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Club


@dataclass(frozen=True, slots=True)
class MetricWindow:
    club_id: uuid.UUID
    timezone_name: str
    date_from: date
    date_to: date
    start_utc: datetime
    end_utc: datetime


def resolve_window(
    session: Session,
    *,
    club_id: uuid.UUID,
    date_from: date | None,
    date_to: date | None,
) -> MetricWindow:
    club = session.scalar(select(Club).where(Club.id == club_id))
    if club is None:
        raise ValueError(f"Club {club_id!r} not found")
    zone = ZoneInfo(club.timezone)
    today_local = datetime.now(zone).date()
    resolved_from = date_from or today_local
    resolved_to = date_to or (resolved_from + timedelta(days=1))
    if resolved_to <= resolved_from:
        raise ValueError("date_to must be strictly after date_from")
    start_utc = datetime.combine(resolved_from, datetime.min.time(), tzinfo=zone).astimezone(UTC)
    end_utc = datetime.combine(resolved_to, datetime.min.time(), tzinfo=zone).astimezone(UTC)
    return MetricWindow(
        club_id=club_id,
        timezone_name=club.timezone,
        date_from=resolved_from,
        date_to=resolved_to,
        start_utc=start_utc,
        end_utc=end_utc,
    )
