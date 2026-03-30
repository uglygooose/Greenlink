from __future__ import annotations

import uuid
from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    AccountCustomer,
    Booking,
    BookingSource,
    BookingStatus,
    Club,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Course,
    FinanceAccount,
    FinanceAccountStatus,
    FinanceTransaction,
    FinanceTransactionSource,
    FinanceTransactionType,
    Order,
    OrderItem,
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


def _create_customer_membership(db: Session, *, person: Person, club: Club) -> ClubMembership:
    membership = ClubMembership(
        person_id=person.id,
        club_id=club.id,
        role=ClubMembershipRole.MEMBER,
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


def _create_course(db: Session, *, club: Club, name: str) -> Course:
    course = Course(club_id=club.id, name=name, holes=18, active=True)
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


def _create_booking(
    db: Session,
    *,
    club: Club,
    course: Course,
    person: Person,
    status: BookingStatus = BookingStatus.RESERVED,
) -> Booking:
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=None,
        slot_datetime=datetime.fromisoformat("2026-04-01T08:00:00+02:00"),
        slot_interval_minutes=10,
        status=status,
        source=BookingSource.ADMIN,
        party_size=2,
        primary_person_id=person.id,
        primary_membership_id=None,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def _auth_headers(
    client: TestClient,
    email: str,
    club_id: str,
    *,
    correlation_id: str | None = None,
) -> dict[str, str]:
    login = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}", "X-Club-Id": club_id}
    if correlation_id is not None:
        headers["X-Correlation-Id"] = correlation_id
    return headers


def _create_order(
    client: TestClient,
    *,
    headers: dict[str, str],
    person_id: uuid.UUID,
    booking_id: uuid.UUID | None = None,
    item_name: str = "Chicken Wrap",
    unit_price: str = "42.00",
    quantity: int = 2,
) -> dict[str, object]:
    payload = {
        "person_id": str(person_id),
        "booking_id": str(booking_id) if booking_id is not None else None,
        "source": "staff",
        "items": [
            {
                "item_name": item_name,
                "unit_price": unit_price,
                "quantity": quantity,
                "product_id": None,
            }
        ],
    }
    response = client.post("/api/orders", headers=headers, json=payload)
    assert response.status_code == 200
    return response.json()


def test_order_creation_preserves_snapshots_and_does_not_touch_booking_or_finance(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="orders-admin@example.com")
    customer = _create_person(db_session, email="orders-customer@example.com")
    club = _create_club(db_session, name="Orders Club", slug="orders-club")
    course = _create_course(db_session, club=club, name="Main Course")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club)
    booking = _create_booking(db_session, club=club, course=course, person=customer)
    finance_count_before = len(db_session.scalars(select(FinanceTransaction)).all())

    headers = _auth_headers(client, admin.email, str(club.id))
    payload = _create_order(
        client,
        headers=headers,
        person_id=customer.id,
        booking_id=booking.id,
        item_name=" Halfway Burger ",
        unit_price="65.50",
        quantity=2,
    )

    assert payload["created"] is True
    assert payload["order"]["booking_id"] == str(booking.id)
    assert payload["order"]["status"] == "placed"
    assert payload["order"]["person"]["id"] == str(customer.id)
    assert payload["order"]["person"]["full_name"] == customer.full_name
    assert payload["order"]["item_count"] == 1
    assert payload["order"]["item_summary"] == "Halfway Burger"
    assert payload["order"]["items"][0]["item_name_snapshot"] == "Halfway Burger"
    assert payload["order"]["items"][0]["unit_price_snapshot"] == "65.50"
    assert payload["order"]["items"][0]["quantity"] == 2

    persisted_booking = db_session.get(Booking, booking.id)
    assert persisted_booking is not None
    assert persisted_booking.status == BookingStatus.RESERVED
    finance_count_after = len(db_session.scalars(select(FinanceTransaction)).all())
    assert finance_count_after == finance_count_before


