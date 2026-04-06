from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class TargetMetricCatalogItem(BaseModel):
    metric_key: str
    label: str
    unit: str


class TargetDomainCatalogItem(BaseModel):
    domain_key: str
    domain_label: str
    metrics: list[TargetMetricCatalogItem]


class TargetMetricCatalogResponse(BaseModel):
    items: list[TargetDomainCatalogItem]


class ClubTargetUpsertRequest(BaseModel):
    domain_key: str = Field(min_length=1, max_length=64)
    metric_key: str = Field(min_length=1, max_length=64)
    period_key: str = Field(min_length=1, max_length=32)
    period_start: date
    period_end: date
    target_value: float = Field(gt=0)

    @field_validator("domain_key", "metric_key", "period_key")
    @classmethod
    def _normalize_key(cls, value: str) -> str:
        return value.strip().lower()


class ClubTargetResponse(BaseModel):
    id: uuid.UUID
    club_id: uuid.UUID
    domain_key: str
    domain_label: str
    metric_key: str
    metric_label: str
    unit: str
    period_key: str
    period_start: date
    period_end: date
    target_value: float
    archived: bool
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ClubTargetListResponse(BaseModel):
    items: list[ClubTargetResponse]
    total_count: int
