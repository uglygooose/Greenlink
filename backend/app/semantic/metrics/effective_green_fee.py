from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy.orm import Session

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
        return EffectiveGreenFeeResult(value=ZERO)


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
