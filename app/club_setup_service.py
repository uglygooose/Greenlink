from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_password_hash
from app import models
from app.club_assignments import sync_user_club_assignment
from app.club_config import invalidate_club_config_cache
from app.club_ops import upsert_club_modules, upsert_operational_targets
from app.models import Club, ClubSetting, User, UserRole
from app.password_policy import assert_password_policy
from app.people import sync_user_person
from app.platform_bootstrap import apply_reference_pricing_template


_PROFILE_SETTING_KEYS = {
    "club_name": "club_name",
    "club_slug": "club_slug",
    "logo_url": "club_logo_url",
    "currency_symbol": "club_currency_symbol",
    "member_label": "club_member_label",
    "visitor_label": "club_visitor_label",
    "non_affiliated_label": "club_non_affiliated_label",
    "brand_primary": "club_brand_primary",
    "brand_secondary": "club_brand_secondary",
    "brand_accent": "club_brand_accent",
    "brand_surface": "club_brand_surface",
    "brand_text": "club_brand_text",
    "tagline": "club_tagline",
    "location": "club_location",
    "website": "club_website",
    "contact_email": "club_contact_email",
    "contact_phone": "club_contact_phone",
}


def slugify(value: str) -> str:
    raw = (value or "").strip().lower()
    raw = re.sub(r"[^a-z0-9]+", "-", raw)
    raw = re.sub(r"-{2,}", "-", raw).strip("-")
    return raw[:80]


def _json_text(values: list[str] | None) -> str:
    cleaned = [str(value or "").strip() for value in list(values or []) if str(value or "").strip()]
    return json.dumps(cleaned, ensure_ascii=True)


def _upsert_setting(db: Session, club_id: int, key: str, value: str | None) -> None:
    row = (
        db.query(ClubSetting)
        .filter(ClubSetting.club_id == int(club_id), ClubSetting.key == str(key))
        .first()
    )
    if row is None:
        db.add(ClubSetting(club_id=int(club_id), key=str(key), value=value))
        return
    row.value = value


def apply_club_profile_settings(db: Session, club_id: int, payload: dict[str, Any]) -> None:
    for payload_key, setting_key in _PROFILE_SETTING_KEYS.items():
        if payload_key not in payload:
            continue
        raw = payload.get(payload_key)
        value = str(raw or "").strip() or None
        _upsert_setting(db, int(club_id), setting_key, value)

    if "home_club_keywords" in payload:
        _upsert_setting(
            db,
            int(club_id),
            "club_home_club_keywords",
            _json_text(payload.get("home_club_keywords")),
        )
    if "suggested_home_clubs" in payload:
        _upsert_setting(
            db,
            int(club_id),
            "club_suggested_home_clubs",
            _json_text(payload.get("suggested_home_clubs")),
        )
    invalidate_club_config_cache(int(club_id))


def ensure_club(
    db: Session,
    *,
    name: str,
    slug: str | None,
    active: bool,
) -> tuple[Club, bool]:
    club_name = str(name or "").strip()
    if not club_name:
        raise HTTPException(status_code=400, detail="club name is required")

    normalized_slug = slugify(slug or club_name)
    if not normalized_slug:
        raise HTTPException(status_code=400, detail="club slug is required")

    club = db.query(Club).filter(func.lower(Club.slug) == normalized_slug.lower()).first()
    created = False
    if club is None:
        club = Club(name=club_name, slug=normalized_slug, active=1 if active else 0)
        db.add(club)
        db.flush()
        created = True
    else:
        club.name = club_name
        club.slug = normalized_slug
        club.active = 1 if active else 0
    return club, created


