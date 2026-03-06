from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db
from app.club_config import club_config_response
from app.models import Club, User
from app.platform_bootstrap import get_platform_state_payload
from app.tenancy import get_active_club_id

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/platform-state")
def get_platform_state(
    request: Request,
    db: Session = Depends(get_db),
):
    runtime = getattr(request.app.state, "startup_diagnostics", {}) or {}
    return get_platform_state_payload(db, runtime=runtime)


@router.get("/club")
def get_club_profile(
    club_id: int | None = Query(None),
    club_slug: str | None = Query(None),
    response: Response = None,
    db: Session = Depends(get_db),
):
    """
    Unauthenticated, read-only metadata for branding + label mapping.

    If multiple clubs exist, callers should provide `club_id` or `club_slug`.
    """
    resolved_id: int | None = None
    if club_id and club_id > 0:
        resolved_id = int(club_id)
    elif club_slug:
        normalized_slug = str(club_slug or "").strip().lower()
        row = db.query(Club).filter(func.lower(Club.slug) == normalized_slug, Club.active == 1).first()
        if row:
            resolved_id = int(row.id)

    if resolved_id is None:
        clubs = db.query(Club).filter(Club.active == 1).order_by(Club.id.asc()).all()
        if len(clubs) == 1:
            resolved_id = int(clubs[0].id)
        elif len(clubs) == 0:
            # Fresh DB: return defaults (no club-specific settings).
            return club_config_response(db, club_id=None)
        else:
            raise HTTPException(status_code=400, detail="club_id or club_slug is required")

    payload = club_config_response(db, club_id=resolved_id)
    if response is not None:
        response.headers.setdefault("Cache-Control", "public, max-age=60")
    return payload


@router.get("/club/me")
def get_my_club_profile(
    club_id: int | None = Query(None),
    x_club_id: str | None = Header(None, alias="X-Club-Id"),
    response: Response = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Authenticated club config.

    - Regular users: resolves from `current_user.club_id` (rejects overrides).
    - Super admins: resolves from `club_id` query param or `X-Club-Id` header (or
      auto-selects the only active club if there is exactly one).
    """
    resolved = get_active_club_id(db=db, current_user=current_user, club_id=club_id, x_club_id=x_club_id)
    payload = club_config_response(db, club_id=int(resolved))
    if response is not None:
        response.headers.setdefault("Cache-Control", "private, max-age=60")
    return payload
