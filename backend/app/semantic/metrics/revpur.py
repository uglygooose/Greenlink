from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.semantic._queries import green_fee_revenue, safe_ratio, utilised_rounds
from app.semantic._window import resolve_window
from app.semantic.base import Metric
from app.semantic.registry import register

ZERO = Decimal("0.00")


class RevPURResult(BaseModel):
    value: Decimal


class _RevPURMetric(Metric):
    def compute(
        self,
        session: Session,
        club_id: uuid.UUID,
        **params: object,
    ) -> RevPURResult:
        """Revenue per Utilised Round.

        SQL summary::

            value = green_fee_revenue
                    /
                    SUM(b.party_size)
                      FROM bookings b
                      WHERE b.club_id = :club
                        AND b.status IN ('checked_in', 'completed')
                        AND b.slot_datetime IN [start_utc, end_utc)

        Honours PRODUCT.md §3.2 "effective rates always" by construction —
        no-shows and cancellations drop out of both numerator (no revenue
        captured) and denominator (not counted as utilised).
        """
        window = resolve_window(
            session,
            club_id=club_id,
            date_from=_optional_date(params.get("date_from")),
            date_to=_optional_date(params.get("date_to")),
        )
        revenue = green_fee_revenue(session, club_id=club_id, window=window)
        rounds = utilised_rounds(session, club_id=club_id, window=window)
        return RevPURResult(value=safe_ratio(revenue, rounds))


def _optional_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    raise TypeError(f"date_from/date_to must be date, got {type(value)!r}")


revpur = _RevPURMetric(
    name="revpur",
    description="Revenue per Utilised Round — total revenue divided by rounds actually played.",
    result_schema=RevPURResult,
    version="0.1.0",
    owner="greenlink-core",
    dependencies=[],
)

register(revpur)
