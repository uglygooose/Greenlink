from __future__ import annotations

import uuid
from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    AccountCustomer,
    Booking,
    BookingPaymentStatus,
    BookingSource,
    BookingStatus,
    Club,
    ClubConfig,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Course,
    FinanceAccount,
    FinanceAccountStatus,
    FinanceTenderRecord,
    FinanceTransaction,
    FinanceTransactionSource,
    FinanceTransactionType,
    Order,
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


def _create_club_with_config(db: Session, *, name: str, slug: str) -> Club:
    club = Club(name=name, slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.flush()
    db.add(
        ClubConfig(
            club_id=club.id,
            timezone="Africa/Johannesburg",
            operating_hours={
                day: {"open": "06:00", "close": "18:00", "closed": False}
                for day in [
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                    "sunday",
                ]
            },
            booking_window_days=14,
            cancellation_policy_hours=24,
            default_slot_interval_minutes=10,
        )
    )
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
) -> Booking:
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=None,
        slot_datetime=datetime.fromisoformat("2026-04-01T08:00:00+02:00"),
        slot_interval_minutes=10,
        status=BookingStatus.RESERVED,
        source=BookingSource.ADMIN,
        party_size=2,
        primary_person_id=person.id,
        primary_membership_id=None,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def _auth_headers(client: TestClient, email: str, club_id: str) -> dict[str, str]:
    login = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}", "X-Club-Id": club_id}


def _create_order(
    client: TestClient,
    *,
    headers: dict[str, str],
    person_id: uuid.UUID,
    booking_id: uuid.UUID | None = None,
    item_name: str = "Chicken Wrap",
    unit_price: str = "42.00",
    quantity: int = 2,
) -> str:
    response = client.post(
        "/api/orders",
        headers=headers,
        json={
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
        },
    )
    assert response.status_code == 200
    return response.json()["order"]["id"]


def _collect_order(client: TestClient, *, headers: dict[str, str], order_id: str) -> None:
    assert client.post(f"/api/orders/{order_id}/preparing", headers=headers).status_code == 200
    assert client.post(f"/api/orders/{order_id}/ready", headers=headers).status_code == 200
    assert client.post(f"/api/orders/{order_id}/collected", headers=headers).status_code == 200


def _post_charge(client: TestClient, *, headers: dict[str, str], order_id: str) -> None:
    response = client.post(f"/api/orders/{order_id}/post-charge", headers=headers)
    assert response.status_code == 200
    assert response.json()["posting_applied"] is True


def test_cash_tender_records_payment_transaction_and_offsets_balance(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="settlement-admin@example.com")
    customer = _create_person(db_session, email="settlement-customer@example.com")
    club = _create_club(db_session, name="Settlement Club", slug="settlement-club")
    course = _create_course(db_session, club=club, name="Settlement Course")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club)
    account_customer = _create_account_customer(
        db_session,
        club=club,
        person=customer,
        account_code="SET-001",
    )
    _create_finance_account(db_session, club=club, account_customer=account_customer)
    booking = _create_booking(db_session, club=club, course=course, person=customer)

    headers = _auth_headers(client, admin.email, str(club.id))
    order_id = _create_order(client, headers=headers, person_id=customer.id, booking_id=booking.id)
    _collect_order(client, headers=headers, order_id=order_id)
    _post_charge(client, headers=headers, order_id=order_id)

    response = client.post(
        f"/api/orders/{order_id}/record-payment",
        headers=headers,
        json={"tender_type": "card"},
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["decision"] == "allowed"
    assert payload["settlement_applied"] is True
    assert payload["tender"]["tender_type"] == "card"
    assert payload["tender"]["settlement_applied"] is True
    assert payload["order"]["finance_payment_posted"] is True
    assert payload["order"]["tender_recorded"] is True
    assert payload["order"]["finance_tender_record_id"] == payload["tender"]["id"]
    assert payload["order"]["payment_tender_type"] == "card"
    assert payload["transaction"]["type"] == "payment"
    assert payload["transaction"]["source"] == "order"
    assert payload["transaction"]["amount"] == "84.00"
    assert payload["transaction"]["reference_id"] == order_id
    assert payload["transaction"]["tender_type"] == "card"
    assert payload["transaction"]["description"].endswith("card")
    assert payload["balance"] == "0.00"

    persisted_booking = db_session.get(Booking, booking.id)
    assert persisted_booking is not None
    assert persisted_booking.status == BookingStatus.RESERVED
    assert persisted_booking.payment_status == BookingPaymentStatus.PAID

    transactions = list(db_session.scalars(select(FinanceTransaction)).all())
    tender_records = list(db_session.scalars(select(FinanceTenderRecord)).all())
    assert len(transactions) == 2
    assert len(tender_records) == 1
    assert {transaction.type for transaction in transactions} == {
        FinanceTransactionType.CHARGE,
        FinanceTransactionType.PAYMENT,
    }


def test_settlement_blocks_non_collected_orders_and_requires_charge_posting(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="settlement-blocked@example.com")
    customer = _create_person(db_session, email="settlement-blocked-customer@example.com")
    club = _create_club(db_session, name="Settlement Blocked", slug="settlement-blocked")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club)
    account_customer = _create_account_customer(
        db_session,
        club=club,
        person=customer,
        account_code="SET-002",
    )
    _create_finance_account(db_session, club=club, account_customer=account_customer)

    headers = _auth_headers(client, admin.email, str(club.id))
    order_id = _create_order(client, headers=headers, person_id=customer.id)

    before_collect = client.post(
        f"/api/orders/{order_id}/record-payment",
        headers=headers,
        json={"tender_type": "cash"},
    )
    assert before_collect.status_code == 200
    assert before_collect.json()["decision"] == "blocked"
    assert before_collect.json()["failures"] == [
        "Only collected orders may record settlement in this phase"
    ]

    _collect_order(client, headers=headers, order_id=order_id)
    before_charge = client.post(
        f"/api/orders/{order_id}/record-payment",
        headers=headers,
        json={"tender_type": "cash"},
    )
    assert before_charge.status_code == 200
    assert before_charge.json()["decision"] == "blocked"
    assert before_charge.json()["failures"] == [
        "Order charge must be posted before settlement can be recorded"
    ]

    assert len(db_session.scalars(select(FinanceTransaction)).all()) == 0
    assert len(db_session.scalars(select(FinanceTenderRecord)).all()) == 0


