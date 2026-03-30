from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
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
    FinanceAccountStatus,
    FinanceTransaction,
    FinanceTransactionSource,
    FinanceTransactionType,
    Person,
    User,
)


def _create_user(db: Session, *, email: str) -> User:
    local_part = email.split("@")[0]
    person = Person(
        first_name=local_part.title(),
        last_name="User",
        full_name=build_full_name(local_part.title(), "User"),
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        profile_metadata={},
    )
    db.add(person)
    db.flush()
    user = User(
        email=email,
        password_hash=hash_password("password123"),
        display_name=local_part,
        person_id=person.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_person(db: Session, *, email: str) -> Person:
    local_part = email.split("@")[0]
    person = Person(
        first_name=local_part.title(),
        last_name="Customer",
        full_name=build_full_name(local_part.title(), "Customer"),
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        profile_metadata={},
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


def _create_club(db: Session, *, name: str, slug: str) -> Club:
    club = Club(name=name, slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _assign_membership(
    db: Session, *, user: User, club: Club, role: ClubMembershipRole
) -> ClubMembership:
    membership = ClubMembership(
        person_id=user.person_id,
        club_id=club.id,
        role=role,
        status=ClubMembershipStatus.ACTIVE,
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


def _auth_headers(client: TestClient, email: str, club_id: str) -> dict[str, str]:
    login = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}", "X-Club-Id": club_id}


def _create_finance_account(
    db: Session,
    *,
    club: Club,
    account_customer: AccountCustomer,
    status: FinanceAccountStatus = FinanceAccountStatus.ACTIVE,
) -> FinanceAccount:
    account = FinanceAccount(
        club_id=club.id,
        account_customer_id=account_customer.id,
        status=status,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _create_account_customer(
    db: Session,
    *,
    club: Club,
    person: Person,
    account_code: str,
) -> AccountCustomer:
    account_customer = AccountCustomer(
        club_id=club.id,
        person_id=person.id,
        account_code=account_code,
        active=True,
        billing_metadata={},
    )
    db.add(account_customer)
    db.commit()
    db.refresh(account_customer)
    return account_customer


def test_finance_transactions_create_and_ledger_is_derived(
    client: TestClient, db_session: Session
) -> None:
    admin = _create_user(db_session, email="finance-admin@example.com")
    customer_person = _create_person(db_session, email="finance-customer@example.com")
    club = _create_club(db_session, name="Finance Club", slug="finance-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    account_customer = _create_account_customer(
        db_session,
        club=club,
        person=customer_person,
        account_code="ACCT-001",
    )
    account = _create_finance_account(
        db_session,
        club=club,
        account_customer=account_customer,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    charge_reference_id = str(uuid.uuid4())

    charge = client.post(
        "/api/finance/transactions",
        headers=headers,
        json={
            "account_id": str(account.id),
            "amount": "-125.00",
            "type": "charge",
            "source": "booking",
            "reference_id": charge_reference_id,
            "description": "Booking charge",
        },
    )
    assert charge.status_code == 200
    charge_payload = charge.json()
    assert charge_payload["transaction"]["amount"] == "-125.00"
    assert charge_payload["transaction"]["type"] == "charge"
    assert charge_payload["transaction"]["source"] == "booking"
    assert charge_payload["transaction"]["reference_id"] == charge_reference_id
    assert charge_payload["balance"] == "-125.00"

    payment = client.post(
        "/api/finance/transactions",
        headers=headers,
        json={
            "account_id": str(account.id),
            "amount": "75.00",
            "type": "payment",
            "source": "manual",
            "reference_id": None,
            "description": "Front desk payment",
        },
    )
    assert payment.status_code == 200
    payment_payload = payment.json()
    assert payment_payload["transaction"]["amount"] == "75.00"
    assert payment_payload["balance"] == "-50.00"

    ledger = client.get(f"/api/finance/accounts/{account.id}/ledger", headers=headers)
    assert ledger.status_code == 200
    ledger_payload = ledger.json()
    assert ledger_payload["account_id"] == str(account.id)
    assert ledger_payload["account_customer_id"] == str(account_customer.id)
    assert ledger_payload["status"] == "active"
    assert ledger_payload["balance"] == "-50.00"
    assert [item["amount"] for item in ledger_payload["transactions"]] == ["-125.00", "75.00"]
    assert [item["running_balance"] for item in ledger_payload["transactions"]] == [
        "-125.00",
        "-50.00",
    ]


def test_finance_account_access_is_scoped_to_selected_club(
    client: TestClient, db_session: Session
) -> None:
    admin_a = _create_user(db_session, email="finance-a@example.com")
    admin_b = _create_user(db_session, email="finance-b@example.com")
    customer_person = _create_person(db_session, email="finance-tenant-customer@example.com")
    club_a = _create_club(db_session, name="Finance A", slug="finance-a")
    club_b = _create_club(db_session, name="Finance B", slug="finance-b")
    _assign_membership(db_session, user=admin_a, club=club_a, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=admin_b, club=club_b, role=ClubMembershipRole.CLUB_ADMIN)
    account_customer = _create_account_customer(
        db_session,
        club=club_a,
        person=customer_person,
        account_code="ACCT-A",
    )
    account = _create_finance_account(
        db_session,
        club=club_a,
        account_customer=account_customer,
    )

    headers = _auth_headers(client, admin_b.email, str(club_b.id))
    create_response = client.post(
        "/api/finance/transactions",
        headers=headers,
        json={
            "account_id": str(account.id),
            "amount": "25.00",
            "type": "adjustment",
            "source": "manual",
            "reference_id": None,
            "description": "Cross-club attempt",
        },
    )
    assert create_response.status_code == 404
    assert create_response.json()["message"] == "Finance account not found"

    ledger_response = client.get(f"/api/finance/accounts/{account.id}/ledger", headers=headers)
    assert ledger_response.status_code == 404
    assert ledger_response.json()["message"] == "Finance account not found"


def test_finance_transactions_are_immutable_and_accounts_are_unique(
    db_session: Session,
) -> None:
    customer_person = _create_person(db_session, email="immutable-customer@example.com")
    club = _create_club(db_session, name="Immutable Club", slug="immutable-club")
    account_customer = _create_account_customer(
        db_session,
        club=club,
        person=customer_person,
        account_code="ACCT-IMM",
    )
    account = _create_finance_account(
        db_session,
        club=club,
        account_customer=account_customer,
    )
    transaction = FinanceTransaction(
        club_id=club.id,
        account_id=account.id,
        amount=Decimal("-10.00"),
        type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.MANUAL,
        reference_id=None,
        description="Immutable charge",
    )
    db_session.add(transaction)
    db_session.commit()
    db_session.refresh(transaction)

    transaction.amount = Decimal("-12.00")
    with pytest.raises(ValueError, match="immutable"):
        db_session.commit()
    db_session.rollback()

    persisted = db_session.scalar(select(FinanceTransaction).where(FinanceTransaction.id == transaction.id))
    assert persisted is not None
    db_session.delete(persisted)
    with pytest.raises(ValueError, match="immutable"):
        db_session.commit()
    db_session.rollback()

    duplicate_account = FinanceAccount(
        club_id=club.id,
        account_customer_id=account_customer.id,
        status=FinanceAccountStatus.ACTIVE,
    )
    db_session.add(duplicate_account)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
