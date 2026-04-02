from __future__ import annotations

import csv
import io
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import ClubMembershipRole, FinanceTransactionSource, FinanceTransactionType
from app.models import AccountCustomer, Club, ClubMembership, ClubMembershipStatus, FinanceAccount, Person, User
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
    user = User(email=email, password_hash=hash_password("password123"), display_name=local, person_id=person.id)
    db.add(user)
    db.flush()
    db.add(ClubMembership(person_id=person.id, club_id=club.id, role=role, status=ClubMembershipStatus.ACTIVE))
    db.commit()
    db.refresh(user)
    return user


def _create_club(db: Session, *, slug: str, timezone: str = "Africa/Johannesburg") -> Club:
    club = Club(name=f"Club {slug}", slug=slug, timezone=timezone)
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _create_finance_account(db: Session, *, club: Club, account_code: str) -> FinanceAccount:
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
    finance_account = FinanceAccount(club_id=club.id, account_customer_id=account_customer.id)
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
    return {"Authorization": f"Bearer {response.json()['access_token']}", "X-Club-Id": str(club_id)}


def _profile_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "code": "generic_journal_ops",
        "name": "Generic Journal Ops",
        "target_system": "generic_journal",
        "is_active": True,
        "mapping_config": {
            "reference_prefix": "GL",
            "fallback_customer_code": "UNASSIGNED",
            "transaction_mappings": {
                "charge": {
                    "debit_account_code": "1100-AR",
                    "credit_account_code": "4000-SALES",
                    "description_prefix": "Charge",
                },
                "payment": {
                    "debit_account_code": "1000-BANK",
                    "credit_account_code": "1100-AR",
                    "description_prefix": "Payment",
                },
                "adjustment": {
                    "debit_account_code": "9990-ADJUST",
                    "credit_account_code": "9990-ADJUST",
                    "description_prefix": "Adjust",
                },
            },
        },
    }
    payload.update(overrides)
    return payload


def _create_canonical_batch(client, headers: dict[str, str]) -> dict[str, object]:
    response = client.post(
        "/api/finance/export-batches",
        headers=headers,
        json={
            "export_profile": "journal_basic",
            "date_from": "2026-04-08",
            "date_to": "2026-04-08",
        },
    )
    assert response.status_code == 200
    return response.json()["batch"]


def test_accounting_export_profile_create_and_list(client, db_session: Session) -> None:
    club = _create_club(db_session, slug=f"aep-list-{uuid.uuid4().hex[:6]}")
    admin = _create_user(
        db_session,
        email=f"aep_list_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club,
    )
    headers = _auth_headers(client, email=admin.email, club_id=club.id)

    created = client.post("/api/finance/accounting-profiles", headers=headers, json=_profile_payload())
    listed = client.get("/api/finance/accounting-profiles", headers=headers)

    assert created.status_code == 200
    assert created.json()["code"] == "generic_journal_ops"
    assert created.json()["target_system"] == "generic_journal"
    assert listed.status_code == 200
    assert listed.json()["total_count"] == 1
    assert listed.json()["profiles"][0]["mapping_config"]["transaction_mappings"]["charge"]["debit_account_code"] == "1100-AR"