def test_settlement_is_idempotent_and_scoped_to_selected_club(
    client: TestClient,
    db_session: Session,
) -> None:
    admin_a = _create_user(db_session, email="settlement-a@example.com")
    admin_b = _create_user(db_session, email="settlement-b@example.com")
    customer = _create_person(db_session, email="settlement-tenant@example.com")
    club_a = _create_club(db_session, name="Settlement A", slug="settlement-a")
    club_b = _create_club(db_session, name="Settlement B", slug="settlement-b")
    _assign_membership(db_session, user=admin_a, club=club_a, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=admin_b, club=club_b, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club_a)
    account_customer = _create_account_customer(
        db_session,
        club=club_a,
        person=customer,
        account_code="SET-003",
    )
    _create_finance_account(db_session, club=club_a, account_customer=account_customer)

    headers_a = _auth_headers(client, admin_a.email, str(club_a.id))
    order_id = _create_order(client, headers=headers_a, person_id=customer.id, item_name="Coffee", unit_price="18.00")
    _collect_order(client, headers=headers_a, order_id=order_id)
    _post_charge(client, headers=headers_a, order_id=order_id)

    first = client.post(
        f"/api/orders/{order_id}/record-payment",
        headers=headers_a,
        json={"tender_type": "member_account"},
    )
    second = client.post(
        f"/api/orders/{order_id}/record-payment",
        headers=headers_a,
        json={"tender_type": "member_account"},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["settlement_applied"] is False
    assert second.json()["settlement_applied"] is False
    assert second.json()["tender"]["id"] == first.json()["tender"]["id"]
    assert second.json()["transaction"] is None
    assert len(db_session.scalars(select(FinanceTransaction)).all()) == 1
    assert len(db_session.scalars(select(FinanceTenderRecord)).all()) == 1

    headers_b = _auth_headers(client, admin_b.email, str(club_b.id))
    cross_club = client.post(
        f"/api/orders/{order_id}/record-payment",
        headers=headers_b,
        json={"tender_type": "cash"},
    )
    assert cross_club.status_code == 200
    assert cross_club.json()["decision"] == "blocked"
    assert cross_club.json()["failures"] == ["order_id was not found in the selected club"]

    charge_transaction = db_session.scalar(
        select(FinanceTransaction).where(FinanceTransaction.type == FinanceTransactionType.CHARGE)
    )
    assert charge_transaction is not None
    assert charge_transaction.source == FinanceTransactionSource.ORDER


def test_member_account_tender_records_without_auto_settling_charge(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="settlement-account@example.com")
    customer = _create_person(db_session, email="settlement-account-customer@example.com")
    club = _create_club(db_session, name="Settlement Account Club", slug="settlement-account-club")
    course = _create_course(db_session, club=club, name="Settlement Account Course")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club)
    account_customer = _create_account_customer(
        db_session,
        club=club,
        person=customer,
        account_code="SET-004",
    )
    _create_finance_account(db_session, club=club, account_customer=account_customer)
    booking = _create_booking(db_session, club=club, course=course, person=customer)

    headers = _auth_headers(client, admin.email, str(club.id))
    order_id = _create_order(client, headers=headers, person_id=customer.id, booking_id=booking.id)
    _collect_order(client, headers=headers, order_id=order_id)
    _post_charge(client, headers=headers, order_id=order_id)

    response = client.post(
        f"/api/orders/{order_id}/record-payment",
        headers=headers,
        json={"tender_type": "member_account"},
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["decision"] == "allowed"
    assert payload["settlement_applied"] is False
    assert payload["tender"]["tender_type"] == "member_account"
    assert payload["tender"]["settlement_applied"] is False
    assert payload["order"]["tender_recorded"] is True
    assert payload["order"]["finance_payment_posted"] is False
    assert payload["order"]["payment_tender_type"] == "member_account"
    assert payload["transaction"] is None
    assert payload["balance"] == "-84.00"

    transactions = list(db_session.scalars(select(FinanceTransaction)).all())
    tender_records = list(db_session.scalars(select(FinanceTenderRecord)).all())
    assert len(transactions) == 1
    assert len(tender_records) == 1
    assert transactions[0].type == FinanceTransactionType.CHARGE

    persisted_booking = db_session.get(Booking, booking.id)
    assert persisted_booking is not None
    assert persisted_booking.payment_status == BookingPaymentStatus.PENDING


def test_charge_posting_and_cash_settlement_flow_updates_booking_payment_status_in_tee_sheet(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="settlement-tee-sheet@example.com")
    customer = _create_person(db_session, email="settlement-tee-sheet-customer@example.com")
    club = _create_club_with_config(
        db_session,
        name="Settlement Tee Sheet Club",
        slug="settlement-tee-sheet",
    )
    course = _create_course(db_session, club=club, name="Settlement Tee Sheet Course")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club)
    account_customer = _create_account_customer(
        db_session,
        club=club,
        person=customer,
        account_code="SET-005",
    )
    _create_finance_account(db_session, club=club, account_customer=account_customer)
    booking = _create_booking(db_session, club=club, course=course, person=customer)

    headers = _auth_headers(client, admin.email, str(club.id))
    order_id = _create_order(client, headers=headers, person_id=customer.id, booking_id=booking.id)
    _collect_order(client, headers=headers, order_id=order_id)
    _post_charge(client, headers=headers, order_id=order_id)

    pending_response = client.get(
        "/api/golf/tee-sheet/day",
        params={
            "course_id": str(course.id),
            "date": "2026-04-01",
            "membership_type": "member",
            "reference_datetime": "2026-03-31T08:00:00+02:00",
        },
        headers=headers,
    )
    assert pending_response.status_code == 200
    pending_booking = next(
        booking_view
        for row in pending_response.json()["rows"]
        for slot in row["slots"]
        for booking_view in slot["bookings"]
        if booking_view["id"] == str(booking.id)
    )
    assert pending_booking["payment_status"] == "pending"

    settle_response = client.post(
        f"/api/orders/{order_id}/record-payment",
        headers=headers,
        json={"tender_type": "cash"},
    )
    assert settle_response.status_code == 200
    assert settle_response.json()["settlement_applied"] is True

    paid_response = client.get(
        "/api/golf/tee-sheet/day",
        params={
            "course_id": str(course.id),
            "date": "2026-04-01",
            "membership_type": "member",
            "reference_datetime": "2026-03-31T08:00:00+02:00",
        },
        headers=headers,
    )
    assert paid_response.status_code == 200
    paid_booking = next(
        booking_view
        for row in paid_response.json()["rows"]
        for slot in row["slots"]
        for booking_view in slot["bookings"]
        if booking_view["id"] == str(booking.id)
    )
    assert paid_booking["payment_status"] == "paid"


