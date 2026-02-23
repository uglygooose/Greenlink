from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session


def _env(key: str) -> str | None:
    raw = os.getenv(key)
    if raw is None:
        return None
    value = str(raw).strip()
    return value or None


def _db_setting(db: Session | None, club_id: int | None, key: str) -> str | None:
    if db is None:
        return None
    if not club_id:
        return None
    try:
        from app.models import ClubSetting

        row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == key).first()
        if not row:
            return None
        value = str(row.value or "").strip()
        return value or None
    except Exception:
        return None


def _parse_list(value: str | None) -> list[str]:
    if not value:
        return []
    raw = str(value).strip()
    if not raw:
        return []

    # JSON list support (preferred).
    if raw.startswith("["):
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                items: list[str] = []
                for v in data:
                    s = str(v or "").strip()
                    if s:
                        items.append(s)
                return items
        except Exception:
            pass

    # Comma/newline separated fallback.
    parts: list[str] = []
    for chunk in raw.replace("\r", "\n").split("\n"):
        for part in chunk.split(","):
            p = part.strip()
            if p:
                parts.append(p)
    return parts


def _norm_keywords(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for v in values:
        k = str(v or "").strip().lower()
        if not k:
            continue
        if k in seen:
            continue
        seen.add(k)
        out.append(k)
    return out


def _home_matches_keywords(home_club: str, keywords: list[str]) -> bool:
    home = str(home_club or "").strip().lower()
    if not home:
        return False
    for k in keywords:
        if k and k in home:
            return True
    return False


@dataclass(frozen=True)
class ClubConfig:
    club_name: str
    club_slug: str | None
    logo_url: str
    currency_symbol: str
    member_label: str
    visitor_label: str
    non_affiliated_label: str
    home_club_keywords: list[str]
    suggested_home_clubs: list[str]

    def is_home_member(self, home_club: str | None) -> bool:
        return _home_matches_keywords(str(home_club or ""), self.home_club_keywords)


def get_club_config(db: Session | None = None, club_id: int | None = None) -> ClubConfig:
    """
    Single-tenant club branding + behavior configuration.

    Sources (highest priority first):
    - club_settings table (per-club, runtime editable)
    - environment variables (deployment-time)
    - safe defaults
    """

    club_name = (
        _db_setting(db, club_id, "club_name")
        or _env("CLUB_NAME")
        or "GreenLink"
    )
    club_slug = _db_setting(db, club_id, "club_slug") or _env("CLUB_SLUG")

    logo_url = (
        _db_setting(db, club_id, "club_logo_url")
        or _env("CLUB_LOGO_URL")
        or "/frontend/assets/logo.png"
    )
    currency_symbol = (
        _db_setting(db, club_id, "club_currency_symbol")
        or _env("CLUB_CURRENCY_SYMBOL")
        or "R"
    )

    member_label = (
        _db_setting(db, club_id, "club_member_label")
        or _env("CLUB_MEMBER_LABEL")
        or "Member"
    )
    visitor_label = (
        _db_setting(db, club_id, "club_visitor_label")
        or _env("CLUB_VISITOR_LABEL")
        or "Affiliated Visitor"
    )
    non_affiliated_label = (
        _db_setting(db, club_id, "club_non_affiliated_label")
        or _env("CLUB_NON_AFFILIATED_LABEL")
        or "Visitor (No HNA)"
    )

    home_keywords_raw = _db_setting(db, club_id, "club_home_club_keywords") or _env("CLUB_HOME_CLUB_KEYWORDS")
    home_keywords = _norm_keywords(_parse_list(home_keywords_raw))
    if not home_keywords:
        # Best-effort fallback using club name/slug so "Member" signups work out-of-the-box.
        derived: list[str] = []
        if club_slug:
            derived.append(club_slug)
        derived.append(club_name)
        home_keywords = _norm_keywords(derived)

    suggested_raw = _db_setting(db, club_id, "club_suggested_home_clubs") or _env("CLUB_SUGGESTED_HOME_CLUBS")
    suggested_home_clubs = _parse_list(suggested_raw)

    return ClubConfig(
        club_name=club_name,
        club_slug=club_slug,
        logo_url=logo_url,
        currency_symbol=currency_symbol,
        member_label=member_label,
        visitor_label=visitor_label,
        non_affiliated_label=non_affiliated_label,
        home_club_keywords=home_keywords,
        suggested_home_clubs=suggested_home_clubs,
    )


def club_config_response(db: Session | None = None, club_id: int | None = None) -> dict[str, Any]:
    cfg = get_club_config(db, club_id=club_id)
    return {
        "club_name": cfg.club_name,
        "club_slug": cfg.club_slug,
        "logo_url": cfg.logo_url,
        "currency_symbol": cfg.currency_symbol,
        "labels": {
            "member": cfg.member_label,
            "visitor": cfg.visitor_label,
            "non_affiliated": cfg.non_affiliated_label,
        },
        "home_club_keywords": list(cfg.home_club_keywords),
        "suggested_home_clubs": list(cfg.suggested_home_clubs),
    }
