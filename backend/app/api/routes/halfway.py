from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.routes.club_access import (
    get_requested_club_id,
    require_operations_read,
    resolve_required_club_context,
)
from app.auth.dependencies import get_current_user, get_db
from app.models import User
from app.schemas.halfway import HalfwaySummaryResponse
from app.services.halfway_service import HalfwayService

router = APIRouter()


@router.get("/summary", response_model=HalfwaySummaryResponse)
def get_halfway_summary(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> HalfwaySummaryResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = HalfwayService(db)
    return service.get_summary(club_id=context.selected_club.id)
