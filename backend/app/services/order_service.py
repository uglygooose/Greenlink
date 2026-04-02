from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import case, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import NotFoundError
from app.events.publisher import DatabaseEventPublisher
from app.models import (
    Booking,
    ClubMembershipStatus,
    DomainEventRecord,
    Order,
    OrderItem,
    OrderSource,
    OrderStatus,
    Person,
)
from app.schemas.orders import (
    OrderCancelRequest,
    OrderCancelResult,
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

PLAYER_MENU_ITEMS = (
    OrderMenuItemResponse(
        product_id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        item_name="Chicken Wrap",
        description="Fast halfway-house favorite with salad greens.",
        unit_price=Decimal("42.00"),
    ),
    OrderMenuItemResponse(
        product_id=uuid.UUID("22222222-2222-2222-2222-222222222222"),
        item_name="Club Sandwich",
        description="Toasted triple-layer sandwich for a quick stop.",
        unit_price=Decimal("58.00"),
    ),
    OrderMenuItemResponse(
        product_id=uuid.UUID("33333333-3333-3333-3333-333333333333"),
        item_name="Beef Burger",
        description="Simple clubhouse burger with chips.",
        unit_price=Decimal("68.00"),
    ),
    OrderMenuItemResponse(
        product_id=uuid.UUID("44444444-4444-4444-4444-444444444444"),
        item_name="Coffee",
        description="Fresh coffee from the halfway counter.",
        unit_price=Decimal("18.00"),
    ),
    OrderMenuItemResponse(
        product_id=uuid.UUID("55555555-5555-5555-5555-555555555555"),
        item_name="Still Water",
        description="500ml bottled water.",
        unit_price=Decimal("12.00"),
    ),
    OrderMenuItemResponse(
        product_id=uuid.UUID("66666666-6666-6666-6666-666666666666"),
        item_name="Sports Drink",
        description="Cold hydration for the back nine.",
        unit_price=Decimal("20.00"),
    ),
)


class OrderService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.publisher = DatabaseEventPublisher(db)

    def create_order(
        self,
        *,
        club_id: uuid.UUID,
        payload: OrderCreateRequest,
        actor_user_id: uuid.UUID | None = None,
        correlation_id: str | None = None,
    ) -> OrderCreateResult:
        if correlation_id:
            existing = self._load_order_from_create_correlation(
                club_id=club_id,
                correlation_id=correlation_id,
            )
            if existing is not None:
                return OrderCreateResult(
                    order=self.to_order_detail(existing),
                    created=False,
                )

        self._ensure_person_in_selected_club(club_id=club_id, person_id=payload.person_id)
        if payload.booking_id is not None:
            self._ensure_booking_in_selected_club(club_id=club_id, booking_id=payload.booking_id)

        order = Order(
            club_id=club_id,
            person_id=payload.person_id,
            booking_id=payload.booking_id,
            source=payload.source,
            status=OrderStatus.PLACED,
        )
        self.db.add(order)
        self.db.flush()

        for item in payload.items:
            item_name_snapshot = item.item_name
            unit_price_snapshot = item.unit_price
            if payload.source == OrderSource.PLAYER_APP:
                menu_item = self._get_player_menu_item(item.product_id)
                item_name_snapshot = menu_item.item_name
                unit_price_snapshot = menu_item.unit_price
            self.db.add(
                OrderItem(
                    order_id=order.id,
                    product_id=item.product_id,
                    item_name_snapshot=item_name_snapshot,
                    unit_price_snapshot=unit_price_snapshot,
                    quantity=item.quantity,
                )
            )

        self.publisher.publish(
            event_type="order.created",
            aggregate_type="order",
            aggregate_id=str(order.id),
            payload={
                "status": order.status.value,
                "source": order.source.value,
                "booking_id": str(order.booking_id) if order.booking_id is not None else None,
                "item_count": len(payload.items),
            },
            correlation_id=correlation_id,
            club_id=club_id,
            actor_user_id=actor_user_id,
        )
        self.db.commit()

        hydrated = self.get_order(club_id=club_id, order_id=order.id)
        return OrderCreateResult(order=self.to_order_detail(hydrated), created=True)

    def list_player_menu(self, *, club_id: uuid.UUID) -> list[OrderMenuItemResponse]:
        # Club scoping is enforced by the route.
        # This static list is the minimal backend-owned menu foundation.
        _ = club_id
        return list(PLAYER_MENU_ITEMS)

    def list_orders(
        self,
        *,
        club_id: uuid.UUID,
        status: OrderStatus | None = None,
    ) -> list[Order]:
        open_status_rank = case(
            (
                Order.status.in_(
                    [OrderStatus.PLACED, OrderStatus.PREPARING, OrderStatus.READY]
                ),
                0,
            ),
            else_=1,
        )
        statement = (
            select(Order)
            .options(
                selectinload(Order.items),
                selectinload(Order.person),
                selectinload(Order.finance_tender_record),
            )
            .where(Order.club_id == club_id)
            .order_by(open_status_rank.asc(), Order.created_at.desc())
        )
        if status is not None:
            statement = statement.where(Order.status == status)
        return list(self.db.scalars(statement).unique().all())

    def get_order(self, *, club_id: uuid.UUID, order_id: uuid.UUID) -> Order:
        order = self._load_order(club_id=club_id, order_id=order_id)
        if order is None:
            raise NotFoundError("Order not found")
        return order

    def mark_preparing(
        self,
        *,
        club_id: uuid.UUID,
        payload: OrderPreparingRequest,
    ) -> OrderPreparingResult:
        return OrderPreparingResult.model_validate(
            self._transition_order(
                club_id=club_id,
                order_id=payload.order_id,
                target_status=OrderStatus.PREPARING,
                allowed_from={OrderStatus.PLACED},
                blocked_code="order_status_not_preparing_eligible",
                blocked_message="Only placed orders may transition to preparing in this phase",
            )
        )

    def mark_ready(
        self,
        *,
        club_id: uuid.UUID,
        payload: OrderReadyRequest,
    ) -> OrderReadyResult:
        return OrderReadyResult.model_validate(
            self._transition_order(
                club_id=club_id,
                order_id=payload.order_id,
                target_status=OrderStatus.READY,
                allowed_from={OrderStatus.PREPARING},
                blocked_code="order_status_not_ready_eligible",
                blocked_message="Only preparing orders may transition to ready in this phase",
            )
        )

    def mark_collected(
        self,
        *,
        club_id: uuid.UUID,
        payload: OrderCollectedRequest,
    ) -> OrderCollectedResult:
        return OrderCollectedResult.model_validate(
            self._transition_order(
                club_id=club_id,
                order_id=payload.order_id,
                target_status=OrderStatus.COLLECTED,
                allowed_from={OrderStatus.READY},
                blocked_code="order_status_not_collectible",
                blocked_message="Only ready orders may transition to collected in this phase",
            )
        )

    def cancel_order(
        self,
        *,
        club_id: uuid.UUID,
        payload: OrderCancelRequest,
    ) -> OrderCancelResult:
        return OrderCancelResult.model_validate(
            self._transition_order(
                club_id=club_id,
                order_id=payload.order_id,
                target_status=OrderStatus.CANCELLED,
                allowed_from={OrderStatus.PLACED},
                blocked_code="order_status_not_cancellable",
                blocked_message="Only placed orders may transition to cancelled in this phase",
            )
        )

    def _transition_order(
        self,
        *,
        club_id: uuid.UUID,
        order_id: uuid.UUID,
        target_status: OrderStatus,
        allowed_from: set[OrderStatus],
        blocked_code: str,
        blocked_message: str,
    ) -> dict[str, object]:
        order = self._load_order(club_id=club_id, order_id=order_id)
        if order is None:
            return {
                "order_id": order_id,
                "decision": "blocked",
                "transition_applied": False,
                "failures": [
                    {
                        "code": "order_not_found",
                        "message": "order_id was not found in the selected club",
                        "field": "order_id",
                    }
                ],
            }

        if order.status == target_status:
            return {
                "order_id": order.id,
                "decision": "allowed",
                "transition_applied": False,
                "order": self.to_order_detail(order),
                "failures": [],
            }

        if order.status not in allowed_from:
            return {
                "order_id": order.id,
                "decision": "blocked",
                "transition_applied": False,
                "order": self.to_order_detail(order),
                "failures": [
                    {
                        "code": blocked_code,
                        "message": blocked_message,
                        "field": "order_id",
                        "current_status": order.status,
                    }
                ],
            }

        order.status = target_status
        self.db.add(order)
        self.db.commit()

        hydrated = self.get_order(club_id=club_id, order_id=order.id)
        return {
            "order_id": hydrated.id,
            "decision": "allowed",
            "transition_applied": True,
            "order": self.to_order_detail(hydrated),
            "failures": [],
        }

    def _load_order(self, *, club_id: uuid.UUID, order_id: uuid.UUID) -> Order | None:
        return self.db.scalar(
            select(Order)
            .options(
                selectinload(Order.items),
                selectinload(Order.person),
                selectinload(Order.finance_tender_record),
            )
            .where(Order.id == order_id, Order.club_id == club_id)
        )

    def _load_order_from_create_correlation(
        self,
        *,
        club_id: uuid.UUID,
        correlation_id: str,
    ) -> Order | None:
        event = self.db.scalar(
            select(DomainEventRecord)
            .where(
                DomainEventRecord.club_id == club_id,
                DomainEventRecord.correlation_id == correlation_id,
                DomainEventRecord.aggregate_type == "order",
                DomainEventRecord.event_type == "order.created",
            )
            .order_by(DomainEventRecord.published_at.desc())
        )
        if event is None:
            return None
        try:
            order_id = uuid.UUID(event.aggregate_id)
        except ValueError:
            return None
        return self._load_order(club_id=club_id, order_id=order_id)

    def _ensure_person_in_selected_club(
        self,
        *,
        club_id: uuid.UUID,
        person_id: uuid.UUID,
    ) -> Person:
        person = self.db.scalar(
            select(Person)
            .options(
                selectinload(Person.memberships),
                selectinload(Person.account_customers),
            )
            .where(Person.id == person_id)
        )
        if person is None:
            raise NotFoundError("Person not found")
        has_active_membership = any(
            membership.club_id == club_id and membership.status == ClubMembershipStatus.ACTIVE
            for membership in person.memberships
        )
        has_active_account_customer = any(
            account_customer.club_id == club_id and account_customer.active
            for account_customer in person.account_customers
        )
        if not has_active_membership and not has_active_account_customer:
            raise NotFoundError("Person not found")
        return person

    def _ensure_booking_in_selected_club(
        self,
        *,
        club_id: uuid.UUID,
        booking_id: uuid.UUID,
    ) -> Booking:
        booking = self.db.scalar(
            select(Booking).where(Booking.id == booking_id, Booking.club_id == club_id)
        )
        if booking is None:
            raise NotFoundError("Booking not found")
        return booking

    def _get_player_menu_item(self, product_id: uuid.UUID | None) -> OrderMenuItemResponse:
        if product_id is None:
            raise NotFoundError("Order menu item not found")
        for item in PLAYER_MENU_ITEMS:
            if item.product_id == product_id:
                return item
        raise NotFoundError("Order menu item not found")

    def to_order_summary(self, order: Order) -> OrderSummaryResponse:
        assert order.person is not None
        item_count = len(order.items)
        if item_count == 0:
            item_summary = "No items"
        elif item_count == 1:
            item_summary = order.items[0].item_name_snapshot
        else:
            item_summary = f"{order.items[0].item_name_snapshot} +{item_count - 1} more"

        return OrderSummaryResponse(
            id=order.id,
            club_id=order.club_id,
            person_id=order.person_id,
            person={"id": order.person.id, "full_name": order.person.full_name},
            booking_id=order.booking_id,
            finance_charge_transaction_id=order.finance_charge_transaction_id,
            finance_charge_posted=order.finance_charge_transaction_id is not None,
            finance_payment_transaction_id=order.finance_payment_transaction_id,
            finance_payment_posted=order.finance_payment_transaction_id is not None,
            finance_tender_record_id=order.finance_tender_record_id,
            tender_recorded=order.finance_tender_record_id is not None,
            payment_tender_type=self._resolve_payment_tender_type(order),
            source=order.source,
            status=order.status,
            created_at=order.created_at,
            item_count=item_count,
            item_summary=item_summary,
        )

    def to_order_detail(self, order: Order) -> OrderDetailResponse:
        summary = self.to_order_summary(order)
        return OrderDetailResponse(
            **summary.model_dump(),
            items=[
                {
                    "id": item.id,
                    "order_id": item.order_id,
                    "product_id": item.product_id,
                    "item_name_snapshot": item.item_name_snapshot,
                    "unit_price_snapshot": item.unit_price_snapshot,
                    "quantity": item.quantity,
                    "created_at": item.created_at,
                }
                for item in order.items
            ],
        )

    def _resolve_payment_tender_type(self, order: Order):
        if order.finance_tender_record is not None:
            return order.finance_tender_record.tender_type
        return None
