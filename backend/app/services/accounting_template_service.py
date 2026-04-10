from __future__ import annotations

import csv
import io
import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.operations_support import build_default_operating_hours
from app.core.exceptions import AppError, NotFoundError
from app.models import AccountingExportProfile, Club, ClubConfig
from app.schemas.finance import AccountingExportProfileUpsertRequest
from app.schemas.superadmin import (
    SuperadminAccountingProfileCreateRequest,
    SuperadminAccountingProfileListResponse,
    SuperadminAccountingProfileSummary,
    SuperadminAccountingSampleLayoutResponse,
    SuperadminAccountingTemplateColumnSample,
    SuperadminAccountingTemplateParseResponse,
)
from app.services.finance.accounting_profile_mapping_service import AccountingProfileMappingService

CANONICAL_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "date": ("date", "entry date", "transaction date", "posting date", "doc date"),
    "reference": ("reference", "ref", "document reference", "gl reference", "journal ref", "journal reference"),
    "description": ("description", "details", "narrative", "memo", "comment"),
    "debit_account_code": ("debit", "debit account", "debit account code", "dr account", "debit nominal"),
    "credit_account_code": ("credit", "credit account", "credit account code", "cr account", "credit nominal"),
    "customer_account_code": ("customer", "customer code", "customer account", "account code", "member account"),
    "amount": ("amount", "value", "gross amount", "transaction amount"),
    "source_type": ("source", "source type", "module", "origin"),
}

SAMPLE_LAYOUTS: dict[str, dict[str, object]] = {
    "generic_journal": {
        "headerless": False,
        "delimiter": ",",
        "headers": [
            "date",
            "reference",
            "description",
            "debit_account_code",
            "credit_account_code",
            "amount",
            "customer_account_code",
            "source_type",
        ],
        "rows": [
            ["2026-04-10", "GL-12345", "Charge Green fee", "1100-AR", "4000-SALES", "450.00", "MEM001", "booking"],
            ["2026-04-10", "GL-12346", "Payment Green fee", "1000-BANK", "1100-AR", "450.00", "MEM001", "manual"],
        ],
        "notes": [
            "Generic Journal uses explicit headers in GreenLink canonical order.",
            "Use this when your accounting package accepts standard column headers.",
        ],
    },
    "sage_like": {
        "headerless": False,
        "delimiter": ",",
        "headers": [
            "REFERENCE",
            "DATE",
            "DESCRIPTION",
            "DEBIT_ACCOUNT_CODE",
            "CREDIT_ACCOUNT_CODE",
            "CUSTOMER_ACCOUNT_CODE",
            "AMOUNT",
            "SOURCE_TYPE",
        ],
        "rows": [
            ["GL-12345", "2026-04-10", "CHARGE GREEN FEE", "1100-AR", "4000-SALES", "MEM001", "450.00", "BOOKING"],
            ["GL-12346", "2026-04-10", "PAYMENT GREEN FEE", "1000-BANK", "1100-AR", "MEM001", "450.00", "MANUAL"],
        ],
        "notes": [
            "Sage-like layouts are header-led and typically prefer uppercase account identifiers.",
            "Descriptions and references should stay within Sage field-length constraints.",
        ],
    },
    "pastel_like": {
        "headerless": True,
        "delimiter": ",",
        "headers": [],
        "rows": [
            ["2026-04-10", "GL-12345", "1100AR", "4000SAL", "450.00", "MEM001", "Charge Green fee", "booking"],
            ["2026-04-10", "GL-12346", "1000BNK", "1100AR", "450.00", "MEM001", "Payment Green fee", "manual"],
        ],
        "notes": [
            "Pastel-like layouts are usually headerless; column order is the contract.",
            "Keep account codes compact because Pastel-style files are field-length sensitive.",
        ],
    },
}


