from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, get_db
from app.core.exceptions import AuthorizationError
from app.models import ClubMembershipRole, User, UserType
from app.schemas.people import (
    AccountCustomerCreateRequest,
    AccountCustomerResponse,
    BulkIntakeRequest,
    BulkIntakeResult,
    ClubMembershipCreateRequest,
    ClubMembershipResponse,
    ClubMembershipUpdateRequest,
    ClubPersonResponse,
    PersonCreateRequest,
    PersonIntegrityResponse,
    PersonResponse,
    PersonSearchResponse,
    PersonUpdateRequest,
)
from app.services.bulk_intake_service import BulkIntakeService
from app.services.people_integrity_service import PeopleIntegrityService
from app.services.people_service import PeopleService
from app.tenancy.service import TenancyContext, TenancyService

router = APIRouter()


def get_requested_club_id(
    selected_club_id: uuid.UUID | None = Query(default=None),
    selected_club_header: uuid.UUID | None = Header(default=None, alias="X-Club-Id"),
) -> uuid.UUID | None:
    return selected_club_id or selected_club_header


def _resolve_context(
    db: Session,
    user: User,
    raw_selected_club_id: uuid.UUID | None,
    *,
    require_selected: bool,
) -> TenancyContext:
    tenancy = TenancyService(db)
    return tenancy.resolve_context(
        user,
        raw_selected_club_id,
        allow_unselected=not require_selected,
        require_explicit_selection=require_selected,
    )


def _require_people_read(user: User, context: TenancyContext | None) -> None:
    if user.user_type == UserType.SUPERADMIN:
        return
    if context is None or context.selected_membership is None:
        raise AuthorizationError("Selected club access is required")
    if context.selected_membership.role not in {
        ClubMembershipRole.CLUB_ADMIN,
        ClubMembershipRole.CLUB_STAFF,
    }:
        raise AuthorizationError("People read access is not available for this membership role")


def _require_people_manage(user: User, context: TenancyContext | None) -> None:
    if user.user_type == UserType.SUPERADMIN:
        return
    if context is None or context.selected_membership is None:
        raise AuthorizationError("Selected club access is required")
    if context.selected_membership.role != ClubMembershipRole.CLUB_ADMIN:
        raise AuthorizationError("Club admin access is required for people management")


def _correlation_id(request: Request) -> str | None:
    return getattr(request.state, "correlation_id", None)


@router.get("", response_model=PersonSearchResponse)
def list_people(
    q: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PersonSearchResponse:
    if current_user.user_type != UserType.SUPERADMIN:
        raise AuthorizationError("Platform-wide people search is only available to superadmins")
    service = PeopleService(db)
    people = service.list_people(query=q, limit=limit)
    return PersonSearchResponse(
        items=[service.to_person_response(item) for item in people],
        total=len(people),
    )


@router.get("/club-directory", response_model=list[ClubPersonResponse])
def list_club_people(
    q: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=50, ge=1, le=100),
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ClubPersonResponse]:
    context = _resolve_context(db, current_user, raw_selected_club_id, require_selected=True)
    _require_people_read(current_user, context)
    assert context.selected_club is not None
    service = PeopleService(db)
    return service.list_club_people(club_id=context.selected_club.id, query=q, limit=limit)


