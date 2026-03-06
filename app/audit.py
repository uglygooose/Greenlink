from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app import models
from app.observability import log_event


def _safe_payload(payload: Any) -> str | None:
    if payload is None:
        return None
    try:
        return json.dumps(payload, ensure_ascii=True, default=str, separators=(",", ":"))
    except Exception:
        return None


def record_audit_event(
    db: Session,
    action: str,
    entity_type: str,
    *,
    actor_user_id: int | None = None,
    entity_id: str | int | None = None,
    payload: dict[str, Any] | None = None,
    request_id: str | None = None,
    club_id: int | None = None,
) -> None:
    """
    Non-blocking audit writer. Any failures are logged but never raised.
    """
    try:
        resolved_club_id = club_id
        if resolved_club_id is None:
            resolved_club_id = getattr(getattr(db, "info", {}), "get", lambda _k, _d=None: None)("club_id")
        if resolved_club_id is not None:
            try:
                resolved_club_id = int(resolved_club_id)
            except Exception:
                resolved_club_id = None

        row = models.AuditLog(
            club_id=resolved_club_id,
            actor_user_id=int(actor_user_id) if actor_user_id is not None else None,
            action=str(action or "").strip()[:120] or "unknown",
            entity_type=str(entity_type or "").strip()[:80] or "unknown",
            entity_id=(str(entity_id).strip()[:120] if entity_id is not None else None),
            request_id=(str(request_id or "").strip()[:64] or None),
            payload_json=_safe_payload(payload),
            created_at=datetime.utcnow(),
        )
        db.add(row)
    except Exception as exc:
        log_event(
            "warning",
            "audit.write_failed",
            error_type=type(exc).__name__,
            error=str(exc)[:200],
            action=action,
            entity_type=entity_type,
        )
