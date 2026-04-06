from __future__ import annotations

import uuid
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    ClubConfig,
    FinanceTransaction,
    FinanceTransactionSource,
    Order,
    OrderStatus,
)
from app.schemas.admin_dashboard import DashboardActivityItem
from app.schemas.halfway import HalfwaySummaryResponse
from app.schemas.orders import OrderSummaryResponse
from app.services.order_service import OrderService

_ACTIVE_STATUSES = (OrderStatus.PLACED, OrderStatus.PREPARING, OrderStatus.READY)
_QUEUE_DISPLAY_LIMIT = 6
_TRANSACTION_DISPLAY_LIMIT = 10
_HALFWAY_SOURCES = (FinanceTransactionSource.POS, FinanceTransactionSource.ORDER)


def _today_utc_window(club_id: uuid.UUID, db: Session) -> tuple[datetime, datetime] | None:
    """Return (start_utc, end_utc) for today in the club's timezone, or None if no config."""
    config = db.scalar(select(ClubConfig).where(ClubConfig.club_id == club_id))
    if config is None:
        return None
    zone = ZoneInfo(config.timezone)
    today = datetime.now(zone).date()
    start = datetime.combine(today, time.min, tzinfo=zone).astimezone(UTC)
    end = datetime.combine(today + timedelta(days=1), time.min, tzinfo=zone).astimezone(UTC)
    return start, end


class HalfwayService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self._order_service = OrderService(db)

    def get_summary(self, *, club_id: uuid.UUID) -> HalfwaySummaryResponse:
        window = _today_utc_window(club_id, self.db)
        orders_today_count = self._get_orders_today_count(club_id, window)
        active_queue_count, queue_orders = self._get_queue(club_id)
        recent_transactions = self._get_recent_transactions(club_id, window)
        return HalfwaySummaryResponse(
            orders_today_count=orders_today_count,
            active_queue_count=active_queue_count,
            queue_orders=queue_orders,
            recent_transactions=recent_transactions,
        )

    def _get_orders_today_count(
        self,
        club_id: uuid.UUID,
        window: tuple[datetime, datetime] | None,
    ) -> int:
        if window is None:
            return 0
        start, end = window
        count = self.db.scalar(
            select(func.count())
            .select_from(Order)
            .where(
                Order.club_id == club_id,
                Order.created_at >= start,
                Order.created_at < end,
            )
        )
        return count or 0

    def _get_queue(self, club_id: uuid.UUID) -> tuple[int, list[OrderSummaryResponse]]:
        orders = list(
            self.db.scalars(
                select(Order)
                .options(
                    selectinload(Order.items),
                    selectinload(Order.person),
                    selectinload(Order.finance_tender_record),
                )
                .where(
                    Order.club_id == club_id,
                    Order.status.in_(tuple(_ACTIVE_STATUSES)),
                )
                .order_by(Order.created_at.asc())
            ).unique().all()
        )
        total = len(orders)
        display = [self._order_service.to_order_summary(o) for o in orders[:_QUEUE_DISPLAY_LIMIT]]
        return total, display

    def _get_recent_transactions(
        self,
        club_id: uuid.UUID,
        window: tuple[datetime, datetime] | None,
    ) -> list[DashboardActivityItem]:
        stmt = (
            select(FinanceTransaction)
            .where(
                FinanceTransaction.club_id == club_id,
                FinanceTransaction.source.in_(tuple(_HALFWAY_SOURCES)),
            )
            .order_by(FinanceTransaction.created_at.desc(), FinanceTransaction.id.desc())
        )
        if window is not None:
            start, end = window
            stmt = stmt.where(
                FinanceTransaction.created_at >= start,
                FinanceTransaction.created_at < end,
            )
        transactions = list(self.db.scalars(stmt.limit(_TRANSACTION_DISPLAY_LIMIT)).all())
        return [
            DashboardActivityItem(
                id=tx.id,
                description=tx.description,
                source=tx.source.value,
                type=tx.type.value,
                amount=str(abs(tx.amount)),
                created_at=tx.created_at,
            )
            for tx in transactions
        ]
