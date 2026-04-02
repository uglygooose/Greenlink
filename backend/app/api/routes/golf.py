from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.routes.club_access import (
    get_requested_club_id,
    require_operations_read,
    require_operations_write,
    resolve_required_club_context,
)
from app.api.routes.operations_support import (
    ensure_course_name_available,
    get_course_for_club,
    to_tee_response,
)
from app.auth.dependencies import get_current_user, get_db
from app.core.exceptions import AuthorizationError, NotFoundError
from app.models import (
    BookingParticipantType,
    BookingRuleAppliesTo,
    BookingSource,
    ClubMembershipRole,
    Course,
    StartLane,
    Tee,
    User,
)
from app.schemas.bookings import (
    BookingCancelRequest,
    BookingCancelResult,
    BookingCheckInRequest,
    BookingCheckInResult,
    BookingCreateParticipantInput,
    BookingCompleteRequest,
    BookingCompleteResult,
    BookingCreateRequest,
    BookingCreateResult,
    BookingMoveInput,
    BookingMoveRequest,
    BookingMoveResult,
    BookingNoShowRequest,
    BookingNoShowResult,
)
from app.schemas.operations import (
    CourseCreateRequest,
    CourseResponse,
    TeeCreateRequest,
    TeeResponse,
)
from app.schemas.tee_sheet import TeeSheetDayQuery, TeeSheetDayResponse
from app.services.booking_cancellation_service import BookingCancellationService
from app.services.booking_checkin_service import BookingCheckInService
from app.services.booking_completion_service import BookingCompletionService
from app.services.booking_move_service import BookingMoveService
from app.services.booking_no_show_service import BookingNoShowService
from app.services.booking_service import BookingService
from app.services.tee_sheet_service import TeeSheetService

router = APIRouter()


def _is_member_context(context) -> bool:
    return bool(
        context.selected_membership
        and context.selected_membership.role == ClubMembershipRole.MEMBER
    )


def _require_golf_read(*, current_user: User, context) -> None:
    if _is_member_context(context):
        return
    require_operations_read(current_user, context)


def _require_booking_create_access(
    *,
    current_user: User,
    context,
    payload: BookingCreateRequest,
) -> None:
    if payload.source == BookingSource.MEMBER_PORTAL and _is_member_context(context):
        return
    require_operations_write(current_user, context)


def _normalize_member_portal_booking_payload(
    *,
    current_user: User,
    payload: BookingCreateRequest,
) -> BookingCreateRequest:
    if payload.source != BookingSource.MEMBER_PORTAL:
        return payload
    if current_user.person_id is None:
        raise NotFoundError("Person not found")
    return payload.model_copy(
        update={
            "applies_to": BookingRuleAppliesTo.MEMBER,
            "participants": [
                BookingCreateParticipantInput(
                    participant_type=BookingParticipantType.MEMBER,
                    person_id=current_user.person_id,
                    is_primary=True,
                )
            ],
        }
    )


@router.get("/courses", response_model=list[CourseResponse])
def list_courses(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CourseResponse]:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    _require_golf_read(current_user=current_user, context=context)
    assert context.selected_club is not None
    courses = db.scalars(
        select(Course).where(Course.club_id == context.selected_club.id).order_by(Course.name.asc())
    ).all()
    return [CourseResponse.model_validate(course) for course in courses]


