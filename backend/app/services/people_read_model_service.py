"""Member-stats read model.

Methods accept ``(session, club_id, …)`` plus an optional :class:`TimeWindow`
and return Pydantic response models from ``app.schemas.reports``.

Three public methods, all tenant-scoped:

* :meth:`summary` — club-wide membership distributions by role / status /
  tenure bucket plus aggregates.
* :meth:`list_member_activity` — every member's activity (rounds, spend,
  last-played) for the supplied window. Drives the ``member_stats``
  metric's all-club shape.
* :meth:`member_activity` — single-person activity for the same window.

Tenure bucketing uses ``ClubMembership.joined_at`` against a reference
date (defaults to "today" in the club's timezone). The role-based "tier"
proxy is documented in :class:`MemberStatsSummaryResponse`. A ``window``
of ``None`` means "all-time" for activity queries.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models import (
    AccountCustomer,
    Booking,
    BookingParticipant,
    BookingStatus,
    Club,
    ClubMembership,
    ClubMembershipStatus,
    FinanceAccount,
    FinanceTransaction,
    FinanceTransactionType,
)
from app.schemas.reports import MemberActivityResponse, MemberStatsSummaryResponse
from app.services._window import TimeWindow

ZERO = Decimal("0.00")
UTILISED_STATUSES = (BookingStatus.CHECKED_IN, BookingStatus.COMPLETED)

TENURE_UNDER_1Y = "under_1y"
TENURE_1_5Y = "1_to_5y"
TENURE_5_10Y = "5_to_10y"
TENURE_10_PLUS_Y = "10y_plus"
TENURE_BUCKETS = (TENURE_UNDER_1Y, TENURE_1_5Y, TENURE_5_10Y, TENURE_10_PLUS_Y)


class PeopleReadModelService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ----- summary -------------------------------------------------------

    def summary(
        self,
        *,
        club_id: uuid.UUID,
        reference_date: date | None = None,
    ) -> MemberStatsSummaryResponse:
        club = self._load_club(club_id)
        zone = ZoneInfo(club.timezone)
        today_local = datetime.now(zone).date()
        ref_date = reference_date or today_local

        memberships = list(
            self.db.scalars(select(ClubMembership).where(ClubMembership.club_id == club_id)).all()
        )

        by_role: dict[str, int] = {}
        by_status: dict[str, int] = {}
        by_tenure: dict[str, int] = {bucket: 0 for bucket in TENURE_BUCKETS}
        tenure_total_days = 0
        active_count = 0
        growth_this_month = 0
        first_of_month = ref_date.replace(day=1)
        first_of_month_utc = datetime.combine(
            first_of_month, datetime.min.time(), tzinfo=zone
        ).astimezone(UTC)

        for membership in memberships:
            role_key = membership.role.value
            by_role[role_key] = by_role.get(role_key, 0) + 1
            status_key = membership.status.value
            by_status[status_key] = by_status.get(status_key, 0) + 1

            tenure_days = (
                (ref_date - membership.joined_at.astimezone(zone).date()).days
                if membership.joined_at is not None
                else 0
            )
            tenure_days = max(tenure_days, 0)
            by_tenure[_bucket_for_days(tenure_days)] += 1
            if membership.status == ClubMembershipStatus.ACTIVE:
                tenure_total_days += tenure_days
                active_count += 1
            if (
                membership.joined_at is not None
                and membership.joined_at >= first_of_month_utc
                and membership.status == ClubMembershipStatus.ACTIVE
            ):
                growth_this_month += 1

        average = tenure_total_days // active_count if active_count else None

        return MemberStatsSummaryResponse(
            club_id=club_id,
            reference_date=ref_date,
            total_members=len(memberships),
            by_role=by_role,
            by_status=by_status,
            by_tenure_bucket=by_tenure,
            growth_this_month=growth_this_month,
            average_tenure_days=average,
        )

    # ----- per-member activity ------------------------------------------

    def member_activity(
        self,
        *,
        club_id: uuid.UUID,
        person_id: uuid.UUID,
        window: TimeWindow | None = None,
    ) -> MemberActivityResponse:
        entries = self._build_activity_rows(
            club_id=club_id,
            window=window,
            person_ids=[person_id],
        )
        if entries:
            return entries[0]
        return MemberActivityResponse(person_id=person_id, rounds=0, spend=ZERO, last_played=None)

    def list_member_activity(
        self,
        *,
        club_id: uuid.UUID,
        window: TimeWindow | None = None,
    ) -> list[MemberActivityResponse]:
        member_person_ids = list(
            self.db.scalars(
                select(ClubMembership.person_id).where(ClubMembership.club_id == club_id)
            ).all()
        )
        if not member_person_ids:
            return []
        rows = self._build_activity_rows(
            club_id=club_id,
            window=window,
            person_ids=member_person_ids,
        )
        # Stable ordering: by person_id string for deterministic test output.
        rows.sort(key=lambda entry: str(entry.person_id))
        return rows

    # ----- internals -----------------------------------------------------

    def _build_activity_rows(
        self,
        *,
        club_id: uuid.UUID,
        window: TimeWindow | None,
        person_ids: list[uuid.UUID],
    ) -> list[MemberActivityResponse]:
        if not person_ids:
            return []
        club = self._load_club(club_id)
        zone = ZoneInfo(club.timezone)

        rounds_stmt = (
            select(
                BookingParticipant.person_id,
                func.count(Booking.id).label("rounds"),
                func.max(Booking.slot_datetime).label("last_played_utc"),
            )
            .join(Booking, Booking.id == BookingParticipant.booking_id)
            .where(
                Booking.club_id == club_id,
                Booking.status.in_(UTILISED_STATUSES),
                BookingParticipant.person_id.in_(person_ids),
            )
            .group_by(BookingParticipant.person_id)
        )
        if window is not None:
            rounds_stmt = rounds_stmt.where(
                Booking.slot_datetime >= window.start_utc,
                Booking.slot_datetime < window.end_utc,
            )
        rounds_rows = self.db.execute(rounds_stmt).all()
        rounds_by_person: dict[uuid.UUID, tuple[int, datetime | None]] = {
            row.person_id: (int(row.rounds), row.last_played_utc) for row in rounds_rows
        }

        # Spend = sum of |amount| on charge-type finance transactions posted
        # against any finance account whose account_customer is this person.
        spend_stmt = (
            select(
                AccountCustomer.person_id,
                func.coalesce(func.sum(func.abs(FinanceTransaction.amount)), ZERO).label("spend"),
            )
            .select_from(FinanceTransaction)
            .join(FinanceAccount, FinanceAccount.id == FinanceTransaction.account_id)
            .join(AccountCustomer, AccountCustomer.id == FinanceAccount.account_customer_id)
            .where(
                FinanceTransaction.club_id == club_id,
                FinanceTransaction.type == FinanceTransactionType.CHARGE,
                AccountCustomer.person_id.in_(person_ids),
            )
            .group_by(AccountCustomer.person_id)
        )
        if window is not None:
            spend_stmt = spend_stmt.where(
                FinanceTransaction.created_at >= window.start_utc,
                FinanceTransaction.created_at < window.end_utc,
            )
        spend_rows = self.db.execute(spend_stmt).all()
        spend_by_person: dict[uuid.UUID, Decimal] = {row.person_id: row.spend for row in spend_rows}

        results: list[MemberActivityResponse] = []
        for person_id in person_ids:
            rounds, last_played_utc = rounds_by_person.get(person_id, (0, None))
            spend = spend_by_person.get(person_id, ZERO)
            last_played: date | None = None
            if last_played_utc is not None:
                last_played = last_played_utc.astimezone(zone).date()
            results.append(
                MemberActivityResponse(
                    person_id=person_id,
                    rounds=rounds,
                    spend=spend,
                    last_played=last_played,
                )
            )
        return results

    def _load_club(self, club_id: uuid.UUID) -> Club:
        club = self.db.scalar(select(Club).where(Club.id == club_id))
        if club is None:
            raise NotFoundError("Club not found")
        return club


def _bucket_for_days(days: int) -> str:
    if days < 365:
        return TENURE_UNDER_1Y
    if days < 365 * 5:
        return TENURE_1_5Y
    if days < 365 * 10:
        return TENURE_5_10Y
    return TENURE_10_PLUS_Y
