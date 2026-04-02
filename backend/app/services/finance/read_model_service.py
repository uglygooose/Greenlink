from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models import Club, FinanceAccount, FinanceTransaction, FinanceTransactionSource, FinanceTransactionType
from app.schemas.finance import (
    FinanceOutstandingSummaryResponse,
    FinanceRevenuePeriodSummaryResponse,
    FinanceRevenueSourceSummaryResponse,
    FinanceRevenueSummaryResponse,
    FinanceSummaryPeriod,
    FinanceTransactionVolumePeriodSummaryResponse,
    FinanceTransactionVolumeSummaryResponse,
    FinanceTransactionVolumeTypeSummaryResponse,
)

ZERO = Decimal("0.00")
OPERATIONAL_REVENUE_SOURCES = {
    FinanceTransactionSource.POS,
    FinanceTransactionSource.ORDER,
}


@dataclass(frozen=True, slots=True)
class SummaryWindow:
    period: FinanceSummaryPeriod
    start_local_date: date
    end_local_date: date
    start_utc: datetime
    end_utc: datetime


class FinanceReadModelService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_revenue_summary(
        self,
        *,
        club_id: uuid.UUID,
        reference_datetime: datetime | None = None,
    ) -> FinanceRevenueSummaryResponse:
        timezone_name, normalized_reference_datetime, windows = self._build_windows(
            club_id=club_id,
            reference_datetime=reference_datetime,
        )
        earliest_start = min(window.start_utc for window in windows.values())
        transactions = list(
            self.db.scalars(
                select(FinanceTransaction).where(
                    FinanceTransaction.club_id == club_id,
                    FinanceTransaction.type == FinanceTransactionType.CHARGE,
                    FinanceTransaction.created_at >= earliest_start,
                    FinanceTransaction.created_at < windows[FinanceSummaryPeriod.MONTH].end_utc,
                )
            ).all()
        )

        period_totals = {
            period: {
                "total_revenue": ZERO,
                "operational_revenue": ZERO,
                "charge_count": 0,
                "by_source": defaultdict(lambda: {"total_revenue": ZERO, "charge_count": 0}),
            }
            for period in FinanceSummaryPeriod
        }

        for transaction in transactions:
            revenue_amount = abs(transaction.amount)
            for period, window in windows.items():
                if not (window.start_utc <= transaction.created_at < window.end_utc):
                    continue
                bucket = period_totals[period]
                bucket["total_revenue"] += revenue_amount
                bucket["charge_count"] += 1
                if transaction.source in OPERATIONAL_REVENUE_SOURCES:
                    bucket["operational_revenue"] += revenue_amount
                source_bucket = bucket["by_source"][transaction.source]
                source_bucket["total_revenue"] += revenue_amount
                source_bucket["charge_count"] += 1

        return FinanceRevenueSummaryResponse(
            timezone=timezone_name,
            reference_datetime=normalized_reference_datetime,
            day=self._to_revenue_period_summary(windows[FinanceSummaryPeriod.DAY], period_totals[FinanceSummaryPeriod.DAY]),
            week=self._to_revenue_period_summary(windows[FinanceSummaryPeriod.WEEK], period_totals[FinanceSummaryPeriod.WEEK]),
            month=self._to_revenue_period_summary(windows[FinanceSummaryPeriod.MONTH], period_totals[FinanceSummaryPeriod.MONTH]),
        )

    def get_transaction_volume_summary(
        self,
        *,
        club_id: uuid.UUID,
        reference_datetime: datetime | None = None,
    ) -> FinanceTransactionVolumeSummaryResponse:
        timezone_name, normalized_reference_datetime, windows = self._build_windows(
            club_id=club_id,
            reference_datetime=reference_datetime,
        )
        earliest_start = min(window.start_utc for window in windows.values())
        transactions = list(
            self.db.scalars(
                select(FinanceTransaction).where(
                    FinanceTransaction.club_id == club_id,
                    FinanceTransaction.created_at >= earliest_start,
                    FinanceTransaction.created_at < windows[FinanceSummaryPeriod.MONTH].end_utc,
                )
            ).all()
        )

        period_totals = {
            period: {
                "total_transaction_count": 0,
                "by_type": defaultdict(lambda: {"transaction_count": 0, "total_absolute_amount": ZERO}),
            }
            for period in FinanceSummaryPeriod
        }

        for transaction in transactions:
            absolute_amount = abs(transaction.amount)
            for period, window in windows.items():
                if not (window.start_utc <= transaction.created_at < window.end_utc):
                    continue
                bucket = period_totals[period]
                bucket["total_transaction_count"] += 1
                type_bucket = bucket["by_type"][transaction.type]
                type_bucket["transaction_count"] += 1
                type_bucket["total_absolute_amount"] += absolute_amount

        return FinanceTransactionVolumeSummaryResponse(
            timezone=timezone_name,
            reference_datetime=normalized_reference_datetime,
            day=self._to_transaction_volume_period_summary(
                windows[FinanceSummaryPeriod.DAY],
                period_totals[FinanceSummaryPeriod.DAY],
            ),
            week=self._to_transaction_volume_period_summary(
                windows[FinanceSummaryPeriod.WEEK],
                period_totals[FinanceSummaryPeriod.WEEK],
            ),
            month=self._to_transaction_volume_period_summary(
                windows[FinanceSummaryPeriod.MONTH],
                period_totals[FinanceSummaryPeriod.MONTH],
            ),
        )

    def get_outstanding_summary(
        self,
        *,
        club_id: uuid.UUID,
    ) -> FinanceOutstandingSummaryResponse:
        accounts = list(
            self.db.scalars(select(FinanceAccount).where(FinanceAccount.club_id == club_id)).all()
        )
        transactions = list(
            self.db.scalars(select(FinanceTransaction).where(FinanceTransaction.club_id == club_id)).all()
        )

        balances_by_account: dict[uuid.UUID, Decimal] = {account.id: ZERO for account in accounts}
        order_net_by_reference: dict[uuid.UUID, Decimal] = defaultdict(lambda: ZERO)
        pending_item_count = 0

        for transaction in transactions:
            balances_by_account[transaction.account_id] = (
                balances_by_account.get(transaction.account_id, ZERO) + transaction.amount
            )
            if transaction.source == FinanceTransactionSource.ORDER and transaction.reference_id is not None:
                order_net_by_reference[transaction.reference_id] += transaction.amount
            if transaction.type == FinanceTransactionType.CHARGE and transaction.amount < 0:
                pending_item_count += 1

        accounts_in_arrears = sum(1 for balance in balances_by_account.values() if balance < 0)
        accounts_in_credit = sum(1 for balance in balances_by_account.values() if balance > 0)
        accounts_settled = sum(1 for balance in balances_by_account.values() if balance == 0)
        total_outstanding_amount = sum(
            (abs(balance) for balance in balances_by_account.values() if balance < 0),
            start=ZERO,
        )

        unpaid_order_balances = [abs(balance) for balance in order_net_by_reference.values() if balance < 0]

        return FinanceOutstandingSummaryResponse(
            total_accounts=len(accounts),
            accounts_in_arrears=accounts_in_arrears,
            accounts_in_credit=accounts_in_credit,
            accounts_settled=accounts_settled,
            total_outstanding_amount=total_outstanding_amount,
            unpaid_order_postings_count=len(unpaid_order_balances),
            unpaid_order_postings_amount=sum(unpaid_order_balances, start=ZERO),
            pending_items_count=pending_item_count,
        )

    def _build_windows(
        self,
        *,
        club_id: uuid.UUID,
        reference_datetime: datetime | None,
    ) -> tuple[str, datetime, dict[FinanceSummaryPeriod, SummaryWindow]]:
        club = self.db.get(Club, club_id)
        if club is None:
            raise NotFoundError("Club not found")
        zone = ZoneInfo(club.timezone)
        normalized_reference_datetime = (
            reference_datetime.astimezone(UTC)
            if reference_datetime is not None
            else datetime.now(UTC)
        )
        local_reference = normalized_reference_datetime.astimezone(zone)
        local_day = local_reference.date()
        week_start = local_day - timedelta(days=local_day.weekday())
        next_day = local_day + timedelta(days=1)
        next_week = week_start + timedelta(days=7)
        month_start = local_day.replace(day=1)
        next_month = (
            local_day.replace(year=local_day.year + 1, month=1, day=1)
            if local_day.month == 12
            else local_day.replace(month=local_day.month + 1, day=1)
        )
        windows = {
            FinanceSummaryPeriod.DAY: self._summary_window(FinanceSummaryPeriod.DAY, local_day, next_day, zone),
            FinanceSummaryPeriod.WEEK: self._summary_window(FinanceSummaryPeriod.WEEK, week_start, next_week, zone),
            FinanceSummaryPeriod.MONTH: self._summary_window(FinanceSummaryPeriod.MONTH, month_start, next_month, zone),
        }
        return club.timezone, normalized_reference_datetime, windows

    def _summary_window(
        self,
        period: FinanceSummaryPeriod,
        start_local_date: date,
        exclusive_end_local_date: date,
        zone: ZoneInfo,
    ) -> SummaryWindow:
        start_utc = datetime.combine(start_local_date, datetime.min.time(), tzinfo=zone).astimezone(UTC)
        end_utc = datetime.combine(exclusive_end_local_date, datetime.min.time(), tzinfo=zone).astimezone(UTC)
        return SummaryWindow(
            period=period,
            start_local_date=start_local_date,
            end_local_date=exclusive_end_local_date - timedelta(days=1),
            start_utc=start_utc,
            end_utc=end_utc,
        )

    def _to_revenue_period_summary(
        self,
        window: SummaryWindow,
        bucket: dict[str, object],
    ) -> FinanceRevenuePeriodSummaryResponse:
        by_source = [
            FinanceRevenueSourceSummaryResponse(
                source=source,
                total_revenue=values["total_revenue"],
                charge_count=values["charge_count"],
            )
            for source, values in sorted(
                bucket["by_source"].items(),
                key=lambda item: (-item[1]["total_revenue"], item[0].value),
            )
            if values["charge_count"] > 0
        ]
        return FinanceRevenuePeriodSummaryResponse(
            period=window.period,
            date_from=window.start_local_date,
            date_to=window.end_local_date,
            total_revenue=bucket["total_revenue"],
            operational_revenue=bucket["operational_revenue"],
            charge_count=bucket["charge_count"],
            by_source=by_source,
        )

    def _to_transaction_volume_period_summary(
        self,
        window: SummaryWindow,
        bucket: dict[str, object],
    ) -> FinanceTransactionVolumePeriodSummaryResponse:
        by_type = [
            FinanceTransactionVolumeTypeSummaryResponse(
                type=tx_type,
                transaction_count=values["transaction_count"],
                total_absolute_amount=values["total_absolute_amount"],
            )
            for tx_type, values in sorted(
                bucket["by_type"].items(),
                key=lambda item: (-item[1]["transaction_count"], item[0].value),
            )
            if values["transaction_count"] > 0
        ]
        return FinanceTransactionVolumePeriodSummaryResponse(
            period=window.period,
            date_from=window.start_local_date,
            date_to=window.end_local_date,
            total_transaction_count=bucket["total_transaction_count"],
            by_type=by_type,
        )
