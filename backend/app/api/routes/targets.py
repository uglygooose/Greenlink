from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.routes.club_access import (
    get_requested_club_id,
    require_club_config_write,
    require_operations_read,
    resolve_required_club_context,
)
from app.auth.dependencies import get_current_user, get_db
from app.models import User
from app.schemas.targets import (
    ClubTargetListResponse,
    ClubTargetResponse,
    ClubTargetUpsertRequest,
    TargetMetricCatalogResponse,
)
from app.services.targets_service import TargetsService

router = APIRouter()


@router.get("/metrics", response_model=TargetMetricCatalogResponse)
def list_target_metrics(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TargetMetricCatalogResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    return TargetsService(db).list_metric_catalog()


@router.get("", response_model=ClubTargetListResponse)
def list_targets(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClubTargetListResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    return TargetsService(db).list_targets(club_id=context.selected_club.id)


@router.post("", response_model=ClubTargetResponse)
def create_target(
    payload: ClubTargetUpsertRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClubTargetResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_club_config_write(current_user, context)
    assert context.selected_club is not None
    return TargetsService(db).create_target(club_id=context.selected_club.id, payload=payload)


@router.patch("/{target_id}", response_model=ClubTargetResponse)
def update_target(
    target_id: uuid.UUID,
    payload: ClubTargetUpsertRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClubTargetResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_club_config_write(current_user, context)
    assert context.selected_club is not None
    return TargetsService(db).update_target(
        club_id=context.selected_club.id,
        target_id=target_id,
        payload=payload,
    )


@router.post("/{target_id}/archive", response_model=ClubTargetResponse)
def archive_target(
    target_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClubTargetResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_club_config_write(current_user, context)
    assert context.selected_club is not None
    return TargetsService(db).archive_target(club_id=context.selected_club.id, target_id=target_id)
