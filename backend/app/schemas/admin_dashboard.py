from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel


class DashboardActivityItem(BaseModel):
    id: uuid.UUID
    description: str
    source: str
    type: str
    amount: str
    created_at: datetime


class DashboardTeeOccupancy(BaseModel):
    booked_slots: int
    total_slots: int
    occupancy_pct: int | None


class DashboardNotice(BaseModel):
    code: str
    message: str


class DashboardTargetContext(BaseModel):
    """An active club target for the current period, surfaced alongside dashboard KPIs."""

    domain_key: str
    domain_label: str
    metric_key: str
    metric_label: str
    period_key: str
    period_start: date
    period_end: date
    target_value: float
    unit: str


class AdminDashboardSummaryResponse(BaseModel):
    member_count: int
    tee_occupancy: DashboardTeeOccupancy
    tee_warnings: list[DashboardNotice]
    recent_activity: list[DashboardActivityItem]
    active_targets: list[DashboardTargetContext] = []