@router.post("", response_model=PersonResponse, status_code=status.HTTP_201_CREATED)
def create_person(
    payload: PersonCreateRequest,
    request: Request,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PersonResponse:
    context = None
    if current_user.user_type != UserType.SUPERADMIN:
        context = _resolve_context(db, current_user, raw_selected_club_id, require_selected=True)
    _require_people_manage(current_user, context)
    service = PeopleService(db)
    person = service.create_person(
        payload,
        actor_user_id=current_user.id,
        correlation_id=_correlation_id(request),
    )
    return service.to_person_response(person)


@router.post(
    "/memberships",
    response_model=ClubMembershipResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_or_update_membership(
    payload: ClubMembershipCreateRequest,
    request: Request,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClubMembershipResponse:
    context = _resolve_context(db, current_user, raw_selected_club_id, require_selected=True)
    _require_people_manage(current_user, context)
    assert context.selected_club is not None
    service = PeopleService(db)
    membership = service.upsert_membership(
        club_id=context.selected_club.id,
        payload=payload,
        actor_user_id=current_user.id,
        correlation_id=_correlation_id(request),
    )
    return service.to_membership_response(membership)


@router.patch("/memberships/{membership_id}", response_model=ClubMembershipResponse)
def update_membership(
    membership_id: uuid.UUID,
    payload: ClubMembershipUpdateRequest,
    request: Request,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClubMembershipResponse:
    context = _resolve_context(db, current_user, raw_selected_club_id, require_selected=True)
    _require_people_manage(current_user, context)
    assert context.selected_club is not None
    service = PeopleService(db)
    membership = service.ensure_membership_access(
        membership_id=membership_id,
        club_id=context.selected_club.id,
        user=current_user,
    )
    updated = service.update_membership(
        membership,
        payload,
        actor_user_id=current_user.id,
        correlation_id=_correlation_id(request),
    )
    return service.to_membership_response(updated)


@router.post(
    "/account-customers",
    response_model=AccountCustomerResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_account_customer(
    payload: AccountCustomerCreateRequest,
    request: Request,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AccountCustomerResponse:
    context = _resolve_context(db, current_user, raw_selected_club_id, require_selected=True)
    _require_people_manage(current_user, context)
    assert context.selected_club is not None
    service = PeopleService(db)
    account_customer = service.create_account_customer(
        club_id=context.selected_club.id,
        payload=payload,
        actor_user_id=current_user.id,
        correlation_id=_correlation_id(request),
    )
    return service.to_account_customer_response(account_customer)


@router.post("/bulk-intake/preview", response_model=BulkIntakeResult)
def preview_bulk_intake(
    payload: BulkIntakeRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BulkIntakeResult:
    context = _resolve_context(db, current_user, raw_selected_club_id, require_selected=True)
    _require_people_read(current_user, context)
    assert context.selected_club is not None
    service = BulkIntakeService(db)
    return service.preview(context.selected_club.id, payload)


@router.post("/bulk-intake/process", response_model=BulkIntakeResult)
def process_bulk_intake(
    payload: BulkIntakeRequest,
    request: Request,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BulkIntakeResult:
    context = _resolve_context(db, current_user, raw_selected_club_id, require_selected=True)
    _require_people_manage(current_user, context)
    assert context.selected_club is not None
    service = BulkIntakeService(db)
    return service.process(
        context.selected_club.id,
        payload,
        actor_user_id=current_user.id,
        correlation_id=_correlation_id(request),
    )


@router.get("/{person_id}", response_model=PersonResponse)
def get_person(
    person_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PersonResponse:
    context = None
    if current_user.user_type != UserType.SUPERADMIN:
        context = _resolve_context(db, current_user, raw_selected_club_id, require_selected=True)
        _require_people_read(current_user, context)
    service = PeopleService(db)
    person = service.ensure_person_access(
        person_id=person_id,
        club_id=context.selected_club.id if context and context.selected_club else None,
        user=current_user,
    )
    return service.to_person_response(person)


@router.patch("/{person_id}", response_model=PersonResponse)
def update_person(
    person_id: uuid.UUID,
    payload: PersonUpdateRequest,
    request: Request,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PersonResponse:
    context = None
    if current_user.user_type != UserType.SUPERADMIN:
        context = _resolve_context(db, current_user, raw_selected_club_id, require_selected=True)
    _require_people_manage(current_user, context)
    service = PeopleService(db)
    person = service.ensure_person_access(
        person_id=person_id,
        club_id=context.selected_club.id if context and context.selected_club else None,
        user=current_user,
    )
    updated = service.update_person(
        person,
        payload,
        actor_user_id=current_user.id,
        correlation_id=_correlation_id(request),
    )
    return service.to_person_response(updated)


@router.get("/{person_id}/memberships", response_model=list[ClubMembershipResponse])
def list_person_memberships(
    person_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ClubMembershipResponse]:
    context = None
    club_id: uuid.UUID | None = None
    if current_user.user_type != UserType.SUPERADMIN:
        context = _resolve_context(db, current_user, raw_selected_club_id, require_selected=True)
        _require_people_read(current_user, context)
        assert context.selected_club is not None
        club_id = context.selected_club.id
    service = PeopleService(db)
    person = service.ensure_person_access(person_id=person_id, club_id=club_id, user=current_user)
    memberships = service.list_person_memberships(person_id=person.id, club_id=club_id)
    return [service.to_membership_response(item) for item in memberships]


@router.get("/{person_id}/integrity", response_model=PersonIntegrityResponse)
def evaluate_person_integrity(
    person_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PersonIntegrityResponse:
    context = None
    club_id: uuid.UUID | None = None
    if current_user.user_type != UserType.SUPERADMIN:
        context = _resolve_context(db, current_user, raw_selected_club_id, require_selected=True)
        _require_people_read(current_user, context)
        assert context.selected_club is not None
        club_id = context.selected_club.id
    service = PeopleService(db)
    person = service.ensure_person_access(person_id=person_id, club_id=club_id, user=current_user)
    integrity = PeopleIntegrityService(db)
    return integrity.evaluate(person, club_id=club_id)
