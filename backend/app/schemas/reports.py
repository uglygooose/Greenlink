from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

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


# ---------- Member-stats read-model schemas ------------------------------


class MemberStatsSummaryResponse(BaseModel):
    """Club-wide membership distributions + recent-activity counters.

    Tier breakdown uses ClubMembershipRole (club_admin / club_staff / member)
    as the v1 tier proxy because the codebase does not yet model
    full/country/junior/social/honorary tiers. Phase 10+ adds tier metadata
    on ClubMembership; this schema will expand then. Tenure buckets are
    derived from ClubMembership.joined_at and the reference date.
    """

    club_id: uuid.UUID
    reference_date: date
    total_members: int
    by_role: dict[str, int]
    by_status: dict[str, int]
    by_tenure_bucket: dict[str, int]
    growth_this_month: int
    average_tenure_days: int | None


class MemberActivityResponse(BaseModel):
    """Per-member activity for an optional window. ``rounds`` counts
    bookings where the member is a participant and the booking is
    CHECKED_IN or COMPLETED; ``spend`` sums absolute finance-transaction
    charge amounts on the member's finance account(s); ``last_played``
    is the most recent slot_datetime across the same booking set (date
    only, in the club's timezone).
    """

    person_id: uuid.UUID
    rounds: int
    spend: Decimal
    last_played: date | None
