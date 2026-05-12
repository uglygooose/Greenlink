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


class EffectiveGreenFeeResult(BaseModel):
    value: Decimal


class _EffectiveGreenFeeMetric(Metric):
    def compute(
        self,
        session: Session,
        club_id: uuid.UUID,
        **params: object,
    ) -> EffectiveGreenFeeResult:
        """Effective average green fee.

        SQL summary::

            value = green_fee_revenue
                    /
                    SUM(b.party_size) WHERE status IN ('checked_in', 'completed')

        Numerically identical to RevPUR; semantically distinct. This metric
        exists explicitly to displace "headline rate" reporting per
        PRODUCT.md §3.2: "GreenLink reports effective rates always". The
        dashboard surfaces choose which framing to show where.
        """
        window = resolve_window(
            session,
            club_id=club_id,
            date_from=_optional_date(params.get("date_from")),
            date_to=_optional_date(params.get("date_to")),
        )
        revenue = green_fee_revenue(session, club_id=club_id, window=window)
        rounds = utilised_rounds(session, club_id=club_id, window=window)
        return EffectiveGreenFeeResult(value=safe_ratio(revenue, rounds))


def _optional_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    raise TypeError(f"date_from/date_to must be date, got {type(value)!r}")


effective_green_fee = _EffectiveGreenFeeMetric(
    name="effective_green_fee",
    description=(
        "Effective average green fee — net green-fee revenue divided by paying "
        "rounds. Reports realised rates, not headline rates (PRODUCT.md §3.2: "
        "'GreenLink reports effective rates always')."
    ),
    result_schema=EffectiveGreenFeeResult,
    version="0.1.0",
    owner="greenlink-core",
    dependencies=[],
)

register(effective_green_fee)
