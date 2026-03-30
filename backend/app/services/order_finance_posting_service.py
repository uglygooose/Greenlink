from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

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
from app.schemas.finance import FinanceTransactionCreateRequest, FinanceTransactionResponse
from app.schemas.orders import OrderChargePostRequest, OrderChargePostResult
from app.services.finance.ledger_service import LedgerService
from app.services.order_service import OrderService


class OrderFinancePostingService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.ledger_service = LedgerService(db)
        self.order_service = OrderService(db)

    def post_charge(
        self,
        *,
        club_id: uuid.UUID,
        payload: OrderChargePostRequest,
    ) -> OrderChargePostResult:
        order = self._load_order(club_id=club_id, order_id=payload.order_id)
        if order is None:
            return OrderChargePostResult(
                order_id=payload.order_id,
                decision="blocked",
                posting_applied=False,
                failures=[
                    {
                        "code": "order_not_found",
                        "message": "order_id was not found in the selected club",
                        "field": "order_id",
                    }
                ],
            )

        if order.finance_charge_transaction_id is not None:
            transaction = self._load_transaction(
                club_id=club_id,
                transaction_id=order.finance_charge_transaction_id,
            )
            if transaction is None:
                return OrderChargePostResult(
                    order_id=order.id,
                    decision="blocked",
                    posting_applied=False,
                    order=self.order_service.to_order_detail(order),
                    failures=[
                        {
                            "code": "order_finance_transaction_missing",
                            "message": "Linked finance transaction was not found for this order",
                            "field": "order_id",
                        }
                    ],
                )

            return OrderChargePostResult(
                order_id=order.id,
                decision="allowed",
                posting_applied=False,
                order=self.order_service.to_order_detail(order),
                transaction=FinanceTransactionResponse.model_validate(transaction),
                balance=self._compute_balance(club_id=club_id, account_id=transaction.account_id),
                failures=[],
            )

        if order.status != OrderStatus.COLLECTED:
            return OrderChargePostResult(
                order_id=order.id,
                decision="blocked",
                posting_applied=False,
                order=self.order_service.to_order_detail(order),
                failures=[
                    {
                        "code": "order_status_not_charge_postable",
                        "message": "Only collected orders may post a finance charge in this phase",
                        "field": "order_id",
                        "current_status": order.status,
                    }
                ],
            )

        finance_account = self._resolve_finance_account(club_id=club_id, order=order)
        if finance_account is None:
            return OrderChargePostResult(
                order_id=order.id,
                decision="blocked",
                posting_applied=False,
                order=self.order_service.to_order_detail(order),
                failures=[
                    {
                        "code": "order_finance_account_not_found",
                        "message": (
                            "Collected order requires an active finance account in this phase"
                        ),
                        "field": "order_id",
                    }
                ],
            )

        if finance_account.status != FinanceAccountStatus.ACTIVE:
            return OrderChargePostResult(
                order_id=order.id,
                decision="blocked",
                posting_applied=False,
                order=self.order_service.to_order_detail(order),
                failures=[
                    {
                        "code": "order_finance_account_closed",
                        "message": "Collected order cannot post to a closed finance account",
                        "field": "order_id",
                    }
                ],
            )

        created = self.ledger_service.create_transaction(
            club_id=club_id,
            payload=FinanceTransactionCreateRequest(
                account_id=finance_account.id,
                amount=-self._compute_order_total(order),
                type=FinanceTransactionType.CHARGE,
                source=FinanceTransactionSource.ORDER,
                reference_id=order.id,
                description=f"Order charge {str(order.id)[:8]}",
            ),
        )

        order.finance_charge_transaction_id = created.transaction.id
        self.db.add(order)
        self.db.commit()

        hydrated = self.order_service.get_order(club_id=club_id, order_id=order.id)
        return OrderChargePostResult(
            order_id=hydrated.id,
            decision="allowed",
            posting_applied=True,
            order=self.order_service.to_order_detail(hydrated),
            transaction=created.transaction,
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
            .join(
                AccountCustomer,
                AccountCustomer.id == FinanceAccount.account_customer_id,
            )
            .where(
                FinanceAccount.club_id == club_id,
                AccountCustomer.club_id == club_id,
                AccountCustomer.person_id == order.person_id,
                AccountCustomer.active.is_(True),
            )
        )

    def _compute_order_total(self, order: Order) -> Decimal:
        total = Decimal("0.00")
        for item in order.items:
            total += item.unit_price_snapshot * item.quantity
        return total

    def _compute_balance(self, *, club_id: uuid.UUID, account_id: uuid.UUID) -> Decimal:
        balance = self.db.scalar(
            select(func.sum(FinanceTransaction.amount)).where(
                FinanceTransaction.club_id == club_id,
                FinanceTransaction.account_id == account_id,
            )
        )
        return balance if balance is not None else Decimal("0.00")
