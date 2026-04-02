from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.events.publisher import DatabaseEventPublisher
from app.models import (
    AccountCustomer,
    Booking,
    BookingPaymentStatus,
    FinanceAccount,
    FinanceAccountStatus,
    FinanceTenderRecord,
    FinanceTransaction,
    FinanceTransactionSource,
    FinanceTransactionType,
    Order,
    OrderStatus,
)
from app.models.enums import TenderType
from app.schemas.finance import FinanceTransactionCreateRequest
from app.schemas.order_settlement import (
    OrderSettlementOrderDetail,
    OrderSettlementRequest,
    OrderSettlementResult,
    OrderSettlementTransactionDetail,
)
from app.schemas.orders import OrderTenderRecordDetail
from app.services.finance.ledger_service import LedgerService
from app.services.order_service import OrderService


class OrderSettlementService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.publisher = DatabaseEventPublisher(db)
        self.ledger_service = LedgerService(db)
        self.order_service = OrderService(db)

    def record_settlement(
        self,
        *,
        club_id: uuid.UUID,
        payload: OrderSettlementRequest,
    ) -> OrderSettlementResult:
        order = self._load_order(club_id=club_id, order_id=payload.order_id)
        if order is None:
            return OrderSettlementResult(
                decision="blocked",
                settlement_applied=False,
                failures=["order_id was not found in the selected club"],
            )

        if order.finance_tender_record_id is not None:
            return self._return_existing_tender_state(
                club_id=club_id,
                order=order,
                requested_tender_type=payload.tender_type,
            )

        if order.status != OrderStatus.COLLECTED:
            return OrderSettlementResult(
                decision="blocked",
                settlement_applied=False,
                order=self._to_settlement_order_detail(order, tender_type=None),
                failures=["Only collected orders may record settlement in this phase"],
            )

        if order.finance_charge_transaction_id is None:
            return OrderSettlementResult(
                decision="blocked",
                settlement_applied=False,
                order=self._to_settlement_order_detail(order, tender_type=None),
                failures=["Order charge must be posted before settlement can be recorded"],
            )

        charge_transaction = self._load_transaction(
            club_id=club_id,
            transaction_id=order.finance_charge_transaction_id,
        )
        if charge_transaction is None:
            return OrderSettlementResult(
                decision="blocked",
                settlement_applied=False,
                order=self._to_settlement_order_detail(order, tender_type=None),
                failures=["Linked finance charge transaction was not found for this order"],
            )

        finance_account = self._resolve_finance_account(club_id=club_id, order=order)
        if finance_account is None:
            return OrderSettlementResult(
                decision="blocked",
                settlement_applied=False,
                order=self._to_settlement_order_detail(order, tender_type=None),
                failures=["Collected order requires an active finance account in this phase"],
            )

        if finance_account.status != FinanceAccountStatus.ACTIVE:
            return OrderSettlementResult(
                decision="blocked",
                settlement_applied=False,
                order=self._to_settlement_order_detail(order, tender_type=None),
                failures=["Collected order cannot settle against a closed finance account"],
            )

        settlement_amount = abs(charge_transaction.amount)
        tender_record = FinanceTenderRecord(
            club_id=club_id,
            account_id=finance_account.id,
            source=FinanceTransactionSource.ORDER,
            reference_id=order.id,
            tender_type=payload.tender_type,
            amount=settlement_amount,
            charge_transaction_id=charge_transaction.id,
            description=f"Tender for order {order.id} - {payload.tender_type.value}",
        )
        self.db.add(tender_record)
        self.db.flush()

        payment_transaction = None
        settlement_applied = False
        if payload.tender_type != TenderType.MEMBER_ACCOUNT:
            created = self.ledger_service.create_transaction(
                club_id=club_id,
                payload=FinanceTransactionCreateRequest(
                    account_id=finance_account.id,
                    amount=settlement_amount,
                    type=FinanceTransactionType.PAYMENT,
                    source=FinanceTransactionSource.ORDER,
                    reference_id=order.id,
                    description=f"Payment for order {order.id} - {payload.tender_type.value}",
                ),
            )
            payment_transaction = self._load_transaction(
                club_id=club_id,
                transaction_id=created.transaction.id,
            )
            tender_record.settlement_transaction_id = created.transaction.id
            order.finance_payment_transaction_id = created.transaction.id
            settlement_applied = True

        order.finance_tender_record_id = tender_record.id
        booking = self._load_booking(order)
        if booking is not None:
            booking.payment_status = (
                BookingPaymentStatus.PAID
                if settlement_applied
                else BookingPaymentStatus.PENDING
            )
            self.db.add(booking)

        self.db.add(tender_record)
        self.db.add(order)
        self.publisher.publish(
            event_type="order.tender_recorded",
            aggregate_type="order",
            aggregate_id=str(order.id),
            payload={
                "tender_type": payload.tender_type.value,
                "payment_transaction_id": (
                    str(payment_transaction.id) if payment_transaction is not None else None
                ),
                "tender_record_id": str(tender_record.id),
                "charge_transaction_id": str(order.finance_charge_transaction_id),
                "settlement_applied": settlement_applied,
            },
            correlation_id=None,
            club_id=club_id,
            actor_user_id=payload.acting_user_id,
        )
        self.db.commit()

        hydrated = self.order_service.get_order(club_id=club_id, order_id=order.id)
        return OrderSettlementResult(
            decision="allowed",
            settlement_applied=settlement_applied,
            order=self._to_settlement_order_detail(hydrated, tender_type=payload.tender_type),
            tender=self._to_tender_detail(tender_record, settlement_applied=settlement_applied),
            transaction=self._to_settlement_transaction_detail(
                payment_transaction,
                tender_type=payload.tender_type,
            ),
            balance=self._compute_balance(club_id=club_id, account_id=finance_account.id),
            failures=[],
        )

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

    def _load_transaction(
        self,
        *,
        club_id: uuid.UUID,
        transaction_id: uuid.UUID,
    ) -> FinanceTransaction | None:
        return self.db.scalar(
            select(FinanceTransaction).where(
                FinanceTransaction.id == transaction_id,
                FinanceTransaction.club_id == club_id,
            )
        )

    def _load_tender_record(
        self,
        *,
        club_id: uuid.UUID,
        tender_record_id: uuid.UUID,
    ) -> FinanceTenderRecord | None:
        return self.db.scalar(
            select(FinanceTenderRecord).where(
                FinanceTenderRecord.id == tender_record_id,
                FinanceTenderRecord.club_id == club_id,
            )
        )

    def _resolve_finance_account(
        self,
        *,
        club_id: uuid.UUID,
        order: Order,
    ) -> FinanceAccount | None:
        return self.db.scalar(
            select(FinanceAccount)
            .join(AccountCustomer, AccountCustomer.id == FinanceAccount.account_customer_id)
            .where(
                FinanceAccount.club_id == club_id,
                AccountCustomer.club_id == club_id,
                AccountCustomer.person_id == order.person_id,
                AccountCustomer.active.is_(True),
            )
        )

    def _compute_balance(self, *, club_id: uuid.UUID, account_id: uuid.UUID) -> Decimal:
        balance = self.db.scalar(
            select(func.sum(FinanceTransaction.amount)).where(
                FinanceTransaction.club_id == club_id,
                FinanceTransaction.account_id == account_id,
            )
        )
        return balance if balance is not None else Decimal("0.00")

    def _to_settlement_order_detail(
        self,
        order: Order,
        *,
        tender_type: TenderType | None,
    ) -> OrderSettlementOrderDetail:
        detail = self.order_service.to_order_detail(order).model_dump()
        if tender_type is not None:
            detail["payment_tender_type"] = tender_type
        return OrderSettlementOrderDetail(**detail)

    def _to_tender_detail(
        self,
        tender_record: FinanceTenderRecord | None,
        *,
        settlement_applied: bool,
    ) -> OrderTenderRecordDetail | None:
        if tender_record is None:
            return None
        detail = OrderTenderRecordDetail.model_validate(tender_record).model_dump()
        detail["settlement_applied"] = settlement_applied
        return OrderTenderRecordDetail(**detail)

    def _to_settlement_transaction_detail(
        self,
        transaction: FinanceTransaction | None,
        *,
        tender_type: TenderType | None,
    ) -> OrderSettlementTransactionDetail | None:
        if transaction is None:
            return None
        return OrderSettlementTransactionDetail(
            id=transaction.id,
            club_id=transaction.club_id,
            account_id=transaction.account_id,
            amount=transaction.amount,
            type=transaction.type,
            source=transaction.source,
            reference_id=transaction.reference_id,
            description=transaction.description,
            created_at=transaction.created_at,
            tender_type=tender_type,
        )

    def _load_booking(self, order: Order) -> Booking | None:
        if order.booking_id is None:
            return None
        return self.db.get(Booking, order.booking_id)

    def _return_existing_tender_state(
        self,
        *,
        club_id: uuid.UUID,
        order: Order,
        requested_tender_type: TenderType,
    ) -> OrderSettlementResult:
        tender_record = self._load_tender_record(
            club_id=club_id,
            tender_record_id=order.finance_tender_record_id,
        )
        if tender_record is None:
            return OrderSettlementResult(
                decision="blocked",
                settlement_applied=False,
                order=self._to_settlement_order_detail(order, tender_type=None),
                failures=["Linked finance tender record was not found for this order"],
            )

        if tender_record.tender_type != requested_tender_type:
            return OrderSettlementResult(
                decision="blocked",
                settlement_applied=False,
                order=self._to_settlement_order_detail(
                    order,
                    tender_type=tender_record.tender_type,
                ),
                tender=self._to_tender_detail(
                    tender_record,
                    settlement_applied=tender_record.settlement_transaction_id is not None,
                ),
                failures=[
                    f"Tender already recorded as {tender_record.tender_type.value} for this order"
                ],
            )

        payment_transaction = None
        if order.finance_payment_transaction_id is not None:
            payment_transaction = self._load_transaction(
                club_id=club_id,
                transaction_id=order.finance_payment_transaction_id,
            )
            if payment_transaction is None:
                return OrderSettlementResult(
                    decision="blocked",
                    settlement_applied=False,
                    order=self._to_settlement_order_detail(
                        order,
                        tender_type=tender_record.tender_type,
                    ),
                    tender=self._to_tender_detail(tender_record, settlement_applied=False),
                    failures=["Linked finance payment transaction was not found for this order"],
                )

        return OrderSettlementResult(
            decision="allowed",
            settlement_applied=False,
            order=self._to_settlement_order_detail(
                order,
                tender_type=tender_record.tender_type,
            ),
            tender=self._to_tender_detail(
                tender_record,
                settlement_applied=payment_transaction is not None,
            ),
            transaction=self._to_settlement_transaction_detail(
                payment_transaction,
                tender_type=tender_record.tender_type,
            ),
            balance=self._compute_balance(club_id=club_id, account_id=tender_record.account_id),
            failures=[],
        )
