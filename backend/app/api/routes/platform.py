from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_superadmin, get_db
from app.schemas.platform import (
    BootstrapRequest,
    ClubCreateRequest,
    ClubMembershipAssignRequest,
    ClubModuleUpdateRequest,
    PlatformBootstrapResponse,
)
from app.services.platform_service import PlatformService

router = APIRouter()


@router.post(
    "/bootstrap",
    response_model=PlatformBootstrapResponse,
    status_code=status.HTTP_201_CREATED,
)
def bootstrap_platform(
    payload: BootstrapRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> PlatformBootstrapResponse:
    service = PlatformService(db)
    correlation_id = getattr(request.state, "correlation_id", None)
    return service.bootstrap_platform(payload, correlation_id=correlation_id)


@router.post(
    "/clubs",
    response_model=PlatformBootstrapResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_club(
    payload: ClubCreateRequest,
    request: Request,
    _: object = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> PlatformBootstrapResponse:
    service = PlatformService(db)
    correlation_id = getattr(request.state, "correlation_id", None)
    return service.create_club(payload, correlation_id=correlation_id)


@router.post("/memberships", status_code=status.HTTP_201_CREATED)
def assign_membership(
    payload: ClubMembershipAssignRequest,
    request: Request,
    _: object = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    service = PlatformService(db)
    correlation_id = getattr(request.state, "correlation_id", None)
    service.assign_membership(payload, correlation_id=correlation_id)
    return {"status": "created"}


@router.put("/clubs/{club_id}/modules")
def update_modules(
    club_id: uuid.UUID,
    payload: ClubModuleUpdateRequest,
    request: Request,
    _: object = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    service = PlatformService(db)
    correlation_id = getattr(request.state, "correlation_id", None)
    service.update_modules(club_id, payload, correlation_id=correlation_id)
    return {"status": "updated"}
