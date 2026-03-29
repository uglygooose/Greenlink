from __future__ import annotations

import re


def clean_name(value: str | None) -> str:
    if value is None:
        return ""
    return " ".join(value.strip().split())


def build_full_name(first_name: str | None, last_name: str | None) -> str:
    parts = [clean_name(first_name), clean_name(last_name)]
    return " ".join(part for part in parts if part).strip()


def normalize_email(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None


def normalize_phone(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    digits = re.sub(r"\D+", "", stripped)
    if not digits:
        return None
    if stripped.startswith("+"):
        return f"+{digits}"
    return digits


def split_display_name(value: str, fallback_email: str | None = None) -> tuple[str, str]:
    cleaned = clean_name(value)
    if cleaned:
        parts = cleaned.split(" ", 1)
        if len(parts) == 1:
            return parts[0], ""
        return parts[0], parts[1]
    if fallback_email:
        local_part = fallback_email.split("@", 1)[0].replace(".", " ").replace("_", " ")
        fallback = clean_name(local_part).title()
        if fallback:
            parts = fallback.split(" ", 1)
            if len(parts) == 1:
                return parts[0], ""
            return parts[0], parts[1]
    return "Unknown", ""
