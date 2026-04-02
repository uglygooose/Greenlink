from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import (
    FinanceAccountStatus,
    FinanceExportBatchStatus,
    FinanceExportProfile,
    FinanceTransactionSource,
    FinanceTransactionType,
)


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


class FinanceExportBatchPreviewRow(BaseModel):
    entry_date: str
    transaction_id: str
    account_customer_code: str | None
    transaction_type: str
    source: str
    reference_id: str | None
    description: str
    amount: str
    debit_amount: str
    credit_amount: str


class FinanceExportBatchCreateRequest(BaseModel):
    export_profile: FinanceExportProfile
    date_from: date
    date_to: date

    @model_validator(mode="after")
    def validate_range(self) -> "FinanceExportBatchCreateRequest":
        if self.date_to < self.date_from:
            raise ValueError("date_to must be on or after date_from")
        return self


class FinanceExportBatchSummaryResponse(BaseModel):
    id: uuid.UUID
    club_id: uuid.UUID
    export_profile: FinanceExportProfile
    date_from: date
    date_to: date
    status: FinanceExportBatchStatus
    created_by_person_id: uuid.UUID
    generated_at: datetime
    file_name: str
    content_hash: str
    transaction_count: int
    total_debits: Decimal
    total_credits: Decimal
    metadata_json: dict[str, object]


class FinanceExportBatchDetailResponse(FinanceExportBatchSummaryResponse):
    rows: list[FinanceExportBatchPreviewRow]


class FinanceExportBatchCreateResult(BaseModel):
    created: bool
    batch: FinanceExportBatchDetailResponse


class FinanceExportBatchListResponse(BaseModel):
    batches: list[FinanceExportBatchSummaryResponse]
    total_count: int


class FinanceExportBatchVoidResult(BaseModel):
    void_applied: bool
    batch: FinanceExportBatchDetailResponse


class FinanceExportBatchDownloadResult(BaseModel):
    file_name: str
    content: str
