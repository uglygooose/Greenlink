from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy.orm import Session

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
        return RevPATTResult(value=ZERO)


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
