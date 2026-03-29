from __future__ import annotations

import redis


def check_redis_health(redis_url: str) -> bool:
    try:
        client = redis.from_url(redis_url, decode_responses=True)
        return bool(client.ping())
    except Exception:
        return False
