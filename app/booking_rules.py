from __future__ import annotations

from datetime import date, timedelta
from typing import Dict, Tuple

from sqlalchemy.orm import Session

from app import models
from app.club_config import get_club_config, get_club_settings_map


DEFAULT_BOOKING_WINDOW_DAYS: Dict[str, int] = {
    "member": 28,
    "visitor": 28,
    "non_affiliated": 28,
}

SETTING_KEYS = {
    "member": "booking_window_member_days",
    "visitor": "booking_window_affiliated_days",
    "non_affiliated": "booking_window_non_affiliated_days",
}


def _normalize_player_type(value: str | None) -> str | None:
    try:
        from app.pricing import normalize_player_type

        return normalize_player_type(value)
    except Exception:
        if value is None:
            return None
        return str(value).strip().lower() or None


def _club_setting_int(settings_map: dict[str, str], key: str, default: int) -> int:
    try:
        raw = str(settings_map.get(key) or "").strip()
        if not raw:
            return int(default)
        return int(float(raw))
    except Exception:
        return int(default)


def resolve_player_type_for_user(db: Session, user: models.User) -> str:
    at = _normalize_player_type(getattr(user, "account_type", None))
    if at in {"member", "visitor", "non_affiliated"}:
        return at

    home = str(getattr(user, "home_course", "") or "").strip().lower()
    has_hna = bool(str(getattr(user, "handicap_sa_id", "") or "").strip())

    cfg = get_club_config(db, club_id=getattr(user, "club_id", None))
    if cfg.is_home_member(home):
        return "member"
    if has_hna or home:
        return "visitor"
    return "non_affiliated"


def get_booking_window_config(db: Session, club_id: int | None) -> Dict[str, int]:
    settings_map = get_club_settings_map(db, club_id)
    return {
        "member": max(0, _club_setting_int(settings_map, SETTING_KEYS["member"], DEFAULT_BOOKING_WINDOW_DAYS["member"])),
        "visitor": max(0, _club_setting_int(settings_map, SETTING_KEYS["visitor"], DEFAULT_BOOKING_WINDOW_DAYS["visitor"])),
        "non_affiliated": max(
            0,
            _club_setting_int(settings_map, SETTING_KEYS["non_affiliated"], DEFAULT_BOOKING_WINDOW_DAYS["non_affiliated"]),
        ),
    }


def get_booking_window_for_user(db: Session, user: models.User) -> Tuple[str, int, date]:
    player_type = resolve_player_type_for_user(db, user)
    config = get_booking_window_config(db, club_id=getattr(user, "club_id", None))
    window_days = int(config.get(player_type, DEFAULT_BOOKING_WINDOW_DAYS["visitor"]))
    window_days = max(0, window_days)
    max_date = date.today() + timedelta(days=window_days)
    return player_type, window_days, max_date
