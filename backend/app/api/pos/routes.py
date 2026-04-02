from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.routes.club_access import (
    get_requested_club_id,
    require_operations_read,
    require_operations_write,
    resolve_required_club_context,
)
from app.auth.dependencies import get_current_user, get_db
from app.models import User
from app.schemas.pos import (
    PosProductResponse,
    PosTransactionCreateRequest,
    PosTransactionResult,
)
from app.services.pos_service import PosService

router = APIRouter()


def _correlation_id(request: Request) -> str | None:
    return getattr(request.state, "correlation_id", None)


@router.get("/products", response_model=list[PosProductResponse])
def list_products(
    include_inactive: bool = Query(default=False),  # noqa: B008
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> list[PosProductResponse]:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = PosService(db)
    return service.list_products(
        club_id=context.selected_club.id,
        include_inactive=include_inactive,
    )


@router.post("/transactions", response_model=PosTransactionResult)
def create_pos_transaction(
    payload: PosTransactionCreateRequest,
    request: Request,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> PosTransactionResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = PosService(db)
    return service.create_transaction(
        club_id=context.selected_club.id,
        payload=payload,
        actor_user_id=current_user.id,
    )
