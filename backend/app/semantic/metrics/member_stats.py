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
        """Per-member activity for every member of the club.

        Delegates to ``PeopleReadModelService.list_member_activity`` and
        maps each entry to the ``MemberStatEntry`` shape. The service does
        the SQL; this stub keeps the registry contract intact (single
        ``list[MemberStatEntry]`` payload, no window arguments surfaced
        through the metric API).
        """
        from app.services.people_read_model_service import PeopleReadModelService

        service = PeopleReadModelService(session)
        entries = service.list_member_activity(club_id=club_id)
        return MemberStatsResult(
            members=[
                MemberStatEntry(
                    member_id=entry.person_id,
                    rounds=entry.rounds,
                    spend=entry.spend,
                    last_played=entry.last_played,
                )
                for entry in entries
            ]
        )


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
