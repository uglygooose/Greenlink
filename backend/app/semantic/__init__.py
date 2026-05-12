"""Semantic layer — typed Python metric registry.

PRODUCT.md §7 commits to a semantic layer in v1. Per the Phase 5.6 amendment
this ships as a Python registry, not a dbt project; the migration trigger to
dbt is named in §7.

Importing this package triggers registration of every v1 metric module via the
side-effect imports below. ``from app.semantic import compute, get_metric,
list_metrics`` is the public entry point.
"""

from __future__ import annotations

from app.semantic.base import Metric

# Side-effect imports: each module registers its metric on import.
from app.semantic.metrics import (  # noqa: F401  (registration side-effect)
    effective_green_fee,
    fnb_per_round,
    member_stats,
    revpatt,
    revpur,
    weather_adjusted_utilisation,
)
from app.semantic.registry import compute, get_metric, list_metrics, register

__all__ = [
    "Metric",
    "compute",
    "get_metric",
    "list_metrics",
    "register",
]
