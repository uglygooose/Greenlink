from __future__ import annotations

import uuid
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_user(db: Session, *, email: str, role: ClubMembershipRole, club: Club) -> User:
    local = email.split("@")[0]
    person = Person(
        first_name=local.title(),
        last_name="Test",
        full_name=build_full_name(local.title(), "Test"),
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
    membership = ClubMembership(
        person_id=person.id,
        club_id=club.id,
        role=role,
        status=ClubMembershipStatus.ACTIVE,
    )
    db.add(membership)
    db.commit()
    db.refresh(user)
    return user


def _create_club(db: Session, *, slug: str) -> Club:
    club = Club(name=f"Club {slug}", slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _create_finance_account(
    db: Session,
    *,
    club: Club,
    account_code: str,
    status: FinanceAccountStatus = FinanceAccountStatus.ACTIVE,
) -> tuple[AccountCustomer, FinanceAccount]:
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
    ac = AccountCustomer(
        club_id=club.id,
        person_id=person.id,
        account_code=account_code,
        active=True,
        billing_metadata={},
    )
    db.add(ac)
    db.flush()
    fa = FinanceAccount(club_id=club.id, account_customer_id=ac.id, status=status)
    db.add(fa)
    db.commit()
    db.refresh(fa)
    return ac, fa


def _post_transaction(
    db: Session,
    *,
    club: Club,
    account: FinanceAccount,
    amount: Decimal,
    tx_type: FinanceTransactionType,
    source: FinanceTransactionSource,
    description: str,
) -> FinanceTransaction:
    tx = FinanceTransaction(
        club_id=club.id,
        account_id=account.id,
        amount=amount,
        type=tx_type,
        source=source,
        description=description,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def _auth_headers(client: TestClient, *, email: str) -> dict:
    resp = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ---------------------------------------------------------------------------
# GET /api/finance/accounts
# ---------------------------------------------------------------------------


def test_list_finance_accounts_returns_club_accounts(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"fa-list-{uuid.uuid4().hex[:6]}")
    admin = _create_user(db_session, email=f"fa_admin_{uuid.uuid4().hex[:6]}@test.com", role=ClubMembershipRole.CLUB_ADMIN, club=club)
    _create_finance_account(db_session, club=club, account_code="ACC001")
    _create_finance_account(db_session, club=club, account_code="ACC002")

    headers = _auth_headers(client, email=admin.email)
    headers["X-Club-Id"] = str(club.id)

    resp = client.get("/api/finance/accounts", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    codes = {a["account_customer"]["account_code"] for a in data}
    assert codes == {"ACC001", "ACC002"}


def test_list_finance_accounts_includes_balance(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"fa-bal-{uuid.uuid4().hex[:6]}")
    admin = _create_user(db_session, email=f"fa_bal_{uuid.uuid4().hex[:6]}@test.com", role=ClubMembershipRole.CLUB_ADMIN, club=club)
    _, fa = _create_finance_account(db_session, club=club, account_code="BALTEST")
    _post_transaction(
        db_session, club=club, account=fa,
        amount=Decimal("-100.00"),
        tx_type=FinanceTransactionType.CHARGE,
        source=FinanceTransactionSource.BOOKING,
        description="Green fee charge",
    )
    _post_transaction(
        db_session, club=club, account=fa,
        amount=Decimal("60.00"),
        tx_type=FinanceTransactionType.PAYMENT,
        source=FinanceTransactionSource.POS,
        description="Part payment",
    )

    headers = _auth_headers(client, email=admin.email)
    headers["X-Club-Id"] = str(club.id)

    resp = client.get("/api/finance/accounts", headers=headers)
    assert resp.status_code == 200
    account = resp.json()[0]
    assert Decimal(account["balance"]) == Decimal("-40.00")
    assert account["transaction_count"] == 2


def test_list_finance_accounts_is_club_scoped(
    client: TestClient, db_session: Session
) -> None:
    club_a = _create_club(db_session, slug=f"fa-scope-a-{uuid.uuid4().hex[:6]}")
    club_b = _create_club(db_session, slug=f"fa-scope-b-{uuid.uuid4().hex[:6]}")
    admin = _create_user(db_session, email=f"fa_scope_{uuid.uuid4().hex[:6]}@test.com", role=ClubMembershipRole.CLUB_ADMIN, club=club_a)
    _create_finance_account(db_session, club=club_a, account_code="A-001")
    _create_finance_account(db_session, club=club_b, account_code="B-001")

    headers = _auth_headers(client, email=admin.email)
    headers["X-Club-Id"] = str(club_a.id)

    resp = client.get("/api/finance/accounts", headers=headers)
    assert resp.status_code == 200
    codes = [a["account_customer"]["account_code"] for a in resp.json()]
    assert codes == ["A-001"]


def test_list_finance_accounts_requires_staff(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"fa-auth-{uuid.uuid4().hex[:6]}")
    member = _create_user(db_session, email=f"fa_mem_{uuid.uuid4().hex[:6]}@test.com", role=ClubMembershipRole.MEMBER, club=club)

    headers = _auth_headers(client, email=member.email)
    headers["X-Club-Id"] = str(club.id)

    resp = client.get("/api/finance/accounts", headers=headers)
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/finance/journal
# ---------------------------------------------------------------------------


def test_get_club_journal_returns_all_transactions(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"jnl-{uuid.uuid4().hex[:6]}")
    admin = _create_user(db_session, email=f"jnl_{uuid.uuid4().hex[:6]}@test.com", role=ClubMembershipRole.CLUB_ADMIN, club=club)
    _, fa1 = _create_finance_account(db_session, club=club, account_code="JNL-A")
    _, fa2 = _create_finance_account(db_session, club=club, account_code="JNL-B")

    _post_transaction(db_session, club=club, account=fa1, amount=Decimal("-75.00"),
                      tx_type=FinanceTransactionType.CHARGE, source=FinanceTransactionSource.BOOKING,
                      description="Green fee A")
    _post_transaction(db_session, club=club, account=fa2, amount=Decimal("-35.00"),
                      tx_type=FinanceTransactionType.CHARGE, source=FinanceTransactionSource.ORDER,
                      description="Food order B")

    headers = _auth_headers(client, email=admin.email)
    headers["X-Club-Id"] = str(club.id)

    resp = client.get("/api/finance/journal", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_count"] == 2
    assert len(data["entries"]) == 2


def test_get_club_journal_ordered_newest_first(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"jnl-ord-{uuid.uuid4().hex[:6]}")
    admin = _create_user(db_session, email=f"jnl_ord_{uuid.uuid4().hex[:6]}@test.com", role=ClubMembershipRole.CLUB_ADMIN, club=club)
    _, fa = _create_finance_account(db_session, club=club, account_code="ORD-001")

    _post_transaction(db_session, club=club, account=fa, amount=Decimal("-10.00"),
                      tx_type=FinanceTransactionType.CHARGE, source=FinanceTransactionSource.MANUAL,
                      description="First charge")
    _post_transaction(db_session, club=club, account=fa, amount=Decimal("10.00"),
                      tx_type=FinanceTransactionType.PAYMENT, source=FinanceTransactionSource.MANUAL,
                      description="Second payment")

    headers = _auth_headers(client, email=admin.email)
    headers["X-Club-Id"] = str(club.id)

    resp = client.get("/api/finance/journal", headers=headers)
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    assert entries[0]["description"] == "Second payment"
    assert entries[1]["description"] == "First charge"


def test_get_club_journal_includes_account_code(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"jnl-code-{uuid.uuid4().hex[:6]}")
    admin = _create_user(db_session, email=f"jnl_code_{uuid.uuid4().hex[:6]}@test.com", role=ClubMembershipRole.CLUB_ADMIN, club=club)
    _, fa = _create_finance_account(db_session, club=club, account_code="CODE-42")
    _post_transaction(db_session, club=club, account=fa, amount=Decimal("-50.00"),
                      tx_type=FinanceTransactionType.CHARGE, source=FinanceTransactionSource.POS,
                      description="POS charge")

    headers = _auth_headers(client, email=admin.email)
    headers["X-Club-Id"] = str(club.id)

    resp = client.get("/api/finance/journal", headers=headers)
    assert resp.status_code == 200
    entry = resp.json()["entries"][0]
    assert entry["account_customer_code"] == "CODE-42"


def test_get_club_journal_is_club_scoped(
    client: TestClient, db_session: Session
) -> None:
    club_a = _create_club(db_session, slug=f"jnl-sc-a-{uuid.uuid4().hex[:6]}")
    club_b = _create_club(db_session, slug=f"jnl-sc-b-{uuid.uuid4().hex[:6]}")
    admin = _create_user(db_session, email=f"jnl_sc_{uuid.uuid4().hex[:6]}@test.com", role=ClubMembershipRole.CLUB_ADMIN, club=club_a)
    _, fa_a = _create_finance_account(db_session, club=club_a, account_code="SC-A")
    _, fa_b = _create_finance_account(db_session, club=club_b, account_code="SC-B")
    _post_transaction(db_session, club=club_a, account=fa_a, amount=Decimal("-20.00"),
                      tx_type=FinanceTransactionType.CHARGE, source=FinanceTransactionSource.MANUAL,
                      description="Club A transaction")
    _post_transaction(db_session, club=club_b, account=fa_b, amount=Decimal("-30.00"),
                      tx_type=FinanceTransactionType.CHARGE, source=FinanceTransactionSource.MANUAL,
                      description="Club B transaction")

    headers = _auth_headers(client, email=admin.email)
    headers["X-Club-Id"] = str(club_a.id)

    resp = client.get("/api/finance/journal", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_count"] == 1
    assert data["entries"][0]["description"] == "Club A transaction"
