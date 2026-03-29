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
from app.models import BookingRuleAppliesTo, Course, Tee, User
from app.schemas.bookings import BookingCreateRequest, BookingCreateResult
from app.schemas.operations import CourseCreateRequest, CourseResponse, TeeCreateRequest, TeeResponse
from app.schemas.tee_sheet import TeeSheetDayQuery, TeeSheetDayResponse
from app.services.booking_service import BookingService
from app.services.tee_sheet_service import TeeSheetService

router = APIRouter()


@router.get("/courses", response_model=list[CourseResponse])
def list_courses(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CourseResponse]:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
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
    membership_type: BookingRuleAppliesTo = Query(default=BookingRuleAppliesTo.MEMBER),
    reference_datetime: datetime | None = Query(default=None),
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TeeSheetDayResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = TeeSheetService(db)
    return service.load_day(
        TeeSheetDayQuery(
            club_id=context.selected_club.id,
            course_id=course_id,
            date=day,
            tee_id=tee_id,
            membership_type=membership_type,
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
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = BookingService(db)
    return service.create_booking(context.selected_club.id, payload)
