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


class AccountingExportProfileTransactionMapping(BaseModel):
    debit_account_code: str = Field(min_length=1, max_length=64)
    credit_account_code: str = Field(min_length=1, max_length=64)
    description_prefix: str = Field(default="", max_length=64)

    @field_validator("debit_account_code", "credit_account_code", "description_prefix")
    @classmethod
    def normalize_mapping_value(cls, value: str) -> str:
        return value.strip()


class AccountingExportProfileMappingConfig(BaseModel):
    reference_prefix: str = Field(default="GL", min_length=1, max_length=32)
    fallback_customer_code: str = Field(default="UNASSIGNED", min_length=1, max_length=64)
    transaction_mappings: dict[FinanceTransactionType, AccountingExportProfileTransactionMapping]

    @field_validator("reference_prefix", "fallback_customer_code")
    @classmethod
    def normalize_top_level_mapping_value(cls, value: str) -> str:
        return value.strip()

    @field_validator("transaction_mappings")
    @classmethod
    def validate_transaction_mappings(
        cls,
        value: dict[FinanceTransactionType, AccountingExportProfileTransactionMapping],
    ) -> dict[FinanceTransactionType, AccountingExportProfileTransactionMapping]:
        missing = set(FinanceTransactionType) - set(value.keys())
        if missing:
            raise ValueError(
                f"transaction mappings are required for: {', '.join(sorted(item.value for item in missing))}"
            )
        return value


class AccountingExportProfileUpsertRequest(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    target_system: str = Field(min_length=1, max_length=64)
    is_active: bool = True
    mapping_config: AccountingExportProfileMappingConfig

    @field_validator("code", "name", "target_system")
    @classmethod
    def normalize_profile_text(cls, value: str) -> str:
        return value.strip()


class AccountingExportProfileResponse(BaseModel):
    id: uuid.UUID
    club_id: uuid.UUID
    code: str
    name: str
    target_system: str
    is_active: bool
    mapping_config: AccountingExportProfileMappingConfig
    created_by_person_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class AccountingExportProfileListResponse(BaseModel):
    profiles: list[AccountingExportProfileResponse]
    total_count: int


class AccountingMappedExportPreviewRow(BaseModel):
    date: str
    reference: str
    description: str
    debit_account_code: str
    credit_account_code: str
    amount: str
    customer_account_code: str
    source_type: str


class AccountingMappedExportPreviewResponse(BaseModel):
    source_batch_id: uuid.UUID
    source_export_profile: FinanceExportProfile
    accounting_profile_id: uuid.UUID
    accounting_profile_code: str
    accounting_profile_name: str
    target_system: str
    generated_at: datetime
    file_name: str
    content_hash: str
    row_count: int
    metadata_json: dict[str, object]
    rows: list[AccountingMappedExportPreviewRow]


class AccountingMappedExportDownloadResult(BaseModel):
    file_name: str
    content: str
