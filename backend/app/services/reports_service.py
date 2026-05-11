from __future__ import annotations

import uuid
from collections import Counter
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AccountCustomer,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Course,
    Order,
    OrderStatus,
)
from app.schemas.reports import (
    MemberBreakdown,
    OrderStatusBreakdown,
    OrderStatusCount,
    ReportsSummaryResponse,
)

_ORDER_STATUS_ORDER = [
    OrderStatus.PLACED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.COLLECTED,
    OrderStatus.CANCELLED,
]


class ReportsService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_summary(self, *, club_id: uuid.UUID) -> ReportsSummaryResponse:
        return ReportsSummaryResponse(
            member_breakdown=self._get_member_breakdown(club_id),
            order_status_breakdown=self._get_order_status_breakdown(club_id),
            course_count=self._get_course_count(club_id),
        )

    def _get_member_breakdown(self, club_id: uuid.UUID) -> MemberBreakdown:
        rows = list(
            self.db.execute(
                select(ClubMembership.role, func.count().label("cnt"))
                .where(
                    ClubMembership.club_id == club_id,
                    ClubMembership.status == ClubMembershipStatus.ACTIVE,
                )
                .group_by(ClubMembership.role)
            ).all()
        )
        counts: Counter[str] = Counter()
        for role, cnt in rows:
            counts[role] = cnt

        admin_count = counts[ClubMembershipRole.CLUB_ADMIN]
        staff_count = counts[ClubMembershipRole.CLUB_STAFF]
        member_count = counts[ClubMembershipRole.MEMBER]
        total = admin_count + staff_count + member_count

        def pct(n: int) -> int:
            return round(n / total * 100) if total > 0 else 0

        # Members with no linked AccountCustomer for this club
        account_person_ids = select(AccountCustomer.person_id).where(
            AccountCustomer.club_id == club_id
        )
        no_account_count: int = (
            self.db.scalar(
                select(func.count())
                .select_from(ClubMembership)
                .where(
                    ClubMembership.club_id == club_id,
                    ClubMembership.status == ClubMembershipStatus.ACTIVE,
                    ClubMembership.person_id.notin_(account_person_ids),
                )
            )
            or 0
        )

        # Members who joined in the last 30 days
        thirty_days_ago = datetime.now(UTC) - timedelta(days=30)
        new_member_count: int = (
            self.db.scalar(
                select(func.count())
                .select_from(ClubMembership)
                .where(
                    ClubMembership.club_id == club_id,
                    ClubMembership.status == ClubMembershipStatus.ACTIVE,
                    ClubMembership.joined_at >= thirty_days_ago,
                )
            )
            or 0
        )

        return MemberBreakdown(
            total=total,
            admin_count=admin_count,
            staff_count=staff_count,
            member_count=member_count,
            admin_pct=pct(admin_count),
            staff_pct=pct(staff_count),
            member_pct=pct(member_count),
            no_account_count=no_account_count,
            new_member_count=new_member_count,
        )

    def _get_order_status_breakdown(self, club_id: uuid.UUID) -> OrderStatusBreakdown:
        rows = list(
            self.db.execute(
                select(Order.status, func.count().label("cnt"))
                .where(Order.club_id == club_id)
                .group_by(Order.status)
            ).all()
        )
        counts: Counter[str] = Counter()
        for status, cnt in rows:
            counts[status] = cnt

        total = sum(counts.values())

        def pct(n: int) -> int:
            return round(n / total * 100) if total > 0 else 0

        by_status = [
            OrderStatusCount(
                status=status.value,
                count=counts[status],
                pct=pct(counts[status]),
            )
            for status in _ORDER_STATUS_ORDER
            if counts[status] > 0
        ]

        return OrderStatusBreakdown(
            total=total,
            collected_count=counts[OrderStatus.COLLECTED],
            by_status=by_status,
        )

    def _get_course_count(self, club_id: uuid.UUID) -> int:
        count = self.db.scalar(
            select(func.count()).select_from(Course).where(Course.club_id == club_id)
        )
        return count or 0
