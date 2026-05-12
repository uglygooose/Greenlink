from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_superadmin, get_db
from app.events.emission_context import EmissionContext
from app.schemas.platform import (
    BootstrapRequest,
    ClubCreateRequest,
    ClubMembershipAssignRequest,
    ClubModuleUpdateRequest,
    PlatformBootstrapResponse,
    PlatformMembershipAssignResponse,
    PlatformModuleUpdateResponse,
)
from app.services.platform_service import PlatformService

router = APIRouter()


def _context(request: Request) -> EmissionContext:
    return EmissionContext(
        correlation_id=getattr(request.state, "correlation_id", None),
    )


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
    return service.bootstrap_platform(payload, context=_context(request))


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
    return service.create_club(payload, context=_context(request))


@router.post(
    "/memberships",
    response_model=PlatformMembershipAssignResponse,
    status_code=status.HTTP_201_CREATED,
)
def assign_membership(
    payload: ClubMembershipAssignRequest,
    request: Request,
    _: object = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> PlatformMembershipAssignResponse:
    service = PlatformService(db)
    membership = service.assign_membership(payload, context=_context(request))
    return PlatformMembershipAssignResponse(
        id=membership.id,
        club_id=membership.club_id,
        person_id=membership.person_id,
        role=membership.role,
        status=membership.status,
        is_primary=membership.is_primary,
        membership_number=membership.membership_number,
    )


@router.put("/clubs/{club_id}/modules", response_model=PlatformModuleUpdateResponse)
def update_modules(
    club_id: uuid.UUID,
    payload: ClubModuleUpdateRequest,
    request: Request,
    _: object = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> PlatformModuleUpdateResponse:
    service = PlatformService(db)
    module_keys = service.update_modules(club_id, payload, context=_context(request))
    return PlatformModuleUpdateResponse(club_id=club_id, module_keys=module_keys)
