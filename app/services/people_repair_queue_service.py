from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app import models

_OPEN_STATES = ("open", "acknowledged", "in_progress", "blocked")
_PEOPLE_SURFACES = {"identity_integrity", "communications_publish", "player_profile_readiness", "booking_commit"}
_PEOPLE_DOMAINS = {"identity", "profile"}


def _json(value: str | None, fallback: Any) -> Any:
    try:
        return json.loads(value or "")
    except Exception:
        return fallback


def _clean_text(value: Any, *, max_len: int = 255) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if len(text) > max_len:
        text = text[:max_len]
    return text


def _linked_entities(row: models.OperationalException) -> tuple[dict[str, int], dict[str, Any]]:
    refs = _json(getattr(row, "linked_record_refs_json", None), [])
    details = _json(getattr(row, "details_json", None), {})
    out: dict[str, int] = {}
    if isinstance(refs, list):
        for ref in refs:
            if not isinstance(ref, dict):
                continue
            entity_type = _clean_text(ref.get("entity_type"), max_len=80)
            entity_id = ref.get("entity_id")
            try:
                entity_id_int = int(entity_id or 0)
            except Exception:
                entity_id_int = 0
            if entity_type and entity_id_int > 0 and entity_type not in out:
                out[entity_type] = entity_id_int
    if isinstance(details, dict):
        for key in ("member_id", "user_id", "booking_id", "global_person_id"):
            try:
                value = int(details.get(key) or 0)
            except Exception:
                value = 0
            if value > 0:
                out.setdefault(key.replace("_id", ""), value)
    return out, details if isinstance(details, dict) else {}


def _resolve_target(db: Session, club_id: int, row: models.OperationalException) -> dict[str, Any]:
    entities, details = _linked_entities(row)
    exception_type = str(getattr(row, "exception_type", "") or "").strip().lower()
    booking_id = int(entities.get("booking") or 0)
    member_id = int(entities.get("member") or 0)
    user_id = int(entities.get("user") or 0)
    global_person_id = int(entities.get("global_person") or 0)

    booking = None
    if booking_id > 0:
        booking = (
            db.query(models.Booking)
            .filter(models.Booking.club_id == int(club_id), models.Booking.id == booking_id)
            .first()
        )
        if booking is not None:
            member_id = member_id or int(getattr(booking, "member_id", 0) or 0)
            user_id = user_id or int(getattr(booking, "created_by_user_id", 0) or 0)
            global_person_id = global_person_id or int(getattr(booking, "global_person_id", 0) or 0)

    member = None
    if member_id > 0:
        member = (
            db.query(models.Member)
            .filter(models.Member.club_id == int(club_id), models.Member.id == member_id)
            .first()
        )
    elif global_person_id > 0:
        member = (
            db.query(models.Member)
            .filter(models.Member.club_id == int(club_id), models.Member.global_person_id == global_person_id)
            .first()
        )
        if member is not None:
            member_id = int(getattr(member, "id", 0) or 0)

    user = None
    if user_id > 0:
        user = db.query(models.User).filter(models.User.club_id == int(club_id), models.User.id == user_id).first()
    elif global_person_id > 0:
        user = db.query(models.User).filter(models.User.club_id == int(club_id), models.User.global_person_id == global_person_id).first()
        if user is not None:
            user_id = int(getattr(user, "id", 0) or 0)

    name = None
    if member is not None:
        name = _clean_text(f"{getattr(member, 'first_name', '')} {getattr(member, 'last_name', '')}".strip(), max_len=160)
    if not name and user is not None:
        name = _clean_text(getattr(user, "name", None), max_len=160)
    if not name and booking is not None:
        name = _clean_text(getattr(booking, "player_name", None), max_len=160)
    if not name:
        name = _clean_text(details.get("player_name"), max_len=160) or "Unlinked person"

    primary_ref = None
    if exception_type == "profile_readiness_unresolved" and user_id > 0:
        primary_ref = {"workspace": "players", "player_id": user_id}
    elif member_id > 0:
        primary_ref = {"workspace": "members", "member_id": member_id}
    elif user_id > 0:
        primary_ref = {"workspace": "players", "player_id": user_id}
    elif booking_id > 0:
        primary_ref = {"workspace": "golf", "panel": "tee-sheet", "booking_id": booking_id}

    return {
        "member_id": member_id or None,
        "user_id": user_id or None,
        "booking_id": booking_id or None,
        "global_person_id": global_person_id or None,
        "name": name,
        "member_number": _clean_text(getattr(member, "member_number", None), max_len=60) if member is not None else None,
        "email": _clean_text(getattr(member, "email", None), max_len=200) if member is not None else _clean_text(getattr(user, "email", None), max_len=200) if user is not None else _clean_text(details.get("player_email"), max_len=200),
        "membership_status": _clean_text(getattr(member, "membership_status", None), max_len=40) if member is not None else None,
        "primary_ref": primary_ref,
    }


def list_people_repair_queue_payload(db: Session, *, club_id: int, limit: int = 25) -> dict[str, Any]:
    rows = (
        db.query(models.OperationalException)
        .filter(
            models.OperationalException.club_id == int(club_id),
            models.OperationalException.state.in_(_OPEN_STATES),
        )
        .order_by(models.OperationalException.due_at.asc(), models.OperationalException.updated_at.desc())
        .all()
    )
    queue: list[dict[str, Any]] = []
    for row in rows:
        source_domain = str(getattr(row, "source_domain", "") or "").strip().lower()
        blocking_surface = str(getattr(row, "blocking_surface", "") or "").strip().lower()
        if source_domain not in _PEOPLE_DOMAINS and blocking_surface not in _PEOPLE_SURFACES:
            continue
        target = _resolve_target(db, int(club_id), row)
        queue.append(
            {
                "exception_id": int(getattr(row, "id", 0) or 0),
                "exception_type": str(getattr(row, "exception_type", "") or ""),
                "severity": str(getattr(row, "severity", "") or ""),
                "blocking_surface": str(getattr(row, "blocking_surface", "") or ""),
                "source_domain": str(getattr(row, "source_domain", "") or ""),
                "owner_role": str(getattr(row, "owner_role", "") or ""),
                "state": str(getattr(row, "state", "") or ""),
                "summary": str(getattr(row, "summary", "") or ""),
                "next_required_action": str(getattr(row, "next_required_action", "") or ""),
                "due_at": getattr(row, "due_at", None).isoformat() if getattr(row, "due_at", None) else None,
                "updated_at": getattr(row, "updated_at", None).isoformat() if getattr(row, "updated_at", None) else None,
                "target": target,
            }
        )
    safe_limit = max(1, min(int(limit or 25), 100))
    return {
        "total": len(queue),
        "queue": queue[:safe_limit],
    }
