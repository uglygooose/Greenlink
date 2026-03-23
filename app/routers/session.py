from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db
from app.models import User
from app.session_bootstrap import build_session_bootstrap

router = APIRouter(prefix="/api/session", tags=["session"])


@router.get("/bootstrap")
def get_session_bootstrap(
    response: Response,
    preview_club_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    response.headers.setdefault("Cache-Control", "no-store")
    return build_session_bootstrap(
        db,
        current_user,
        preview_club_id=int(preview_club_id) if preview_club_id is not None else None,
    )
