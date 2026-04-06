from __future__ import annotations

import uuid
from datetime import datetime

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


class AdminDashboardSummaryResponse(BaseModel):
    member_count: int
    tee_occupancy: DashboardTeeOccupancy
    tee_warnings: list[DashboardNotice]
    recent_activity: list[DashboardActivityItem]
