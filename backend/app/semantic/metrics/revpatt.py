from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.semantic._queries import (
    generated_slot_count,
    green_fee_revenue,
    safe_ratio,
)
from app.semantic._window import resolve_window
from app.semantic.base import Metric
from app.semantic.registry import register

ZERO = Decimal("0.00")


class RevPATTResult(BaseModel):
    value: Decimal


class _RevPATTMetric(Metric):
    def compute(
        self,
        session: Session,
        club_id: uuid.UUID,
        **params: object,
    ) -> RevPATTResult:
        """Revenue per Available Tee Time.

        SQL summary::

            value = SUM(ABS(ft.amount))
                      FROM finance_transactions ft
                      JOIN bookings b ON b.id = ft.reference_id
                      WHERE ft.club_id = :club
                        AND ft.type = 'charge'
                        AND ft.source = 'booking'
                        AND b.vat_category = 'green_fee'
                        AND ft.created_at IN [start_utc, end_utc)
                    /
                    (generated_slot_count - blocked_slot_count)

        ``generated_slot_count`` is derived from ClubConfig.operating_hours
        × active tees × 2 lanes (HOLE_1, HOLE_10); blocked slots in
        TeeSheetSlotState are subtracted.
        """
        window = resolve_window(
            session,
            club_id=club_id,
            date_from=_optional_date(params.get("date_from")),
            date_to=_optional_date(params.get("date_to")),
        )
        revenue = green_fee_revenue(session, club_id=club_id, window=window)
        slots = generated_slot_count(session, club_id=club_id, window=window)
        return RevPATTResult(value=safe_ratio(revenue, slots))


def _optional_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    raise TypeError(f"date_from/date_to must be date, got {type(value)!r}")


revpatt = _RevPATTMetric(
    name="revpatt",
    description=(
        "Revenue per Available Tee Time — total revenue divided by bookable "
        "tee-time slots in the period."
    ),
    result_schema=RevPATTResult,
    version="0.1.0",
    owner="greenlink-core",
    dependencies=[],
)

register(revpatt)
