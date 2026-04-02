from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_superadmin, get_db
from app.models import User
from app.schemas.superadmin import (
    SuperadminAssignmentCandidateListResponse,
    SuperadminClubAssignmentResponse,
    SuperadminClubAssignmentUpsertRequest,
    SuperadminClubCreateRequest,
    SuperadminClubListResponse,
    SuperadminClubOnboardingDetailResponse,
    SuperadminClubOnboardingUpdateRequest,
    SuperadminClubSummary,
)
from app.services.superadmin_onboarding_service import SuperadminOnboardingService

router = APIRouter()


def _correlation_id(request: Request) -> str | None:
    return getattr(request.state, "correlation_id", None)


@router.get("/clubs", response_model=SuperadminClubListResponse)
def list_superadmin_clubs(
    _: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminClubListResponse:
    return SuperadminOnboardingService(db).list_clubs()


@router.post("/clubs", response_model=SuperadminClubSummary, status_code=status.HTTP_201_CREATED)
def create_superadmin_club(
    payload: SuperadminClubCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminClubSummary:
    return SuperadminOnboardingService(db).create_club(
        payload=payload,
        actor_user_id=current_user.id,
        correlation_id=_correlation_id(request),
    )


@router.get("/clubs/{club_id}/onboarding", response_model=SuperadminClubOnboardingDetailResponse)
def get_superadmin_club_onboarding(
    club_id: uuid.UUID,
    _: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminClubOnboardingDetailResponse:
    return SuperadminOnboardingService(db).get_onboarding_detail(club_id=club_id)


@router.put("/clubs/{club_id}/onboarding", response_model=SuperadminClubOnboardingDetailResponse)
def update_superadmin_club_onboarding(
    club_id: uuid.UUID,
    payload: SuperadminClubOnboardingUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminClubOnboardingDetailResponse:
    return SuperadminOnboardingService(db).update_onboarding(
        club_id=club_id,
        payload=payload,
        actor_user_id=current_user.id,
        correlation_id=_correlation_id(request),
    )


@router.get(
    "/clubs/{club_id}/assignment-candidates",
    response_model=SuperadminAssignmentCandidateListResponse,
)
def list_superadmin_assignment_candidates(
    club_id: uuid.UUID,
    q: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=12, ge=1, le=50),
    _: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminAssignmentCandidateListResponse:
    service = SuperadminOnboardingService(db)
    service.get_onboarding_detail(club_id=club_id)
    return service.search_assignment_candidates(query=q, limit=limit)


@router.post(
    "/clubs/{club_id}/assignments",
    response_model=SuperadminClubAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def assign_superadmin_club_user(
    club_id: uuid.UUID,
    payload: SuperadminClubAssignmentUpsertRequest,
    request: Request,
    current_user: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminClubAssignmentResponse:
    return SuperadminOnboardingService(db).assign_user_to_club(
        club_id=club_id,
        payload=payload,
        actor_user_id=current_user.id,
        correlation_id=_correlation_id(request),
    )
