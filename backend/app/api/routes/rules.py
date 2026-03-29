from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.routes.club_access import (
    get_requested_club_id,
    require_operations_read,
    require_operations_write,
    resolve_required_club_context,
)
from app.api.routes.operations_support import load_rule_set, replace_booking_rules, to_rule_set_response
from app.auth.dependencies import get_current_user, get_db
from app.models import BookingRuleAppliesTo, BookingRuleSet, ClubMembershipRole, PricingDayType, PricingTimeBand, User
from app.schemas.availability import AvailabilityPolicyResult
from app.schemas.booking_state import SlotPreviewRequest
from app.schemas.operations import (
    BookingRuleSetCreateRequest,
    BookingRuleSetResponse,
    BookingRuleSetUpdateRequest,
)
from app.schemas.rule_context import RuleContextInput
from app.schemas.rule_evaluation import RuleEvaluationResult
from app.services.availability_service import AvailabilityService
from app.services.booking_state_service import BookingStateService
from app.services.rule_context_service import RuleContextService
from app.services.rule_evaluation_service import RuleEvaluationService

router = APIRouter()


@router.get("/evaluate", response_model=RuleEvaluationResult)
def evaluate_rules(
    course_id: uuid.UUID | None = Query(default=None),
    tee_id: uuid.UUID | None = Query(default=None),
    membership_type: BookingRuleAppliesTo | None = Query(default=None),
    membership_role: ClubMembershipRole | None = Query(default=None),
    effective_datetime: datetime | None = Query(default=None),
    reference_datetime: datetime | None = Query(default=None),
    timezone: str | None = Query(default=None),
    day_type: PricingDayType | None = Query(default=None),
    time_band: PricingTimeBand | None = Query(default=None),
    time_band_ref: str | None = Query(default=None),
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RuleEvaluationResult:
    normalized_context = _normalize_request_context(
        db=db,
        current_user=current_user,
        raw_selected_club_id=raw_selected_club_id,
        course_id=course_id,
        tee_id=tee_id,
        membership_type=membership_type,
        membership_role=membership_role,
        effective_datetime=effective_datetime,
        reference_datetime=reference_datetime,
        timezone=timezone,
        day_type=day_type,
        time_band=time_band,
        time_band_ref=time_band_ref,
    )
    service = RuleEvaluationService(db)
    return service.evaluate(normalized_context)


@router.get("/availability-preview", response_model=AvailabilityPolicyResult)
def preview_availability(
    course_id: uuid.UUID | None = Query(default=None),
    tee_id: uuid.UUID | None = Query(default=None),
    membership_type: BookingRuleAppliesTo | None = Query(default=None),
    membership_role: ClubMembershipRole | None = Query(default=None),
    effective_datetime: datetime | None = Query(default=None),
    reference_datetime: datetime | None = Query(default=None),
    timezone: str | None = Query(default=None),
    day_type: PricingDayType | None = Query(default=None),
    time_band: PricingTimeBand | None = Query(default=None),
    time_band_ref: str | None = Query(default=None),
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AvailabilityPolicyResult:
    normalized_context = _normalize_request_context(
        db=db,
        current_user=current_user,
        raw_selected_club_id=raw_selected_club_id,
        course_id=course_id,
        tee_id=tee_id,
        membership_type=membership_type,
        membership_role=membership_role,
        effective_datetime=effective_datetime,
        reference_datetime=reference_datetime,
        timezone=timezone,
        day_type=day_type,
        time_band=time_band,
        time_band_ref=time_band_ref,
    )
    decision_input = BookingStateService(db).build_decision_input(normalized_context)
    service = AvailabilityService(db)
    return service.preview_slot_availability(decision_input)


@router.post("/slot-preview", response_model=AvailabilityPolicyResult)
def preview_slot(
    payload: SlotPreviewRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AvailabilityPolicyResult:
    normalized_context = _normalize_request_context(
        db=db,
        current_user=current_user,
        raw_selected_club_id=raw_selected_club_id,
        course_id=payload.course_id,
        tee_id=payload.tee_id,
        membership_type=payload.membership_type,
        membership_role=payload.membership_role,
        effective_datetime=payload.effective_datetime,
        reference_datetime=payload.reference_datetime,
        timezone=payload.timezone,
        day_type=payload.day_type,
        time_band=payload.time_band,
        time_band_ref=payload.time_band_ref,
    )
    decision_input = BookingStateService(db).build_decision_input(
        normalized_context,
        slot=payload.slot,
        party=payload.party,
        booking_state=payload.booking_state,
    )
    service = AvailabilityService(db)
    return service.preview_slot_availability(decision_input)


@router.get("", response_model=list[BookingRuleSetResponse])
def list_rule_sets(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BookingRuleSetResponse]:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    rule_sets = db.scalars(
        select(BookingRuleSet)
        .options(selectinload(BookingRuleSet.rules))
        .where(BookingRuleSet.club_id == context.selected_club.id)
        .order_by(BookingRuleSet.priority.asc(), BookingRuleSet.name.asc())
    ).unique().all()
    return [to_rule_set_response(item) for item in rule_sets]


@router.post("", response_model=BookingRuleSetResponse, status_code=status.HTTP_201_CREATED)
def create_rule_set(
    payload: BookingRuleSetCreateRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingRuleSetResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    ruleset = BookingRuleSet(
        club_id=context.selected_club.id,
        name=payload.name.strip(),
        applies_to=payload.applies_to,
        scope_type=payload.scope_type,
        scope_ref_id=payload.scope_ref_id,
        conflict_strategy=payload.conflict_strategy,
        applies_from=payload.applies_from,
        applies_until=payload.applies_until,
        priority=payload.priority,
        active=payload.active,
    )
    db.add(ruleset)
    db.flush()
    replace_booking_rules(db, ruleset, payload.rules)
    db.commit()
    db.expire_all()
    return to_rule_set_response(load_rule_set(db, ruleset.id, context.selected_club.id))


@router.put("/{rule_set_id}", response_model=BookingRuleSetResponse)
def update_rule_set(
    rule_set_id: uuid.UUID,
    payload: BookingRuleSetUpdateRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingRuleSetResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    ruleset = load_rule_set(db, rule_set_id, context.selected_club.id)
    ruleset.name = payload.name.strip()
    ruleset.applies_to = payload.applies_to
    ruleset.scope_type = payload.scope_type
    ruleset.scope_ref_id = payload.scope_ref_id
    ruleset.conflict_strategy = payload.conflict_strategy
    ruleset.applies_from = payload.applies_from
    ruleset.applies_until = payload.applies_until
    ruleset.priority = payload.priority
    ruleset.active = payload.active
    replace_booking_rules(db, ruleset, payload.rules)
    db.commit()
    db.expire_all()
    return to_rule_set_response(load_rule_set(db, ruleset.id, context.selected_club.id))


def _normalize_request_context(
    *,
    db: Session,
    current_user: User,
    raw_selected_club_id: uuid.UUID | None,
    course_id: uuid.UUID | None,
    tee_id: uuid.UUID | None,
    membership_type: BookingRuleAppliesTo | None,
    membership_role: ClubMembershipRole | None,
    effective_datetime: datetime | None,
    reference_datetime: datetime | None,
    timezone: str | None,
    day_type: PricingDayType | None,
    time_band: PricingTimeBand | None,
    time_band_ref: str | None,
):
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    return RuleContextService(db).normalize_context(
        RuleContextInput(
            club_id=context.selected_club.id,
            course_id=course_id,
            tee_id=tee_id,
            applies_to=membership_type,
            membership_role=membership_role,
            effective_datetime=effective_datetime,
            reference_datetime=reference_datetime,
            timezone=timezone,
            day_type=day_type,
            time_band=time_band,
            time_band_ref=time_band_ref,
        )
    )
