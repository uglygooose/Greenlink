from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.events.publisher import DatabaseEventPublisher
from app.models import (
    AccountCustomer,
    FinanceAccount,
    FinanceAccountStatus,
    FinanceTransactionSource,
    FinanceTransactionType,
)
from app.models.enums import TenderType
from app.models.pos_transaction import PosTransaction, PosTransactionItem
from app.models.product import Product
from app.schemas.finance import FinanceTransactionCreateRequest
from app.schemas.pos import (
    PosProductResponse,
    PosTransactionCreateRequest,
    PosTransactionDetail,
    PosTransactionItemDetail,
    PosTransactionResult,
)
from app.services.finance.ledger_service import LedgerService


class PosService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.ledger_service = LedgerService(db)
        self.publisher = DatabaseEventPublisher(db)

    def list_products(self, *, club_id: uuid.UUID) -> list[PosProductResponse]:
        products = list(
            self.db.scalars(
                select(Product)
                .where(Product.club_id == club_id, Product.active.is_(True))
                .order_by(Product.category.asc(), Product.name.asc())
            ).all()
        )
        return [PosProductResponse.model_validate(p) for p in products]

    def create_transaction(
        self,
        *,
        club_id: uuid.UUID,
        payload: PosTransactionCreateRequest,
        actor_user_id: uuid.UUID,
    ) -> PosTransactionResult:
        if not payload.items:
            return PosTransactionResult(
                decision="blocked",
                transaction_applied=False,
                failures=["At least one item is required"],
            )

        total_amount = sum(
            item.unit_price * item.quantity for item in payload.items
        )

        finance_transaction_id: uuid.UUID | None = None

        if payload.tender_type == TenderType.MEMBER_ACCOUNT:
            if payload.person_id is None:
                return PosTransactionResult(
                    decision="blocked",
                    transaction_applied=False,
                    failures=["person_id is required for member_account tender"],
                )
            finance_account = self._resolve_finance_account(
                club_id=club_id,
                person_id=payload.person_id,
            )
            if finance_account is None:
                return PosTransactionResult(
                    decision="blocked",
                    transaction_applied=False,
                    failures=["No active finance account found for this member"],
                )
            if finance_account.status != FinanceAccountStatus.ACTIVE:
                return PosTransactionResult(
                    decision="blocked",
                    transaction_applied=False,
                    failures=["Member finance account is not active"],
                )

            charge_amount = -abs(total_amount)
            created = self.ledger_service.create_transaction(
                club_id=club_id,
                payload=FinanceTransactionCreateRequest(
                    account_id=finance_account.id,
                    amount=charge_amount,
                    type=FinanceTransactionType.CHARGE,
                    source=FinanceTransactionSource.POS,
                    description=f"POS charge - {payload.tender_type.value}",
                ),
            )
            finance_transaction_id = created.transaction.id

        pos_tx = PosTransaction(
            club_id=club_id,
            total_amount=total_amount,
            tender_type=payload.tender_type,
            finance_transaction_id=finance_transaction_id,
            notes=payload.notes,
            created_by_user_id=actor_user_id,
        )
        self.db.add(pos_tx)
        self.db.flush()

        item_models = [
            PosTransactionItem(
                pos_transaction_id=pos_tx.id,
                product_id=item.product_id,
                item_name_snapshot=item.item_name,
                unit_price_snapshot=item.unit_price,
                quantity=item.quantity,
            )
            for item in payload.items
        ]
        self.db.add_all(item_models)
        self.db.commit()
        self.db.refresh(pos_tx)

        hydrated = self._load_transaction(club_id=club_id, transaction_id=pos_tx.id)

        self.publisher.publish(
            event_type="pos.transaction_created",
            aggregate_type="pos_transaction",
            aggregate_id=str(pos_tx.id),
            payload={
                "tender_type": payload.tender_type.value,
                "total_amount": str(total_amount),
                "item_count": len(payload.items),
                "finance_transaction_id": str(finance_transaction_id) if finance_transaction_id else None,
            },
            correlation_id=None,
            club_id=club_id,
            actor_user_id=actor_user_id,
        )
        self.db.commit()

        return PosTransactionResult(
            decision="allowed",
            transaction_applied=True,
            transaction=self._to_transaction_detail(hydrated),
            failures=[],
        )

    def _resolve_finance_account(
        self,
        *,
        club_id: uuid.UUID,
        person_id: uuid.UUID,
    ) -> FinanceAccount | None:
        return self.db.scalar(
            select(FinanceAccount)
            .join(AccountCustomer, AccountCustomer.id == FinanceAccount.account_customer_id)
            .where(
                FinanceAccount.club_id == club_id,
                AccountCustomer.club_id == club_id,
                AccountCustomer.person_id == person_id,
                AccountCustomer.active.is_(True),
            )
        )

    def _load_transaction(
        self,
        *,
        club_id: uuid.UUID,
        transaction_id: uuid.UUID,
    ) -> PosTransaction:
        result = self.db.scalar(
            select(PosTransaction)
            .options(selectinload(PosTransaction.items))
            .where(
                PosTransaction.id == transaction_id,
                PosTransaction.club_id == club_id,
            )
        )
        if result is None:
            raise RuntimeError(f"PosTransaction {transaction_id} not found after commit")
        return result

    def _to_transaction_detail(self, tx: PosTransaction) -> PosTransactionDetail:
        return PosTransactionDetail(
            id=tx.id,
            club_id=tx.club_id,
            total_amount=tx.total_amount,
            tender_type=tx.tender_type,
            finance_transaction_id=tx.finance_transaction_id,
            notes=tx.notes,
            created_by_user_id=tx.created_by_user_id,
            created_at=tx.created_at,
            items=[
                PosTransactionItemDetail(
                    id=item.id,
                    product_id=item.product_id,
                    item_name_snapshot=item.item_name_snapshot,
                    unit_price_snapshot=item.unit_price_snapshot,
                    quantity=item.quantity,
                    line_total=item.unit_price_snapshot * item.quantity,
                )
                for item in tx.items
            ],
        )
