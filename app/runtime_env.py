from __future__ import annotations

import os

CLOUD_HINT_KEYS = (
    "RENDER",
    "RENDER_SERVICE_ID",
    "RENDER_INSTANCE_ID",
    "K_SERVICE",
    "GOOGLE_CLOUD_PROJECT",
)

_PRODUCTION_ENV_VALUES = {
    "prod",
    "production",
    "staging",
    "stage",
}

_LOCAL_ENV_VALUES = {
    "local",
    "dev",
    "development",
    "test",
    "testing",
}


def env_bool(key: str, default: bool = False) -> bool:
    raw = os.getenv(key)
    if raw is None:
        return bool(default)
    return str(raw).strip().lower() in {"1", "true", "yes", "y", "on"}


def env_name(default: str = "development") -> str:
    for key in ("GREENLINK_ENV", "APP_ENV", "ENV", "FASTAPI_ENV"):
        raw = os.getenv(key)
        if raw is not None and str(raw).strip():
            return str(raw).strip().lower()
    return str(default or "development").strip().lower()


def is_cloud_runtime() -> bool:
    return any(os.getenv(k) for k in CLOUD_HINT_KEYS)


def is_production_like() -> bool:
    if env_bool("GREENLINK_ASSUME_LOCAL", default=False):
        return False
    name = env_name(default="production" if is_cloud_runtime() else "development")
    if name in _LOCAL_ENV_VALUES:
        return False
    if name in _PRODUCTION_ENV_VALUES:
        return True
    return is_cloud_runtime()


def is_local_like() -> bool:
    return not is_production_like()

