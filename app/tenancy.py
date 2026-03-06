from __future__ import annotations

from fastapi import Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db
from app.club_assignments import ensure_user_primary_club
from app.models import Club, User, UserRole


def is_super_admin(user: User | None) -> bool:
    return bool(user) and getattr(user, "role", None) == UserRole.super_admin


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    if not is_super_admin(current_user):
        raise HTTPException(status_code=403, detail="Super admin access required")
    return current_user


def require_admin_like(current_user: User = Depends(get_current_user)) -> User:
    """
    Treat super_admin as an admin for permission checks.
    """
    if getattr(current_user, "role", None) not in {UserRole.super_admin, UserRole.admin}:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_staff_like(current_user: User = Depends(get_current_user)) -> User:
    """
    Treat super_admin as staff for operational endpoints.
    """
    if getattr(current_user, "role", None) not in {UserRole.super_admin, UserRole.admin, UserRole.club_staff}:
        raise HTTPException(status_code=403, detail="Staff access required")
    return current_user


def _parse_club_id(raw: str | None) -> int | None:
    if raw is None:
        return None
    try:
        v = int(str(raw).strip())
    except Exception:
        return None
    return v if v > 0 else None


def get_active_club_id(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    club_id: int | None = Query(None),
    x_club_id: str | None = Header(None, alias="X-Club-Id"),
) -> int:
    """
    Resolve the active club context for this request.

    - Regular staff/admin users: always use their resolved primary club assignment (and reject overrides).
    - Super admins: must specify a club via `club_id` query param or `X-Club-Id` header.
    """
    override = club_id or _parse_club_id(x_club_id)

    if is_super_admin(current_user):
        if not override:
            clubs = db.query(Club).filter(Club.active == 1).order_by(Club.id.asc()).all()
            if len(clubs) == 1:
                override = int(clubs[0].id)
            else:
                raise HTTPException(status_code=400, detail="club_id is required for super admins")
        club = db.query(Club).filter(Club.id == int(override), Club.active == 1).first()
        if not club:
            raise HTTPException(status_code=404, detail="Club not found")
        resolved = int(club.id)
        db.info["club_id"] = resolved
        return resolved

    user_club_id = ensure_user_primary_club(db, current_user)
    if not user_club_id:
        raise HTTPException(status_code=400, detail="User is not assigned to a club")
    if override and int(override) != int(user_club_id):
        raise HTTPException(status_code=403, detail="Cannot access another club")
    club = db.query(Club).filter(Club.id == int(user_club_id), Club.active == 1).first()
    if not club:
        raise HTTPException(status_code=403, detail="Assigned club is inactive or missing")
    resolved = int(user_club_id)
    db.info["club_id"] = resolved
    return resolved