def test_order_creation_is_idempotent_safe_with_reused_correlation_id(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="orders-idempotent@example.com")
    customer = _create_person(db_session, email="orders-idempotent-customer@example.com")
    club = _create_club(db_session, name="Idempotent Orders", slug="idempotent-orders")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_account_customer(db_session, club=club, person=customer, account_code="ORD-001")

    correlation_id = "orders-create-001"
    headers = _auth_headers(client, admin.email, str(club.id), correlation_id=correlation_id)

    first = _create_order(client, headers=headers, person_id=customer.id)
    second = _create_order(client, headers=headers, person_id=customer.id)

    assert first["created"] is True
    assert second["created"] is False
    assert second["order"]["id"] == first["order"]["id"]
    assert len(db_session.scalars(select(Order)).all()) == 1
    assert len(db_session.scalars(select(OrderItem)).all()) == 1

    detail = client.get(f"/api/orders/{first['order']['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["person"]["full_name"] == customer.full_name


def test_order_access_is_scoped_to_selected_club_and_booking_linkage_is_validated(
    client: TestClient,
    db_session: Session,
) -> None:
    admin_a = _create_user(db_session, email="orders-a@example.com")
    admin_b = _create_user(db_session, email="orders-b@example.com")
    customer = _create_person(db_session, email="orders-tenant-customer@example.com")
    customer_b = _create_person(db_session, email="orders-tenant-customer-b@example.com")
    club_a = _create_club(db_session, name="Orders A", slug="orders-a")
    club_b = _create_club(db_session, name="Orders B", slug="orders-b")
    course_a = _create_course(db_session, club=club_a, name="Course A")
    course_b = _create_course(db_session, club=club_b, name="Course B")
    _assign_membership(db_session, user=admin_a, club=club_a, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=admin_b, club=club_b, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club_a)
    _create_customer_membership(db_session, person=customer_b, club=club_b)
    booking = _create_booking(db_session, club=club_a, course=course_a, person=customer)
    foreign_booking = _create_booking(db_session, club=club_b, course=course_b, person=customer_b)

    headers_a = _auth_headers(client, admin_a.email, str(club_a.id))
    created = _create_order(client, headers=headers_a, person_id=customer.id, booking_id=booking.id)
    order_id = created["order"]["id"]

    headers_b = _auth_headers(client, admin_b.email, str(club_b.id))
    detail_response = client.get(f"/api/orders/{order_id}", headers=headers_b)
    assert detail_response.status_code == 404
    assert detail_response.json()["message"] == "Order not found"

    create_cross_club = client.post(
        "/api/orders",
        headers=headers_b,
        json={
            "person_id": str(customer.id),
            "booking_id": str(booking.id),
            "source": "staff",
            "items": [{"item_name": "Tea", "unit_price": "10.00", "quantity": 1}],
        },
    )
    assert create_cross_club.status_code == 404
    assert create_cross_club.json()["message"] == "Person not found"

    create_with_foreign_booking = client.post(
        "/api/orders",
        headers=headers_a,
        json={
            "person_id": str(customer.id),
            "booking_id": str(foreign_booking.id),
            "source": "staff",
            "items": [{"item_name": "Coffee", "unit_price": "10.00", "quantity": 1}],
        },
    )
    assert create_with_foreign_booking.status_code == 404
    assert create_with_foreign_booking.json()["message"] == "Booking not found"


def test_order_lifecycle_transitions_and_idempotent_repeat_are_explicit(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="orders-lifecycle@example.com")
    customer = _create_person(db_session, email="orders-lifecycle-customer@example.com")
    club = _create_club(db_session, name="Lifecycle Orders", slug="lifecycle-orders")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club)

    headers = _auth_headers(client, admin.email, str(club.id))
    created = _create_order(client, headers=headers, person_id=customer.id)
    order_id = created["order"]["id"]

    preparing = client.post(f"/api/orders/{order_id}/preparing", headers=headers)
    assert preparing.status_code == 200
    assert preparing.json()["decision"] == "allowed"
    assert preparing.json()["transition_applied"] is True
    assert preparing.json()["order"]["status"] == "preparing"

    preparing_repeat = client.post(f"/api/orders/{order_id}/preparing", headers=headers)
    assert preparing_repeat.status_code == 200
    assert preparing_repeat.json()["decision"] == "allowed"
    assert preparing_repeat.json()["transition_applied"] is False

    ready = client.post(f"/api/orders/{order_id}/ready", headers=headers)
    assert ready.status_code == 200
    assert ready.json()["decision"] == "allowed"
    assert ready.json()["order"]["status"] == "ready"

    collected = client.post(f"/api/orders/{order_id}/collected", headers=headers)
    assert collected.status_code == 200
    assert collected.json()["decision"] == "allowed"
    assert collected.json()["order"]["status"] == "collected"


