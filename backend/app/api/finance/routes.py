from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.routes.club_access import (
    get_requested_club_id,
    require_operations_read,
    require_operations_write,
    resolve_required_club_context,
)
from app.auth.dependencies import get_current_user, get_db
from app.models import User
from app.schemas.finance import (
    FinanceAccountLedgerResponse,
    FinanceAccountSummaryResponse,
    FinanceClubJournalResponse,
    FinanceTransactionCreateRequest,
    FinanceTransactionCreateResult,
)
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
