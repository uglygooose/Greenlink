from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_superadmin, get_db
from app.core.exceptions import AppError
from app.events.emission_context import EmissionContext
from app.models import User
from app.schemas.superadmin import (
    SuperadminAccountingProfileActivationRequest,
    SuperadminAccountingProfileBindRequest,
    SuperadminAccountingProfileCreateRequest,
    SuperadminAccountingProfileListResponse,
    SuperadminAccountingProfileSummary,
    SuperadminAccountingSampleLayoutResponse,
    SuperadminAccountingTemplateParseResponse,
    SuperadminAssignmentCandidateListResponse,
    SuperadminClubAssignmentResponse,
    SuperadminClubAssignmentUpsertRequest,
    SuperadminClubCreateRequest,
    SuperadminClubInvitationCreateRequest,
    SuperadminClubInvitationListResponse,
    SuperadminClubInvitationResponse,
    SuperadminClubListResponse,
    SuperadminClubOnboardingDetailResponse,
    SuperadminClubOnboardingUpdateRequest,
    SuperadminClubStatusUpdateRequest,
    SuperadminClubSummary,
)
from app.services.accounting_template_service import AccountingTemplateService
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


@router.get("/accounting-profiles", response_model=SuperadminAccountingProfileListResponse)
def list_superadmin_accounting_profiles(
    club_id: uuid.UUID | None = Query(default=None),
    _: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminAccountingProfileListResponse:
    return AccountingTemplateService(db).list_profiles(club_id=club_id)


@router.get(
    "/accounting-profiles/sample-layout", response_model=SuperadminAccountingSampleLayoutResponse
)
def get_superadmin_accounting_sample_layout(
    target_system: str = Query(...),
    _: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminAccountingSampleLayoutResponse:
    return AccountingTemplateService(db).get_sample_layout(target_system=target_system)


@router.post(
    "/accounting-profiles/parse-template", response_model=SuperadminAccountingTemplateParseResponse
)
async def parse_superadmin_accounting_template(
    file: UploadFile = File(...),
    _: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminAccountingTemplateParseResponse:
    return AccountingTemplateService(db).parse_csv_template(
        file_bytes=await file.read(),
        file_name=file.filename or "template.csv",
    )


@router.post(
    "/accounting-profiles",
    response_model=SuperadminAccountingProfileSummary,
    status_code=status.HTTP_201_CREATED,
)
def create_superadmin_accounting_profile(
    payload: SuperadminAccountingProfileCreateRequest,
    current_user: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminAccountingProfileSummary:
    if current_user.person_id is None:
        raise AppError(
            code="superadmin_accounting_profile_person_required",
            message="Superadmin accounting profile creation requires a resolved person context",
            status_code=400,
        )
    return AccountingTemplateService(db).create_profile(
        payload=payload,
        created_by_person_id=current_user.person_id,
    )


@router.patch(
    "/accounting-profiles/{profile_id}/active", response_model=SuperadminAccountingProfileSummary
)
def update_superadmin_accounting_profile_active(
    profile_id: uuid.UUID,
    payload: SuperadminAccountingProfileActivationRequest,
    _: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminAccountingProfileSummary:
    return AccountingTemplateService(db).set_profile_active_status(
        profile_id=profile_id,
        is_active=payload.is_active,
    )


@router.post("/clubs", response_model=SuperadminClubSummary, status_code=status.HTTP_201_CREATED)
def create_superadmin_club(
    payload: SuperadminClubCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminClubSummary:
    return SuperadminOnboardingService(db).create_club(
        payload=payload,
        context=EmissionContext(
            actor_user_id=current_user.id,
            correlation_id=_correlation_id(request),
        ),
    )


@router.patch("/clubs/{club_id}/status", response_model=SuperadminClubSummary)
def update_superadmin_club_status(
    club_id: uuid.UUID,
    payload: SuperadminClubStatusUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_superadmin),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> SuperadminClubSummary:
    return SuperadminOnboardingService(db).set_club_active(
        club_id=club_id,
        active=payload.active,
        context=EmissionContext(
            actor_user_id=current_user.id,
            correlation_id=_correlation_id(request),
        ),
    )


@router.delete("/clubs/{club_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_superadmin_club(
    club_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_superadmin),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> None:
    SuperadminOnboardingService(db).delete_club(
        club_id=club_id,
        context=EmissionContext(
            actor_user_id=current_user.id,
            correlation_id=_correlation_id(request),
        ),
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
        context=EmissionContext(
            actor_user_id=current_user.id,
            correlation_id=_correlation_id(request),
        ),
    )


@router.post(
    "/clubs/{club_id}/onboarding/finance/bind-profile",
    response_model=SuperadminClubOnboardingDetailResponse,
)
def bind_superadmin_club_accounting_profile(
    club_id: uuid.UUID,
    payload: SuperadminAccountingProfileBindRequest,
    _: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminClubOnboardingDetailResponse:
    template_service = AccountingTemplateService(db)
    template_service.bind_profile(club_id=club_id, profile_id=payload.profile_id)
    return SuperadminOnboardingService(db).get_onboarding_detail(club_id=club_id)


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
        context=EmissionContext(
            actor_user_id=current_user.id,
            correlation_id=_correlation_id(request),
        ),
    )


@router.get(
    "/clubs/{club_id}/invitations",
    response_model=SuperadminClubInvitationListResponse,
)
def list_superadmin_club_invitations(
    club_id: uuid.UUID,
    _: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminClubInvitationListResponse:
    return SuperadminOnboardingService(db).list_invitations(club_id=club_id)


@router.post(
    "/clubs/{club_id}/invitations",
    response_model=SuperadminClubInvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_superadmin_club_invitation(
    club_id: uuid.UUID,
    payload: SuperadminClubInvitationCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
) -> SuperadminClubInvitationResponse:
    return SuperadminOnboardingService(db).create_invitation(
        club_id=club_id,
        payload=payload,
        context=EmissionContext(
            actor_user_id=current_user.id,
            correlation_id=_correlation_id(request),
        ),
    )