class AccountingTemplateService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.mapping_service = AccountingProfileMappingService(db)

    def list_profiles(
        self,
        *,
        club_id: uuid.UUID | None = None,
    ) -> SuperadminAccountingProfileListResponse:
        statement = (
            select(AccountingExportProfile, Club)
            .join(Club, Club.id == AccountingExportProfile.club_id)
            .order_by(Club.name.asc(), AccountingExportProfile.is_active.desc(), AccountingExportProfile.name.asc())
        )
        if club_id is not None:
            self._get_club(club_id)
            statement = statement.where(AccountingExportProfile.club_id == club_id)

        rows = self.db.execute(statement).all()
        profiles = [self._to_summary(profile=profile, club=club) for profile, club in rows]
        return SuperadminAccountingProfileListResponse(profiles=profiles, total_count=len(profiles))

    def create_profile(
        self,
        *,
        payload: SuperadminAccountingProfileCreateRequest,
        created_by_person_id: uuid.UUID,
    ) -> SuperadminAccountingProfileSummary:
        club = self._get_club(payload.club_id)
        profile = self.mapping_service.create_profile(
            club_id=club.id,
            created_by_person_id=created_by_person_id,
            payload=AccountingExportProfileUpsertRequest(
                code=payload.code,
                name=payload.name,
                target_system=payload.target_system,
                is_active=payload.is_active,
                mapping_config=payload.mapping_config,
            ),
        )
        return SuperadminAccountingProfileSummary(
            id=profile.id,
            club_id=profile.club_id,
            club_name=club.name,
            club_slug=club.slug,
            code=profile.code,
            name=profile.name,
            target_system=profile.target_system,
            is_active=profile.is_active,
            mapping_config=profile.mapping_config,
            created_by_person_id=profile.created_by_person_id,
            created_at=profile.created_at,
            updated_at=profile.updated_at,
        )

    def set_profile_active_status(
        self,
        *,
        profile_id: uuid.UUID,
        is_active: bool,
    ) -> SuperadminAccountingProfileSummary:
        profile = self.db.get(AccountingExportProfile, profile_id)
        if profile is None:
            raise NotFoundError("Accounting export profile not found")
        club = self._get_club(profile.club_id)

        if is_active:
            self._deactivate_other_profiles(club_id=profile.club_id, excluded_profile_id=profile.id)
        else:
            config = self.db.scalar(select(ClubConfig).where(ClubConfig.club_id == profile.club_id))
            if config is not None and config.preferred_accounting_profile_id == profile.id:
                config.preferred_accounting_profile_id = None
                self.db.add(config)

        profile.is_active = is_active
        self.db.add(profile)
        self.db.commit()
        self.db.refresh(profile)
        return self._to_summary(profile=profile, club=club)

    def bind_profile(self, *, club_id: uuid.UUID, profile_id: uuid.UUID) -> None:
        club = self._get_club(club_id)
        profile = self.db.scalar(
            select(AccountingExportProfile).where(
                AccountingExportProfile.club_id == club.id,
                AccountingExportProfile.id == profile_id,
            )
        )
        if profile is None:
            raise NotFoundError("Accounting export profile not found")

        config = self.db.scalar(select(ClubConfig).where(ClubConfig.club_id == club.id))
        if config is None:
            config = ClubConfig(
                club_id=club.id,
                timezone=club.timezone,
                operating_hours=build_default_operating_hours(),
                booking_window_days=14,
                cancellation_policy_hours=24,
                default_slot_interval_minutes=10,
                preferred_accounting_profile_id=profile.id,
            )
        else:
            config.preferred_accounting_profile_id = profile.id

        self._deactivate_other_profiles(club_id=club.id, excluded_profile_id=profile.id)
        profile.is_active = True
        self.db.add(profile)
        self.db.add(config)
        self.db.commit()

    def parse_csv_template(self, *, file_bytes: bytes, file_name: str) -> SuperadminAccountingTemplateParseResponse:
        text = self._decode_bytes(file_bytes)
        rows = [row for row in csv.reader(io.StringIO(text)) if any(cell.strip() for cell in row)]
        if not rows:
            raise AppError(
                code="accounting_template_empty",
                message="Template CSV is empty",
                status_code=400,
            )

        first_row = rows[0]
        headerless = self._looks_like_data_row(first_row)
        headers = (
            [self._column_label(index) for index in range(len(first_row))]
            if headerless
            else [cell.strip() or self._column_label(index) for index, cell in enumerate(first_row)]
        )
        data_rows = rows[:3] if headerless else rows[1:4]
        suggested_target_system = self._suggest_target_system(raw_headers=first_row, headerless=headerless)
        suggested_mapping = self._suggest_mapping(
            headers=headers,
            raw_headers=first_row,
            suggested_target_system=suggested_target_system,
            headerless=headerless,
        )
        warnings = self._build_template_warnings(
            headerless=headerless,
            suggested_target_system=suggested_target_system,
            suggested_mapping=suggested_mapping,
        )

        return SuperadminAccountingTemplateParseResponse(
            file_name=file_name,
            headers_detected=headers,
            headerless=headerless,
            suggested_target_system=suggested_target_system,
            suggested_mapping=suggested_mapping,
            sample_rows=[SuperadminAccountingTemplateColumnSample(values=row) for row in data_rows],
            warnings=warnings,
        )

    def get_sample_layout(self, *, target_system: str) -> SuperadminAccountingSampleLayoutResponse:
        layout = SAMPLE_LAYOUTS.get(target_system)
        if layout is None:
            raise AppError(
                code="accounting_template_target_system_invalid",
                message="Target system must be one of generic_journal, pastel_like, or sage_like",
                status_code=400,
            )

        sample_csv = self._render_sample_csv(
            headers=layout["headers"],
            rows=layout["rows"],
            headerless=bool(layout["headerless"]),
            delimiter=str(layout["delimiter"]),
        )
        return SuperadminAccountingSampleLayoutResponse(
            target_system=target_system,
            file_name=f"greenlink-{target_system}-sample.csv",
            headerless=bool(layout["headerless"]),
            delimiter=str(layout["delimiter"]),
            headers=list(layout["headers"]),
            sample_csv=sample_csv,
            notes=list(layout["notes"]),
        )

    def _suggest_target_system(self, *, raw_headers: list[str], headerless: bool) -> str:
        if headerless:
            return "pastel_like"
        normalized_headers = [self._normalize_header(header) for header in raw_headers]
        if all(header == header.upper() for header in raw_headers if header.strip()):
            return "sage_like"
        if any("journal" in header or "nominal" in header for header in normalized_headers):
            return "sage_like"
        return "generic_journal"

    def _suggest_mapping(
        self,
        *,
        headers: list[str],
        raw_headers: list[str],
        suggested_target_system: str,
        headerless: bool,
    ) -> dict[str, str]:
        if headerless:
            if suggested_target_system == "pastel_like":
                ordered_fields = [
                    "date",
                    "reference",
                    "debit_account_code",
                    "credit_account_code",
                    "amount",
                    "customer_account_code",
                    "description",
                    "source_type",
                ]
                return {
                    field: headers[index]
                    for index, field in enumerate(ordered_fields)
                    if index < len(headers)
                }
            return {}

        suggestions: dict[str, str] = {}
        normalized_headers = {header: self._normalize_header(header) for header in raw_headers}
        for canonical_field, aliases in CANONICAL_FIELD_ALIASES.items():
            matched_header = next(
                (
                    header
                    for header, normalized in normalized_headers.items()
                    if normalized == canonical_field
                    or normalized in aliases
                    or any(alias in normalized for alias in aliases)
                ),
                None,
            )
            if matched_header is not None:
                suggestions[canonical_field] = matched_header.strip()
        return suggestions

    def _build_template_warnings(
        self,
        *,
        headerless: bool,
        suggested_target_system: str,
        suggested_mapping: dict[str, str],
    ) -> list[str]:
        warnings: list[str] = []
        if headerless:
            warnings.append("Headerless layout detected. This is treated as a Pastel-like sample and the column order becomes the contract.")
        if suggested_target_system == "sage_like":
            warnings.append("Sage-like layout detected. Keep account codes uppercase and watch reference/description length limits.")
        required_fields = {"date", "reference", "description", "debit_account_code", "credit_account_code", "amount"}
        missing = sorted(required_fields - set(suggested_mapping))
        if missing:
            warnings.append(f"Could not confidently match: {', '.join(missing)}.")
        return warnings

    def _decode_bytes(self, payload: bytes) -> str:
        for encoding in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                return payload.decode(encoding)
            except UnicodeDecodeError:
                continue
        raise AppError(
            code="accounting_template_decode_failed",
            message="Template CSV could not be decoded as text",
            status_code=400,
        )

    def _looks_like_data_row(self, row: list[str]) -> bool:
        populated = [cell.strip() for cell in row if cell.strip()]
        if not populated:
            return False
        alpha_cells = sum(bool(re.search(r"[A-Za-z]", cell)) for cell in populated)
        numeric_cells = sum(bool(re.fullmatch(r"[-+]?\d[\d,]*(\.\d+)?", cell)) for cell in populated)
        date_cells = sum(bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", cell)) for cell in populated)
        return date_cells > 0 or numeric_cells >= max(1, len(populated) // 2) or alpha_cells < len(populated) // 2

    def _normalize_header(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", value.strip().lower()).strip()

    def _column_label(self, index: int) -> str:
        quotient = index
        label = ""
        while True:
            quotient, remainder = divmod(quotient, 26)
            label = chr(65 + remainder) + label
            if quotient == 0:
                return f"Column {label}"
            quotient -= 1

    def _render_sample_csv(
        self,
        *,
        headers: object,
        rows: object,
        headerless: bool,
        delimiter: str,
    ) -> str:
        output = io.StringIO()
        writer = csv.writer(output, lineterminator="\n", delimiter=delimiter)
        if not headerless:
            writer.writerow(list(headers))
        for row in rows:
            writer.writerow(list(row))
        return output.getvalue()

    def _deactivate_other_profiles(
        self,
        *,
        club_id: uuid.UUID,
        excluded_profile_id: uuid.UUID,
    ) -> None:
        profiles = self.db.scalars(
            select(AccountingExportProfile).where(AccountingExportProfile.club_id == club_id)
        ).all()
        for profile in profiles:
            if profile.id == excluded_profile_id:
                continue
            profile.is_active = False
            self.db.add(profile)

    def _get_club(self, club_id: uuid.UUID) -> Club:
        club = self.db.get(Club, club_id)
        if club is None:
            raise NotFoundError("Club not found")
        return club

    def _to_summary(
        self,
        *,
        profile: AccountingExportProfile,
        club: Club,
    ) -> SuperadminAccountingProfileSummary:
        profile_response = self.mapping_service._to_profile_response(profile)
        return SuperadminAccountingProfileSummary(
            id=profile_response.id,
            club_id=profile_response.club_id,
            club_name=club.name,
            club_slug=club.slug,
            code=profile_response.code,
            name=profile_response.name,
            target_system=profile_response.target_system,
            is_active=profile_response.is_active,
            mapping_config=profile_response.mapping_config,
            created_by_person_id=profile_response.created_by_person_id,
            created_at=profile_response.created_at,
            updated_at=profile_response.updated_at,
        )