def test_order_lifecycle_blocks_skipped_and_terminal_transitions(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="orders-blocked@example.com")
    customer = _create_person(db_session, email="orders-blocked-customer@example.com")
    club = _create_club(db_session, name="Blocked Orders", slug="blocked-orders")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club)
    headers = _auth_headers(client, admin.email, str(club.id))

    created = _create_order(client, headers=headers, person_id=customer.id)
    order_id = created["order"]["id"]

    skipped = client.post(f"/api/orders/{order_id}/ready", headers=headers)
    assert skipped.status_code == 200
    assert skipped.json()["decision"] == "blocked"
    assert skipped.json()["transition_applied"] is False
    assert skipped.json()["failures"][0]["current_status"] == "placed"

    cancelled = client.post(f"/api/orders/{order_id}/cancel", headers=headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["decision"] == "allowed"
    assert cancelled.json()["order"]["status"] == "cancelled"

    cancel_repeat = client.post(f"/api/orders/{order_id}/cancel", headers=headers)
    assert cancel_repeat.status_code == 200
    assert cancel_repeat.json()["decision"] == "allowed"
    assert cancel_repeat.json()["transition_applied"] is False

    collected_after_cancel = client.post(f"/api/orders/{order_id}/collected", headers=headers)
    assert collected_after_cancel.status_code == 200
    assert collected_after_cancel.json()["decision"] == "blocked"
    assert collected_after_cancel.json()["failures"][0]["current_status"] == "cancelled"


def test_order_reads_filter_and_sort_with_open_orders_first(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="orders-list@example.com")
    customer = _create_person(db_session, email="orders-list-customer@example.com")
    club = _create_club(db_session, name="List Orders", slug="list-orders")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club)
    headers = _auth_headers(client, admin.email, str(club.id))

    first = _create_order(client, headers=headers, person_id=customer.id)
    second = _create_order(
        client,
        headers=_auth_headers(client, admin.email, str(club.id), correlation_id="orders-list-2"),
        person_id=customer.id,
        item_name="Coffee",
    )
    client.post(f"/api/orders/{first['order']['id']}/cancel", headers=headers)

    listing = client.get("/api/orders", headers=headers)
    assert listing.status_code == 200
    payload = listing.json()
    assert payload[0]["id"] == second["order"]["id"]
    assert payload[0]["status"] == "placed"
    assert payload[-1]["id"] == first["order"]["id"]
    assert payload[-1]["status"] == "cancelled"

    filtered = client.get("/api/orders?status=cancelled", headers=headers)
    assert filtered.status_code == 200
    filtered_payload = filtered.json()
    assert len(filtered_payload) == 1
    assert filtered_payload[0]["id"] == first["order"]["id"]
    assert filtered_payload[0]["person"]["full_name"] == customer.full_name


