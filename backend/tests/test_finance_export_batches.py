from __future__ import annotations

import csv
import io
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    AccountCustomer,
    Club,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    FinanceAccount,
    FinanceTransactionSource,
    FinanceTransactionType,
    Person,
    User,
)
from app.models.finance.transaction import FinanceTransaction


def _create_user(db: Session, *, email: str, role: ClubMembershipRole, club: Club) -> User:
    local = email.split("@")[0]
    person = Person(
        first_name=local.title(),
        last_name="Export",
        full_name=build_full_name(local.title(), "Export"),
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        profile_metadata={},
    )
    db.add(person)
    db.flush()
    user = User(
        email=email,
        password_hash=hash_password("password123"),
        display_name=local,
        person_id=person.id,
    )
    db.add(user)
    db.flush()
    db.add(
        ClubMembership(
            person_id=person.id,
            club_id=club.id,
            role=role,
            status=ClubMembershipStatus.ACTIVE,
        )
    )
    db.commit()
    db.refresh(user)
    return user


def _create_club(db: Session, *, slug: str, timezone: str = "Africa/Johannesburg") -> Club:
    club = Club(name=f"Club {slug}", slug=slug, timezone=timezone)
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _create_finance_account(
    db: Session,
    *,
    club: Club,
    account_code: str,
) -> FinanceAccount:
    local = account_code.lower()
    person = Person(
        first_name=local.title(),
        last_name="Member",
        full_name=build_full_name(local.title(), "Member"),
        email=normalize_email(f"{local}_{uuid.uuid4().hex[:6]}@test.com"),
        normalized_email=normalize_email(f"{local}_{uuid.uuid4().hex[:6]}@test.com"),
        profile_metadata={},
    )
    db.add(person)
    db.flush()
    account_customer = AccountCustomer(
        club_id=club.id,
        person_id=person.id,
        account_code=account_code,
        active=True,
        billing_metadata={},
    )
    db.add(account_customer)
    db.flush()
    finance_account = FinanceAccount(
        club_id=club.id,
        account_customer_id=account_customer.id,
    )
    db.add(finance_account)
    db.commit()
    db.refresh(finance_account)
    return finance_account


