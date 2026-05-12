from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy.orm import Session

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
        return RevPURResult(value=ZERO)


revpur = _RevPURMetric(
    name="revpur",
    description="Revenue per Utilised Round — total revenue divided by rounds actually played.",
    result_schema=RevPURResult,
    version="0.1.0",
    owner="greenlink-core",
    dependencies=[],
)

register(revpur)
