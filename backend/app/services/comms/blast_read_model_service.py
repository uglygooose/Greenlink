"""Blast read model.

Methods accept ``(session, club_id, …)`` plus an optional :class:`TimeWindow`
and return Pydantic response models from ``app.schemas.blasts``.

Two read methods, both tenant-scoped:

* :meth:`summary` — club-wide rollup over the window: totals by
  lifecycle state (draft / sent / failed), average target size on
  sent blasts, last-sent timestamp.
* :meth:`list_recent` — per-blast history view, ordered newest first,
  bounded by ``limit``.

Aggregations are SQL-pushdown — one round-trip per method. Delivery /
open / bounce metrics are not yet surfaced because the
:class:`CommunicationBlast` model does not yet track them; the comms
broader scope (v1.5+) adds them once a transactional provider lands.
"""

from __future__ import annotations

import uuid

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.communication_blast import CommunicationBlast
from app.models.enums import BlastStatus
from app.schemas.blasts import BlastListItemResponse, BlastSummaryResponse
from app.services._window import TimeWindow


class BlastReadModelService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def summary(
        self,
        *,
        club_id: uuid.UUID,
        window: TimeWindow | None = None,
    ) -> BlastSummaryResponse:
        sent_case = case((CommunicationBlast.status == BlastStatus.SENT, 1), else_=0)
        drafted_case = case((CommunicationBlast.status == BlastStatus.DRAFT, 1), else_=0)
        failed_case = case((CommunicationBlast.status == BlastStatus.FAILED, 1), else_=0)
        sent_recipient_case = case(
            (
                CommunicationBlast.status == BlastStatus.SENT,
                CommunicationBlast.recipient_count,
            ),
            else_=None,
        )

        stmt = select(
            func.count().label("total"),
            func.coalesce(func.sum(drafted_case), 0).label("drafted"),
            func.coalesce(func.sum(sent_case), 0).label("sent"),
            func.coalesce(func.sum(failed_case), 0).label("failed"),
            func.avg(sent_recipient_case).label("avg_recipient_count"),
            func.max(CommunicationBlast.sent_at).label("last_sent_at"),
        ).where(CommunicationBlast.club_id == club_id)
        if window is not None:
            stmt = stmt.where(
                CommunicationBlast.created_at >= window.start_utc,
                CommunicationBlast.created_at < window.end_utc,
            )

        row = self.db.execute(stmt).one()
        avg_int = int(row.avg_recipient_count) if row.avg_recipient_count is not None else 0
        return BlastSummaryResponse(
            club_id=club_id,
            window_start=window.start_utc if window is not None else None,
            window_end=window.end_utc if window is not None else None,
            total_blasts=int(row.total or 0),
            blasts_drafted=int(row.drafted or 0),
            blasts_sent=int(row.sent or 0),
            blasts_failed=int(row.failed or 0),
            average_target_size=avg_int,
            last_sent_at=row.last_sent_at,
        )

    def list_recent(
        self,
        *,
        club_id: uuid.UUID,
        window: TimeWindow | None = None,
        limit: int = 20,
    ) -> list[BlastListItemResponse]:
        stmt = (
            select(CommunicationBlast)
            .where(CommunicationBlast.club_id == club_id)
            .order_by(CommunicationBlast.created_at.desc())
            .limit(limit)
        )
        if window is not None:
            stmt = stmt.where(
                CommunicationBlast.created_at >= window.start_utc,
                CommunicationBlast.created_at < window.end_utc,
            )
        rows = list(self.db.scalars(stmt).all())
        return [
            BlastListItemResponse(
                blast_id=row.id,
                subject=row.subject,
                status=row.status,
                recipient_count=row.recipient_count,
                sent_at=row.sent_at,
                created_at=row.created_at,
                created_by_person_id=row.created_by_person_id,
            )
            for row in rows
        ]
