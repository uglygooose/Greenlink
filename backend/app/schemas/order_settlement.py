from __future__ import annotations

import uuid
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TenderType
from app.schemas.finance import FinanceTransactionResponse
from app.schemas.orders import OrderDetailResponse, OrderTenderRecordDetail


class OrderSettlementRecordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tender_type: TenderType


class OrderSettlementRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order_id: uuid.UUID
    acting_user_id: uuid.UUID
    tender_type: TenderType


class OrderSettlementDecision(StrEnum):
    ALLOWED = "allowed"
    BLOCKED = "blocked"


class OrderSettlementOrderDetail(OrderDetailResponse):
    pass


class OrderSettlementTransactionDetail(FinanceTransactionResponse):
    tender_type: TenderType | None = None


class OrderSettlementResult(BaseModel):
    decision: OrderSettlementDecision
    settlement_applied: bool = False
    order: OrderSettlementOrderDetail | None = None
    tender: OrderTenderRecordDetail | None = None
    transaction: OrderSettlementTransactionDetail | None = None
    balance: Decimal | None = None
    failures: list[str] = Field(default_factory=list)
