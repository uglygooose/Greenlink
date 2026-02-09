from __future__ import annotations

from datetime import date, timedelta
from typing import Dict, Tuple

from sqlalchemy.orm import Session

from app import models


DEFAULT_BOOKING_WINDOW_DAYS: Dict[str, int] = {
    "member": 14,
    "visitor": 7,
    "non_affiliated": 5,
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


def _club_setting_int(db: Session, key: str, default: int) -> int:
    try:
        row = db.query(models.ClubSetting).filter(models.ClubSetting.key == key).first()
        if not row or row.value is None:
            return int(default)
        raw = str(row.value).strip()
        if not raw:
            return int(default)
        return int(float(raw))
    except Exception:
        return int(default)


def resolve_player_type_for_user(user: models.User) -> str:
    at = _normalize_player_type(getattr(user, "account_type", None))
    if at in {"member", "visitor", "non_affiliated"}:
        return at

    home = str(getattr(user, "home_course", "") or "").strip().lower()
    has_hna = bool(str(getattr(user, "handicap_sa_id", "") or "").strip())

    if "umhlali" in home:
        return "member"
    if has_hna or home:
        return "visitor"
    return "non_affiliated"


def get_booking_window_config(db: Session) -> Dict[str, int]:
    return {
        "member": max(0, _club_setting_int(db, SETTING_KEYS["member"], DEFAULT_BOOKING_WINDOW_DAYS["member"])),
        "visitor": max(0, _club_setting_int(db, SETTING_KEYS["visitor"], DEFAULT_BOOKING_WINDOW_DAYS["visitor"])),
        "non_affiliated": max(0, _club_setting_int(db, SETTING_KEYS["non_affiliated"], DEFAULT_BOOKING_WINDOW_DAYS["non_affiliated"])),
    }


def get_booking_window_for_user(db: Session, user: models.User) -> Tuple[str, int, date]:
    player_type = resolve_player_type_for_user(user)
    config = get_booking_window_config(db)
    window_days = int(config.get(player_type, DEFAULT_BOOKING_WINDOW_DAYS["visitor"]))
    window_days = max(0, window_days)
    max_date = date.today() + timedelta(days=window_days)
    return player_type, window_days, max_date
