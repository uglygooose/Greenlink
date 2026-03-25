from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from app.models import AuditLog, User


def get_audit_logs_payload(
    db: Session,
    *,
    skip: int = 0,
    limit: int = 100,
    action: str | None = None,
    entity_type: str | None = None,
    actor_user_id: int | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    q: str | None = None,
) -> dict[str, Any]:
    query = db.query(AuditLog)
    if action:
        query = query.filter(func.lower(AuditLog.action) == str(action).strip().lower())
    if entity_type:
        query = query.filter(func.lower(AuditLog.entity_type) == str(entity_type).strip().lower())
    if actor_user_id is not None and int(actor_user_id) > 0:
        query = query.filter(AuditLog.actor_user_id == int(actor_user_id))
    if start is not None:
        query = query.filter(AuditLog.created_at >= start)
    if end is not None:
        query = query.filter(AuditLog.created_at < end)
    if q:
        needle = str(q).strip().lower()
        like = f"%{needle}%"
        query = query.filter(
            or_(
                func.lower(AuditLog.entity_id).like(like),
                func.lower(AuditLog.request_id).like(like),
                func.lower(AuditLog.payload_json).like(like),
            )
        )

    total = query.count()
    rows = query.order_by(desc(AuditLog.created_at), desc(AuditLog.id)).offset(skip).limit(limit).all()

    actor_ids = {
        int(getattr(row, "actor_user_id", 0) or 0)
        for row in rows
        if getattr(row, "actor_user_id", None) is not None
    }
    actor_names: dict[int, str] = {}
    if actor_ids:
        for user in db.query(User).filter(User.id.in_(list(actor_ids))).all():
            actor_names[int(user.id)] = str(getattr(user, "name", "") or "").strip() or str(getattr(user, "email", "") or "")

    items = []
    for row in rows:
        actor_id_raw = getattr(row, "actor_user_id", None)
        actor_id = int(actor_id_raw) if actor_id_raw is not None else None
        items.append(
            {
                "id": int(getattr(row, "id", 0) or 0),
                "club_id": int(getattr(row, "club_id", 0) or 0) if getattr(row, "club_id", None) is not None else None,
                "actor_user_id": actor_id,
                "actor_name": actor_names.get(actor_id or 0) if actor_id is not None else None,
                "action": str(getattr(row, "action", "") or ""),
                "entity_type": str(getattr(row, "entity_type", "") or ""),
                "entity_id": str(getattr(row, "entity_id", "") or "") or None,
                "request_id": str(getattr(row, "request_id", "") or "") or None,
                "payload_json": str(getattr(row, "payload_json", "") or "") or None,
                "created_at": getattr(row, "created_at", None).isoformat() if getattr(row, "created_at", None) else None,
            }
        )

    return {"total": int(total or 0), "items": items}
