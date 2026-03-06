from __future__ import annotations

import os
import re
from typing import List

from fastapi import HTTPException


def _env_bool(key: str, default: bool) -> bool:
    raw = os.getenv(key)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "y", "on"}


def _env_int(key: str, default: int) -> int:
    raw = os.getenv(key)
    if raw is None:
        return int(default)
    try:
        return int(str(raw).strip())
    except Exception:
        return int(default)


PASSWORD_MIN_LENGTH = max(6, _env_int("PASSWORD_MIN_LENGTH", 8))
PASSWORD_REQUIRE_LETTER = _env_bool("PASSWORD_REQUIRE_LETTER", True)
PASSWORD_REQUIRE_DIGIT = _env_bool("PASSWORD_REQUIRE_DIGIT", True)
PASSWORD_REQUIRE_UPPER = _env_bool("PASSWORD_REQUIRE_UPPER", False)
PASSWORD_REQUIRE_SPECIAL = _env_bool("PASSWORD_REQUIRE_SPECIAL", False)


def password_policy_errors(password: str | None) -> List[str]:
    value = str(password or "")
    errors: List[str] = []

    if len(value) < PASSWORD_MIN_LENGTH:
        errors.append(f"Password must be at least {PASSWORD_MIN_LENGTH} characters long")

    if PASSWORD_REQUIRE_LETTER and not re.search(r"[A-Za-z]", value):
        errors.append("Password must include at least one letter")

    if PASSWORD_REQUIRE_DIGIT and not re.search(r"\d", value):
        errors.append("Password must include at least one number")

    if PASSWORD_REQUIRE_UPPER and not re.search(r"[A-Z]", value):
        errors.append("Password must include at least one uppercase letter")

    if PASSWORD_REQUIRE_SPECIAL and not re.search(r"[^A-Za-z0-9]", value):
        errors.append("Password must include at least one special character")

    if len(value) > 256:
        errors.append("Password must be 256 characters or fewer")

    return errors


def assert_password_policy(password: str | None, field_name: str = "password") -> None:
    errors = password_policy_errors(password)
    if errors:
        raise HTTPException(
            status_code=400,
            detail={
                "message": f"{field_name} does not meet password policy requirements",
                "errors": errors,
            },
        )
