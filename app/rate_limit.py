from __future__ import annotations

import os
import threading
import time
from collections import deque
from typing import Deque, Dict, Tuple

from fastapi import Request


def _env_int(key: str, default: int) -> int:
    raw = os.getenv(key)
    if raw is None:
        return int(default)
    try:
        return int(str(raw).strip())
    except Exception:
        return int(default)


class InMemoryRateLimiter:
    """
    Lightweight in-memory sliding-window limiter.

    Good enough for single-instance deployments and local development.
    """

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max(1, int(max_requests))
        self.window_seconds = max(1, int(window_seconds))
        self._lock = threading.Lock()
        self._events: Dict[str, Deque[float]] = {}

    def _prune(self, q: Deque[float], now: float) -> None:
        cutoff = now - self.window_seconds
        while q and q[0] <= cutoff:
            q.popleft()

    def check(self, key: str) -> Tuple[bool, int, int]:
        """
        Returns:
        - allowed
        - retry_after_seconds
        - remaining_requests_in_window
        """
        now = time.time()
        normalized = str(key or "").strip() or "anon"

        with self._lock:
            q = self._events.get(normalized)
            if q is None:
                q = deque()
                self._events[normalized] = q

            self._prune(q, now)
            if len(q) >= self.max_requests:
                retry_after = max(1, int((q[0] + self.window_seconds) - now))
                return False, retry_after, 0

            q.append(now)
            remaining = max(0, self.max_requests - len(q))
            return True, 0, remaining

    def reset(self, key: str) -> None:
        normalized = str(key or "").strip() or "anon"
        with self._lock:
            self._events.pop(normalized, None)

    def snapshot(self) -> dict:
        now = time.time()
        with self._lock:
            active_keys = 0
            active_events = 0
            for key, q in list(self._events.items()):
                self._prune(q, now)
                if not q:
                    self._events.pop(key, None)
                    continue
                active_keys += 1
                active_events += len(q)
            return {
                "max_requests": int(self.max_requests),
                "window_seconds": int(self.window_seconds),
                "active_keys": int(active_keys),
                "active_events": int(active_events),
            }


def client_ip_from_request(request: Request) -> str:
    # Respect reverse-proxy headers when present.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        first = str(fwd).split(",")[0].strip()
        if first:
            return first
    real_ip = request.headers.get("x-real-ip")
    if real_ip and str(real_ip).strip():
        return str(real_ip).strip()
    if request.client and request.client.host:
        return str(request.client.host)
    return "unknown"


def normalize_identity(value: str | None, default: str = "anon") -> str:
    text = str(value or "").strip().lower()
    return text or default


LOGIN_RATE_LIMITER = InMemoryRateLimiter(
    max_requests=_env_int("LOGIN_RATE_LIMIT", 10),
    window_seconds=_env_int("LOGIN_RATE_WINDOW_SECONDS", 60),
)

SIGNUP_RATE_LIMITER = InMemoryRateLimiter(
    max_requests=_env_int("SIGNUP_RATE_LIMIT", 8),
    window_seconds=_env_int("SIGNUP_RATE_WINDOW_SECONDS", 300),
)

IMPORT_RATE_LIMITER = InMemoryRateLimiter(
    max_requests=_env_int("IMPORT_RATE_LIMIT", 20),
    window_seconds=_env_int("IMPORT_RATE_WINDOW_SECONDS", 300),
)
