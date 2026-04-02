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
    Person,
    User,
)
from app.models.product import Product


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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
    db: Session,
    *,
    user: User,
    club: Club,
    role: ClubMembershipRole,
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


def _create_product(
    db: Session,
    *,
    club: Club,
    name: str,
    price: Decimal,
    category: str | None = None,
    active: bool = True,
) -> Product:
    product = Product(
        club_id=club.id,
        name=name,
        price=price,
        category=category,
        active=active,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def _auth_headers(client: TestClient, *, email: str, password: str = "password123") -> dict:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


# ---------------------------------------------------------------------------
# Tests: GET /api/pos/products
# ---------------------------------------------------------------------------


def test_list_products_returns_active_only(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, name="POS Club", slug=f"pos-club-{uuid.uuid4().hex[:6]}")
    staff_user = _create_user(db_session, email=f"pos_staff_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff_user, club=club, role=ClubMembershipRole.CLUB_STAFF)

    _create_product(db_session, club=club, name="Active Item", price=Decimal("10.00"), active=True)
    _create_product(db_session, club=club, name="Inactive Item", price=Decimal("5.00"), active=False)

    headers = _auth_headers(client, email=staff_user.email)
    headers["X-Club-Id"] = str(club.id)

    response = client.get("/api/pos/products", headers=headers)
    assert response.status_code == 200
    data = response.json()
    names = [p["name"] for p in data]
    assert "Active Item" in names
    assert "Inactive Item" not in names


def test_list_products_can_include_inactive_for_admin_catalog(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, name="POS Catalog Club", slug=f"pos-cat-{uuid.uuid4().hex[:6]}")
    staff_user = _create_user(db_session, email=f"pos_catalog_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff_user, club=club, role=ClubMembershipRole.CLUB_STAFF)

    _create_product(db_session, club=club, name="Logo Cap", price=Decimal("25.00"), active=True)
    _create_product(db_session, club=club, name="Retired Polo", price=Decimal("49.00"), active=False)

    headers = _auth_headers(client, email=staff_user.email)
    headers["X-Club-Id"] = str(club.id)

    response = client.get("/api/pos/products?include_inactive=true", headers=headers)
    assert response.status_code == 200
    names = [p["name"] for p in response.json()]
    assert "Logo Cap" in names
    assert "Retired Polo" in names


def test_list_products_club_scoped(client: TestClient, db_session: Session) -> None:
    club_a = _create_club(db_session, name="POS Club A", slug=f"pos-a-{uuid.uuid4().hex[:6]}")
    club_b = _create_club(db_session, name="POS Club B", slug=f"pos-b-{uuid.uuid4().hex[:6]}")
    staff_user = _create_user(db_session, email=f"pos_staff2_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff_user, club=club_a, role=ClubMembershipRole.CLUB_STAFF)

    _create_product(db_session, club=club_a, name="Club A Item", price=Decimal("20.00"))
    _create_product(db_session, club=club_b, name="Club B Item", price=Decimal("30.00"))

    headers = _auth_headers(client, email=staff_user.email)
    headers["X-Club-Id"] = str(club_a.id)

    response = client.get("/api/pos/products", headers=headers)
    assert response.status_code == 200
    names = [p["name"] for p in response.json()]
    assert "Club A Item" in names
    assert "Club B Item" not in names


def test_list_products_requires_staff(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, name="POS Club Member", slug=f"pos-mem-{uuid.uuid4().hex[:6]}")
    member = _create_user(db_session, email=f"pos_member_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=member, club=club, role=ClubMembershipRole.MEMBER)

    headers = _auth_headers(client, email=member.email)
    headers["X-Club-Id"] = str(club.id)

    response = client.get("/api/pos/products", headers=headers)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Tests: POST /api/pos/transactions
# ---------------------------------------------------------------------------


def test_create_pos_transaction_cash(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, name="POS Cash Club", slug=f"pos-cash-{uuid.uuid4().hex[:6]}")
    staff_user = _create_user(db_session, email=f"pos_cash_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff_user, club=club, role=ClubMembershipRole.CLUB_STAFF)

    headers = _auth_headers(client, email=staff_user.email)
    headers["X-Club-Id"] = str(club.id)

    payload = {
        "items": [
            {"item_name": "Green Fee", "unit_price": "75.00", "quantity": 1},
            {"item_name": "Power Cart", "unit_price": "35.00", "quantity": 1},
        ],
        "tender_type": "cash",
    }
    response = client.post("/api/pos/transactions", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["decision"] == "allowed"
    assert data["transaction_applied"] is True
    assert data["transaction"]["total_amount"] == "110.00"
    assert data["transaction"]["tender_type"] == "cash"
    assert data["transaction"]["finance_transaction_id"] is None
    assert len(data["transaction"]["items"]) == 2


def test_create_pos_transaction_card(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, name="POS Card Club", slug=f"pos-card-{uuid.uuid4().hex[:6]}")
    staff_user = _create_user(db_session, email=f"pos_card_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff_user, club=club, role=ClubMembershipRole.CLUB_STAFF)

    headers = _auth_headers(client, email=staff_user.email)
    headers["X-Club-Id"] = str(club.id)

    payload = {
        "items": [{"item_name": "Titleist Pro V1", "unit_price": "54.99", "quantity": 2}],
        "tender_type": "card",
    }
    response = client.post("/api/pos/transactions", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["decision"] == "allowed"
    assert data["transaction"]["total_amount"] == "109.98"
    assert data["transaction"]["finance_transaction_id"] is None


def test_create_pos_transaction_member_account(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, name="POS Account Club", slug=f"pos-acc-{uuid.uuid4().hex[:6]}")
    staff_user = _create_user(db_session, email=f"pos_acc_staff_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff_user, club=club, role=ClubMembershipRole.CLUB_STAFF)

    member_person = _create_person(db_session, email=f"pos_member_p_{uuid.uuid4().hex[:6]}@test.com")
    account_customer = _create_account_customer(
        db_session, club=club, person=member_person, account_code="POS001"
    )
    _create_finance_account(db_session, club=club, account_customer=account_customer)

    headers = _auth_headers(client, email=staff_user.email)
    headers["X-Club-Id"] = str(club.id)

    payload = {
        "items": [{"item_name": "Range Balls", "unit_price": "12.00", "quantity": 1}],
        "tender_type": "member_account",
        "person_id": str(member_person.id),
    }
    response = client.post("/api/pos/transactions", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["decision"] == "allowed"
    assert data["transaction"]["total_amount"] == "12.00"
    assert data["transaction"]["finance_transaction_id"] is not None


def test_create_pos_transaction_member_account_missing_person(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, name="POS NoPerson Club", slug=f"pos-np-{uuid.uuid4().hex[:6]}")
    staff_user = _create_user(db_session, email=f"pos_np_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff_user, club=club, role=ClubMembershipRole.CLUB_STAFF)

    headers = _auth_headers(client, email=staff_user.email)
    headers["X-Club-Id"] = str(club.id)

    payload = {
        "items": [{"item_name": "Water", "unit_price": "4.50", "quantity": 1}],
        "tender_type": "member_account",
    }
    response = client.post("/api/pos/transactions", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["decision"] == "blocked"
    assert any("person_id" in f for f in data["failures"])


def test_create_pos_transaction_member_account_no_finance_account(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, name="POS NoFA Club", slug=f"pos-nofa-{uuid.uuid4().hex[:6]}")
    staff_user = _create_user(db_session, email=f"pos_nofa_staff_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff_user, club=club, role=ClubMembershipRole.CLUB_STAFF)

    person_no_account = _create_person(db_session, email=f"nofa_{uuid.uuid4().hex[:6]}@test.com")

    headers = _auth_headers(client, email=staff_user.email)
    headers["X-Club-Id"] = str(club.id)

    payload = {
        "items": [{"item_name": "Snack", "unit_price": "8.00", "quantity": 1}],
        "tender_type": "member_account",
        "person_id": str(person_no_account.id),
    }
    response = client.post("/api/pos/transactions", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["decision"] == "blocked"
    assert any("finance account" in f.lower() for f in data["failures"])


def test_create_pos_transaction_with_product_id(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, name="POS ProductId Club", slug=f"pos-pid-{uuid.uuid4().hex[:6]}")
    staff_user = _create_user(db_session, email=f"pos_pid_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff_user, club=club, role=ClubMembershipRole.CLUB_STAFF)
    product = _create_product(db_session, club=club, name="Golf Glove", price=Decimal("22.00"))

    headers = _auth_headers(client, email=staff_user.email)
    headers["X-Club-Id"] = str(club.id)

    payload = {
        "items": [
            {
                "product_id": str(product.id),
                "item_name": product.name,
                "unit_price": "22.00",
                "quantity": 1,
            }
        ],
        "tender_type": "cash",
    }
    response = client.post("/api/pos/transactions", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["decision"] == "allowed"
    assert data["transaction"]["items"][0]["product_id"] == str(product.id)
    assert data["transaction"]["items"][0]["item_name_snapshot"] == "Golf Glove"
    assert data["transaction"]["items"][0]["unit_price_snapshot"] == "22.00"


def test_create_pos_transaction_uses_canonical_product_details(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(
        db_session,
        name="POS Canonical Club",
        slug=f"pos-canon-{uuid.uuid4().hex[:6]}",
    )
    staff_user = _create_user(db_session, email=f"pos_canon_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff_user, club=club, role=ClubMembershipRole.CLUB_STAFF)
    product = _create_product(db_session, club=club, name="Cart Rental", price=Decimal("35.00"))

    headers = _auth_headers(client, email=staff_user.email)
    headers["X-Club-Id"] = str(club.id)

    payload = {
        "items": [
            {
                "product_id": str(product.id),
                "item_name": "Tampered Name",
                "unit_price": "1.00",
                "quantity": 2,
            }
        ],
        "tender_type": "cash",
    }
    response = client.post("/api/pos/transactions", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["decision"] == "allowed"
    assert data["transaction"]["total_amount"] == "70.00"
    assert data["transaction"]["items"][0]["item_name_snapshot"] == "Cart Rental"
    assert data["transaction"]["items"][0]["unit_price_snapshot"] == "35.00"


def test_create_pos_transaction_blocks_inactive_product(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(
        db_session,
        name="POS Inactive Club",
        slug=f"pos-inactive-{uuid.uuid4().hex[:6]}",
    )
    staff_user = _create_user(db_session, email=f"pos_inactive_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff_user, club=club, role=ClubMembershipRole.CLUB_STAFF)
    product = _create_product(
        db_session,
        club=club,
        name="Hidden Marker",
        price=Decimal("12.00"),
        active=False,
    )

    headers = _auth_headers(client, email=staff_user.email)
    headers["X-Club-Id"] = str(club.id)

    payload = {
        "items": [
            {
                "product_id": str(product.id),
                "item_name": product.name,
                "unit_price": "12.00",
                "quantity": 1,
            }
        ],
        "tender_type": "cash",
    }
    response = client.post("/api/pos/transactions", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["decision"] == "blocked"
    assert any("inactive" in failure.lower() for failure in data["failures"])


def test_create_pos_transaction_line_totals(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, name="POS LineTotal Club", slug=f"pos-lt-{uuid.uuid4().hex[:6]}")
    staff_user = _create_user(db_session, email=f"pos_lt_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff_user, club=club, role=ClubMembershipRole.CLUB_STAFF)

    headers = _auth_headers(client, email=staff_user.email)
    headers["X-Club-Id"] = str(club.id)

    payload = {
        "items": [
            {"item_name": "Coffee", "unit_price": "18.00", "quantity": 3},
        ],
        "tender_type": "cash",
    }
    response = client.post("/api/pos/transactions", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    item = data["transaction"]["items"][0]
    assert item["line_total"] == "54.00"
    assert data["transaction"]["total_amount"] == "54.00"


def test_create_pos_transaction_requires_staff(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, name="POS AuthFail Club", slug=f"pos-af-{uuid.uuid4().hex[:6]}")
    member = _create_user(db_session, email=f"pos_mem_auth_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=member, club=club, role=ClubMembershipRole.MEMBER)

    headers = _auth_headers(client, email=member.email)
    headers["X-Club-Id"] = str(club.id)

    payload = {
        "items": [{"item_name": "Drink", "unit_price": "5.00", "quantity": 1}],
        "tender_type": "cash",
    }
    response = client.post("/api/pos/transactions", json=payload, headers=headers)
    assert response.status_code == 403
