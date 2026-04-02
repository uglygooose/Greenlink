from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import OrderSource, OrderStatus
from app.models.enums import TenderType
from app.schemas.finance import FinanceTenderRecordResponse, FinanceTransactionResponse


class OrderItemCreateInput(BaseModel):
    product_id: uuid.UUID | None = None
    item_name: str = Field(min_length=1, max_length=255)
    unit_price: Decimal = Field(ge=0)
    quantity: int = Field(ge=1, le=999)

    @field_validator("item_name")
    @classmethod
    def normalize_item_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("item_name must not be blank")
        return normalized


class OrderCreateRequest(BaseModel):
    person_id: uuid.UUID | None = None
    booking_id: uuid.UUID | None = None
    source: OrderSource
    items: list[OrderItemCreateInput] = Field(min_length=1, max_length=64)

    @model_validator(mode="after")
    def validate_person_requirement(self) -> OrderCreateRequest:
        if self.source != OrderSource.PLAYER_APP and self.person_id is None:
            raise ValueError("person_id is required unless source is player_app")
        return self


class OrderMenuItemResponse(BaseModel):
    product_id: uuid.UUID
    item_name: str
    description: str
    unit_price: Decimal


class OrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    product_id: uuid.UUID | None = None
    item_name_snapshot: str
    unit_price_snapshot: Decimal
    quantity: int
    created_at: datetime


class OrderPersonSummary(BaseModel):
    id: uuid.UUID
    full_name: str


class OrderSummaryResponse(BaseModel):
    id: uuid.UUID
    club_id: uuid.UUID
    person_id: uuid.UUID
    person: OrderPersonSummary
    booking_id: uuid.UUID | None = None
    finance_charge_transaction_id: uuid.UUID | None = None
    finance_charge_posted: bool = False
    finance_payment_transaction_id: uuid.UUID | None = None
    finance_payment_posted: bool = False
    finance_tender_record_id: uuid.UUID | None = None
    tender_recorded: bool = False
    payment_tender_type: TenderType | None = None
    source: OrderSource
    status: OrderStatus
    created_at: datetime
    item_count: int
    item_summary: str


class OrderDetailResponse(OrderSummaryResponse):
    items: list[OrderItemResponse] = Field(default_factory=list)


class OrderCreateResult(BaseModel):
    order: OrderDetailResponse
    created: bool


class OrderLifecycleMutationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order_id: uuid.UUID
    acting_user_id: uuid.UUID


class OrderLifecycleMutationFailureDetail(BaseModel):
    code: str
    message: str
    field: str | None = None
    current_status: OrderStatus | None = None


class OrderLifecycleMutationDecision(StrEnum):
    ALLOWED = "allowed"
    BLOCKED = "blocked"


class OrderLifecycleMutationResult(BaseModel):
    order_id: uuid.UUID
    decision: OrderLifecycleMutationDecision
    transition_applied: bool = False
    order: OrderDetailResponse | None = None
    failures: list[OrderLifecycleMutationFailureDetail] = Field(default_factory=list)


class OrderPreparingRequest(OrderLifecycleMutationRequest):
    pass


class OrderPreparingFailureDetail(OrderLifecycleMutationFailureDetail):
    pass


OrderPreparingDecision = OrderLifecycleMutationDecision


class OrderPreparingResult(OrderLifecycleMutationResult):
    order_id: uuid.UUID
    decision: OrderPreparingDecision
    failures: list[OrderPreparingFailureDetail] = Field(default_factory=list)


class OrderReadyRequest(OrderLifecycleMutationRequest):
    pass


class OrderReadyFailureDetail(OrderLifecycleMutationFailureDetail):
    pass


OrderReadyDecision = OrderLifecycleMutationDecision


class OrderReadyResult(OrderLifecycleMutationResult):
    order_id: uuid.UUID
    decision: OrderReadyDecision
    failures: list[OrderReadyFailureDetail] = Field(default_factory=list)


class OrderCollectedRequest(OrderLifecycleMutationRequest):
    pass


class OrderCollectedFailureDetail(OrderLifecycleMutationFailureDetail):
    pass


OrderCollectedDecision = OrderLifecycleMutationDecision


class OrderCollectedResult(OrderLifecycleMutationResult):
    order_id: uuid.UUID
    decision: OrderCollectedDecision
    failures: list[OrderCollectedFailureDetail] = Field(default_factory=list)


class OrderCancelRequest(OrderLifecycleMutationRequest):
    pass


class OrderCancelFailureDetail(OrderLifecycleMutationFailureDetail):
    pass


OrderCancelDecision = OrderLifecycleMutationDecision


class OrderCancelResult(OrderLifecycleMutationResult):
    order_id: uuid.UUID
    decision: OrderCancelDecision
    failures: list[OrderCancelFailureDetail] = Field(default_factory=list)


class OrderChargePostRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order_id: uuid.UUID
    acting_user_id: uuid.UUID


class OrderChargePostFailureDetail(BaseModel):
    code: str
    message: str
    field: str | None = None
    current_status: OrderStatus | None = None


class OrderChargePostDecision(StrEnum):
    ALLOWED = "allowed"
    BLOCKED = "blocked"


class OrderChargePostResult(BaseModel):
    order_id: uuid.UUID
    decision: OrderChargePostDecision
    posting_applied: bool = False
    order: OrderDetailResponse | None = None
    transaction: FinanceTransactionResponse | None = None
    balance: Decimal | None = None
    failures: list[OrderChargePostFailureDetail] = Field(default_factory=list)


class OrderTenderRecordDetail(FinanceTenderRecordResponse):
    settlement_applied: bool = False
