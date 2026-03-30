from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.events.publisher import DatabaseEventPublisher
from app.models import (
    AccountCustomer,
    FinanceAccount,
    FinanceAccountStatus,
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

        if order.finance_payment_transaction_id is not None:
            transaction = self._load_transaction(
                club_id=club_id,
                transaction_id=order.finance_payment_transaction_id,
            )
            if transaction is None:
                return OrderSettlementResult(
                    decision="blocked",
                    settlement_applied=False,
                    order=self._to_settlement_order_detail(order, tender_type=None),
                    failures=["Linked finance payment transaction was not found for this order"],
                )

            tender_type = self._extract_tender_type(transaction.description)
            return OrderSettlementResult(
                decision="allowed",
                settlement_applied=False,
                order=self._to_settlement_order_detail(order, tender_type=tender_type),
                transaction=self._to_settlement_transaction_detail(
                    transaction,
                    tender_type=tender_type,
                ),
                balance=self._compute_balance(club_id=club_id, account_id=transaction.account_id),
                failures=[],
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

        order.finance_payment_transaction_id = created.transaction.id
        self.db.add(order)
        self.publisher.publish(
            event_type="order.payment_recorded",
            aggregate_type="order",
            aggregate_id=str(order.id),
            payload={
                "tender_type": payload.tender_type.value,
                "payment_transaction_id": str(created.transaction.id),
                "charge_transaction_id": str(order.finance_charge_transaction_id),
            },
            correlation_id=None,
            club_id=club_id,
            actor_user_id=payload.acting_user_id,
        )
        self.db.commit()

        hydrated = self.order_service.get_order(club_id=club_id, order_id=order.id)
        return OrderSettlementResult(
            decision="allowed",
            settlement_applied=True,
            order=self._to_settlement_order_detail(hydrated, tender_type=payload.tender_type),
            transaction=self._to_settlement_transaction_detail(
                self._load_transaction(club_id=club_id, transaction_id=created.transaction.id),
                tender_type=payload.tender_type,
            ),
            balance=created.balance,
            failures=[],
        )

    def _load_order(self, *, club_id: uuid.UUID, order_id: uuid.UUID) -> Order | None:
        return self.db.scalar(
            select(Order)
            .options(selectinload(Order.items), selectinload(Order.person))
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

    def _extract_tender_type(self, description: str) -> TenderType | None:
        for tender_type in TenderType:
            if description.endswith(tender_type.value):
                return tender_type
        return None

    def _to_settlement_order_detail(
        self,
        order: Order,
        *,
        tender_type: TenderType | None,
    ) -> OrderSettlementOrderDetail:
        base_detail = self.order_service.to_order_detail(order)
        return OrderSettlementOrderDetail(
            **base_detail.model_dump(),
            finance_payment_transaction_id=order.finance_payment_transaction_id,
            finance_payment_posted=order.finance_payment_transaction_id is not None,
            payment_tender_type=tender_type,
        )

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
