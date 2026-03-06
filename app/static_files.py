from __future__ import annotations

import os
from pathlib import Path

from fastapi.staticfiles import StaticFiles


def _env_int(key: str, default: int) -> int:
    raw = os.getenv(key)
    if raw is None:
        return int(default)
    try:
        return int(str(raw).strip())
    except Exception:
        return int(default)


ASSET_CACHE_SECONDS = max(60, _env_int("FRONTEND_ASSET_CACHE_SECONDS", 86400))
ASSET_EXTENSIONS = {
    ".js",
    ".css",
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".webp",
    ".ico",
    ".woff",
    ".woff2",
}


class FrontendStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):  # type: ignore[override]
        response = await super().get_response(path, scope)
        if getattr(response, "status_code", 0) != 200:
            return response

        ext = Path(str(path or "")).suffix.lower()
        if ext in ASSET_EXTENSIONS:
            response.headers.setdefault(
                "Cache-Control",
                f"public, max-age={ASSET_CACHE_SECONDS}, immutable",
            )
        elif ext == ".html" or not ext:
            response.headers.setdefault("Cache-Control", "no-cache")

        return response
