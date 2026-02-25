from __future__ import annotations

import json
from datetime import date as Date
from typing import Any

from sqlalchemy.orm import Session

from app import models

DEFAULT_TEE_SHEET_PROFILE: dict[str, Any] = {
    "version": 1,
    "interval_min": 8,
    "winter_months": [5, 6, 7, 8],
    "two_tee_days": [1, 2, 3, 5],  # Tue, Wed, Thu, Sat (python weekday: Mon=0)
    "two_tee_tees": ["1", "10"],
    "one_tee_tees": ["1"],
    "summer": {
        "two_tee_windows": [{"start": "06:30", "end": "08:30"}, {"start": "11:30", "end": "13:30"}],
        "one_tee_windows": [{"start": "06:30", "end": "13:30"}],
        "nine_hole_start": "15:40",
        "nine_hole_end": "17:30",
    },
    "winter": {
        "two_tee_windows": [{"start": "06:45", "end": "08:00"}, {"start": "11:00", "end": "13:00"}],
        "one_tee_windows": [{"start": "06:45", "end": "13:00"}],
        "nine_hole_start": "15:15",
        "nine_hole_end": "16:45",
    },
}


def _normalize_hhmm(value: Any, default: str) -> str:
    raw = str(value or "").strip()
    if ":" not in raw:
        return default
    parts = raw.split(":")
    if len(parts) != 2:
        return default
    try:
        hh = int(parts[0])
        mm = int(parts[1])
    except Exception:
        return default
    if hh < 0 or hh > 23 or mm < 0 or mm > 59:
        return default
    return f"{hh:02d}:{mm:02d}"


def _add_minutes_hhmm(value: str, minutes: int, fallback: str) -> str:
    base = _normalize_hhmm(value, "")
    if not base:
        return fallback
    try:
        hh, mm = [int(x) for x in base.split(":")]
        total = (hh * 60) + mm + int(minutes or 0)
        total = max(0, min((23 * 60) + 59, total))
        out_h = total // 60
        out_m = total % 60
        return f"{out_h:02d}:{out_m:02d}"
    except Exception:
        return fallback


