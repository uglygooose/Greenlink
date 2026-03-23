from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.club_assignments import ensure_user_primary_club
from app.club_config import club_config_response, get_club_settings_map
from app.models import Club, User, UserRole

ROLE_SHELL_SUPER_ADMIN = "super_admin"
ROLE_SHELL_CLUB_ADMIN = "club_admin"
ROLE_SHELL_STAFF = "staff"
ROLE_SHELL_MEMBER = "member"

_TRUTHY_VALUES = {"1", "true", "yes", "y", "on"}
_SUPER_ADMIN_NAV = [
    {"workspace": "overview", "label": "Overview"},
    {"workspace": "clubs", "label": "Clubs"},
    {"workspace": "onboarding", "label": "Onboarding"},
    {"workspace": "demo", "label": "Demo Environment"},
    {"workspace": "users", "label": "Users & Roles"},
    {"workspace": "settings", "label": "Platform Settings"},
]
_CLUB_ADMIN_NAV = [
    {"workspace": "overview", "label": "Club Overview"},
    {"workspace": "golf", "label": "Golf"},
    {"workspace": "operations", "label": "Operations"},
    {"workspace": "members", "label": "People & Clubs"},
    {"workspace": "communications", "label": "Communications"},
    {"workspace": "reports", "label": "Revenue & Finance"},
    {"workspace": "settings", "label": "Club Setup"},
]
_STAFF_NAV = [
    {"workspace": "today", "label": "Today"},
    {"workspace": "golf", "label": "Golf"},
    {"workspace": "operations", "label": "Operations"},
    {"workspace": "members", "label": "Members"},
    {"workspace": "communications", "label": "Communications"},
]
_MEMBER_NAV = [
    {"workspace": "home", "label": "Home"},
    {"workspace": "bookings", "label": "My Bookings"},
    {"workspace": "news", "label": "Club News"},
    {"workspace": "messages", "label": "Messages"},
    {"workspace": "profile", "label": "Profile"},
]
_DEFAULT_WORKSPACE = {
    ROLE_SHELL_SUPER_ADMIN: "overview",
    ROLE_SHELL_CLUB_ADMIN: "overview",
    ROLE_SHELL_STAFF: "today",
    ROLE_SHELL_MEMBER: "home",
}
_NAV_BY_SHELL = {
    ROLE_SHELL_SUPER_ADMIN: _SUPER_ADMIN_NAV,
    ROLE_SHELL_CLUB_ADMIN: _CLUB_ADMIN_NAV,
    ROLE_SHELL_STAFF: _STAFF_NAV,
    ROLE_SHELL_MEMBER: _MEMBER_NAV,
}


def _role_value(raw: Any) -> str:
    return str(getattr(raw, "value", raw) or "").strip().lower()


def role_shell_for_user(user: User) -> str:
    role = _role_value(getattr(user, "role", None))
    if role == UserRole.super_admin.value:
        return ROLE_SHELL_SUPER_ADMIN
    if role == UserRole.admin.value:
        return ROLE_SHELL_CLUB_ADMIN
    if role == UserRole.club_staff.value:
        return ROLE_SHELL_STAFF
    return ROLE_SHELL_MEMBER


def _landing_path_for_shell(shell: str, workspace: str) -> str:
    if shell == ROLE_SHELL_MEMBER:
        return f"/frontend/dashboard.html?view={workspace}"
    return f"/frontend/admin.html?workspace={workspace}"


def _club_status(settings: dict[str, str], club: Club) -> str:
    explicit = str(settings.get("club_status") or "").strip().lower()
    if explicit in {"draft", "onboarding", "live", "inactive", "demo"}:
        return explicit
    if str(settings.get("club_is_demo") or "").strip().lower() in _TRUTHY_VALUES:
        return "demo"
    if "demo" in str(getattr(club, "slug", "") or "").strip().lower():
        return "demo"
    if int(getattr(club, "active", 0) or 0) != 1:
        return "inactive"
    return "live"


def _club_context_payload(db: Session, club_id: int) -> dict[str, Any]:
    club = db.query(Club).filter(Club.id == int(club_id), Club.active == 1).first()
    if club is None:
        raise HTTPException(status_code=404, detail="Club not found")

    profile = club_config_response(db, club_id=int(club_id))
    settings = get_club_settings_map(db, int(club_id))
    status = _club_status(settings, club)
    return {
        "id": int(club.id),
        "name": str(getattr(club, "name", "") or "").strip() or f"Club {club.id}",
        "slug": str(getattr(club, "slug", "") or "").strip() or None,
        "display_name": str(profile.get("display_name") or getattr(club, "name", "") or "").strip() or f"Club {club.id}",
        "status": status,
        "is_demo": bool(status == "demo"),
        "enabled_modules": list(profile.get("enabled_modules") or []),
        "branding": dict(profile.get("branding") or {}),
        "details": dict(profile.get("details") or {}),
        "profile": profile,
    }


def build_session_bootstrap(
    db: Session,
    user: User,
    *,
    preview_club_id: int | None = None,
) -> dict[str, Any]:
    if user is None or not getattr(user, "id", None):
        raise HTTPException(status_code=401, detail="Could not validate credentials")

    shell = role_shell_for_user(user)
    role_value = _role_value(getattr(user, "role", None))
    default_workspace = _DEFAULT_WORKSPACE[shell]
    nav = list(_NAV_BY_SHELL[shell])
    effective_club = None
    preview_club = None
    club_locked = shell != ROLE_SHELL_SUPER_ADMIN

    if shell == ROLE_SHELL_SUPER_ADMIN:
        if preview_club_id is not None:
            preview_club = _club_context_payload(db, int(preview_club_id))
        scope_key = f"user:{int(user.id)}:platform:{preview_club.get('id') if preview_club else 'none'}"
    else:
        resolved_club_id = ensure_user_primary_club(db, user)
        if not resolved_club_id:
            raise HTTPException(
                status_code=403,
                detail="User is not assigned to a club. Ask a super admin to complete club access setup.",
            )
        db.info["club_id"] = int(resolved_club_id)
        effective_club = _club_context_payload(db, int(resolved_club_id))
        scope_key = f"user:{int(user.id)}:club:{int(resolved_club_id)}:{shell}"

    landing_path = _landing_path_for_shell(shell, default_workspace)
    return {
        "user": {
            "id": int(user.id),
            "name": str(getattr(user, "name", "") or "").strip() or str(getattr(user, "email", "") or ""),
            "email": str(getattr(user, "email", "") or "").strip().lower(),
            "role": role_value or UserRole.player.value,
        },
        "role_shell": shell,
        "default_workspace": default_workspace,
        "landing_path": landing_path,
        "nav": nav,
        "allowed_workspaces": [str(item["workspace"]) for item in nav],
        "club_context_locked": bool(club_locked),
        "effective_club": effective_club,
        "preview_club": preview_club,
        "cache_scope_key": scope_key,
    }
