from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.semantic.base import Metric
from app.semantic.registry import register


class MemberStatEntry(BaseModel):
    member_id: uuid.UUID
    rounds: int
    spend: Decimal
    last_played: date | None


class MemberStatsResult(BaseModel):
    members: list[MemberStatEntry]


class _MemberStatsMetric(Metric):
    def compute(
        self,
        session: Session,
        club_id: uuid.UUID,
        **params: object,
    ) -> MemberStatsResult:
        return MemberStatsResult(members=[])


member_stats = _MemberStatsMetric(
    name="member_stats",
    description=(
        "Member-level activity counts — per-member rounds played, total spend, "
        "and last-played date."
    ),
    result_schema=MemberStatsResult,
    version="0.1.0",
    owner="greenlink-core",
    dependencies=[],
)

register(member_stats)
