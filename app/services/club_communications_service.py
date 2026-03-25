from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import ClubCommunication

_ALLOWED_COMMUNICATION_KINDS = {"news", "announcement", "message"}
_ALLOWED_COMMUNICATION_AUDIENCES = {"members", "staff", "all"}
_ALLOWED_COMMUNICATION_STATUSES = {"draft", "published", "archived"}


class ClubCommunicationInput(BaseModel):
    kind: str
    audience: str = "members"
    status: str = "draft"
    title: str
    summary: str | None = None
    body: str
    cta_label: str | None = None
    cta_url: str | None = None
    pinned: bool = False
    published_at: datetime | None = None
    expires_at: datetime | None = None


def _normalize_value(raw: str | None, allowed: set[str], field_name: str) -> str:
    value = str(raw or "").strip().lower()
    if value not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")
    return value


def serialize_club_communication(row: ClubCommunication) -> dict[str, Any]:
    return {
        "id": int(getattr(row, "id", 0) or 0),
        "kind": str(getattr(row, "kind", "") or ""),
        "audience": str(getattr(row, "audience", "") or ""),
        "status": str(getattr(row, "status", "") or ""),
        "title": str(getattr(row, "title", "") or ""),
        "summary": str(getattr(row, "summary", "") or ""),
        "body": str(getattr(row, "body", "") or ""),
        "cta_label": str(getattr(row, "cta_label", "") or "").strip() or None,
        "cta_url": str(getattr(row, "cta_url", "") or "").strip() or None,
        "pinned": bool(getattr(row, "pinned", False)),
        "published_at": getattr(row, "published_at", None).isoformat() if getattr(row, "published_at", None) else None,
        "expires_at": getattr(row, "expires_at", None).isoformat() if getattr(row, "expires_at", None) else None,
        "updated_at": getattr(row, "updated_at", None).isoformat() if getattr(row, "updated_at", None) else None,
    }


def list_club_communications_payload(
    db: Session,
    *,
    club_id: int,
    kind: str = "all",
    audience: str = "all",
    status: str = "all",
    limit: int = 50,
) -> dict[str, Any]:
    q = db.query(ClubCommunication).filter(ClubCommunication.club_id == int(club_id))

    kind_value = str(kind or "").strip().lower()
    audience_value = str(audience or "").strip().lower()
    status_value = str(status or "").strip().lower()
    if kind_value and kind_value != "all":
        q = q.filter(ClubCommunication.kind == kind_value)
    if audience_value and audience_value != "all":
        q = q.filter(ClubCommunication.audience == audience_value)
    if status_value and status_value != "all":
        q = q.filter(ClubCommunication.status == status_value)

    rows = (
        q.order_by(
            ClubCommunication.pinned.desc(),
            ClubCommunication.published_at.desc(),
            ClubCommunication.created_at.desc(),
        )
        .limit(int(limit))
        .all()
    )
    return {
        "count": len(rows),
        "communications": [serialize_club_communication(row) for row in rows],
    }


def create_club_communication(
    db: Session,
    *,
    club_id: int,
    admin_user_id: int | None,
    payload: ClubCommunicationInput,
) -> dict[str, Any]:
    row = ClubCommunication(
        club_id=int(club_id),
        kind=_normalize_value(payload.kind, _ALLOWED_COMMUNICATION_KINDS, "kind"),
        audience=_normalize_value(payload.audience, _ALLOWED_COMMUNICATION_AUDIENCES, "audience"),
        status=_normalize_value(payload.status, _ALLOWED_COMMUNICATION_STATUSES, "status"),
        title=str(payload.title or "").strip(),
        summary=str(payload.summary or "").strip() or None,
        body=str(payload.body or "").strip(),
        cta_label=str(payload.cta_label or "").strip() or None,
        cta_url=str(payload.cta_url or "").strip() or None,
        pinned=bool(payload.pinned),
        created_by_user_id=int(admin_user_id) if admin_user_id else None,
        published_at=payload.published_at if str(payload.status or "").strip().lower() == "published" else None,
        expires_at=payload.expires_at,
    )
    if not row.title or not row.body:
        raise HTTPException(status_code=400, detail="title and body are required")
    if row.status == "published" and row.published_at is None:
        row.published_at = datetime.utcnow()

    db.add(row)
    db.commit()
    db.refresh(row)
    return serialize_club_communication(row)


def update_club_communication(
    db: Session,
    *,
    club_id: int,
    communication_id: int,
    payload: ClubCommunicationInput,
) -> dict[str, Any]:
    row = (
        db.query(ClubCommunication)
        .filter(ClubCommunication.id == int(communication_id), ClubCommunication.club_id == int(club_id))
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Communication not found")

    row.kind = _normalize_value(payload.kind, _ALLOWED_COMMUNICATION_KINDS, "kind")
    row.audience = _normalize_value(payload.audience, _ALLOWED_COMMUNICATION_AUDIENCES, "audience")
    row.status = _normalize_value(payload.status, _ALLOWED_COMMUNICATION_STATUSES, "status")
    row.title = str(payload.title or "").strip()
    row.summary = str(payload.summary or "").strip() or None
    row.body = str(payload.body or "").strip()
    row.cta_label = str(payload.cta_label or "").strip() or None
    row.cta_url = str(payload.cta_url or "").strip() or None
    row.pinned = bool(payload.pinned)
    row.expires_at = payload.expires_at
    if row.status == "published" and row.published_at is None:
        row.published_at = payload.published_at or datetime.utcnow()
    elif row.status != "published":
        row.published_at = payload.published_at
    if not row.title or not row.body:
        raise HTTPException(status_code=400, detail="title and body are required")

    db.commit()
    db.refresh(row)
    return serialize_club_communication(row)