def _post_transaction(
    db: Session,
    *,
    club: Club,
    account: FinanceAccount,
    amount: Decimal,
    tx_type: FinanceTransactionType,
    source: FinanceTransactionSource,
    description: str,
    created_at: datetime,
) -> FinanceTransaction:
    transaction = FinanceTransaction(
        club_id=club.id,
        account_id=account.id,
        amount=amount,
        type=tx_type,
        source=source,
        description=description,
        created_at=created_at,
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


def _auth_headers(client: TestClient, *, email: str, club_id: uuid.UUID) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return {
        "Authorization": f"Bearer {response.json()['access_token']}",
        "X-Club-Id": str(club_id),
    }


def test_generate_finance_export_batch_persists_summary_and_rows(
    client: TestClient,
    db_session: Session,
) -> None:
    club = _create_club(db_session, slug=f"feb-generate-{uuid.uuid4().hex[:6]}")
    admin = _create_user(
        db_session,
        email=f"feb_admin_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club,
    )
    account = _create_finance_account(db_session, club=club, account_code="EXP-001")
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("-120.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.ORDER,
        description="Halfway charge",
        created_at=datetime(2026, 4, 1, 8, 30, tzinfo=UTC),
    )
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("120.00"),
        tx_type=FinanceTransactionType.PAYMENT,
        source=FinanceTransactionSource.MANUAL,
        description="Manual settlement",
        created_at=datetime(2026, 4, 1, 10, 15, tzinfo=UTC),
    )

    headers = _auth_headers(client, email=admin.email, club_id=club.id)
    response = client.post(
        "/api/finance/export-batches",
        headers=headers,
        json={
            "export_profile": "journal_basic",
            "date_from": "2026-04-01",
            "date_to": "2026-04-01",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["created"] is True
    assert payload["batch"]["transaction_count"] == 2
    assert Decimal(payload["batch"]["total_debits"]) == Decimal("120.00")
    assert Decimal(payload["batch"]["total_credits"]) == Decimal("120.00")
    assert payload["batch"]["rows"][0]["description"] == "Halfway charge"
    assert payload["batch"]["rows"][0]["debit_amount"] == "120.00"
    assert payload["batch"]["rows"][1]["credit_amount"] == "120.00"
    assert payload["batch"]["metadata_json"]["selection_timezone"] == "Africa/Johannesburg"


def test_generate_finance_export_batch_is_idempotent_for_same_range(
    client: TestClient,
    db_session: Session,
) -> None:
    club = _create_club(db_session, slug=f"feb-idem-{uuid.uuid4().hex[:6]}")
    admin = _create_user(
        db_session,
        email=f"feb_idem_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club,
    )
    account = _create_finance_account(db_session, club=club, account_code="EXP-002")
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("-80.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.POS,
        description="POS charge",
        created_at=datetime(2026, 4, 2, 9, 0, tzinfo=UTC),
    )

    headers = _auth_headers(client, email=admin.email, club_id=club.id)
    request_body = {
        "export_profile": "journal_basic",
        "date_from": "2026-04-02",
        "date_to": "2026-04-02",
    }

    first = client.post("/api/finance/export-batches", headers=headers, json=request_body)
    second = client.post("/api/finance/export-batches", headers=headers, json=request_body)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["created"] is True
    assert second.json()["created"] is False
    assert first.json()["batch"]["id"] == second.json()["batch"]["id"]
    assert first.json()["batch"]["content_hash"] == second.json()["batch"]["content_hash"]


def test_finance_export_download_is_stable_from_persisted_payload(
    client: TestClient,
    db_session: Session,
) -> None:
    club = _create_club(db_session, slug=f"feb-download-{uuid.uuid4().hex[:6]}")
    admin = _create_user(
        db_session,
        email=f"feb_download_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club,
    )
    account = _create_finance_account(db_session, club=club, account_code="EXP-003")
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("-42.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.ORDER,
        description="Wrap charge",
        created_at=datetime(2026, 4, 3, 6, 0, tzinfo=UTC),
    )
    headers = _auth_headers(client, email=admin.email, club_id=club.id)
    create = client.post(
        "/api/finance/export-batches",
        headers=headers,
        json={
            "export_profile": "journal_basic",
            "date_from": "2026-04-03",
            "date_to": "2026-04-03",
        },
    )
    batch_id = create.json()["batch"]["id"]

    first_download = client.get(f"/api/finance/export-batches/{batch_id}/download", headers=headers)
    second_download = client.get(f"/api/finance/export-batches/{batch_id}/download", headers=headers)

    assert first_download.status_code == 200
    assert second_download.status_code == 200
    assert first_download.text == second_download.text
    assert "attachment; filename=" in first_download.headers["content-disposition"]

    parsed = list(csv.DictReader(io.StringIO(first_download.text)))
    assert parsed[0]["description"] == "Wrap charge"
    assert parsed[0]["debit_amount"] == "42.00"


def test_finance_export_selection_includes_order_and_pos_transactions(
    client: TestClient,
    db_session: Session,
) -> None:
    club = _create_club(db_session, slug=f"feb-sources-{uuid.uuid4().hex[:6]}")
    admin = _create_user(
        db_session,
        email=f"feb_sources_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club,
    )
    account = _create_finance_account(db_session, club=club, account_code="EXP-004")
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("-55.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.ORDER,
        description="Order charge",
        created_at=datetime(2026, 4, 4, 7, 0, tzinfo=UTC),
    )
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("-25.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.POS,
        description="POS account charge",
        created_at=datetime(2026, 4, 4, 7, 30, tzinfo=UTC),
    )

    headers = _auth_headers(client, email=admin.email, club_id=club.id)
    response = client.post(
        "/api/finance/export-batches",
        headers=headers,
        json={
            "export_profile": "journal_basic",
            "date_from": "2026-04-04",
            "date_to": "2026-04-04",
        },
    )

    assert response.status_code == 200
    sources = [row["source"] for row in response.json()["batch"]["rows"]]
    assert sources == ["order", "pos"]


def test_voided_finance_export_batch_allows_regeneration(
    client: TestClient,
    db_session: Session,
) -> None:
    club = _create_club(db_session, slug=f"feb-void-{uuid.uuid4().hex[:6]}")
    admin = _create_user(
        db_session,
        email=f"feb_void_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club,
    )
    account = _create_finance_account(db_session, club=club, account_code="EXP-005")
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("-65.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.MANUAL,
        description="Manual charge",
        created_at=datetime(2026, 4, 5, 8, 0, tzinfo=UTC),
    )
    headers = _auth_headers(client, email=admin.email, club_id=club.id)
    request_body = {
        "export_profile": "journal_basic",
        "date_from": "2026-04-05",
        "date_to": "2026-04-05",
    }

    created = client.post("/api/finance/export-batches", headers=headers, json=request_body)
    batch_id = created.json()["batch"]["id"]
    voided = client.post(f"/api/finance/export-batches/{batch_id}/void", headers=headers)
    regenerated = client.post("/api/finance/export-batches", headers=headers, json=request_body)

    assert voided.status_code == 200
    assert voided.json()["void_applied"] is True
    assert voided.json()["batch"]["status"] == "void"
    assert regenerated.status_code == 200
    assert regenerated.json()["created"] is True
    assert regenerated.json()["batch"]["id"] != batch_id


def test_finance_export_batch_detail_is_club_scoped(
    client: TestClient,
    db_session: Session,
) -> None:
    club_a = _create_club(db_session, slug=f"feb-scope-a-{uuid.uuid4().hex[:6]}")
    club_b = _create_club(db_session, slug=f"feb-scope-b-{uuid.uuid4().hex[:6]}")
    admin = _create_user(
        db_session,
        email=f"feb_scope_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club_a,
    )
    account_b = _create_finance_account(db_session, club=club_b, account_code="EXP-006")
    other_admin = _create_user(
        db_session,
        email=f"feb_scope_other_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club_b,
    )
    _post_transaction(
        db_session,
        club=club_b,
        account=account_b,
        amount=Decimal("-15.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.MANUAL,
        description="Other club charge",
        created_at=datetime(2026, 4, 6, 11, 0, tzinfo=UTC),
    )

    other_headers = _auth_headers(client, email=other_admin.email, club_id=club_b.id)
    create = client.post(
        "/api/finance/export-batches",
        headers=other_headers,
        json={
            "export_profile": "journal_basic",
            "date_from": "2026-04-06",
            "date_to": "2026-04-06",
        },
    )
    batch_id = create.json()["batch"]["id"]

    headers = _auth_headers(client, email=admin.email, club_id=club_a.id)
    detail = client.get(f"/api/finance/export-batches/{batch_id}", headers=headers)

    assert detail.status_code == 404
