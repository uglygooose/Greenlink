from __future__ import annotations

import os
from datetime import datetime

from sqlalchemy import func

from app.auth import get_password_hash
from app.database import DB_SOURCE, SessionLocal
from app.models import Club, ClubSetting, User, UserRole


def _env_true(key: str) -> bool:
    return str(os.getenv(key, "")).strip().lower() in {"1", "true", "yes", "y", "on"}


def _upsert_club_setting(db, club_id: int, key: str, value: str) -> None:
    row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == key).first()
    if row:
        row.value = value
        row.updated_at = datetime.utcnow()
        return
    db.add(ClubSetting(club_id=int(club_id), key=key, value=value, updated_at=datetime.utcnow()))


def bootstrap_seed_if_enabled() -> None:
    """
    Bootstrap a fresh DB into a usable multi-club state.

    Env vars:
    - GREENLINK_BOOTSTRAP=1
    - GREENLINK_SUPER_ADMIN_EMAIL (default: greenlinkgolfsa@gmail.com)
    - GREENLINK_SUPER_ADMIN_PASSWORD (default: GreenLink123!)
    - GREENLINK_DEFAULT_CLUB_NAME (default: Umhlali Country Club)
    - GREENLINK_DEFAULT_CLUB_SLUG (default: umhlali)
    - GREENLINK_DEFAULT_CLUB_ADMIN_EMAIL (default: admin@umhlali.com)
    - GREENLINK_DEFAULT_CLUB_ADMIN_PASSWORD (default: Admin123!)
    - GREENLINK_BOOTSTRAP_FORCE_RESET=1 (reset passwords/roles each startup; defaults to local SQLite only)
    """
    if not _env_true("GREENLINK_BOOTSTRAP"):
        return

    super_email = (os.getenv("GREENLINK_SUPER_ADMIN_EMAIL") or "greenlinkgolfsa@gmail.com").strip().lower()
    super_password = os.getenv("GREENLINK_SUPER_ADMIN_PASSWORD") or "GreenLink123!"

    club_name = (os.getenv("GREENLINK_DEFAULT_CLUB_NAME") or "Umhlali Country Club").strip() or "Umhlali Country Club"
    club_slug = (os.getenv("GREENLINK_DEFAULT_CLUB_SLUG") or "umhlali").strip().lower() or "umhlali"

    admin_email = (os.getenv("GREENLINK_DEFAULT_CLUB_ADMIN_EMAIL") or "admin@umhlali.com").strip().lower()
    admin_password = os.getenv("GREENLINK_DEFAULT_CLUB_ADMIN_PASSWORD") or "Admin123!"

    force_reset = _env_true("GREENLINK_BOOTSTRAP_FORCE_RESET") or (DB_SOURCE == "SQLITE")

    with SessionLocal() as db:
        # Club
        club = db.query(Club).filter(func.lower(Club.slug) == club_slug.lower()).first()
        if not club:
            club = Club(name=club_name, slug=club_slug, active=1)
            db.add(club)
            db.commit()
            db.refresh(club)

        # Super admin
        super_user = db.query(User).filter(func.lower(User.email) == super_email).first()
        if not super_user:
            super_user = User(
                name="Super Admin",
                email=super_email,
                password=get_password_hash(super_password),
                role=UserRole.super_admin,
                club_id=None,
            )
            db.add(super_user)
            db.commit()
        elif force_reset:
            super_user.role = UserRole.super_admin
            super_user.password = get_password_hash(super_password)
            super_user.club_id = None
            db.commit()

        # Default club admin
        club_admin = db.query(User).filter(func.lower(User.email) == admin_email).first()
        if not club_admin:
            club_admin = User(
                name="Club Admin",
                email=admin_email,
                password=get_password_hash(admin_password),
                role=UserRole.admin,
                club_id=int(club.id),
            )
            db.add(club_admin)
            db.commit()
        elif force_reset:
            club_admin.role = UserRole.admin
            club_admin.password = get_password_hash(admin_password)
            club_admin.club_id = int(club.id)
            db.commit()

        # Basic per-club branding defaults (safe to overwrite on force_reset).
        if force_reset:
            _upsert_club_setting(db, int(club.id), "club_name", club_name)
            _upsert_club_setting(db, int(club.id), "club_slug", club_slug)
            _upsert_club_setting(db, int(club.id), "club_member_label", "Member")
            _upsert_club_setting(db, int(club.id), "club_visitor_label", "Visitor")
            _upsert_club_setting(db, int(club.id), "club_non_affiliated_label", "Non-affiliated")
            db.commit()

    print(f"[BOOTSTRAP] Ensured super admin: {super_email} (force_reset={force_reset}, db_source={DB_SOURCE})")
    print(f"[BOOTSTRAP] Ensured club: {club_slug} and admin: {admin_email}")