def test_collected_order_does_not_auto_settle_or_create_tender_record(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="settlement-no-auto@example.com")
    customer = _create_person(db_session, email="settlement-no-auto-customer@example.com")
    club = _create_club(db_session, name="Settlement No Auto", slug="settlement-no-auto")
    course = _create_course(db_session, club=club, name="Settlement No Auto Course")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _create_customer_membership(db_session, person=customer, club=club)
    account_customer = _create_account_customer(
        db_session,
        club=club,
        person=customer,
        account_code="SET-006",
    )
    _create_finance_account(db_session, club=club, account_customer=account_customer)
    booking = _create_booking(db_session, club=club, course=course, person=customer)

    headers = _auth_headers(client, admin.email, str(club.id))
    order_id = _create_order(client, headers=headers, person_id=customer.id, booking_id=booking.id)
    _collect_order(client, headers=headers, order_id=order_id)

    order = db_session.get(Order, uuid.UUID(order_id))
    persisted_booking = db_session.get(Booking, booking.id)
    assert order is not None
    assert order.finance_charge_transaction_id is None
    assert order.finance_payment_transaction_id is None
    assert order.finance_tender_record_id is None
    assert persisted_booking is not None
    assert persisted_booking.payment_status is None
    assert len(db_session.scalars(select(FinanceTransaction)).all()) == 0
    assert len(db_session.scalars(select(FinanceTenderRecord)).all()) == 0
