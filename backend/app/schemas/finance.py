from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import FinanceAccountStatus, FinanceTransactionSource, FinanceTransactionType


class FinanceTransactionCreateRequest(BaseModel):
    account_id: uuid.UUID
    amount: Decimal
    type: FinanceTransactionType
    source: FinanceTransactionSource
    reference_id: uuid.UUID | None = None
    description: str = Field(min_length=1, max_length=255)

    @field_validator("amount")
    @classmethod
    def validate_non_zero_amount(cls, value: Decimal) -> Decimal:
        if value == 0:
            raise ValueError("amount must be non-zero")
        return value

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return value.strip()


class FinanceTransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    account_id: uuid.UUID
    amount: Decimal
    type: FinanceTransactionType
    source: FinanceTransactionSource
    reference_id: uuid.UUID | None = None
    description: str
    created_at: datetime


class FinanceTransactionCreateResult(BaseModel):
    transaction: FinanceTransactionResponse
    balance: Decimal


class FinanceLedgerEntryResponse(FinanceTransactionResponse):
    running_balance: Decimal


class FinanceAccountLedgerResponse(BaseModel):
    account_id: uuid.UUID
    club_id: uuid.UUID
    account_customer_id: uuid.UUID
    status: FinanceAccountStatus
    balance: Decimal
    transactions: list[FinanceLedgerEntryResponse]


class FinanceAccountCustomerSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_code: str
    person_id: uuid.UUID


class FinanceAccountSummaryResponse(BaseModel):
    id: uuid.UUID
    club_id: uuid.UUID
    account_customer_id: uuid.UUID
    account_customer: FinanceAccountCustomerSummary
    status: FinanceAccountStatus
    balance: Decimal
    transaction_count: int


class FinanceJournalEntryResponse(FinanceTransactionResponse):
    account_customer_code: str | None


class FinanceClubJournalResponse(BaseModel):
    entries: list[FinanceJournalEntryResponse]
    total_count: int
