from __future__ import annotations

import re

import pytest
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import Club
from app.semantic import Metric, compute, get_metric, list_metrics

V1_METRIC_NAMES = {
    "effective_green_fee",
    "fnb_per_round",
    "member_stats",
    "revpatt",
    "revpur",
    "weather_adjusted_utilisation",
}

SEMVER_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")


def _seed_club(db: Session) -> Club:
    club = Club(name="Semantic Test Club", slug="semantic-test", timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def test_all_six_v1_metrics_registered() -> None:
    registered_names = {metric.name for metric in list_metrics()}
    assert V1_METRIC_NAMES <= registered_names


def test_each_metric_well_formed() -> None:
    registered_names = {metric.name for metric in list_metrics()}
    for metric in list_metrics():
        assert metric.name, f"metric has empty name: {metric!r}"
        assert metric.description, f"metric {metric.name!r} has empty description"
        assert isinstance(metric.result_schema, type), (
            f"metric {metric.name!r} result_schema is not a type"
        )
        assert issubclass(metric.result_schema, BaseModel), (
            f"metric {metric.name!r} result_schema is not a BaseModel subclass"
        )
        assert SEMVER_PATTERN.fullmatch(metric.version), (
            f"metric {metric.name!r} version {metric.version!r} is not semver"
        )
        assert metric.owner, f"metric {metric.name!r} has empty owner"
        unknown_deps = [dep for dep in metric.dependencies if dep not in registered_names]
        assert not unknown_deps, (
            f"metric {metric.name!r} depends on unregistered metrics: {unknown_deps!r}"
        )


def test_compute_returns_result_schema_instance(db_session: Session) -> None:
    club = _seed_club(db_session)
    for metric in list_metrics():
        result = compute(metric.name, db_session, club_id=club.id)
        assert isinstance(result, metric.result_schema), (
            f"metric {metric.name!r} returned {type(result).__name__}, "
            f"expected {metric.result_schema.__name__}"
        )


def test_get_metric_raises_on_unknown() -> None:
    with pytest.raises(KeyError):
        get_metric("does_not_exist")


def test_get_metric_returns_metric_instance() -> None:
    metric = get_metric("revpatt")
    assert isinstance(metric, Metric)
    assert metric.name == "revpatt"
