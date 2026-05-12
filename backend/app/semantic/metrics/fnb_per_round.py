from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.semantic.base import Metric
from app.semantic.registry import register

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
        return FnbPerRoundResult(value=ZERO)


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
