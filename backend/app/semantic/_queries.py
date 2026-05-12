"""Shared SQL helpers for the v1 KPI metrics.

Each helper is a pure read against the canonical tables (FinanceTransaction,
Booking, Order / OrderItem, PosTransaction / PosTransactionItem,
TeeSheetSlotState, ClubConfig, Tee, Course). Centralised so the four KPI
metric modules don't duplicate SQL: RevPATT and the F&B metric share
denominator semantics with RevPUR / effective green fee, and the green-fee
revenue formula is identical across RevPATT / RevPUR / effective green
fee.

Tenant scope is enforced at every helper — every query carries the
``club_id`` predicate. Phase 9A's vat_category tags at the originator
records (bookings.vat_category, order_items.vat_category,
pos_transaction_items.vat_category) drive the revenue split.
"""

from __future__ import annotations

import uuid
from datetime import time, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Booking,
    BookingStatus,
    ClubConfig,
    Course,
    FinanceTransaction,
    FinanceTransactionSource,
    FinanceTransactionType,
    Order,
    OrderItem,
    OrderStatus,
    PosTransaction,
    PosTransactionItem,
    Tee,
    TeeSheetSlotState,
    VatCategory,
)
from app.semantic._window import MetricWindow

ZERO = Decimal("0.00")


def green_fee_revenue(session: Session, *, club_id: uuid.UUID, window: MetricWindow) -> Decimal:
    """Sum of charge-type finance transactions where the originating booking
    is tagged ``vat_category='green_fee'`` and the transaction was posted
    in the window.
    """
    total = session.scalar(
        select(func.coalesce(func.sum(func.abs(FinanceTransaction.amount)), ZERO))
        .select_from(FinanceTransaction)
        .join(Booking, Booking.id == FinanceTransaction.reference_id)
        .where(
            FinanceTransaction.club_id == club_id,
            FinanceTransaction.type == FinanceTransactionType.CHARGE,
            FinanceTransaction.source == FinanceTransactionSource.BOOKING,
            Booking.vat_category == VatCategory.GREEN_FEE.value,
            FinanceTransaction.created_at >= window.start_utc,
            FinanceTransaction.created_at < window.end_utc,
        )
    )
    return total if total is not None else ZERO


def utilised_rounds(session: Session, *, club_id: uuid.UUID, window: MetricWindow) -> int:
    """Sum of ``party_size`` across bookings whose status is CHECKED_IN or
    COMPLETED with a ``slot_datetime`` in the window. Matches the brief:
    no-shows and cancellations do NOT count.
    """
    total = session.scalar(
        select(func.coalesce(func.sum(Booking.party_size), 0)).where(
            Booking.club_id == club_id,
            Booking.status.in_([BookingStatus.CHECKED_IN, BookingStatus.COMPLETED]),
            Booking.slot_datetime >= window.start_utc,
            Booking.slot_datetime < window.end_utc,
        )
    )
    return int(total or 0)


def fnb_revenue(session: Session, *, club_id: uuid.UUID, window: MetricWindow) -> Decimal:
    """Sum of F&B-tagged line revenue from both originator surfaces:
      * player-app halfway-house orders (order_items.vat_category='fnb',
        order status COLLECTED)
      * POS transactions (pos_transaction_items.vat_category='fnb', any
        tender type)
    Line revenue is summed directly; finance-transaction headers are not,
    to avoid double-counting.
    """
    order_branch = (
        session.scalar(
            select(
                func.coalesce(
                    func.sum(OrderItem.unit_price_snapshot * OrderItem.quantity),
                    ZERO,
                )
            )
            .select_from(OrderItem)
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                Order.club_id == club_id,
                Order.status == OrderStatus.COLLECTED,
                OrderItem.vat_category == VatCategory.FNB.value,
                Order.created_at >= window.start_utc,
                Order.created_at < window.end_utc,
            )
        )
        or ZERO
    )

    pos_branch = (
        session.scalar(
            select(
                func.coalesce(
                    func.sum(PosTransactionItem.unit_price_snapshot * PosTransactionItem.quantity),
                    ZERO,
                )
            )
            .select_from(PosTransactionItem)
            .join(PosTransaction, PosTransaction.id == PosTransactionItem.pos_transaction_id)
            .where(
                PosTransaction.club_id == club_id,
                PosTransactionItem.vat_category == VatCategory.FNB.value,
                PosTransaction.created_at >= window.start_utc,
                PosTransaction.created_at < window.end_utc,
            )
        )
        or ZERO
    )

    return order_branch + pos_branch


