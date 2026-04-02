from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Enum, ForeignKey, Index, JSON, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime
from app.models.enums import FinanceExportBatchStatus, FinanceExportProfile
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class FinanceExportBatch(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "finance_export_batches"
    __table_args__ = (
        Index(
            "uq_finance_export_batches_active_range",
            "club_id",
            "export_profile",
            "date_from",
            "date_to",
            unique=True,
            postgresql_where=text("status <> CAST('void' AS financeexportbatchstatus)"),
            sqlite_where=text("status <> 'void'"),
        ),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    export_profile: Mapped[FinanceExportProfile] = mapped_column(
        Enum(
            FinanceExportProfile,
            values_callable=lambda values: [item.value for item in values],
            name="financeexportprofile",
        ),
        nullable=False,
    )
    date_from: Mapped[date] = mapped_column(nullable=False)
    date_to: Mapped[date] = mapped_column(nullable=False)
    status: Mapped[FinanceExportBatchStatus] = mapped_column(
        Enum(
            FinanceExportBatchStatus,
            values_callable=lambda values: [item.value for item in values],
            name="financeexportbatchstatus",
        ),
        nullable=False,
        default=FinanceExportBatchStatus.GENERATED,
    )
    created_by_person_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("people.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    generated_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    transaction_count: Mapped[int] = mapped_column(nullable=False, default=0)
    total_debits: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    total_credits: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    payload_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
