from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import uuid
from datetime import datetime
from decimal import Decimal
from decimal import InvalidOperation

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.datetime import utc_now
from app.core.exceptions import AppError, NotFoundError
from app.models import (
    AccountingExportProfile,
    FinanceExportProfile,
    FinanceTransactionSource,
    FinanceTransactionType,
)
from app.schemas.finance import (
    AccountingExportProfileListResponse,
    AccountingExportProfileMappingConfig,
    AccountingExportProfileResponse,
    AccountingExportProfileUpsertRequest,
    AccountingMappedExportDownloadResult,
    AccountingMappedExportPreviewResponse,
    AccountingMappedExportPreviewRow,
    AccountingMappedExportValidationError,
    FinanceExportBatchPreviewRow,
)
from app.services.finance.export_batch_service import FinanceExportBatchService


class AccountingProfileMappingService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.batch_service = FinanceExportBatchService(db)

    def list_profiles(self, *, club_id: uuid.UUID) -> AccountingExportProfileListResponse:
        profiles = list(
            self.db.scalars(
                select(AccountingExportProfile)
                .where(AccountingExportProfile.club_id == club_id)
                .order_by(AccountingExportProfile.is_active.desc(), AccountingExportProfile.name.asc())
            ).all()
        )
        return AccountingExportProfileListResponse(
            profiles=[self._to_profile_response(profile) for profile in profiles],
            total_count=len(profiles),
        )

    def create_profile(
        self,
        *,
        club_id: uuid.UUID,
        created_by_person_id: uuid.UUID,
        payload: AccountingExportProfileUpsertRequest,
    ) -> AccountingExportProfileResponse:
        profile = AccountingExportProfile(
            club_id=club_id,
            code=self._normalize_code(payload.code),
            name=payload.name.strip(),
            target_system=payload.target_system.strip(),
            is_active=payload.is_active,
            mapping_config_json=payload.mapping_config.model_dump(mode="json"),
            created_by_person_id=created_by_person_id,
        )
        self.db.add(profile)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise AppError(
                code="accounting_export_profile_code_conflict",
                message="An accounting export profile with this code already exists for the club",
                status_code=409,
            ) from None
        self.db.refresh(profile)
        return self._to_profile_response(profile)

    def update_profile(
        self,
        *,
        club_id: uuid.UUID,
        profile_id: uuid.UUID,
        payload: AccountingExportProfileUpsertRequest,
    ) -> AccountingExportProfileResponse:
        profile = self.get_profile(club_id=club_id, profile_id=profile_id)
        profile.code = self._normalize_code(payload.code)
        profile.name = payload.name.strip()
        profile.target_system = payload.target_system.strip()
        profile.is_active = payload.is_active
        profile.mapping_config_json = payload.mapping_config.model_dump(mode="json")
        self.db.add(profile)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise AppError(
                code="accounting_export_profile_code_conflict",
                message="An accounting export profile with this code already exists for the club",
                status_code=409,
            ) from None
        self.db.refresh(profile)
        return self._to_profile_response(profile)

    def get_profile(self, *, club_id: uuid.UUID, profile_id: uuid.UUID) -> AccountingExportProfile:
        profile = self.db.scalar(
            select(AccountingExportProfile).where(
                AccountingExportProfile.club_id == club_id,
                AccountingExportProfile.id == profile_id,
            )
        )
        if profile is None:
            raise NotFoundError("Accounting export profile not found")
        return profile

    def build_mapped_export_preview(
        self,
        *,
        club_id: uuid.UUID,
        batch_id: uuid.UUID,
        profile_id: uuid.UUID,
    ) -> AccountingMappedExportPreviewResponse:
        batch = self.batch_service.get_batch(club_id=club_id, batch_id=batch_id)
        profile = self.get_profile(club_id=club_id, profile_id=profile_id)
        if not profile.is_active:
            raise AppError(
                code="accounting_export_profile_inactive",
                message="Only active accounting export profiles may be applied",
                status_code=400,
            )

        mapped_rows, validation_errors = self._build_validated_mapped_rows(batch=batch, profile=profile)
        generated_at = utc_now()
        file_name = (
            f"greenlink-generic_journal_mapped-{profile.code}-"
            f"{batch.date_from.isoformat()}-to-{batch.date_to.isoformat()}.csv"
        )
        content_hash = self._content_hash(mapped_rows)
        return AccountingMappedExportPreviewResponse(
            source_batch_id=batch.id,
            source_export_profile=FinanceExportProfile(batch.export_profile),
            accounting_profile_id=profile.id,
            accounting_profile_code=profile.code,
            accounting_profile_name=profile.name,
            target_system=profile.target_system,
            generated_at=generated_at,
            file_name=file_name,
            content_hash=content_hash,
            row_count=len(mapped_rows),
            download_ready=len(validation_errors) == 0,
            metadata_json={
                "output_mode": "generic_journal_mapped",
                "source_batch_content_hash": batch.content_hash,
                "source_batch_file_name": batch.file_name,
                "column_order": [
                    "date",
                    "reference",
                    "description",
                    "debit_account_code",
                    "credit_account_code",
                    "amount",
                    "customer_account_code",
                    "source_type",
                ],
            },
            validation_errors=validation_errors,
            rows=mapped_rows,
        )

    def build_mapped_export_download(
        self,
        *,
        club_id: uuid.UUID,
        batch_id: uuid.UUID,
        profile_id: uuid.UUID,
    ) -> AccountingMappedExportDownloadResult:
        preview = self.build_mapped_export_preview(club_id=club_id, batch_id=batch_id, profile_id=profile_id)
        if preview.validation_errors:
            raise AppError(
                code="accounting_export_validation_failed",
                message=self._validation_failure_message(preview.validation_errors),
                status_code=422,
            )
        return AccountingMappedExportDownloadResult(
            file_name=preview.file_name,
            content=self._to_csv(preview.rows),
        )

    def _build_validated_mapped_rows(
        self,
        *,
        batch,
        profile: AccountingExportProfile,
    ) -> tuple[list[AccountingMappedExportPreviewRow], list[AccountingMappedExportValidationError]]:
        validation_errors: list[AccountingMappedExportValidationError] = []
        try:
            config = AccountingExportProfileMappingConfig.model_validate(profile.mapping_config_json)
        except ValidationError as exc:
            return [], self._collect_model_validation_errors(
                exc,
                code="accounting_export_profile_invalid",
                message_prefix="Profile mapping config is invalid",
            )

        canonical_rows: list[FinanceExportBatchPreviewRow] = []
        for row_index, row in enumerate(batch.payload_json, start=1):
            try:
                canonical_rows.append(FinanceExportBatchPreviewRow.model_validate(row))
            except ValidationError as exc:
                validation_errors.extend(
                    self._collect_model_validation_errors(
                        exc,
                        code="accounting_export_source_row_invalid",
                        message_prefix=f"Canonical row {row_index} is invalid",
                        row_index=row_index,
                    )
                )
        if validation_errors:
            return [], validation_errors

        mapped_rows = self._map_rows(canonical_rows=canonical_rows, config=config)
        validation_errors.extend(self._validate_mapped_rows(mapped_rows=mapped_rows, config=config))
        return mapped_rows, validation_errors

    def _to_profile_response(self, profile: AccountingExportProfile) -> AccountingExportProfileResponse:
        return AccountingExportProfileResponse(
            id=profile.id,
            club_id=profile.club_id,
            code=profile.code,
            name=profile.name,
            target_system=profile.target_system,
            is_active=profile.is_active,
            mapping_config=AccountingExportProfileMappingConfig.model_validate(profile.mapping_config_json),
            created_by_person_id=profile.created_by_person_id,
            created_at=profile.created_at,
            updated_at=profile.updated_at,
        )

    def _map_rows(
        self,
        *,
        canonical_rows: list[FinanceExportBatchPreviewRow],
        config: AccountingExportProfileMappingConfig,
    ) -> list[AccountingMappedExportPreviewRow]:
        rows: list[AccountingMappedExportPreviewRow] = []
        for row in canonical_rows:
            transaction_type = FinanceTransactionType(row.transaction_type)
            mapping = config.transaction_mappings[transaction_type]
            reference_token = row.reference_id or row.transaction_id
            description = f"{mapping.description_prefix} {row.description}".strip()
            rows.append(
                AccountingMappedExportPreviewRow(
                    date=row.entry_date,
                    reference=f"{config.reference_prefix}-{reference_token}",
                    description=description,
                    debit_account_code=mapping.debit_account_code,
                    credit_account_code=mapping.credit_account_code,
                    amount=self._decimal_string(abs(Decimal(row.amount))),
                    customer_account_code=row.account_customer_code or config.fallback_customer_code,
                    source_type=row.source,
                )
            )
        return rows

    def _validate_mapped_rows(
        self,
        *,
        mapped_rows: list[AccountingMappedExportPreviewRow],
        config: AccountingExportProfileMappingConfig,
    ) -> list[AccountingMappedExportValidationError]:
        validation_errors: list[AccountingMappedExportValidationError] = []
        reference_prefix = f"{config.reference_prefix}-"
        for row_index, row in enumerate(mapped_rows, start=1):
            if not row.reference.strip():
                validation_errors.append(
                    self._validation_error(
                        code="accounting_export_reference_missing",
                        message=f"Mapped row {row_index} is missing a reference",
                        row_index=row_index,
                        field="reference",
                    )
                )
            elif not row.reference.startswith(reference_prefix):
                validation_errors.append(
                    self._validation_error(
                        code="accounting_export_reference_prefix_invalid",
                        message=(
                            f"Mapped row {row_index} reference must start with "
                            f"'{reference_prefix}'"
                        ),
                        row_index=row_index,
                        field="reference",
                    )
                )

            if not row.description.strip():
                validation_errors.append(
                    self._validation_error(
                        code="accounting_export_description_missing",
                        message=f"Mapped row {row_index} is missing a description",
                        row_index=row_index,
                        field="description",
                    )
                )

            for field_name, value in (
                ("debit_account_code", row.debit_account_code),
                ("credit_account_code", row.credit_account_code),
                ("customer_account_code", row.customer_account_code),
            ):
                if value.strip():
                    continue
                validation_errors.append(
                    self._validation_error(
                        code=f"accounting_export_{field_name}_missing",
                        message=f"Mapped row {row_index} is missing {field_name.replace('_', ' ')}",
                        row_index=row_index,
                        field=field_name,
                    )
                )

            try:
                amount = Decimal(row.amount)
            except InvalidOperation:
                validation_errors.append(
                    self._validation_error(
                        code="accounting_export_amount_invalid",
                        message=f"Mapped row {row_index} amount is not a valid decimal",
                        row_index=row_index,
                        field="amount",
                    )
                )
            else:
                if amount <= 0:
                    validation_errors.append(
                        self._validation_error(
                            code="accounting_export_amount_non_positive",
                            message=f"Mapped row {row_index} amount must be positive",
                            row_index=row_index,
                            field="amount",
                        )
                    )
                elif amount.quantize(Decimal("0.01")) != amount:
                    validation_errors.append(
                        self._validation_error(
                            code="accounting_export_amount_precision_invalid",
                            message=f"Mapped row {row_index} amount must use two decimal places",
                            row_index=row_index,
                            field="amount",
                        )
                    )

            try:
                FinanceTransactionSource(row.source_type)
            except ValueError:
                validation_errors.append(
                    self._validation_error(
                        code="accounting_export_source_type_invalid",
                        message=f"Mapped row {row_index} source type is not recognized",
                        row_index=row_index,
                        field="source_type",
                    )
                )

        return validation_errors

    def _collect_model_validation_errors(
        self,
        exc: ValidationError,
        *,
        code: str,
        message_prefix: str,
        row_index: int | None = None,
    ) -> list[AccountingMappedExportValidationError]:
        errors: list[AccountingMappedExportValidationError] = []
        for item in exc.errors():
            field = ".".join(str(part) for part in item["loc"]) or None
            message = message_prefix
            if field:
                message = f"{message_prefix}: {field} {item['msg']}"
            else:
                message = f"{message_prefix}: {item['msg']}"
            errors.append(
                self._validation_error(
                    code=code,
                    message=message,
                    row_index=row_index,
                    field=field,
                )
            )
        return errors

    def _validation_error(
        self,
        *,
        code: str,
        message: str,
        row_index: int | None = None,
        field: str | None = None,
    ) -> AccountingMappedExportValidationError:
        return AccountingMappedExportValidationError(
            code=code,
            message=message,
            row_index=row_index,
            field=field,
        )

    def _validation_failure_message(
        self,
        validation_errors: list[AccountingMappedExportValidationError],
    ) -> str:
        top_messages = ", ".join(error.message for error in validation_errors[:3])
        if len(validation_errors) > 3:
            top_messages = f"{top_messages}, plus {len(validation_errors) - 3} more"
        return f"Mapped export validation failed: {top_messages}"

    def _content_hash(self, rows: list[AccountingMappedExportPreviewRow]) -> str:
        canonical = json.dumps(
            [row.model_dump(mode="json") for row in rows],
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def _to_csv(self, rows: list[AccountingMappedExportPreviewRow]) -> str:
        output = io.StringIO()
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(
            [
                "date",
                "reference",
                "description",
                "debit_account_code",
                "credit_account_code",
                "amount",
                "customer_account_code",
                "source_type",
            ]
        )
        for row in rows:
            writer.writerow(
                [
                    row.date,
                    row.reference,
                    row.description,
                    row.debit_account_code,
                    row.credit_account_code,
                    row.amount,
                    row.customer_account_code,
                    row.source_type,
                ]
            )
        return output.getvalue()

    def _normalize_code(self, value: str) -> str:
        collapsed = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
        if not collapsed:
            raise AppError(
                code="accounting_export_profile_code_invalid",
                message="Profile code must include at least one letter or number",
                status_code=400,
            )
        return collapsed

    def _decimal_string(self, value: Decimal) -> str:
        return f"{value.quantize(Decimal('0.01'))}"