def generated_slot_count(session: Session, *, club_id: uuid.UUID, window: MetricWindow) -> int:
    """Compute the available tee-time slot denominator for RevPATT.

    Gross slots per day = ``(operating_minutes // default_slot_interval_minutes)
    × active_tees × 2 lanes`` (HOLE_1 + HOLE_10), with a one-row phantom
    fallback when no active tees exist — matches
    TeeSheetService._load_row_scopes. Blocked slots
    (``manually_blocked``, ``competition_controlled``, ``event_controlled``,
    ``externally_unavailable`` flags on TeeSheetSlotState) are subtracted.
    """
    config = session.scalar(select(ClubConfig).where(ClubConfig.club_id == club_id))
    if config is None:
        return 0
    interval = config.default_slot_interval_minutes
    if interval <= 0:
        return 0

    tees_count = (
        session.scalar(
            select(func.count())
            .select_from(Tee)
            .join(Course, Course.id == Tee.course_id)
            .where(Course.club_id == club_id, Tee.active.is_(True))
        )
        or 0
    )
    row_count = max(int(tees_count), 1) * 2  # HOLE_1 + HOLE_10 lanes

    operating = config.operating_hours or {}
    gross = 0
    current = window.date_from
    while current < window.date_to:
        day_hours = operating.get(current.strftime("%A").lower())
        gross += _slots_per_row_for_day(day_hours, interval_minutes=interval) * row_count
        current += timedelta(days=1)

    blocked = (
        session.scalar(
            select(func.count())
            .select_from(TeeSheetSlotState)
            .where(
                TeeSheetSlotState.club_id == club_id,
                TeeSheetSlotState.slot_datetime >= window.start_utc,
                TeeSheetSlotState.slot_datetime < window.end_utc,
                or_(
                    TeeSheetSlotState.manually_blocked.is_(True),
                    TeeSheetSlotState.competition_controlled.is_(True),
                    TeeSheetSlotState.event_controlled.is_(True),
                    TeeSheetSlotState.externally_unavailable.is_(True),
                ),
            )
        )
        or 0
    )

    return max(gross - int(blocked), 0)


def safe_ratio(numerator: Decimal, denominator: int | Decimal) -> Decimal:
    """Quantise ``numerator / denominator`` to two decimal places, returning
    ``Decimal('0.00')`` when the denominator is zero. Money math — floats
    stay out of the chain.
    """
    if isinstance(denominator, Decimal):
        if denominator == ZERO:
            return ZERO
        return (numerator / denominator).quantize(Decimal("0.01"))
    if denominator <= 0:
        return ZERO
    return (numerator / Decimal(denominator)).quantize(Decimal("0.01"))


def _slots_per_row_for_day(day_hours: object, *, interval_minutes: int) -> int:
    if not isinstance(day_hours, dict) or day_hours.get("closed"):
        return 0
    open_t = _parse_hhmm(day_hours.get("open"))
    close_t = _parse_hhmm(day_hours.get("close"))
    if open_t is None or close_t is None or close_t <= open_t:
        return 0
    open_minutes = open_t.hour * 60 + open_t.minute
    close_minutes = close_t.hour * 60 + close_t.minute
    return (close_minutes - open_minutes) // interval_minutes


def _parse_hhmm(value: object) -> time | None:
    if not isinstance(value, str) or ":" not in value:
        return None
    hours, minutes = value.split(":", 1)
    if not hours.isdigit() or not minutes.isdigit():
        return None
    return time(hour=int(hours), minute=int(minutes))
