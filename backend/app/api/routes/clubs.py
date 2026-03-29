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
from app.api.routes.operations_support import get_or_create_club_config
from app.auth.dependencies import get_current_user, get_db
from app.models import ClubConfig, User
from app.schemas.operations import ClubConfigResponse, ClubConfigUpsertRequest

router = APIRouter()


@router.get("/config", response_model=ClubConfigResponse)
def get_club_config(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClubConfigResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    return ClubConfigResponse.model_validate(get_or_create_club_config(db, context.selected_club.id))


@router.put("/config", response_model=ClubConfigResponse)
def update_club_config(
    payload: ClubConfigUpsertRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClubConfigResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_club_config_write(current_user, context)
    assert context.selected_club is not None
    config = get_or_create_club_config(db, context.selected_club.id)
    config.timezone = payload.timezone
    config.operating_hours = {
        day: entry.model_dump() for day, entry in payload.operating_hours.items()
    }
    config.booking_window_days = payload.booking_window_days
    config.cancellation_policy_hours = payload.cancellation_policy_hours
    config.default_slot_interval_minutes = payload.default_slot_interval_minutes
    db.add(config)
    db.commit()
    db.refresh(config)
    return ClubConfigResponse.model_validate(config)
