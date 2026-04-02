from __future__ import annotations

import uuid
from datetime import UTC, datetime
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
    FinanceAccountStatus,
    FinanceTransactionSource,
    FinanceTransactionType,
    Person,
    User,
)
from app.models.finance.transaction import FinanceTransaction


def _create_club(db: Session, *, slug: str) -> Club:
    club = Club(name=f"Club {slug}", slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _create_user(db: Session, *, email: str, role: ClubMembershipRole, club: Club) -> User:
    local = email.split("@")[0]
    person = Person(
        first_name=local.title(),
        last_name="Finance",
        full_name=build_full_name(local.title(), "Finance"),
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


def _create_finance_account(
    db: Session,
    *,
    club: Club,
    account_code: str,
    status: FinanceAccountStatus = FinanceAccountStatus.ACTIVE,
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
    account = FinanceAccount(
        club_id=club.id,
        account_customer_id=account_customer.id,
        status=status,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


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
    reference_id: uuid.UUID | None = None,
) -> FinanceTransaction:
    tx = FinanceTransaction(
        club_id=club.id,
        account_id=account.id,
        amount=amount,
        type=tx_type,
        source=source,
        description=description,
        created_at=created_at,
        reference_id=reference_id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def _auth_headers(client: TestClient, *, email: str, club_id: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}", "X-Club-Id": club_id}


def test_finance_revenue_and_transaction_volume_summaries_are_derived_from_append_only_history(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"fin-rm-{uuid.uuid4().hex[:6]}")
    admin = _create_user(
        db_session,
        email=f"fin_rm_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club,
    )
    account = _create_finance_account(db_session, club=club, account_code="RM-001")
    order_reference = uuid.uuid4()

    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("-100.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.POS,
        description="POS charge today",
        created_at=datetime(2026, 4, 10, 7, 0, tzinfo=UTC),
    )
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("-30.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.ORDER,
        description="Order charge this week",
        created_at=datetime(2026, 4, 8, 7, 0, tzinfo=UTC),
        reference_id=order_reference,
    )
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("10.00"),
        tx_type=FinanceTransactionType.PAYMENT,
        source=FinanceTransactionSource.ORDER,
        description="Order payment this week",
        created_at=datetime(2026, 4, 10, 9, 0, tzinfo=UTC),
        reference_id=order_reference,
    )
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("5.00"),
        tx_type=FinanceTransactionType.ADJUSTMENT,
        source=FinanceTransactionSource.MANUAL,
        description="Manual adjustment this month",
        created_at=datetime(2026, 4, 3, 7, 0, tzinfo=UTC),
    )
    _post_transaction(
        db_session,
        club=club,
        account=account,
        amount=Decimal("-200.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.BOOKING,
        description="Prior month booking charge",
        created_at=datetime(2026, 3, 20, 7, 0, tzinfo=UTC),
    )

    headers = _auth_headers(client, email=admin.email, club_id=str(club.id))

    revenue_response = client.get(
        "/api/finance/summaries/revenue",
        headers=headers,
        params={"reference_datetime": "2026-04-10T10:00:00+02:00"},
    )
    assert revenue_response.status_code == 200
    revenue = revenue_response.json()
    assert revenue["day"]["total_revenue"] == "100.00"
    assert revenue["day"]["operational_revenue"] == "100.00"
    assert revenue["day"]["charge_count"] == 1
    assert revenue["week"]["total_revenue"] == "130.00"
    assert revenue["week"]["operational_revenue"] == "130.00"
    assert revenue["week"]["by_source"] == [
        {"source": "pos", "total_revenue": "100.00", "charge_count": 1},
        {"source": "order", "total_revenue": "30.00", "charge_count": 1},
    ]
    assert revenue["month"]["total_revenue"] == "130.00"

    volume_response = client.get(
        "/api/finance/summaries/transaction-volume",
        headers=headers,
        params={"reference_datetime": "2026-04-10T10:00:00+02:00"},
    )
    assert volume_response.status_code == 200
    volume = volume_response.json()
    assert volume["day"]["total_transaction_count"] == 2
    assert volume["week"]["total_transaction_count"] == 3
    assert volume["month"]["total_transaction_count"] == 4
    assert volume["month"]["by_type"] == [
        {"type": "charge", "transaction_count": 2, "total_absolute_amount": "130.00"},
        {"type": "adjustment", "transaction_count": 1, "total_absolute_amount": "5.00"},
        {"type": "payment", "transaction_count": 1, "total_absolute_amount": "10.00"},
    ]


def test_finance_outstanding_summary_returns_balances_and_unpaid_order_postings(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"fin-out-{uuid.uuid4().hex[:6]}")
    admin = _create_user(
        db_session,
        email=f"fin_out_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club,
    )
    arrears_account = _create_finance_account(db_session, club=club, account_code="OUT-001")
    settled_account = _create_finance_account(db_session, club=club, account_code="OUT-002")
    credit_account = _create_finance_account(db_session, club=club, account_code="OUT-003")

    unpaid_order_reference = uuid.uuid4()
    settled_order_reference = uuid.uuid4()

    _post_transaction(
        db_session,
        club=club,
        account=arrears_account,
        amount=Decimal("-80.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.BOOKING,
        description="Booking charge",
        created_at=datetime(2026, 4, 10, 6, 0, tzinfo=UTC),
    )
    _post_transaction(
        db_session,
        club=club,
        account=arrears_account,
        amount=Decimal("-50.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.ORDER,
        description="Order charge outstanding",
        created_at=datetime(2026, 4, 10, 7, 0, tzinfo=UTC),
        reference_id=unpaid_order_reference,
    )
    _post_transaction(
        db_session,
        club=club,
        account=arrears_account,
        amount=Decimal("20.00"),
        tx_type=FinanceTransactionType.PAYMENT,
        source=FinanceTransactionSource.ORDER,
        description="Partial order payment",
        created_at=datetime(2026, 4, 10, 8, 0, tzinfo=UTC),
        reference_id=unpaid_order_reference,
    )
    _post_transaction(
        db_session,
        club=club,
        account=settled_account,
        amount=Decimal("-25.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.ORDER,
        description="Settled order charge",
        created_at=datetime(2026, 4, 9, 7, 0, tzinfo=UTC),
        reference_id=settled_order_reference,
    )
    _post_transaction(
        db_session,
        club=club,
        account=settled_account,
        amount=Decimal("25.00"),
        tx_type=FinanceTransactionType.PAYMENT,
        source=FinanceTransactionSource.ORDER,
        description="Settled order payment",
        created_at=datetime(2026, 4, 9, 8, 0, tzinfo=UTC),
        reference_id=settled_order_reference,
    )
    _post_transaction(
        db_session,
        club=club,
        account=credit_account,
        amount=Decimal("15.00"),
        tx_type=FinanceTransactionType.PAYMENT,
        source=FinanceTransactionSource.MANUAL,
        description="Account credit",
        created_at=datetime(2026, 4, 9, 9, 0, tzinfo=UTC),
    )

    headers = _auth_headers(client, email=admin.email, club_id=str(club.id))
    response = client.get("/api/finance/summaries/outstanding", headers=headers)
    assert response.status_code == 200
    payload = response.json()

    assert payload == {
        "total_accounts": 3,
        "accounts_in_arrears": 1,
        "accounts_in_credit": 1,
        "accounts_settled": 1,
        "total_outstanding_amount": "110.00",
        "unpaid_order_postings_count": 1,
        "unpaid_order_postings_amount": "30.00",
        "pending_items_count": 3,
    }