def test_mapped_export_preview_and_download_are_deterministic(client, db_session: Session) -> None:
    club = _create_club(db_session, slug=f"aep-map-{uuid.uuid4().hex[:6]}")
    admin = _create_user(
        db_session,
        email=f"aep_map_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club,
    )
    account = _create_finance_account(db_session, club=club, account_code="MAP-001")
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("-90.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.ORDER,
        description="Halfway charge",
        created_at=datetime(2026, 4, 8, 8, 0, tzinfo=UTC),
    )
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("90.00"),
        tx_type=FinanceTransactionType.PAYMENT,
        source=FinanceTransactionSource.MANUAL,
        description="Member payment",
        created_at=datetime(2026, 4, 8, 10, 0, tzinfo=UTC),
    )

    headers = _auth_headers(client, email=admin.email, club_id=club.id)
    profile = client.post("/api/finance/accounting-profiles", headers=headers, json=_profile_payload()).json()
    batch = _create_canonical_batch(client, headers=headers)

    preview_first = client.get(
        f"/api/finance/export-batches/{batch['id']}/mapped-export",
        headers=headers,
        params={"profile_id": profile["id"]},
    )
    preview_second = client.get(
        f"/api/finance/export-batches/{batch['id']}/mapped-export",
        headers=headers,
        params={"profile_id": profile["id"]},
    )
    download = client.get(
        f"/api/finance/export-batches/{batch['id']}/mapped-export/download",
        headers=headers,
        params={"profile_id": profile["id"]},
    )

    assert preview_first.status_code == 200
    assert preview_second.status_code == 200
    assert preview_first.json()["content_hash"] == preview_second.json()["content_hash"]
    assert preview_first.json()["row_count"] == 2
    assert preview_first.json()["rows"][0]["debit_account_code"] == "1100-AR"
    assert preview_first.json()["rows"][0]["credit_account_code"] == "4000-SALES"
    assert preview_first.json()["rows"][0]["reference"].startswith("GL-")
    assert preview_first.json()["rows"][1]["debit_account_code"] == "1000-BANK"
    assert download.status_code == 200
    parsed = list(csv.DictReader(io.StringIO(download.text)))
    assert parsed[0]["description"] == "Charge Halfway charge"
    assert parsed[1]["credit_account_code"] == "1100-AR"


def test_updating_profile_changes_future_mapped_output(client, db_session: Session) -> None:
    club = _create_club(db_session, slug=f"aep-update-{uuid.uuid4().hex[:6]}")
    admin = _create_user(
        db_session,
        email=f"aep_update_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club,
    )
    account = _create_finance_account(db_session, club=club, account_code="MAP-002")
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("-35.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.MANUAL,
        description="Locker charge",
        created_at=datetime(2026, 4, 8, 12, 0, tzinfo=UTC),
    )

    headers = _auth_headers(client, email=admin.email, club_id=club.id)
    created_profile = client.post("/api/finance/accounting-profiles", headers=headers, json=_profile_payload()).json()
    batch = _create_canonical_batch(client, headers=headers)

    updated_payload = _profile_payload()
    updated_payload["mapping_config"]["transaction_mappings"]["charge"]["debit_account_code"] = "1150-AR-CLUB"
    updated = client.put(
        f"/api/finance/accounting-profiles/{created_profile['id']}",
        headers=headers,
        json=updated_payload,
    )
    preview = client.get(
        f"/api/finance/export-batches/{batch['id']}/mapped-export",
        headers=headers,
        params={"profile_id": created_profile["id"]},
    )

    assert updated.status_code == 200
    assert preview.status_code == 200
    assert preview.json()["rows"][0]["debit_account_code"] == "1150-AR-CLUB"


def test_accounting_export_profile_is_club_scoped(client, db_session: Session) -> None:
    club_a = _create_club(db_session, slug=f"aep-scope-a-{uuid.uuid4().hex[:6]}")
    club_b = _create_club(db_session, slug=f"aep-scope-b-{uuid.uuid4().hex[:6]}")
    admin_a = _create_user(
        db_session,
        email=f"aep_scope_a_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club_a,
    )
    admin_b = _create_user(
        db_session,
        email=f"aep_scope_b_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club_b,
    )
    account_b = _create_finance_account(db_session, club=club_b, account_code="MAP-003")
    _post_transaction(
        db_session,
        club=club_b,
        account=account_b,
        amount=Decimal("-12.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.MANUAL,
        description="Other club charge",
        created_at=datetime(2026, 4, 8, 13, 0, tzinfo=UTC),
    )

    headers_b = _auth_headers(client, email=admin_b.email, club_id=club_b.id)
    profile_b = client.post("/api/finance/accounting-profiles", headers=headers_b, json=_profile_payload()).json()
    batch_b = _create_canonical_batch(client, headers=headers_b)

    headers_a = _auth_headers(client, email=admin_a.email, club_id=club_a.id)
    preview = client.get(
        f"/api/finance/export-batches/{batch_b['id']}/mapped-export",
        headers=headers_a,
        params={"profile_id": profile_b["id"]},
    )

    assert preview.status_code == 404
