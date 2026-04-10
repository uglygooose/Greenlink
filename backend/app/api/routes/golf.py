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
    BookingChargePostInput,
    BookingChargePostRequest,
    BookingChargePostResult,
    BookingCheckInRequest,
    BookingCheckInResult,
    BookingCreateParticipantInput,
    BookingCompleteRequest,
    BookingCompleteResult,
    BookingCreateRequest,
    BookingCreateResult,
    BookingUpdateRequest,
    BookingUpdateResult,
    BookingMoveInput,
    BookingMoveRequest,
    BookingMoveResult,
    BookingNoShowRequest,
    BookingNoShowResult,
    BookingPaymentRecordRequest,
    BookingPaymentRecordResult,
    BookingPaymentStatusUpdateInput,
    BookingPaymentStatusUpdateRequest,
    BookingPaymentStatusUpdateResult,
    PlayerBookingReadModelResponse,
)
from app.schemas.operations import (
    CourseCreateRequest,
    CourseResponse,
    GolfSettingsPricingMutationResult,
    GolfSettingsPricingPublishRequest,
    GolfSettingsReadinessResponse,
    GolfSettingsRulesMutationResult,
    GolfSettingsRulesPublishRequest,
    TeeCreateRequest,
    TeeResponse,
)
from app.schemas.tee_sheet import TeeSheetDayQuery, TeeSheetDayResponse
from app.services.booking_cancellation_service import BookingCancellationService
from app.services.booking_checkin_service import BookingCheckInService
from app.services.booking_completion_service import BookingCompletionService
from app.services.booking_finance_service import BookingFinanceService
from app.services.booking_move_service import BookingMoveService
from app.services.booking_no_show_service import BookingNoShowService
from app.services.booking_service import BookingService
from app.services.booking_update_service import BookingUpdateService
from app.services.golf_settings_service import GolfSettingsService
from app.services.player_booking_read_model_service import PlayerBookingReadModelService
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
    GolfSettingsService(db).ensure_courses_exist_for_tees(context.selected_club.id)
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


@router.get("/settings/readiness", response_model=GolfSettingsReadinessResponse)
def get_golf_settings_readiness(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GolfSettingsReadinessResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    return GolfSettingsService(db).get_readiness(context.selected_club.id)


@router.post("/settings/rules/publish", response_model=GolfSettingsRulesMutationResult)
def publish_golf_rules(
    payload: GolfSettingsRulesPublishRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GolfSettingsRulesMutationResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    return GolfSettingsService(db).publish_rule_set(context.selected_club.id, payload.rule_set_id)


@router.post("/settings/rules/rollback", response_model=GolfSettingsRulesMutationResult)
def rollback_golf_rules(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GolfSettingsRulesMutationResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    return GolfSettingsService(db).rollback_rule_set(context.selected_club.id)


@router.post("/settings/pricing/publish", response_model=GolfSettingsPricingMutationResult)
def publish_golf_pricing(
    payload: GolfSettingsPricingPublishRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GolfSettingsPricingMutationResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    return GolfSettingsService(db).publish_pricing_matrix(context.selected_club.id, payload.matrix_id)


@router.post("/settings/pricing/rollback", response_model=GolfSettingsPricingMutationResult)
def rollback_golf_pricing(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GolfSettingsPricingMutationResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    return GolfSettingsService(db).rollback_pricing_matrix(context.selected_club.id)


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


@router.get("/bookings/player", response_model=PlayerBookingReadModelResponse)
def get_player_bookings(
    reference_datetime: datetime | None = Query(default=None),
    upcoming_limit: int = Query(default=5, ge=1, le=20),
    history_limit: int = Query(default=10, ge=1, le=50),
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PlayerBookingReadModelResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    if not _is_member_context(context):
        raise AuthorizationError("Player booking read model requires a member club context")
    if current_user.person_id is None:
        raise NotFoundError("Person not found")
    assert context.selected_club is not None
    service = PlayerBookingReadModelService(db)
    return service.load_for_person(
        club=context.selected_club,
        person_id=current_user.person_id,
        reference_datetime=reference_datetime,
        upcoming_limit=upcoming_limit,
        history_limit=history_limit,
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


@router.patch("/bookings/{booking_id}", response_model=BookingUpdateResult)
def update_booking(
    booking_id: uuid.UUID,
    payload: BookingUpdateRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingUpdateResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = BookingUpdateService(db)
    return service.update_booking(context.selected_club.id, booking_id=booking_id, payload=payload)


@router.patch("/bookings/{booking_id}/payment-status", response_model=BookingPaymentStatusUpdateResult)
def update_booking_payment_status(
    booking_id: uuid.UUID,
    payload: BookingPaymentStatusUpdateInput,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingPaymentStatusUpdateResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = BookingFinanceService(db)
    return service.update_payment_status(
        club_id=context.selected_club.id,
        payload=BookingPaymentStatusUpdateRequest(
            booking_id=booking_id,
            acting_user_id=current_user.id,
            payment_status=payload.payment_status,
        ),
    )


@router.post("/bookings/{booking_id}/post-charge", response_model=BookingChargePostResult)
def post_booking_charge(
    booking_id: uuid.UUID,
    payload: BookingChargePostInput,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingChargePostResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = BookingFinanceService(db)
    return service.post_charge(
        club_id=context.selected_club.id,
        payload=BookingChargePostRequest(
            booking_id=booking_id,
            acting_user_id=current_user.id,
            amount=payload.amount,
            description=payload.description,
        ),
    )


@router.post("/bookings/{booking_id}/record-payment", response_model=BookingPaymentRecordResult)
def record_booking_payment(
    booking_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingPaymentRecordResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = BookingFinanceService(db)
    return service.record_payment(
        club_id=context.selected_club.id,
        payload=BookingPaymentRecordRequest(
            booking_id=booking_id,
            acting_user_id=current_user.id,
        ),
    )


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
            participant_id=payload.participant_id,
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
