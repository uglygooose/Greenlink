from __future__ import annotations

from pydantic import BaseModel

from app.schemas.admin_dashboard import DashboardActivityItem
from app.schemas.orders import OrderSummaryResponse


class HalfwaySummaryResponse(BaseModel):
    orders_today_count: int
    active_queue_count: int
    queue_orders: list[OrderSummaryResponse]
    recent_transactions: list[DashboardActivityItem]