def test_order_creation_does_not_mutate_inventory_state_in_this_phase(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="orders-inventory@example.com")
    customer = _create_person(db_session, email="orders-inventory-customer@example.com")
    club = _create_club(db_session, name="Inventory Orders", slug="inventory-orders")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club)

    headers = _auth_headers(client, admin.email, str(club.id))
    _create_order(client, headers=headers, person_id=customer.id)

    table_names = set(inspect(db_session.bind).get_table_names())
    assert "orders" in table_names
    assert "order_items" in table_names
    assert not any(name.startswith("inventory") for name in table_names)


def test_player_member_can_fetch_menu_and_place_order_without_person_id(
    client: TestClient,
    db_session: Session,
) -> None:
    member_user = _create_user(db_session, email="player-orders@example.com")
    club = _create_club(db_session, name="Player Orders Club", slug="player-orders-club")
    _assign_membership(db_session, user=member_user, club=club, role=ClubMembershipRole.MEMBER)

    headers = _auth_headers(client, member_user.email, str(club.id))
    menu_response = client.get("/api/orders/menu", headers=headers)
    assert menu_response.status_code == 200
    menu_payload = menu_response.json()
    assert len(menu_payload) >= 1

    first_menu_item = menu_payload[0]
    create_response = client.post(
        "/api/orders",
        headers=headers,
        json={
            "source": "player_app",
            "items": [
                {
                    "product_id": first_menu_item["product_id"],
                    "item_name": "Tampered Name",
                    "unit_price": "0.01",
                    "quantity": 2,
                }
            ],
        },
    )
    assert create_response.status_code == 200
    payload = create_response.json()
    assert payload["created"] is True
    assert payload["order"]["person"]["id"] == str(member_user.person_id)
    assert payload["order"]["source"] == "player_app"
    assert payload["order"]["items"][0]["item_name_snapshot"] == first_menu_item["item_name"]
    assert payload["order"]["items"][0]["unit_price_snapshot"] == first_menu_item["unit_price"]


