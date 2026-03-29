from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, get_db
from app.models import User
from app.schemas.session import SessionBootstrapResponse
from app.services.session_bootstrap_service import SessionBootstrapService

router = APIRouter()


@router.get("/bootstrap", response_model=SessionBootstrapResponse)
def bootstrap(
    selected_club_id: uuid.UUID | None = Query(default=None),
    selected_club_header: uuid.UUID | None = Header(default=None, alias="X-Club-Id"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionBootstrapResponse:
    raw_selected_club_id = selected_club_id or selected_club_header
    service = SessionBootstrapService(db)
    return service.build(current_user, raw_selected_club_id=raw_selected_club_id)
