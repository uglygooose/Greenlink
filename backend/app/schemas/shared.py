from __future__ import annotations

from pydantic import BaseModel


class ErrorResponse(BaseModel):
    code: str
    message: str
    correlation_id: str | None = None


class ReadinessState(BaseModel):
    ready: bool


class HealthResponse(BaseModel):
    app: ReadinessState
    db: ReadinessState
    redis: ReadinessState
