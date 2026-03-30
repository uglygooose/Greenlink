from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import TenderType


class PosProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    name: str
    description: str | None
    price: Decimal
    category: str | None
    active: bool


class PosTransactionItemInput(BaseModel):
    product_id: uuid.UUID | None = None
    item_name: str = Field(min_length=1, max_length=255)
    unit_price: Decimal
    quantity: int = Field(ge=1)

    @field_validator("unit_price")
    @classmethod
    def validate_price_non_negative(cls, value: Decimal) -> Decimal:
        if value < 0:
            raise ValueError("unit_price must be non-negative")
        return value

    @field_validator("item_name")
    @classmethod
    def normalize_item_name(cls, value: str) -> str:
        return value.strip()


class PosTransactionCreateRequest(BaseModel):
    items: list[PosTransactionItemInput] = Field(min_length=1)
    tender_type: TenderType
    person_id: uuid.UUID | None = None
    notes: str | None = Field(default=None, max_length=500)


class PosTransactionItemDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID | None
    item_name_snapshot: str
    unit_price_snapshot: Decimal
    quantity: int
    line_total: Decimal


class PosTransactionDetail(BaseModel):
    id: uuid.UUID
    club_id: uuid.UUID
    total_amount: Decimal
    tender_type: TenderType
    finance_transaction_id: uuid.UUID | None
    notes: str | None
    created_by_user_id: uuid.UUID
    created_at: datetime
    items: list[PosTransactionItemDetail]


class PosTransactionResult(BaseModel):
    decision: Literal["allowed", "blocked"]
    transaction_applied: bool
    transaction: PosTransactionDetail | None = None
    failures: list[str] = []
