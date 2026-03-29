from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.routes.club_access import (
    get_requested_club_id,
    require_operations_read,
    require_operations_write,
    resolve_required_club_context,
)
from app.api.routes.operations_support import (
    load_pricing_matrix,
    replace_pricing_rules,
    to_pricing_matrix_response,
)
from app.auth.dependencies import get_current_user, get_db
from app.models import PricingMatrix, User
from app.schemas.operations import (
    PricingMatrixCreateRequest,
    PricingMatrixResponse,
    PricingMatrixUpdateRequest,
)

router = APIRouter()


@router.get("", response_model=list[PricingMatrixResponse])
def list_pricing_matrices(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[PricingMatrixResponse]:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    matrices = db.scalars(
        select(PricingMatrix)
        .options(selectinload(PricingMatrix.rules))
        .where(PricingMatrix.club_id == context.selected_club.id)
        .order_by(PricingMatrix.name.asc())
    ).unique().all()
    return [to_pricing_matrix_response(item) for item in matrices]


@router.post("", response_model=PricingMatrixResponse, status_code=status.HTTP_201_CREATED)
def create_pricing_matrix(
    payload: PricingMatrixCreateRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PricingMatrixResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    matrix = PricingMatrix(
        club_id=context.selected_club.id,
        name=payload.name.strip(),
        active=payload.active,
    )
    db.add(matrix)
    db.flush()
    replace_pricing_rules(db, matrix, payload.rules)
    db.commit()
    db.expire_all()
    return to_pricing_matrix_response(load_pricing_matrix(db, matrix.id, context.selected_club.id))


@router.put("/{matrix_id}", response_model=PricingMatrixResponse)
def update_pricing_matrix(
    matrix_id: uuid.UUID,
    payload: PricingMatrixUpdateRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PricingMatrixResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    matrix = load_pricing_matrix(db, matrix_id, context.selected_club.id)
    matrix.name = payload.name.strip()
    matrix.active = payload.active
    replace_pricing_rules(db, matrix, payload.rules)
    db.commit()
    db.expire_all()
    return to_pricing_matrix_response(load_pricing_matrix(db, matrix.id, context.selected_club.id))
