from __future__ import annotations

import uuid

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.semantic.base import Metric

_REGISTRY: dict[str, Metric] = {}


def register(metric: Metric) -> None:
    if metric.name in _REGISTRY:
        raise ValueError(f"Metric already registered: {metric.name}")
    _REGISTRY[metric.name] = metric


def get_metric(name: str) -> Metric:
    return _REGISTRY[name]


def list_metrics() -> list[Metric]:
    return sorted(_REGISTRY.values(), key=lambda metric: metric.name)


def compute(
    name: str,
    session: Session,
    club_id: uuid.UUID,
    **params: object,
) -> BaseModel:
    """Look up a metric by name and delegate to its ``compute`` method.

    Materialisation is on-demand for v1: no cache layer, no materialised view,
    no scheduler. The migration trigger (>25 metrics, compound-metric clunk, an
    analyst joins, or a paying customer needs dbt-grade introspection) is named
    in PRODUCT.md §7 and is when this decision is revisited.
    """
    metric = get_metric(name)
    missing = [dep for dep in metric.dependencies if dep not in _REGISTRY]
    if missing:
        raise ValueError(f"Metric {metric.name!r} depends on unregistered metrics: {missing!r}")
    return metric.compute(session, club_id, **params)
