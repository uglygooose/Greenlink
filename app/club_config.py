from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.club_ops import enabled_module_keys_for_club, module_catalog, module_settings_for_club

_CACHE_TTL_SECONDS = max(5, int(str(os.getenv("CLUB_CONFIG_CACHE_TTL_SECONDS", "60")).strip() or 60))
_SETTINGS_CACHE: dict[int, tuple[float, dict[str, str]]] = {}
_SETTINGS_CACHE_LOCK = threading.Lock()


def _env(key: str) -> str | None:
    raw = os.getenv(key)
    if raw is None:
        return None
    value = str(raw).strip()
    return value or None


def _db_settings_map(db: Session | None, club_id: int | None) -> dict[str, str]:
    if db is None:
        return {}
    if not club_id:
        return {}

    cid = int(club_id)
    now = time.monotonic()
    with _SETTINGS_CACHE_LOCK:
        cached = _SETTINGS_CACHE.get(cid)
        if cached and (now - cached[0]) <= _CACHE_TTL_SECONDS:
            return dict(cached[1])

    try:
        from app.models import ClubSetting

        rows = db.query(ClubSetting).filter(ClubSetting.club_id == cid).all()
        values: dict[str, str] = {}
        for row in rows:
            key = str(getattr(row, "key", "") or "").strip()
            if not key:
                continue
            value = str(getattr(row, "value", "") or "").strip()
            if value:
                values[key] = value

        with _SETTINGS_CACHE_LOCK:
            _SETTINGS_CACHE[cid] = (now, values)
        return dict(values)
    except Exception:
        return {}


def _db_setting(db: Session | None, club_id: int | None, key: str) -> str | None:
    value = _db_settings_map(db, club_id).get(str(key or "").strip())
    if value is None:
        return None
    out = str(value or "").strip()
    return out or None


def get_club_settings_map(db: Session | None, club_id: int | None) -> dict[str, str]:
    return _db_settings_map(db, club_id)


def invalidate_club_config_cache(club_id: int | None = None) -> None:
    with _SETTINGS_CACHE_LOCK:
        if club_id is None:
            _SETTINGS_CACHE.clear()
            return
        try:
            _SETTINGS_CACHE.pop(int(club_id), None)
        except Exception:
            pass


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
    brand_primary: str
    brand_secondary: str
    brand_accent: str
    brand_surface: str
    brand_text: str
    tagline: str | None
    location: str | None
    website: str | None
    contact_email: str | None
    contact_phone: str | None
    enabled_modules: list[str]

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

    settings = _db_settings_map(db, club_id)

    def _s(key: str) -> str | None:
        value = settings.get(key)
        if value is None:
            return None
        text = str(value or "").strip()
        return text or None

    club_name = _s("club_name") or _env("CLUB_NAME") or "GreenLink"
    club_slug = _s("club_slug") or _env("CLUB_SLUG")

    logo_url = (
        _s("club_logo_url")
        or _env("CLUB_LOGO_URL")
        or "/frontend/assets/logo.png"
    )
    currency_symbol = (
        _s("club_currency_symbol")
        or _env("CLUB_CURRENCY_SYMBOL")
        or "R"
    )

    member_label = (
        _s("club_member_label")
        or _env("CLUB_MEMBER_LABEL")
        or "Member"
    )
    visitor_label = (
        _s("club_visitor_label")
        or _env("CLUB_VISITOR_LABEL")
        or "Affiliated Visitor"
    )
    non_affiliated_label = (
        _s("club_non_affiliated_label")
        or _env("CLUB_NON_AFFILIATED_LABEL")
        or "Visitor (No HNA)"
    )

    home_keywords_raw = _s("club_home_club_keywords") or _env("CLUB_HOME_CLUB_KEYWORDS")
    home_keywords = _norm_keywords(_parse_list(home_keywords_raw))
    if not home_keywords:
        # Best-effort fallback using club name/slug so "Member" signups work out-of-the-box.
        derived: list[str] = []
        if club_slug:
            derived.append(club_slug)
        derived.append(club_name)
        home_keywords = _norm_keywords(derived)

    suggested_raw = _s("club_suggested_home_clubs") or _env("CLUB_SUGGESTED_HOME_CLUBS")
    suggested_home_clubs = _parse_list(suggested_raw)

    brand_primary = _s("club_brand_primary") or _env("CLUB_BRAND_PRIMARY") or "#2f6f49"
    brand_secondary = _s("club_brand_secondary") or _env("CLUB_BRAND_SECONDARY") or "#1f5c3a"
    brand_accent = _s("club_brand_accent") or _env("CLUB_BRAND_ACCENT") or "#c0912f"
    brand_surface = _s("club_brand_surface") or _env("CLUB_BRAND_SURFACE") or "#ffffff"
    brand_text = _s("club_brand_text") or _env("CLUB_BRAND_TEXT") or "#1f2a1b"

    tagline = _s("club_tagline") or _env("CLUB_TAGLINE")
    location = _s("club_location") or _env("CLUB_LOCATION")
    website = _s("club_website") or _env("CLUB_WEBSITE")
    contact_email = _s("club_contact_email") or _env("CLUB_CONTACT_EMAIL")
    contact_phone = _s("club_contact_phone") or _env("CLUB_CONTACT_PHONE")

    if club_id:
        enabled_modules = enabled_module_keys_for_club(db, int(club_id))
    else:
        enabled_modules = [row["key"] for row in module_catalog() if bool(row.get("default_enabled"))]

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
        brand_primary=brand_primary,
        brand_secondary=brand_secondary,
        brand_accent=brand_accent,
        brand_surface=brand_surface,
        brand_text=brand_text,
        tagline=tagline,
        location=location,
        website=website,
        contact_email=contact_email,
        contact_phone=contact_phone,
        enabled_modules=enabled_modules,
    )


def club_config_response(db: Session | None = None, club_id: int | None = None) -> dict[str, Any]:
    cfg = get_club_config(db, club_id=club_id)
    if club_id:
        modules = module_settings_for_club(db, int(club_id))
    else:
        modules = [
            {
                "key": row["key"],
                "label": row["label"],
                "description": row["description"],
                "enabled": bool(row.get("default_enabled")),
            }
            for row in module_catalog()
        ]
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
        "branding": {
            "primary": cfg.brand_primary,
            "secondary": cfg.brand_secondary,
            "accent": cfg.brand_accent,
            "surface": cfg.brand_surface,
            "text": cfg.brand_text,
        },
        "details": {
            "tagline": cfg.tagline,
            "location": cfg.location,
            "website": cfg.website,
            "contact_email": cfg.contact_email,
            "contact_phone": cfg.contact_phone,
        },
        "enabled_modules": list(cfg.enabled_modules),
        "modules": modules,
    }
