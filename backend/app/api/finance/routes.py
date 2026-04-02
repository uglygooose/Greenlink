from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.routes.club_access import (
    get_requested_club_id,
    require_club_config_write,
    require_operations_read,
    require_operations_write,
    resolve_required_club_context,
)
from app.auth.dependencies import get_current_user, get_db
from app.core.exceptions import AuthorizationError
from app.models import User
from app.schemas.finance import (
    AccountingExportProfileListResponse,
    AccountingExportProfileResponse,
    AccountingExportProfileUpsertRequest,
    AccountingMappedExportPreviewResponse,
    FinanceAccountLedgerResponse,
    FinanceAccountSummaryResponse,
    FinanceClubJournalResponse,
    FinanceExportBatchCreateRequest,
    FinanceExportBatchCreateResult,
    FinanceExportBatchDetailResponse,
    FinanceExportBatchListResponse,
    FinanceTransactionCreateRequest,
    FinanceTransactionCreateResult,
    FinanceExportBatchVoidResult,
)
from app.services.finance.accounting_profile_mapping_service import AccountingProfileMappingService
from app.services.finance.export_batch_service import FinanceExportBatchService
from app.services.finance.ledger_service import LedgerService

router = APIRouter()


@router.post("/transactions", response_model=FinanceTransactionCreateResult)
def create_finance_transaction(
    payload: FinanceTransactionCreateRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> FinanceTransactionCreateResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = LedgerService(db)
    return service.create_transaction(club_id=context.selected_club.id, payload=payload)


@router.get("/accounts", response_model=list[FinanceAccountSummaryResponse])
def list_finance_accounts(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> list[FinanceAccountSummaryResponse]:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = LedgerService(db)
    return service.list_accounts(club_id=context.selected_club.id)


@router.get("/journal", response_model=FinanceClubJournalResponse)
def get_club_journal(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> FinanceClubJournalResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = LedgerService(db)
    return service.get_club_journal(club_id=context.selected_club.id)


@router.get("/accounts/{account_id}/ledger", response_model=FinanceAccountLedgerResponse)
def get_account_ledger(
    account_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> FinanceAccountLedgerResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = LedgerService(db)
    return service.get_account_ledger(club_id=context.selected_club.id, account_id=account_id)


@router.post("/export-batches", response_model=FinanceExportBatchCreateResult)
def create_finance_export_batch(
    payload: FinanceExportBatchCreateRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> FinanceExportBatchCreateResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    if current_user.person_id is None:
        raise AuthorizationError("Finance export generation requires a resolved person context")
    service = FinanceExportBatchService(db)
    return service.generate_or_get_existing(
        club_id=context.selected_club.id,
        created_by_person_id=current_user.person_id,
        payload=payload,
    )


@router.get("/export-batches", response_model=FinanceExportBatchListResponse)
def list_finance_export_batches(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> FinanceExportBatchListResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = FinanceExportBatchService(db)
    return service.list_batches(club_id=context.selected_club.id)


@router.get("/export-batches/{batch_id}", response_model=FinanceExportBatchDetailResponse)
def get_finance_export_batch(
    batch_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> FinanceExportBatchDetailResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = FinanceExportBatchService(db)
    return service.get_batch_detail(club_id=context.selected_club.id, batch_id=batch_id)


@router.get("/export-batches/{batch_id}/download")
def download_finance_export_batch(
    batch_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> Response:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = FinanceExportBatchService(db)
    result = service.build_download(club_id=context.selected_club.id, batch_id=batch_id)
    return Response(
        content=result.content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{result.file_name}"'},
    )


@router.get("/accounting-profiles", response_model=AccountingExportProfileListResponse)
def list_accounting_export_profiles(
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> AccountingExportProfileListResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = AccountingProfileMappingService(db)
    return service.list_profiles(club_id=context.selected_club.id)


@router.post("/accounting-profiles", response_model=AccountingExportProfileResponse)
def create_accounting_export_profile(
    payload: AccountingExportProfileUpsertRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> AccountingExportProfileResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_club_config_write(current_user, context)
    assert context.selected_club is not None
    if current_user.person_id is None:
        raise AuthorizationError("Accounting export profile creation requires a resolved person context")
    service = AccountingProfileMappingService(db)
    return service.create_profile(
        club_id=context.selected_club.id,
        created_by_person_id=current_user.person_id,
        payload=payload,
    )


@router.put("/accounting-profiles/{profile_id}", response_model=AccountingExportProfileResponse)
def update_accounting_export_profile(
    profile_id: uuid.UUID,
    payload: AccountingExportProfileUpsertRequest,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> AccountingExportProfileResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_club_config_write(current_user, context)
    assert context.selected_club is not None
    service = AccountingProfileMappingService(db)
    return service.update_profile(
        club_id=context.selected_club.id,
        profile_id=profile_id,
        payload=payload,
    )


@router.get("/export-batches/{batch_id}/mapped-export", response_model=AccountingMappedExportPreviewResponse)
def get_mapped_finance_export_preview(
    batch_id: uuid.UUID,
    profile_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> AccountingMappedExportPreviewResponse:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = AccountingProfileMappingService(db)
    return service.build_mapped_export_preview(
        club_id=context.selected_club.id,
        batch_id=batch_id,
        profile_id=profile_id,
    )


@router.get("/export-batches/{batch_id}/mapped-export/download")
def download_mapped_finance_export(
    batch_id: uuid.UUID,
    profile_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> Response:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_read(current_user, context)
    assert context.selected_club is not None
    service = AccountingProfileMappingService(db)
    result = service.build_mapped_export_download(
        club_id=context.selected_club.id,
        batch_id=batch_id,
        profile_id=profile_id,
    )
    return Response(
        content=result.content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{result.file_name}"'},
    )


@router.post("/export-batches/{batch_id}/void", response_model=FinanceExportBatchVoidResult)
def void_finance_export_batch(
    batch_id: uuid.UUID,
    raw_selected_club_id: uuid.UUID | None = Depends(get_requested_club_id),  # noqa: B008
    current_user: User = Depends(get_current_user),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
) -> FinanceExportBatchVoidResult:
    context = resolve_required_club_context(db, current_user, raw_selected_club_id)
    require_operations_write(current_user, context)
    assert context.selected_club is not None
    service = FinanceExportBatchService(db)
    return service.void_batch(club_id=context.selected_club.id, batch_id=batch_id)