def test_collected_order_can_post_finance_charge_with_order_reference(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="orders-finance@example.com")
    customer = _create_person(db_session, email="orders-finance-customer@example.com")
    club = _create_club(db_session, name="Orders Finance", slug="orders-finance")
    course = _create_course(db_session, club=club, name="Orders Finance Course")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club)
    booking = _create_booking(db_session, club=club, course=course, person=customer)
    account_customer = _create_account_customer(
        db_session,
        club=club,
        person=customer,
        account_code="ORD-FIN-001",
    )
    finance_account = _create_finance_account(
        db_session,
        club=club,
        account_customer=account_customer,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    created = _create_order(
        client,
        headers=headers,
        person_id=customer.id,
        booking_id=booking.id,
        item_name="Wrap",
        unit_price="42.00",
        quantity=2,
    )
    order_id = created["order"]["id"]

    ready = client.post(f"/api/orders/{order_id}/ready", headers=headers)
    assert ready.status_code == 200
    assert ready.json()["decision"] == "blocked"

    preparing = client.post(f"/api/orders/{order_id}/preparing", headers=headers)
    assert preparing.status_code == 200
    ready = client.post(f"/api/orders/{order_id}/ready", headers=headers)
    assert ready.status_code == 200
    collected = client.post(f"/api/orders/{order_id}/collected", headers=headers)
    assert collected.status_code == 200

    finance_count_before = len(db_session.scalars(select(FinanceTransaction)).all())
    posting = client.post(f"/api/orders/{order_id}/post-charge", headers=headers)
    assert posting.status_code == 200
    payload = posting.json()

    assert payload["decision"] == "allowed"
    assert payload["posting_applied"] is True
    assert payload["order"]["finance_charge_posted"] is True
    assert payload["order"]["finance_charge_transaction_id"] == payload["transaction"]["id"]
    assert payload["transaction"]["account_id"] == str(finance_account.id)
    assert payload["transaction"]["amount"] == "-84.00"
    assert payload["transaction"]["type"] == "charge"
    assert payload["transaction"]["source"] == "order"
    assert payload["transaction"]["reference_id"] == order_id
    assert payload["balance"] == "-84.00"

    finance_count_after = len(db_session.scalars(select(FinanceTransaction)).all())
    assert finance_count_after == finance_count_before + 1

    persisted_order = db_session.get(Order, uuid.UUID(order_id))
    assert persisted_order is not None
    assert persisted_order.finance_charge_transaction_id is not None

    persisted_transaction = db_session.scalar(
        select(FinanceTransaction).where(FinanceTransaction.id == persisted_order.finance_charge_transaction_id)
    )
    assert persisted_transaction is not None
    assert persisted_transaction.reference_id == uuid.UUID(order_id)
    assert persisted_transaction.source == FinanceTransactionSource.ORDER
    assert persisted_transaction.type == FinanceTransactionType.CHARGE

    persisted_booking = db_session.get(Booking, booking.id)
    assert persisted_booking is not None
    assert persisted_booking.status == BookingStatus.RESERVED


def test_non_collected_order_finance_posting_is_blocked_and_booking_state_is_unchanged(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="orders-finance-blocked@example.com")
    customer = _create_person(db_session, email="orders-finance-blocked-customer@example.com")
    club = _create_club(db_session, name="Orders Finance Blocked", slug="orders-finance-blocked")
    course = _create_course(db_session, club=club, name="Finance Course")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club)
    booking = _create_booking(db_session, club=club, course=course, person=customer)
    account_customer = _create_account_customer(
        db_session,
        club=club,
        person=customer,
        account_code="ORD-FIN-002",
    )
    _create_finance_account(db_session, club=club, account_customer=account_customer)

    headers = _auth_headers(client, admin.email, str(club.id))
    created = _create_order(client, headers=headers, person_id=customer.id, booking_id=booking.id)
    order_id = created["order"]["id"]

    posting = client.post(f"/api/orders/{order_id}/post-charge", headers=headers)
    assert posting.status_code == 200
    payload = posting.json()
    assert payload["decision"] == "blocked"
    assert payload["posting_applied"] is False
    assert payload["failures"][0]["current_status"] == "placed"
    assert len(db_session.scalars(select(FinanceTransaction)).all()) == 0

    persisted_booking = db_session.get(Booking, booking.id)
    assert persisted_booking is not None
    assert persisted_booking.status == BookingStatus.RESERVED


def test_repeated_order_finance_posting_is_idempotent_safe(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="orders-finance-repeat@example.com")
    customer = _create_person(db_session, email="orders-finance-repeat-customer@example.com")
    club = _create_club(db_session, name="Orders Finance Repeat", slug="orders-finance-repeat")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club)
    account_customer = _create_account_customer(
        db_session,
        club=club,
        person=customer,
        account_code="ORD-FIN-003",
    )
    _create_finance_account(db_session, club=club, account_customer=account_customer)

    headers = _auth_headers(client, admin.email, str(club.id))
    created = _create_order(client, headers=headers, person_id=customer.id, item_name="Coffee", unit_price="18.00")
    order_id = created["order"]["id"]

    assert client.post(f"/api/orders/{order_id}/preparing", headers=headers).status_code == 200
    assert client.post(f"/api/orders/{order_id}/ready", headers=headers).status_code == 200
    assert client.post(f"/api/orders/{order_id}/collected", headers=headers).status_code == 200

    first = client.post(f"/api/orders/{order_id}/post-charge", headers=headers)
    second = client.post(f"/api/orders/{order_id}/post-charge", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    first_payload = first.json()
    second_payload = second.json()
    assert first_payload["posting_applied"] is True
    assert second_payload["decision"] == "allowed"
    assert second_payload["posting_applied"] is False
    assert second_payload["transaction"]["id"] == first_payload["transaction"]["id"]
    assert len(db_session.scalars(select(FinanceTransaction)).all()) == 1
