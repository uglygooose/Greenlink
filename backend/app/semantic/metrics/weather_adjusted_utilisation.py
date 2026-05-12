from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.semantic.base import Metric
from app.semantic.registry import register

ZERO = Decimal("0.00")


class WeatherAdjustedUtilisationResult(BaseModel):
    value: Decimal


class _WeatherAdjustedUtilisationMetric(Metric):
    def compute(
        self,
        session: Session,
        club_id: uuid.UUID,
        **params: object,
    ) -> WeatherAdjustedUtilisationResult:
        # Real implementation depends on a weather data source — deferred to
        # v1.5 per Phase 5.5 audit WI-6. v1 ships the stub so the registry
        # contract is complete.
        return WeatherAdjustedUtilisationResult(value=ZERO)


weather_adjusted_utilisation = _WeatherAdjustedUtilisationMetric(
    name="weather_adjusted_utilisation",
    description=(
        "Weather-adjusted utilisation — utilisation percentage normalised "
        "against weather conditions so a rained-off day does not penalise the "
        "headline number."
    ),
    result_schema=WeatherAdjustedUtilisationResult,
    version="0.1.0",
    owner="greenlink-core",
    dependencies=[],
)

register(weather_adjusted_utilisation)
