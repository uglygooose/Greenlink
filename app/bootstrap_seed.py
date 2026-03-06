from __future__ import annotations

import os

from app.platform_bootstrap import ensure_platform_ready


def _env_true(key: str) -> bool:
    return str(os.getenv(key, "")).strip().lower() in {"1", "true", "yes", "y", "on"}


def bootstrap_seed_if_enabled() -> dict | None:
    """
    Backward-compatible wrapper for older startup paths.

    Tenant bootstrap is now centralized in `ensure_platform_ready()`. This wrapper only
    forces a rerun when explicit bootstrap env vars are enabled.
    """
    if not _env_true("GREENLINK_BOOTSTRAP"):
        return None
    return ensure_platform_ready()
