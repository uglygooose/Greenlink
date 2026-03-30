from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import NotFoundError
from app.models import FinanceAccount, FinanceTransaction
from app.schemas.finance import (
    FinanceAccountCustomerSummary,
    FinanceAccountLedgerResponse,
    FinanceAccountSummaryResponse,
    FinanceClubJournalResponse,
    FinanceJournalEntryResponse,
    FinanceLedgerEntryResponse,
    FinanceTransactionCreateRequest,
    FinanceTransactionCreateResult,
    FinanceTransactionResponse,
)


class LedgerService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_transaction(
        self,
        *,
        club_id: uuid.UUID,
        payload: FinanceTransactionCreateRequest,
    ) -> FinanceTransactionCreateResult:
        account = self._load_account(club_id=club_id, account_id=payload.account_id)
        if account is None:
            raise NotFoundError("Finance account not found")

        transaction = FinanceTransaction(
            club_id=club_id,
            account_id=account.id,
            amount=payload.amount,
            type=payload.type,
            source=payload.source,
            reference_id=payload.reference_id,
            description=payload.description,
        )
        self.db.add(transaction)
        self.db.commit()
        self.db.refresh(transaction)

        return FinanceTransactionCreateResult(
            transaction=FinanceTransactionResponse.model_validate(transaction),
            balance=self._compute_balance(club_id=club_id, account_id=account.id),
        )

    def get_account_ledger(
        self,
        *,
        club_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> FinanceAccountLedgerResponse:
        account = self._load_account(club_id=club_id, account_id=account_id)
        if account is None:
            raise NotFoundError("Finance account not found")

        transactions = list(
            self.db.scalars(
                select(FinanceTransaction)
                .where(
                    FinanceTransaction.club_id == club_id,
                    FinanceTransaction.account_id == account.id,
                )
                .order_by(FinanceTransaction.created_at.asc(), FinanceTransaction.id.asc())
            ).all()
        )
        running_balance = Decimal("0.00")
        entries: list[FinanceLedgerEntryResponse] = []
        for transaction in transactions:
            running_balance += transaction.amount
            entries.append(
                FinanceLedgerEntryResponse(
                    id=transaction.id,
                    club_id=transaction.club_id,
                    account_id=transaction.account_id,
                    amount=transaction.amount,
                    type=transaction.type,
                    source=transaction.source,
                    reference_id=transaction.reference_id,
                    description=transaction.description,
                    created_at=transaction.created_at,
                    running_balance=running_balance,
                )
            )

        return FinanceAccountLedgerResponse(
            account_id=account.id,
            club_id=account.club_id,
            account_customer_id=account.account_customer_id,
            status=account.status,
            balance=running_balance,
            transactions=entries,
        )

    def list_accounts(
        self,
        *,
        club_id: uuid.UUID,
    ) -> list[FinanceAccountSummaryResponse]:
        accounts = list(
            self.db.scalars(
                select(FinanceAccount)
                .options(selectinload(FinanceAccount.account_customer))
                .where(FinanceAccount.club_id == club_id)
                .order_by(FinanceAccount.created_at.asc())
            ).all()
        )
        results = []
        for account in accounts:
            balance = self._compute_balance(club_id=club_id, account_id=account.id)
            tx_count = self.db.scalar(
                select(func.count()).where(
                    FinanceTransaction.club_id == club_id,
                    FinanceTransaction.account_id == account.id,
                )
            ) or 0
            results.append(
                FinanceAccountSummaryResponse(
                    id=account.id,
                    club_id=account.club_id,
                    account_customer_id=account.account_customer_id,
                    account_customer=FinanceAccountCustomerSummary(
                        id=account.account_customer.id,
                        account_code=account.account_customer.account_code,
                        person_id=account.account_customer.person_id,
                    ),
                    status=account.status,
                    balance=balance,
                    transaction_count=tx_count,
                )
            )
        return results

    def get_club_journal(
        self,
        *,
        club_id: uuid.UUID,
        limit: int = 50,
    ) -> FinanceClubJournalResponse:
        from sqlalchemy import join as sa_join

        from app.models import AccountCustomer

        total_count = self.db.scalar(
            select(func.count()).where(FinanceTransaction.club_id == club_id)
        ) or 0

        rows = list(
            self.db.execute(
                select(FinanceTransaction, AccountCustomer.account_code)
                .join(
                    FinanceAccount,
                    FinanceTransaction.account_id == FinanceAccount.id,
                )
                .join(
                    AccountCustomer,
                    FinanceAccount.account_customer_id == AccountCustomer.id,
                )
                .where(FinanceTransaction.club_id == club_id)
                .order_by(FinanceTransaction.created_at.desc(), FinanceTransaction.id.desc())
                .limit(limit)
            ).all()
        )

        entries = [
            FinanceJournalEntryResponse(
                id=tx.id,
                club_id=tx.club_id,
                account_id=tx.account_id,
                amount=tx.amount,
                type=tx.type,
                source=tx.source,
                reference_id=tx.reference_id,
                description=tx.description,
                created_at=tx.created_at,
                account_customer_code=account_code,
            )
            for tx, account_code in rows
        ]

        return FinanceClubJournalResponse(entries=entries, total_count=total_count)

    def _load_account(
        self,
        *,
        club_id: uuid.UUID,
        account_id: uuid.UUID,
    ) -> FinanceAccount | None:
        return self.db.scalar(
            select(FinanceAccount)
            .options(selectinload(FinanceAccount.account_customer))
            .where(
                FinanceAccount.id == account_id,
                FinanceAccount.club_id == club_id,
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
