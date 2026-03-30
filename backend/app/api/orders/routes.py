from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.routes.club_access import (
    get_requested_club_id,
    require_operations_read,
    require_operations_write,
    resolve_required_club_context,
)
from app.auth.dependencies import get_current_user, get_db
from app.core.exceptions import AuthorizationError, NotFoundError
from app.models import ClubMembershipRole, OrderSource, OrderStatus, User
from app.schemas.order_settlement import (
    OrderSettlementRecordRequest,
    OrderSettlementRequest,
    OrderSettlementResult,
)
from app.schemas.orders import (
    OrderCancelRequest,
    OrderCancelResult,
    OrderChargePostRequest,
    OrderChargePostResult,
    OrderCollectedRequest,
    OrderCollectedResult,
    OrderCreateRequest,
    OrderCreateResult,
    OrderDetailResponse,
    OrderMenuItemResponse,
    OrderPreparingRequest,
    OrderPreparingResult,
    OrderReadyRequest,
    OrderReadyResult,
    OrderSummaryResponse,
)
from app.services.order_finance_posting_service import OrderFinancePostingService
from app.services.order_service import OrderService
from app.services.order_settlement_service import OrderSettlementService

router = APIRouter()


def _correlation_id(request: Request) -> str | None:
    return getattr(request.state, "correlation_id", None)


def _is_member_context(context) -> bool:
    return bool(
        context.selected_membership
        and context.selected_membership.role == ClubMembershipRole.MEMBER
    )


def _require_order_create_access(
    *,
    current_user: User,
    context,
    payload: OrderCreateRequest,
) -> None:
    if payload.source == OrderSource.PLAYER_APP and _is_member_context(context):
        return
    require_operations_write(current_user, context)


def _require_order_menu_read(*, current_user: User, context) -> None:
    if _is_member_context(context):
        return
    require_operations_read(current_user, context)


@router.get("/menu", response_model=list[OrderMenuItemResponse])
def get_order_menu(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> list[OrderMenuItemResponse]:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    _require_order_menu_read(current_user=current_user, context=context)
    assert context.selected_club is not None
    service = OrderService(db)
    return service.list_player_menu(club_id=context.selected_club.id)


@router.post("", response_model=OrderCreateResult)
def create_order(
    payload: OrderCreateRequest,
    request: Request,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> OrderCreateResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    _require_order_create_access(current_user=current_user, context=context, payload=payload)
    assert context.selected_club is not None
    normalized_payload = payload
    if payload.source == OrderSource.PLAYER_APP and payload.person_id is None:
        if current_user.person_id is None:
            raise NotFoundError("Person not found")
        normalized_payload = payload.model_copy(update={"person_id": current_user.person_id})
    if normalized_payload.person_id is None:
        raise AuthorizationError("Order placement requires a resolved person context")
    service = OrderService(db)
    return service.create_order(
        club_id=context.selected_club.id,
        payload=normalized_payload,
        actor_user_id=current_user.id,
        correlation_id=_correlation_id(request),
    )


@router.get("", response_model=list[OrderSummaryResponse])
def list_orders(
    status: OrderStatus | None = Query(default=None),  # noqa: B008
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> list[OrderSummaryResponse]:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = OrderService(db)
    return [
        service.to_order_summary(order)
        for order in service.list_orders(club_id=context.selected_club.id, status=status)
    ]


@router.get("/{order_id}", response_model=OrderDetailResponse)
def get_order(
    order_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> OrderDetailResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = OrderService(db)
    return service.to_order_detail(
        service.get_order(club_id=context.selected_club.id, order_id=order_id)
    )


@router.post("/{order_id}/preparing", response_model=OrderPreparingResult)
def mark_order_preparing(
    order_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> OrderPreparingResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = OrderService(db)
    return service.mark_preparing(
        club_id=context.selected_club.id,
        payload=OrderPreparingRequest(order_id=order_id, acting_user_id=current_user.id),
    )


@router.post("/{order_id}/ready", response_model=OrderReadyResult)
def mark_order_ready(
    order_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> OrderReadyResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = OrderService(db)
    return service.mark_ready(
        club_id=context.selected_club.id,
        payload=OrderReadyRequest(order_id=order_id, acting_user_id=current_user.id),
    )


@router.post("/{order_id}/collected", response_model=OrderCollectedResult)
def mark_order_collected(
    order_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> OrderCollectedResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = OrderService(db)
    return service.mark_collected(
        club_id=context.selected_club.id,
        payload=OrderCollectedRequest(order_id=order_id, acting_user_id=current_user.id),
    )


@router.post("/{order_id}/cancel", response_model=OrderCancelResult)
def cancel_order(
    order_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> OrderCancelResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = OrderService(db)
    return service.cancel_order(
        club_id=context.selected_club.id,
        payload=OrderCancelRequest(order_id=order_id, acting_user_id=current_user.id),
    )


@router.post("/{order_id}/post-charge", response_model=OrderChargePostResult)
def post_order_charge(
    order_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> OrderChargePostResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = OrderFinancePostingService(db)
    return service.post_charge(
        club_id=context.selected_club.id,
        payload=OrderChargePostRequest(order_id=order_id, acting_user_id=current_user.id),
    )


@router.post("/{order_id}/record-payment", response_model=OrderSettlementResult)
def record_order_payment(
    order_id: uuid.UUID,
    payload: OrderSettlementRecordRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> OrderSettlementResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = OrderSettlementService(db)
    return service.record_settlement(
        club_id=context.selected_club.id,
        payload=OrderSettlementRequest(
            order_id=order_id,
            acting_user_id=current_user.id,
            tender_type=payload.tender_type,
        ),
    )
