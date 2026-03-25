from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Callable

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.club_config import club_config_response, invalidate_club_config_cache
from app.club_ops import upsert_club_modules
from app.club_setup_service import apply_club_profile_settings
from app.models import ClubSetting


class BookingWindowSettings(BaseModel):
    member_days: int
    affiliated_days: int
    non_affiliated_days: int
    group_cancel_days: int = 10


class ClubProfileSettings(BaseModel):
    club_name: str | None = None
    club_slug: str | None = None
    logo_url: str | None = None
    currency_symbol: str | None = None
    member_label: str | None = None
    visitor_label: str | None = None
    non_affiliated_label: str | None = None
    home_club_keywords: list[str] | None = None
    suggested_home_clubs: list[str] | None = None
    brand_primary: str | None = None
    brand_secondary: str | None = None
    brand_accent: str | None = None
    brand_surface: str | None = None
    brand_text: str | None = None
    tagline: str | None = None
    location: str | None = None
    website: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    tennis_court_count: int | None = None
    tennis_session_minutes: int | None = None
    tennis_court_names: list[str] | None = None
    tennis_open_time: str | None = None
    tennis_close_time: str | None = None
    padel_court_count: int | None = None
    padel_session_minutes: int | None = None
    padel_court_names: list[str] | None = None
    padel_open_time: str | None = None
    padel_close_time: str | None = None
    bowls_rink_count: int | None = None
    bowls_session_minutes: int | None = None
    bowls_rink_names: list[str] | None = None
    bowls_open_time: str | None = None
    bowls_close_time: str | None = None
    enabled_modules: list[str] | None = None


def _setting_value(db: Session, club_id: int, key: str, default: int) -> int:
    row = (
        db.query(ClubSetting.value)
        .filter(ClubSetting.club_id == int(club_id), ClubSetting.key == key)
        .first()
    )
    if not row:
        return int(default)
    try:
        return int(float(str(row[0] or "").strip() or default))
    except Exception:
        return int(default)


def _upsert_setting(db: Session, club_id: int, key: str, value: int | float | str) -> None:
    row = (
        db.query(ClubSetting)
        .filter(ClubSetting.club_id == int(club_id), ClubSetting.key == key)
        .first()
    )
    if row:
        row.value = str(value)
        row.updated_at = datetime.utcnow()
    else:
        db.add(ClubSetting(club_id=int(club_id), key=key, value=str(value)))
    invalidate_club_config_cache(int(club_id))


def get_booking_window_settings_payload(db: Session, club_id: int) -> BookingWindowSettings:
    return BookingWindowSettings(
        member_days=_setting_value(db, club_id, "booking_window_member_days", 28),
        affiliated_days=_setting_value(db, club_id, "booking_window_affiliated_days", 28),
        non_affiliated_days=_setting_value(db, club_id, "booking_window_non_affiliated_days", 28),
        group_cancel_days=_setting_value(db, club_id, "booking_window_group_cancel_days", 10),
    )


def update_booking_window_settings_payload(
    db: Session,
    club_id: int,
    payload: BookingWindowSettings,
) -> BookingWindowSettings:
    member_days = max(0, min(365, int(payload.member_days)))
    affiliated_days = max(0, min(365, int(payload.affiliated_days)))
    non_affiliated_days = max(0, min(365, int(payload.non_affiliated_days)))
    group_cancel_days = max(0, min(365, int(getattr(payload, "group_cancel_days", 10))))

    _upsert_setting(db, club_id, "booking_window_member_days", member_days)
    _upsert_setting(db, club_id, "booking_window_affiliated_days", affiliated_days)
    _upsert_setting(db, club_id, "booking_window_non_affiliated_days", non_affiliated_days)
    _upsert_setting(db, club_id, "booking_window_group_cancel_days", group_cancel_days)
    db.commit()

    return BookingWindowSettings(
        member_days=member_days,
        affiliated_days=affiliated_days,
        non_affiliated_days=non_affiliated_days,
        group_cancel_days=group_cancel_days,
    )


def get_club_profile_settings_payload(db: Session, club_id: int) -> dict[str, Any]:
    return club_config_response(db, club_id=club_id)


def update_club_profile_settings_payload(
    db: Session,
    club_id: int,
    payload: ClubProfileSettings,
    *,
    invalidate_admin_caches: Callable[[int | None], None] | None = None,
) -> dict[str, Any]:
    payload_dict = payload.model_dump(exclude_none=True)
    if "club_name" in payload_dict and not str(payload_dict.get("club_name") or "").strip():
        raise ValueError("club_name cannot be empty")

    for key in ("tennis_court_count", "padel_court_count", "bowls_rink_count"):
        if key in payload_dict:
            payload_dict[key] = max(0, min(99, int(payload_dict[key] or 0)))

    for key, minimum, maximum, default in (
        ("tennis_session_minutes", 15, 360, 60),
        ("padel_session_minutes", 15, 360, 60),
        ("bowls_session_minutes", 30, 480, 120),
    ):
        if key in payload_dict:
            try:
                payload_dict[key] = max(minimum, min(maximum, int(payload_dict[key] or default)))
            except Exception:
                payload_dict[key] = default

    for key, default in (
        ("tennis_open_time", "06:00"),
        ("tennis_close_time", "18:00"),
        ("padel_open_time", "06:00"),
        ("padel_close_time", "22:00"),
        ("bowls_open_time", "08:00"),
        ("bowls_close_time", "18:00"),
    ):
        if key in payload_dict:
            value = str(payload_dict.get(key) or "").strip()
            payload_dict[key] = value if re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value) else default

    apply_club_profile_settings(db, int(club_id), payload_dict)
    if payload.enabled_modules is not None:
        upsert_club_modules(db, int(club_id), list(payload.enabled_modules or []))

    db.commit()
    if invalidate_admin_caches is not None:
        invalidate_admin_caches(int(club_id))
    return club_config_response(db, club_id=club_id)
