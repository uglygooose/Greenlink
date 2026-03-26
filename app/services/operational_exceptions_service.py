from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app import models

_OPEN_STATES = {"open", "acknowledged", "in_progress", "blocked"}
_ALLOWED_STATES = _OPEN_STATES | {"resolved", "waived"}
_ALLOWED_SEVERITIES = {"low", "medium", "high"}


def _clean_text(value: Any, *, max_len: int = 255) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if len(text) > max_len:
        text = text[:max_len]
    return text


def _json_text(value: Any) -> str | None:
    if value in (None, "", [], {}):
        return None
    try:
        return json.dumps(value, ensure_ascii=True, separators=(",", ":"), default=str)
    except Exception:
        return None


def _normalized_state(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in _ALLOWED_STATES:
        return raw
    return "open"


def _normalized_severity(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in _ALLOWED_SEVERITIES:
        return raw
    return "medium"


def default_due_at(*, severity: str) -> datetime:
    level = _normalized_severity(severity)
    if level == "high":
        return datetime.utcnow() + timedelta(hours=4)
    if level == "low":
        return datetime.utcnow() + timedelta(days=2)
    return datetime.utcnow() + timedelta(days=1)


def upsert_operational_exception(
    db: Session,
    *,
    club_id: int,
    dedupe_key: str,
    exception_type: str,
    blocking_surface: str,
    source_domain: str,
    summary: str,
    severity: str = "medium",
    owner_role: str = "admin",
    owner_user_id: int | None = None,
    next_required_action: str | None = None,
    linked_record_refs: list[dict[str, Any]] | dict[str, Any] | None = None,
    details: dict[str, Any] | None = None,
    ai_suggestion: dict[str, Any] | None = None,
    freshness_at: datetime | None = None,
    due_at: datetime | None = None,
    audit_ref: str | None = None,
    state: str = "open",
    allow_waived: bool = False,
) -> models.OperationalException:
    safe_key = _clean_text(dedupe_key, max_len=180)
    if not safe_key:
        raise ValueError("dedupe_key is required")
    safe_summary = _clean_text(summary, max_len=255) or "Operational exception"
    safe_exception_type = _clean_text(exception_type, max_len=80) or "exception"
    safe_surface = _clean_text(blocking_surface, max_len=80) or "workflow"
    safe_domain = _clean_text(source_domain, max_len=80) or "operations"
    safe_owner_role = _clean_text(owner_role, max_len=40) or "admin"
    resolved_state = _normalized_state(state)
    if resolved_state == "waived" and not allow_waived:
        raise ValueError("waived state requires explicit waiver policy")
    resolved_severity = _normalized_severity(severity)

    row = (
        db.query(models.OperationalException)
        .filter(
            models.OperationalException.club_id == int(club_id),
            models.OperationalException.dedupe_key == safe_key,
        )
        .first()
    )
    if row is None:
        row = models.OperationalException(
            club_id=int(club_id),
            dedupe_key=safe_key,
            exception_type=safe_exception_type,
            severity=resolved_severity,
            blocking_surface=safe_surface,
            source_domain=safe_domain,
            owner_role=safe_owner_role,
            owner_user_id=int(owner_user_id) if owner_user_id else None,
            state=resolved_state,
            next_required_action=_clean_text(next_required_action, max_len=200),
            summary=safe_summary,
            linked_record_refs_json=_json_text(linked_record_refs),
            details_json=_json_text(details),
            ai_suggestion_json=_json_text(ai_suggestion),
            freshness_at=freshness_at or datetime.utcnow(),
            due_at=due_at or default_due_at(severity=resolved_severity),
            audit_ref=_clean_text(audit_ref, max_len=120),
            opened_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(row)
        db.flush()
        return row

    row.exception_type = safe_exception_type
    row.severity = resolved_severity
    row.blocking_surface = safe_surface
    row.source_domain = safe_domain
    row.owner_role = safe_owner_role
    if owner_user_id is not None:
        row.owner_user_id = int(owner_user_id)
    row.state = resolved_state
    row.next_required_action = _clean_text(next_required_action, max_len=200)
    row.summary = safe_summary
    row.linked_record_refs_json = _json_text(linked_record_refs)
    row.details_json = _json_text(details)
    row.ai_suggestion_json = _json_text(ai_suggestion)
    row.freshness_at = freshness_at or datetime.utcnow()
    row.due_at = due_at or row.due_at or default_due_at(severity=resolved_severity)
    row.audit_ref = _clean_text(audit_ref, max_len=120)
    row.updated_at = datetime.utcnow()
    if resolved_state in {"resolved", "waived"}:
        row.resolved_at = row.resolved_at or datetime.utcnow()
    else:
        row.resolved_at = None
    return row


def resolve_operational_exception(
    db: Session,
    *,
    club_id: int,
    dedupe_key: str,
    state: str = "resolved",
    audit_ref: str | None = None,
    allow_waived: bool = False,
) -> None:
    safe_key = _clean_text(dedupe_key, max_len=180)
    if not safe_key:
        return
    row = (
        db.query(models.OperationalException)
        .filter(
            models.OperationalException.club_id == int(club_id),
            models.OperationalException.dedupe_key == safe_key,
        )
        .first()
    )
    if row is None:
        return
    normalized_state = _normalized_state(state)
    if normalized_state == "waived" and not allow_waived:
        raise ValueError("waived state requires explicit waiver policy")
    row.state = normalized_state
    row.audit_ref = _clean_text(audit_ref, max_len=120) or row.audit_ref
    row.updated_at = datetime.utcnow()
    row.resolved_at = datetime.utcnow() if row.state in {"resolved", "waived"} else None


def open_exception_count(
    db: Session,
    *,
    club_id: int,
    blocking_surface: str | None = None,
) -> int:
    query = db.query(func.count(models.OperationalException.id)).filter(
        models.OperationalException.club_id == int(club_id),
        models.OperationalException.state.in_(sorted(_OPEN_STATES)),
    )
    if blocking_surface:
        query = query.filter(models.OperationalException.blocking_surface == str(blocking_surface).strip())
    return int(query.scalar() or 0)


def list_operational_exceptions_payload(
    db: Session,
    *,
    club_id: int,
    state: str = "open",
    blocking_surface: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    safe_limit = max(1, min(int(limit or 50), 200))
    query = db.query(models.OperationalException).filter(models.OperationalException.club_id == int(club_id))
    state_value = str(state or "").strip().lower()
    if state_value == "open":
        query = query.filter(models.OperationalException.state.in_(sorted(_OPEN_STATES)))
    elif state_value in _ALLOWED_STATES:
        query = query.filter(models.OperationalException.state == state_value)
    if blocking_surface:
        query = query.filter(models.OperationalException.blocking_surface == str(blocking_surface).strip())
    rows = query.order_by(
        desc(models.OperationalException.severity),
        models.OperationalException.due_at.asc(),
        models.OperationalException.updated_at.desc(),
    ).limit(safe_limit).all()
    return {
        "exceptions": [
            {
                "id": int(row.id),
                "exception_type": row.exception_type,
                "severity": row.severity,
                "blocking_surface": row.blocking_surface,
                "source_domain": row.source_domain,
                "owner_role": row.owner_role,
                "owner_user_id": row.owner_user_id,
                "state": row.state,
                "next_required_action": row.next_required_action,
                "summary": row.summary,
                "linked_record_refs": json.loads(row.linked_record_refs_json or "[]"),
                "details": json.loads(row.details_json or "{}"),
                "ai_suggestion": json.loads(row.ai_suggestion_json or "{}"),
                "freshness_at": row.freshness_at.isoformat() if row.freshness_at else None,
                "due_at": row.due_at.isoformat() if row.due_at else None,
                "audit_ref": row.audit_ref,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ]
    }