def ensure_staff_user(
    db: Session,
    *,
    club_id: int,
    name: str,
    email: str,
    password: str,
    role: UserRole,
    force_reset: bool = True,
) -> tuple[User, bool]:
    normalized_email = str(email or "").strip().lower()
    if not normalized_email:
        raise HTTPException(status_code=400, detail="admin email is required")
    assert_password_policy(password, field_name="password")

    display_name = str(name or "").strip() or normalized_email
    existing = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    created = False
    if existing is None:
        existing = User(
            name=display_name,
            email=normalized_email,
            password=get_password_hash(password),
            role=role,
            club_id=int(club_id),
        )
        db.add(existing)
        db.flush()
        created = True
    else:
        if not force_reset:
            raise HTTPException(status_code=409, detail="User already exists")
        existing.name = display_name
        existing.password = get_password_hash(password)
        existing.role = role
        existing.club_id = int(club_id)

    sync_user_club_assignment(
        db,
        existing,
        club_id=int(club_id),
        role=role,
        is_primary=True,
    )
    sync_user_person(db, existing, source_system="club_setup")
    return existing, created


def apply_club_setup(
    db: Session,
    *,
    club_payload: dict[str, Any],
    enabled_modules: list[str] | None,
    operational_targets: list[dict[str, Any]] | None,
    annual_targets_year: int | None,
    annual_targets: dict[str, Any] | None,
    pricing_template: str | None,
    overwrite_pricing: bool,
    admin_user_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    club, club_created = ensure_club(
        db,
        name=str(club_payload.get("club_name") or club_payload.get("name") or "").strip(),
        slug=str(club_payload.get("club_slug") or club_payload.get("slug") or "").strip() or None,
        active=bool(club_payload.get("active", True)),
    )
    apply_club_profile_settings(db, int(club.id), club_payload)
    modules = upsert_club_modules(db, int(club.id), enabled_modules)

    target_year = int(annual_targets_year or club_payload.get("year") or 0 or 0)
    if target_year <= 0:
        target_year = int(datetime.utcnow().year)

    if annual_targets:
        for metric in ("rounds", "revenue"):
            if metric not in annual_targets or annual_targets.get(metric) is None:
                continue
            try:
                annual_target_value = float(annual_targets.get(metric))
            except Exception:
                raise HTTPException(status_code=400, detail=f"Invalid annual {metric} target")
            row = (
                db.query(models.KpiTarget)
                .filter(
                    models.KpiTarget.club_id == int(club.id),
                    models.KpiTarget.year == int(target_year),
                    models.KpiTarget.metric == metric,
                )
                .first()
            )
            if row is None:
                row = models.KpiTarget(
                    club_id=int(club.id),
                    year=int(target_year),
                    metric=metric,
                    annual_target=annual_target_value,
                )
                db.add(row)
            else:
                row.annual_target = annual_target_value
                row.updated_at = datetime.utcnow()
        for setting_key, payload_key in (
            ("target_revenue_mode", "revenue_mode"),
            ("target_member_round_share", "member_round_share"),
            ("target_member_revenue_share", "member_revenue_share"),
        ):
            if payload_key not in annual_targets or annual_targets.get(payload_key) is None:
                continue
            _upsert_setting(db, int(club.id), setting_key, str(annual_targets.get(payload_key)))

    targets_payload = upsert_operational_targets(
        db,
        club_id=int(club.id),
        year=int(target_year),
        rows=operational_targets,
    )

    pricing_result = None
    if pricing_template:
        pricing_result = apply_reference_pricing_template(
            db,
            club_id=int(club.id),
            template_key=str(pricing_template).strip().lower(),
            overwrite_existing=bool(overwrite_pricing),
        )

    staff_user = None
    staff_created = None
    if admin_user_payload:
        staff_user, staff_created = ensure_staff_user(
            db,
            club_id=int(club.id),
            name=str(admin_user_payload.get("name") or "").strip(),
            email=str(admin_user_payload.get("email") or "").strip(),
            password=str(admin_user_payload.get("password") or "").strip(),
            role=UserRole.admin,
            force_reset=bool(admin_user_payload.get("force_reset", True)),
        )

    return {
        "club": club,
        "club_created": bool(club_created),
        "modules": modules,
        "targets": targets_payload,
        "pricing": pricing_result,
        "admin_user": staff_user,
        "admin_user_created": staff_created,
        "target_year": int(target_year),
    }