@router.post("/courses", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseCreateRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CourseResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    ensure_course_name_available(db, context.selected_club.id, payload.name.strip())
    course = Course(
        club_id=context.selected_club.id,
        name=payload.name.strip(),
        holes=payload.holes,
        active=payload.active,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return CourseResponse.model_validate(course)


@router.get("/tees", response_model=list[TeeResponse])
def list_tees(
    course_id: uuid.UUID | None = Query(default=None),
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TeeResponse]:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    statement = (
        select(Tee)
        .join(Tee.course)
        .options(selectinload(Tee.course))
        .where(Course.club_id == context.selected_club.id)
        .order_by(Course.name.asc(), Tee.name.asc())
    )
    if course_id is not None:
        statement = statement.where(Tee.course_id == course_id)
    tees = db.scalars(statement).unique().all()
    return [to_tee_response(tee) for tee in tees]


@router.post("/tees", response_model=TeeResponse, status_code=status.HTTP_201_CREATED)
def create_tee(
    payload: TeeCreateRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeeResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    course = get_course_for_club(db, payload.course_id, context.selected_club.id)
    tee = Tee(
        course_id=course.id,
        name=payload.name.strip(),
        gender=payload.gender.strip() if payload.gender else None,
        slope_rating=payload.slope_rating,
        course_rating=payload.course_rating,
        color_code=payload.color_code.strip(),
        active=payload.active,
    )
    db.add(tee)
    db.commit()
    hydrated = db.scalar(select(Tee).options(selectinload(Tee.course)).where(Tee.id == tee.id))
    assert hydrated is not None
    return to_tee_response(hydrated)


@router.get("/tee-sheet/day", response_model=TeeSheetDayResponse)
def get_tee_sheet_day(
    course_id: uuid.UUID = Query(),
    day: date = Query(alias="date"),
    tee_id: uuid.UUID | None = Query(default=None),
    start_lane: StartLane | None = Query(default=None),
    membership_type: BookingRuleAppliesTo = Query(default=BookingRuleAppliesTo.MEMBER),
    reference_datetime: datetime | None = Query(default=None),
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeeSheetDayResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    _require_golf_read(current_user=current_user, context=context)
    assert context.selected_club is not None
    normalized_membership_type = membership_type
    if _is_member_context(context):
        if membership_type != BookingRuleAppliesTo.MEMBER:
            raise AuthorizationError("Member tee sheet access is limited to member availability")
        normalized_membership_type = BookingRuleAppliesTo.MEMBER
    service = TeeSheetService(db)
    return service.load_day(
        TeeSheetDayQuery(
            club_id=context.selected_club.id,
            course_id=course_id,
            date=day,
            tee_id=tee_id,
            start_lane=start_lane,
            membership_type=normalized_membership_type,
            reference_datetime=reference_datetime,
        )
    )


@router.post("/bookings", response_model=BookingCreateResult)
def create_booking(
    payload: BookingCreateRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingCreateResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    _require_booking_create_access(current_user=current_user, context=context, payload=payload)
    assert context.selected_club is not None
    normalized_payload = _normalize_member_portal_booking_payload(
        current_user=current_user,
        payload=payload,
    )
    service = BookingService(db)
    return service.create_booking(context.selected_club.id, normalized_payload)


@router.post("/bookings/{booking_id}/move", response_model=BookingMoveResult)
def move_booking(
    booking_id: uuid.UUID,
    payload: BookingMoveInput,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingMoveResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = BookingMoveService(db)
    return service.move_booking(
        context.selected_club.id,
        BookingMoveRequest(
            booking_id=booking_id,
            target_slot_datetime=payload.target_slot_datetime,
            target_start_lane=payload.target_start_lane,
            target_tee_id=payload.target_tee_id,
        ),
    )


@router.post("/bookings/{booking_id}/cancel", response_model=BookingCancelResult)
def cancel_booking(
    booking_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingCancelResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = BookingCancellationService(db)
    return service.cancel_booking(
        context.selected_club.id,
        BookingCancelRequest(
            booking_id=booking_id,
            acting_user_id=current_user.id,
        ),
    )


@router.post("/bookings/{booking_id}/check-in", response_model=BookingCheckInResult)
def check_in_booking(
    booking_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingCheckInResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = BookingCheckInService(db)
    return service.check_in_booking(
        context.selected_club.id,
        BookingCheckInRequest(
            booking_id=booking_id,
            acting_user_id=current_user.id,
        ),
    )


@router.post("/bookings/{booking_id}/complete", response_model=BookingCompleteResult)
def complete_booking(
    booking_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingCompleteResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = BookingCompletionService(db)
    return service.complete_booking(
        context.selected_club.id,
        BookingCompleteRequest(
            booking_id=booking_id,
            acting_user_id=current_user.id,
        ),
    )


@router.post("/bookings/{booking_id}/no-show", response_model=BookingNoShowResult)
def mark_booking_no_show(
    booking_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingNoShowResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = BookingNoShowService(db)
    return service.mark_no_show(
        context.selected_club.id,
        BookingNoShowRequest(
            booking_id=booking_id,
            acting_user_id=current_user.id,
        ),
    )
