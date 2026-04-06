from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.datetime import utc_now
from app.core.exceptions import AppError, NotFoundError
from app.models import ClubTarget
from app.schemas.targets import (
    ClubTargetListResponse,
    ClubTargetResponse,
    ClubTargetUpsertRequest,
    TargetDomainCatalogItem,
    TargetMetricCatalogItem,
    TargetMetricCatalogResponse,
)


@dataclass(frozen=True)
class TargetMetricDefinition:
    key: str
    label: str
    unit: str


@dataclass(frozen=True)
class TargetDomainDefinition:
    key: str
    label: str
    metrics: tuple[TargetMetricDefinition, ...]


TARGET_DOMAIN_REGISTRY: tuple[TargetDomainDefinition, ...] = (
    TargetDomainDefinition(
        key="golf",
        label="Golf",
        metrics=(
            TargetMetricDefinition("rounds_booked", "Rounds booked", "count"),
            TargetMetricDefinition("golf_revenue", "Golf revenue", "currency"),
        ),
    ),
    TargetDomainDefinition(
        key="members",
        label="Members",
        metrics=(TargetMetricDefinition("active_members", "Active members", "count"),),
    ),
    TargetDomainDefinition(
        key="orders",
        label="Orders",
        metrics=(
            TargetMetricDefinition("orders_count", "Orders count", "count"),
            TargetMetricDefinition("orders_revenue", "Orders revenue", "currency"),
        ),
    ),
    TargetDomainDefinition(
        key="finance",
        label="Finance",
        metrics=(
            TargetMetricDefinition("cash_collected", "Cash collected", "currency"),
            TargetMetricDefinition("outstanding_balance", "Outstanding balance", "currency"),
        ),
    ),
)

TARGET_PERIOD_KEYS = {"daily", "weekly", "monthly", "quarterly", "yearly"}


class TargetsService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_metric_catalog(self) -> TargetMetricCatalogResponse:
        return TargetMetricCatalogResponse(
            items=[
                TargetDomainCatalogItem(
                    domain_key=domain.key,
                    domain_label=domain.label,
                    metrics=[
                        TargetMetricCatalogItem(
                            metric_key=metric.key,
                            label=metric.label,
                            unit=metric.unit,
                        )
                        for metric in domain.metrics
                    ],
                )
                for domain in TARGET_DOMAIN_REGISTRY
            ]
        )

    def list_targets(self, *, club_id: uuid.UUID) -> ClubTargetListResponse:
        targets = list(
            self.db.scalars(
                select(ClubTarget)
                .where(ClubTarget.club_id == club_id)
                .order_by(ClubTarget.archived_at.is_not(None), ClubTarget.period_start.desc(), ClubTarget.created_at.desc())
            ).all()
        )
        return ClubTargetListResponse(
            items=[self._target_response(target) for target in targets],
            total_count=len(targets),
        )

    def create_target(self, *, club_id: uuid.UUID, payload: ClubTargetUpsertRequest) -> ClubTargetResponse:
        self._validate_payload(payload)
        duplicate = self.db.scalar(
            select(ClubTarget.id).where(
                ClubTarget.club_id == club_id,
                ClubTarget.domain_key == payload.domain_key,
                ClubTarget.metric_key == payload.metric_key,
                ClubTarget.period_key == payload.period_key,
                ClubTarget.period_start == payload.period_start,
                ClubTarget.period_end == payload.period_end,
                ClubTarget.archived_at.is_(None),
            )
        )
        if duplicate is not None:
            raise AppError(
                code="club_target_duplicate",
                message="An active target already exists for this club, metric, and period.",
                status_code=409,
            )

        target = ClubTarget(
            club_id=club_id,
            domain_key=payload.domain_key,
            metric_key=payload.metric_key,
            period_key=payload.period_key,
            period_start=payload.period_start,
            period_end=payload.period_end,
            target_value=payload.target_value,
            archived_at=None,
        )
        self.db.add(target)
        self.db.commit()
        self.db.refresh(target)
        return self._target_response(target)

    def update_target(
        self,
        *,
        club_id: uuid.UUID,
        target_id: uuid.UUID,
        payload: ClubTargetUpsertRequest,
    ) -> ClubTargetResponse:
        self._validate_payload(payload)
        target = self._get_target(club_id=club_id, target_id=target_id)
        target.domain_key = payload.domain_key
        target.metric_key = payload.metric_key
        target.period_key = payload.period_key
        target.period_start = payload.period_start
        target.period_end = payload.period_end
        target.target_value = payload.target_value
        self.db.add(target)
        self.db.commit()
        self.db.refresh(target)
        return self._target_response(target)

    def archive_target(self, *, club_id: uuid.UUID, target_id: uuid.UUID) -> ClubTargetResponse:
        target = self._get_target(club_id=club_id, target_id=target_id)
        if target.archived_at is None:
            target.archived_at = utc_now()
            self.db.add(target)
            self.db.commit()
            self.db.refresh(target)
        return self._target_response(target)

    def _get_target(self, *, club_id: uuid.UUID, target_id: uuid.UUID) -> ClubTarget:
        target = self.db.scalar(
            select(ClubTarget).where(ClubTarget.club_id == club_id, ClubTarget.id == target_id)
        )
        if target is None:
            raise NotFoundError("Club target not found")
        return target

    def _validate_payload(self, payload: ClubTargetUpsertRequest) -> None:
        if payload.period_end < payload.period_start:
            raise AppError(
                code="club_target_period_invalid",
                message="Target period end must be on or after the period start.",
                status_code=400,
            )
        domain = next((item for item in TARGET_DOMAIN_REGISTRY if item.key == payload.domain_key), None)
        if domain is None:
            raise AppError(
                code="club_target_domain_invalid",
                message="Unsupported target domain.",
                status_code=400,
            )
        metric = next((item for item in domain.metrics if item.key == payload.metric_key), None)
        if metric is None:
            raise AppError(
                code="club_target_metric_invalid",
                message="Unsupported target metric for the selected domain.",
                status_code=400,
            )
        if payload.period_key not in TARGET_PERIOD_KEYS:
            raise AppError(
                code="club_target_period_key_invalid",
                message="Unsupported target period key.",
                status_code=400,
            )

    def _target_response(self, target: ClubTarget) -> ClubTargetResponse:
        domain = next(item for item in TARGET_DOMAIN_REGISTRY if item.key == target.domain_key)
        metric = next(item for item in domain.metrics if item.key == target.metric_key)
        return ClubTargetResponse(
            id=target.id,
            club_id=target.club_id,
            domain_key=target.domain_key,
            domain_label=domain.label,
            metric_key=target.metric_key,
            metric_label=metric.label,
            unit=metric.unit,
            period_key=target.period_key,
            period_start=target.period_start,
            period_end=target.period_end,
            target_value=float(target.target_value),
            archived=target.archived_at is not None,
            archived_at=target.archived_at,
            created_at=target.created_at,
            updated_at=target.updated_at,
        )
