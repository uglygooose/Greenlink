from __future__ import annotations

import uuid
from typing import Protocol

from sqlalchemy.orm import Session

from app.events.emission_context import EmissionContext
from app.models import DomainEventRecord


class EventPublisher(Protocol):
    def publish(
        self,
        *,
        event_type: str,
        aggregate_type: str,
        aggregate_id: str,
        payload: dict[str, object],
        context: EmissionContext | None = None,
        club_id: uuid.UUID | None = None,
        actor_person_id: uuid.UUID | None = None,
        before: dict[str, object] | None = None,
        after: dict[str, object] | None = None,
    ) -> None: ...


class DatabaseEventPublisher:
    def __init__(self, db: Session) -> None:
        self.db = db

    def publish(
        self,
        *,
        event_type: str,
        aggregate_type: str,
        aggregate_id: str,
        payload: dict[str, object],
        context: EmissionContext | None = None,
        club_id: uuid.UUID | None = None,
        actor_person_id: uuid.UUID | None = None,
        before: dict[str, object] | None = None,
        after: dict[str, object] | None = None,
    ) -> None:
        ctx = context or EmissionContext()
        enriched: dict[str, object] = {**payload}
        enriched.setdefault("source_channel", ctx.source_channel)
        if actor_person_id is not None:
            enriched.setdefault("actor_person_id", str(actor_person_id))
        if before is not None:
            enriched.setdefault("before", before)
        if after is not None:
            enriched.setdefault("after", after)
        self.db.add(
            DomainEventRecord(
                event_type=event_type,
                aggregate_type=aggregate_type,
                aggregate_id=aggregate_id,
                payload=enriched,
                correlation_id=ctx.correlation_id,
                club_id=club_id,
                actor_user_id=ctx.actor_user_id,
            )
        )
