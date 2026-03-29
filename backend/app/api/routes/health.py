from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.config import get_settings
from app.db import SessionLocal
from app.observability.redis import check_redis_health
from app.schemas.shared import HealthResponse, ReadinessState

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    db_ready = False
    with SessionLocal() as db:
        try:
            db.execute(text("SELECT 1"))
            db_ready = True
        except Exception:
            db_ready = False

    redis_ready = check_redis_health(settings.redis_url)
    return HealthResponse(
        app=ReadinessState(ready=True),
        db=ReadinessState(ready=db_ready),
        redis=ReadinessState(ready=redis_ready),
    )
