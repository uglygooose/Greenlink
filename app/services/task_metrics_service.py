from __future__ import annotations

import json
from datetime import datetime, timedelta
from time import perf_counter
from typing import Any

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app import models


def measure_started() -> float:
    return perf_counter()


def elapsed_ms(started_at: float) -> int:
    return max(0, int((perf_counter() - float(started_at)) * 1000))


def record_task_timing(
    db: Session,
    *,
    task_key: str,
    duration_ms: int,
    club_id: int | None = None,
    status: str = "success",
    actor_role: str | None = None,
    actor_user_id: int | None = None,
    request_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> models.TaskTimingEvent:
    row = models.TaskTimingEvent(
        club_id=int(club_id) if club_id else None,
        task_key=str(task_key or "").strip() or "task",
        status=str(status or "").strip().lower() or "success",
        duration_ms=max(0, int(duration_ms or 0)),
        actor_role=str(actor_role or "").strip() or None,
        actor_user_id=int(actor_user_id) if actor_user_id else None,
        request_id=str(request_id or "").strip() or None,
        meta_json=(json.dumps(meta, ensure_ascii=True, separators=(",", ":"), default=str) if meta else None),
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row


def get_task_timing_summary_payload(
    db: Session,
    *,
    club_id: int,
    lookback_days: int = 14,
) -> dict[str, Any]:
    safe_days = max(1, min(int(lookback_days or 14), 60))
    cutoff = datetime.utcnow() - timedelta(days=safe_days)
    rows = (
        db.query(
            models.TaskTimingEvent.task_key,
            func.count(models.TaskTimingEvent.id).label("samples"),
            func.avg(models.TaskTimingEvent.duration_ms).label("avg_ms"),
            func.max(models.TaskTimingEvent.duration_ms).label("max_ms"),
        )
        .filter(
            models.TaskTimingEvent.club_id == int(club_id),
            models.TaskTimingEvent.created_at >= cutoff,
        )
        .group_by(models.TaskTimingEvent.task_key)
        .order_by(desc(func.count(models.TaskTimingEvent.id)))
        .all()
    )
    return {
        "lookback_days": safe_days,
        "metrics": [
            {
                "task_key": str(task_key or ""),
                "samples": int(samples or 0),
                "avg_ms": int(avg_ms or 0),
                "max_ms": int(max_ms or 0),
            }
            for task_key, samples, avg_ms, max_ms in rows
        ],
    }
