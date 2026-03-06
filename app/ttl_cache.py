from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Generic, TypeVar

K = TypeVar("K")
V = TypeVar("V")


@dataclass
class _CacheEntry(Generic[V]):
    value: V
    expires_at: float


class TTLCache(Generic[K, V]):
    """
    Simple thread-safe in-memory TTL cache for hot API paths.
    """

    def __init__(self, ttl_seconds: int = 30, max_entries: int = 256):
        self.ttl_seconds = max(1, int(ttl_seconds))
        self.max_entries = max(16, int(max_entries))
        self._lock = threading.Lock()
        self._store: dict[K, _CacheEntry[V]] = {}

    def _now(self) -> float:
        return time.monotonic()

    def _prune_expired(self, now: float) -> None:
        expired = [k for k, entry in self._store.items() if entry.expires_at <= now]
        for key in expired:
            self._store.pop(key, None)

    def get(self, key: K) -> V | None:
        now = self._now()
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            if entry.expires_at <= now:
                self._store.pop(key, None)
                return None
            return entry.value

    def set(self, key: K, value: V) -> None:
        now = self._now()
        with self._lock:
            self._prune_expired(now)
            if len(self._store) >= self.max_entries:
                # Evict oldest expiring entry.
                oldest_key = min(self._store.items(), key=lambda item: item[1].expires_at)[0]
                self._store.pop(oldest_key, None)
            self._store[key] = _CacheEntry(value=value, expires_at=now + self.ttl_seconds)

    def delete(self, key: K) -> None:
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def snapshot(self) -> dict[str, int]:
        now = self._now()
        with self._lock:
            self._prune_expired(now)
            return {"entries": len(self._store), "ttl_seconds": int(self.ttl_seconds), "max_entries": int(self.max_entries)}
