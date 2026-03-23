from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime
from typing import Any


_LOG_LEVEL = str(os.getenv("GREENLINK_LOG_LEVEL", "INFO")).strip().upper() or "INFO"
_LOGGER = logging.getLogger("greenlink")
if not _LOGGER.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _LOGGER.addHandler(_handler)
_LOGGER.setLevel(getattr(logging, _LOG_LEVEL, logging.INFO))
_LOGGER.propagate = False


def _json_safe(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]
    try:
        return str(value)
    except Exception:
        return "<unserializable>"


def log_event(level: str, event: str, **fields: Any) -> None:
    payload = {
        "ts": datetime.utcnow().isoformat(),
        "level": str(level or "INFO").upper(),
        "event": str(event or "event"),
    }
    for key, value in fields.items():
        payload[str(key)] = _json_safe(value)
    text = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    method = getattr(_LOGGER, str(level or "info").strip().lower(), _LOGGER.info)
    method(text)


class InMemoryRouteMetrics:
    """
    Lightweight per-route request metrics for production troubleshooting.
    """

    def __init__(self, max_routes: int = 500):
        self.max_routes = max(50, int(max_routes))
        self._lock = threading.Lock()
        self._stats: dict[str, dict[str, int | float | str]] = {}

    def record(self, method: str, path: str, status_code: int, duration_ms: int) -> None:
        key = f"{str(method or 'GET').upper()} {str(path or '/').strip()}"
        status = int(status_code or 0)
        duration = max(0, int(duration_ms or 0))
        with self._lock:
            stat = self._stats.get(key)
            if stat is None:
                if len(self._stats) >= self.max_routes:
                    # Drop oldest inserted metric key if saturated.
                    oldest_key = next(iter(self._stats.keys()))
                    self._stats.pop(oldest_key, None)
                stat = {
                    "route": key,
                    "count": 0,
                    "errors_4xx": 0,
                    "errors_5xx": 0,
                    "duration_ms_total": 0,
                    "duration_ms_max": 0,
                    "duration_ms_last": 0,
                }
                self._stats[key] = stat

            stat["count"] = int(stat["count"]) + 1
            if 400 <= status <= 499:
                stat["errors_4xx"] = int(stat["errors_4xx"]) + 1
            if status >= 500:
                stat["errors_5xx"] = int(stat["errors_5xx"]) + 1
            stat["duration_ms_total"] = int(stat["duration_ms_total"]) + duration
            stat["duration_ms_max"] = max(int(stat["duration_ms_max"]), duration)
            stat["duration_ms_last"] = duration

    def snapshot(self, limit: int = 200) -> dict[str, Any]:
        cap = max(1, min(int(limit or 200), 1000))
        with self._lock:
            total_count = len(self._stats)
            rows = sorted(self._stats.values(), key=lambda row: int(row.get("count", 0)), reverse=True)[:cap]
        materialized: list[dict[str, Any]] = []
        for row in rows:
            count = max(1, int(row.get("count", 0)))
            duration_total = int(row.get("duration_ms_total", 0))
            materialized.append(
                {
                    "route": row.get("route"),
                    "count": count,
                    "errors_4xx": int(row.get("errors_4xx", 0)),
                    "errors_5xx": int(row.get("errors_5xx", 0)),
                    "duration_ms_avg": int(round(duration_total / count)),
                    "duration_ms_max": int(row.get("duration_ms_max", 0)),
                    "duration_ms_last": int(row.get("duration_ms_last", 0)),
                }
            )
        return {"route_count": total_count, "routes": materialized}


ROUTE_METRICS = InMemoryRouteMetrics()
