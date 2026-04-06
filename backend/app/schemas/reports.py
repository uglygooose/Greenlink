from __future__ import annotations

from pydantic import BaseModel


class MemberBreakdown(BaseModel):
    total: int
    admin_count: int
    staff_count: int
    member_count: int
    admin_pct: int
    staff_pct: int
    member_pct: int
    no_account_count: int
    new_member_count: int


class OrderStatusCount(BaseModel):
    status: str
    count: int
    pct: int


class OrderStatusBreakdown(BaseModel):
    total: int
    collected_count: int
    by_status: list[OrderStatusCount]


class ReportsSummaryResponse(BaseModel):
    member_breakdown: MemberBreakdown
    order_status_breakdown: OrderStatusBreakdown
    course_count: int
