from __future__ import annotations

import uuid
from typing import Protocol

from sqlalchemy.orm import Session

from app.models import DomainEventRecord


class EventPublisher(Protocol):
    def publish(
        self,
        *,
        event_type: str,
        aggregate_type: str,
        aggregate_id: str,
        payload: dict[str, object],
        correlation_id: str | None = None,
        club_id: uuid.UUID | None = None,
        actor_user_id: uuid.UUID | None = None,
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
        correlation_id: str | None = None,
        club_id: uuid.UUID | None = None,
        actor_user_id: uuid.UUID | None = None,
    ) -> None:
        self.db.add(
            DomainEventRecord(
                event_type=event_type,
                aggregate_type=aggregate_type,
                aggregate_id=aggregate_id,
                payload=payload,
                correlation_id=correlation_id,
                club_id=club_id,
                actor_user_id=actor_user_id,
            )
        )
