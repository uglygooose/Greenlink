from __future__ import annotations

import csv
import hashlib
import io
import json
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.datetime import utc_now
from app.core.exceptions import AppError, NotFoundError
from app.models import (
    AccountCustomer,
    Club,
    FinanceAccount,
    FinanceExportBatch,
    FinanceExportBatchStatus,
    FinanceExportProfile,
    FinanceTransaction,
)
from app.schemas.finance import (
    FinanceExportBatchCreateRequest,
    FinanceExportBatchCreateResult,
    FinanceExportBatchDetailResponse,
    FinanceExportBatchDownloadResult,
    FinanceExportBatchListResponse,
    FinanceExportBatchPreviewRow,
    FinanceExportBatchSummaryResponse,
    FinanceExportBatchVoidResult,
)


@dataclass(slots=True)
class SelectedFinanceTransaction:
    transaction: FinanceTransaction
    account_customer_code: str | None


class FinanceExportBatchService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def generate_or_get_existing(
        self,
        *,
        club_id: uuid.UUID,
        created_by_person_id: uuid.UUID,
        payload: FinanceExportBatchCreateRequest,
    ) -> FinanceExportBatchCreateResult:
        existing = self._load_active_batch(
            club_id=club_id,
            export_profile=payload.export_profile,
            date_from=payload.date_from,
            date_to=payload.date_to,
        )
        if existing is not None:
            return FinanceExportBatchCreateResult(
                created=False,
                batch=self._to_detail(existing),
            )

        selected_transactions, timezone_name = self._select_transactions(
            club_id=club_id,
            date_from=payload.date_from,
            date_to=payload.date_to,
        )
        if not selected_transactions:
            raise AppError(
                code="finance_export_empty",
                message="No finance transactions were found for the selected date range",
                status_code=400,
            )

        rows = self._build_rows(selected_transactions)
        content_hash = self._content_hash(rows)
        file_name = self._file_name(
            export_profile=payload.export_profile,
            date_from=payload.date_from,
            date_to=payload.date_to,
        )
        total_debits = sum((Decimal(row.debit_amount) for row in rows), Decimal("0.00"))
        total_credits = sum((Decimal(row.credit_amount) for row in rows), Decimal("0.00"))
        source_counts = Counter(row.source for row in rows)
        type_counts = Counter(row.transaction_type for row in rows)

        batch = FinanceExportBatch(
            club_id=club_id,
            export_profile=payload.export_profile,
            date_from=payload.date_from,
            date_to=payload.date_to,
            status=FinanceExportBatchStatus.GENERATED,
            created_by_person_id=created_by_person_id,
            generated_at=utc_now(),
            file_name=file_name,
            content_hash=content_hash,
            transaction_count=len(rows),
            total_debits=total_debits,
            total_credits=total_credits,
            metadata_json={
                "selection_timezone": timezone_name,
                "selection_window": {
                    "date_from": payload.date_from.isoformat(),
                    "date_to": payload.date_to.isoformat(),
                },
                "source_counts": dict(sorted(source_counts.items())),
                "transaction_type_counts": dict(sorted(type_counts.items())),
            },
            payload_json=[row.model_dump(mode="json") for row in rows],
        )
        self.db.add(batch)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            existing = self._load_active_batch(
                club_id=club_id,
                export_profile=payload.export_profile,
                date_from=payload.date_from,
                date_to=payload.date_to,
            )
            if existing is None:
                raise
            return FinanceExportBatchCreateResult(
                created=False,
                batch=self._to_detail(existing),
            )

        return FinanceExportBatchCreateResult(
            created=True,
            batch=self._to_detail(self.get_batch(club_id=club_id, batch_id=batch.id)),
        )

    def list_batches(self, *, club_id: uuid.UUID) -> FinanceExportBatchListResponse:
        batches = list(
            self.db.scalars(
                select(FinanceExportBatch)
                .where(FinanceExportBatch.club_id == club_id)
                .order_by(FinanceExportBatch.generated_at.desc(), FinanceExportBatch.id.desc())
            ).all()
        )
        return FinanceExportBatchListResponse(
            batches=[self._to_summary(batch) for batch in batches],
            total_count=len(batches),
        )

    def get_batch(self, *, club_id: uuid.UUID, batch_id: uuid.UUID) -> FinanceExportBatch:
        batch = self.db.scalar(
            select(FinanceExportBatch).where(
                FinanceExportBatch.club_id == club_id,
                FinanceExportBatch.id == batch_id,
            )
        )
        if batch is None:
            raise NotFoundError("Finance export batch not found")
        return batch

    def get_batch_detail(
        self,
        *,
        club_id: uuid.UUID,
        batch_id: uuid.UUID,
    ) -> FinanceExportBatchDetailResponse:
        return self._to_detail(self.get_batch(club_id=club_id, batch_id=batch_id))

    def build_download(
        self,
        *,
        club_id: uuid.UUID,
        batch_id: uuid.UUID,
    ) -> FinanceExportBatchDownloadResult:
        batch = self.get_batch(club_id=club_id, batch_id=batch_id)
        rows = [FinanceExportBatchPreviewRow.model_validate(row) for row in batch.payload_json]
        return FinanceExportBatchDownloadResult(
            file_name=batch.file_name,
            content=self._to_csv(rows),
        )

    def void_batch(
        self,
        *,
        club_id: uuid.UUID,
        batch_id: uuid.UUID,
    ) -> FinanceExportBatchVoidResult:
        batch = self.get_batch(club_id=club_id, batch_id=batch_id)
        if batch.status != FinanceExportBatchStatus.VOID:
            batch.status = FinanceExportBatchStatus.VOID
            self.db.add(batch)
            self.db.commit()
            self.db.refresh(batch)
            return FinanceExportBatchVoidResult(
                void_applied=True,
                batch=self._to_detail(batch),
            )
        return FinanceExportBatchVoidResult(
            void_applied=False,
            batch=self._to_detail(batch),
        )

    def _load_active_batch(
        self,
        *,
        club_id: uuid.UUID,
        export_profile: FinanceExportProfile,
        date_from: date,
        date_to: date,
    ) -> FinanceExportBatch | None:
        return self.db.scalar(
            select(FinanceExportBatch).where(
                FinanceExportBatch.club_id == club_id,
                FinanceExportBatch.export_profile == export_profile,
                FinanceExportBatch.date_from == date_from,
                FinanceExportBatch.date_to == date_to,
                FinanceExportBatch.status != FinanceExportBatchStatus.VOID,
            )
        )

    def _select_transactions(
        self,
        *,
        club_id: uuid.UUID,
        date_from: date,
        date_to: date,
    ) -> tuple[list[SelectedFinanceTransaction], str]:
        club = self.db.get(Club, club_id)
        if club is None:
            raise NotFoundError("Club not found")

        zone = ZoneInfo(club.timezone)
        start_local = datetime.combine(date_from, time.min, tzinfo=zone)
        end_local = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=zone)
        start_utc = start_local.astimezone(UTC)
        end_utc = end_local.astimezone(UTC)

        rows = self.db.execute(
            select(FinanceTransaction, AccountCustomer.account_code)
            .join(FinanceAccount, FinanceTransaction.account_id == FinanceAccount.id)
            .join(AccountCustomer, FinanceAccount.account_customer_id == AccountCustomer.id)
            .where(
                FinanceTransaction.club_id == club_id,
                FinanceTransaction.created_at >= start_utc,
                FinanceTransaction.created_at < end_utc,
            )
            .order_by(FinanceTransaction.created_at.asc(), FinanceTransaction.id.asc())
        ).all()

        return (
            [
                SelectedFinanceTransaction(
                    transaction=transaction,
                    account_customer_code=account_customer_code,
                )
                for transaction, account_customer_code in rows
            ],
            club.timezone,
        )

    def _build_rows(
        self,
        selected_transactions: list[SelectedFinanceTransaction],
    ) -> list[FinanceExportBatchPreviewRow]:
        rows: list[FinanceExportBatchPreviewRow] = []
        for selected in selected_transactions:
            transaction = selected.transaction
            amount = Decimal(transaction.amount)
            debit_amount = abs(amount) if amount < 0 else Decimal("0.00")
            credit_amount = amount if amount > 0 else Decimal("0.00")
            rows.append(
                FinanceExportBatchPreviewRow(
                    entry_date=transaction.created_at.date().isoformat(),
                    transaction_id=str(transaction.id),
                    account_customer_code=selected.account_customer_code,
                    transaction_type=transaction.type.value,
                    source=transaction.source.value,
                    reference_id=str(transaction.reference_id) if transaction.reference_id else None,
                    description=transaction.description,
                    amount=self._decimal_string(amount),
                    debit_amount=self._decimal_string(debit_amount),
                    credit_amount=self._decimal_string(credit_amount),
                )
            )
        return rows

    def _content_hash(self, rows: list[FinanceExportBatchPreviewRow]) -> str:
        canonical = json.dumps(
            [row.model_dump(mode="json") for row in rows],
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def _file_name(
        self,
        *,
        export_profile: FinanceExportProfile,
        date_from: date,
        date_to: date,
    ) -> str:
        return (
            f"greenlink-{export_profile.value}-"
            f"{date_from.isoformat()}-to-{date_to.isoformat()}.csv"
        )

    def _to_summary(self, batch: FinanceExportBatch) -> FinanceExportBatchSummaryResponse:
        return FinanceExportBatchSummaryResponse(
            id=batch.id,
            club_id=batch.club_id,
            export_profile=batch.export_profile,
            date_from=batch.date_from,
            date_to=batch.date_to,
            status=batch.status,
            created_by_person_id=batch.created_by_person_id,
            generated_at=batch.generated_at,
            file_name=batch.file_name,
            content_hash=batch.content_hash,
            transaction_count=batch.transaction_count,
            total_debits=batch.total_debits,
            total_credits=batch.total_credits,
            metadata_json=batch.metadata_json,
        )

    def _to_detail(self, batch: FinanceExportBatch) -> FinanceExportBatchDetailResponse:
        return FinanceExportBatchDetailResponse(
            **self._to_summary(batch).model_dump(),
            rows=[FinanceExportBatchPreviewRow.model_validate(row) for row in batch.payload_json],
        )

    def _to_csv(self, rows: list[FinanceExportBatchPreviewRow]) -> str:
        output = io.StringIO()
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(
            [
                "entry_date",
                "transaction_id",
                "account_customer_code",
                "transaction_type",
                "source",
                "reference_id",
                "description",
                "amount",
                "debit_amount",
                "credit_amount",
            ]
        )
        for row in rows:
            writer.writerow(
                [
                    row.entry_date,
                    row.transaction_id,
                    row.account_customer_code or "",
                    row.transaction_type,
                    row.source,
                    row.reference_id or "",
                    row.description,
                    row.amount,
                    row.debit_amount,
                    row.credit_amount,
                ]
            )
        return output.getvalue()

    def _decimal_string(self, value: Decimal) -> str:
        return f"{value.quantize(Decimal('0.01'))}"