def _normalize_windows(value: Any, default_windows: list[dict[str, str]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    rows = value if isinstance(value, list) else []
    for row in rows:
        if not isinstance(row, dict):
            continue
        start = _normalize_hhmm(row.get("start"), "")
        end = _normalize_hhmm(row.get("end"), "")
        if not start or not end:
            continue
        if start > end:
            continue
        out.append({"start": start, "end": end})
    if out:
        return out
    return [dict(x) for x in default_windows]


def _normalize_weekdays(value: Any, default_days: list[int]) -> list[int]:
    rows = value if isinstance(value, list) else []
    out: list[int] = []
    seen: set[int] = set()
    for row in rows:
        try:
            day = int(row)
        except Exception:
            continue
        if day < 0 or day > 6:
            continue
        if day in seen:
            continue
        seen.add(day)
        out.append(day)
    if out:
        return out
    return list(default_days)


def _normalize_tees(value: Any, default_tees: list[str]) -> list[str]:
    rows = value if isinstance(value, list) else []
    out: list[str] = []
    seen: set[str] = set()
    for row in rows:
        tee = str(row or "").strip()
        if not tee:
            continue
        if tee in seen:
            continue
        seen.add(tee)
        out.append(tee)
    if out:
        return out
    return list(default_tees)


def _normalize_months(value: Any, default_months: list[int]) -> list[int]:
    rows = value if isinstance(value, list) else []
    out: list[int] = []
    seen: set[int] = set()
    for row in rows:
        try:
            month = int(row)
        except Exception:
            continue
        if month < 1 or month > 12:
            continue
        if month in seen:
            continue
        seen.add(month)
        out.append(month)
    if out:
        return out
    return list(default_months)


def _normalize_season(value: Any, default: dict[str, Any]) -> dict[str, Any]:
    raw = value if isinstance(value, dict) else {}
    return {
        "two_tee_windows": _normalize_windows(raw.get("two_tee_windows"), list(default.get("two_tee_windows") or [])),
        "one_tee_windows": _normalize_windows(raw.get("one_tee_windows"), list(default.get("one_tee_windows") or [])),
        "nine_hole_start": _normalize_hhmm(raw.get("nine_hole_start"), str(default.get("nine_hole_start") or "15:30")),
        "nine_hole_end": _normalize_hhmm(raw.get("nine_hole_end"), str(default.get("nine_hole_end") or "17:00")),
    }


def normalize_tee_sheet_profile(raw: dict[str, Any] | None) -> dict[str, Any]:
    source = raw if isinstance(raw, dict) else {}
    default = DEFAULT_TEE_SHEET_PROFILE

    try:
        interval_min = int(source.get("interval_min"))
    except Exception:
        interval_min = int(default["interval_min"])
    interval_min = max(1, min(30, interval_min))

    return {
        "version": 1,
        "interval_min": interval_min,
        "winter_months": _normalize_months(source.get("winter_months"), list(default["winter_months"])),
        "two_tee_days": _normalize_weekdays(source.get("two_tee_days"), list(default["two_tee_days"])),
        "two_tee_tees": _normalize_tees(source.get("two_tee_tees"), list(default["two_tee_tees"])),
        "one_tee_tees": _normalize_tees(source.get("one_tee_tees"), list(default["one_tee_tees"])),
        "summer": _normalize_season(source.get("summer"), dict(default["summer"])),
        "winter": _normalize_season(source.get("winter"), dict(default["winter"])),
    }


def load_tee_sheet_profile(db: Session, club_id: int | None) -> dict[str, Any]:
    if not club_id:
        return normalize_tee_sheet_profile(DEFAULT_TEE_SHEET_PROFILE)
    row = (
        db.query(models.ClubSetting)
        .filter(models.ClubSetting.club_id == int(club_id), models.ClubSetting.key == "tee_sheet_profile")
        .first()
    )
    if not row or not str(row.value or "").strip():
        return normalize_tee_sheet_profile(DEFAULT_TEE_SHEET_PROFILE)

    try:
        parsed = json.loads(str(row.value))
    except Exception:
        parsed = None
    return normalize_tee_sheet_profile(parsed)


def save_tee_sheet_profile(db: Session, club_id: int, profile: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize_tee_sheet_profile(profile)
    payload = json.dumps(normalized)
    row = (
        db.query(models.ClubSetting)
        .filter(models.ClubSetting.club_id == int(club_id), models.ClubSetting.key == "tee_sheet_profile")
        .first()
    )
    if row:
        row.value = payload
    else:
        db.add(models.ClubSetting(club_id=int(club_id), key="tee_sheet_profile", value=payload))
    return normalized


def _is_two_tee_day(target_date: Date, profile: dict[str, Any]) -> bool:
    two_tee_days = set(_normalize_weekdays(profile.get("two_tee_days"), list(DEFAULT_TEE_SHEET_PROFILE["two_tee_days"])))
    return int(target_date.weekday()) in two_tee_days


def _season_key(target_date: Date, profile: dict[str, Any]) -> str:
    winter_months = set(_normalize_months(profile.get("winter_months"), list(DEFAULT_TEE_SHEET_PROFILE["winter_months"])))
    return "winter" if int(target_date.month) in winter_months else "summer"


def tee_sheet_plan_for_date(target_date: Date, profile: dict[str, Any] | None = None, holes: int = 18) -> dict[str, Any]:
    normalized = normalize_tee_sheet_profile(profile or DEFAULT_TEE_SHEET_PROFILE)
    season_key = _season_key(target_date, normalized)
    season = normalized.get(season_key) or {}

    mode = "two_tee" if _is_two_tee_day(target_date, normalized) else "one_tee"
    tees = (
        list(normalized.get("two_tee_tees") or [])
        if mode == "two_tee"
        else list(normalized.get("one_tee_tees") or [])
    )
    if not tees:
        tees = ["1", "10"] if mode == "two_tee" else ["1"]

    holes_normalized = 9 if int(holes or 18) == 9 else 18
    if holes_normalized == 9:
        one_tee_windows = _normalize_windows(
            season.get("one_tee_windows"),
            list((DEFAULT_TEE_SHEET_PROFILE[season_key] or {}).get("one_tee_windows") or []),
        )
        one_tee_last_end = one_tee_windows[-1]["end"] if one_tee_windows else ""
        default_mode_start = _add_minutes_hhmm(one_tee_last_end, 15, "13:45")
        nine_start = _normalize_hhmm(
            season.get("nine_hole_start"),
            default_mode_start if mode == "one_tee" else "15:30",
        )
        if mode == "one_tee":
            nine_start = _add_minutes_hhmm(one_tee_last_end, 15, nine_start)
        nine_end = _normalize_hhmm(season.get("nine_hole_end"), "17:00")
        windows = [
            {
                "start": nine_start,
                "end": nine_end,
            }
        ]
    else:
        key = "two_tee_windows" if mode == "two_tee" else "one_tee_windows"
        windows = _normalize_windows(season.get(key), list((DEFAULT_TEE_SHEET_PROFILE[season_key] or {}).get(key) or []))

    return {
        "date": target_date.isoformat(),
        "season": season_key,
        "mode": mode,
        "holes": holes_normalized,
        "interval_min": int(normalized.get("interval_min") or 8),
        "tees": tees,
        "windows": windows,
        "nine_hole_start": windows[0]["start"] if windows else _normalize_hhmm(season.get("nine_hole_start"), "15:30"),
        "nine_hole_end": windows[0]["end"] if windows else _normalize_hhmm(season.get("nine_hole_end"), "17:00"),
    }
