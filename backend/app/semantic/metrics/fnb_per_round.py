from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.semantic._queries import fnb_revenue, safe_ratio, utilised_rounds
from app.semantic.base import Metric
from app.semantic.registry import register
from app.services._window import optional_date, resolve_window

ZERO = Decimal("0.00")


class FnbPerRoundResult(BaseModel):
    value: Decimal


class _FnbPerRoundMetric(Metric):
    def compute(
        self,
        session: Session,
        club_id: uuid.UUID,
        **params: object,
    ) -> FnbPerRoundResult:
        """F&B revenue per utilised round.

        SQL summary::

            fnb_revenue =
                SUM(oi.unit_price_snapshot * oi.quantity)
                  FROM order_items oi JOIN orders o
                  WHERE o.club_id = :club
                    AND o.status = 'collected'
                    AND oi.vat_category = 'fnb'
                    AND o.created_at IN [start_utc, end_utc)
              +
                SUM(pti.unit_price_snapshot * pti.quantity)
                  FROM pos_transaction_items pti JOIN pos_transactions pt
                  WHERE pt.club_id = :club
                    AND pti.vat_category = 'fnb'
                    AND pt.created_at IN [start_utc, end_utc)

            value = fnb_revenue / utilised_rounds

        Line revenue is the source of truth; FinanceTransaction headers
        are not summed (would double-count member-account-charged orders).
        """
        window = resolve_window(
            session,
            club_id=club_id,
            date_from=optional_date(params.get("date_from")),
            date_to=optional_date(params.get("date_to")),
        )
        revenue = fnb_revenue(session, club_id=club_id, window=window)
        rounds = utilised_rounds(session, club_id=club_id, window=window)
        return FnbPerRoundResult(value=safe_ratio(revenue, rounds))


fnb_per_round = _FnbPerRoundMetric(
    name="fnb_per_round",
    description=(
        "F&B revenue per paid round — halfway-house plus clubhouse F&B revenue "
        "divided by paid rounds."
    ),
    result_schema=FnbPerRoundResult,
    version="0.1.0",
    owner="greenlink-core",
    dependencies=[],
)

register(fnb_per_round)
