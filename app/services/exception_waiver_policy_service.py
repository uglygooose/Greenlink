from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.services.operational_exceptions_service import resolve_operational_exception

_WAIVER_POLICY_VERSION = "2026-03-26"
_ALLOWED_WAIVER_TYPES: frozenset[str] = frozenset()
_ALLOWED_WAIVER_SURFACES: frozenset[str] = frozenset()


def get_exception_waiver_policy_payload() -> dict[str, Any]:
    return {
        "enabled": False,
        "policy_version": _WAIVER_POLICY_VERSION,
        "allowed_exception_types": sorted(_ALLOWED_WAIVER_TYPES),
        "allowed_blocking_surfaces": sorted(_ALLOWED_WAIVER_SURFACES),
        "rule": "No operational exception waivers are currently permitted. Resolve through the owning workflow instead.",
    }


def ensure_exception_waiver_allowed(row: models.OperationalException | None, *, reason: str | None = None) -> None:
    if row is None:
        raise HTTPException(status_code=404, detail="Operational exception not found")
    reason_text = str(reason or "").strip()
    if not reason_text:
        raise HTTPException(status_code=400, detail="Waiver reason is required")

    exception_type = str(getattr(row, "exception_type", "") or "").strip().lower()
    blocking_surface = str(getattr(row, "blocking_surface", "") or "").strip().lower()
    if exception_type in _ALLOWED_WAIVER_TYPES and blocking_surface in _ALLOWED_WAIVER_SURFACES:
        return
    raise HTTPException(
        status_code=409,
        detail="Waivers are not allowed for current identity, communication, booking, or revenue integrity exceptions.",
    )


def waive_operational_exception(
    db: Session,
    *,
    club_id: int,
    exception_id: int,
    reason: str,
    actor_user_id: int | None = None,
    audit_ref: str | None = None,
) -> dict[str, Any]:
    row = (
        db.query(models.OperationalException)
        .filter(
            models.OperationalException.club_id == int(club_id),
            models.OperationalException.id == int(exception_id),
        )
        .first()
    )
    ensure_exception_waiver_allowed(row, reason=reason)
    resolve_operational_exception(
        db,
        club_id=int(club_id),
        dedupe_key=str(getattr(row, "dedupe_key", "") or ""),
        state="waived",
        audit_ref=str(audit_ref or f"waiver:{int(actor_user_id or 0) or 'system'}"),
        allow_waived=True,
    )
    return {
        "status": "success",
        "exception_id": int(getattr(row, "id", 0) or 0),
        "state": "waived",
    }
