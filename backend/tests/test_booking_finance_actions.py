from __future__ import annotations

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


def _create_account_customer(db: Session, *, club: Club, person: Person, account_code: str) -> AccountCustomer:
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
    payment_status: BookingPaymentStatus | None = None,
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
        fee_label="Member Weekend Rate",
        payment_status=payment_status,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def _auth_headers(client: TestClient, email: str, club_id: str) -> dict[str, str]:
    login = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}", "X-Club-Id": club_id}


def test_booking_finance_actions_post_charge_and_record_payment_happy_path(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="booking-finance-admin@example.com")
    customer = _create_person(db_session, email="booking-finance-customer@example.com")
    club = _create_club_with_config(db_session, name="Booking Finance Club", slug="booking-finance-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    account_customer = _create_account_customer(db_session, club=club, person=customer, account_code="MEM-100")
    account = _create_finance_account(db_session, club=club, account_customer=account_customer)
    course = _create_course(db_session, club=club, name="North")
    booking = _create_booking(db_session, club=club, course=course, person=customer)
    headers = _auth_headers(client, admin.email, str(club.id))

    charge_response = client.post(
        f"/api/golf/bookings/{booking.id}/post-charge",
        headers=headers,
        json={"amount": "85.00"},
    )
    assert charge_response.status_code == 200
    charge_payload = charge_response.json()
    assert charge_payload["decision"] == "allowed"
    assert charge_payload["posting_applied"] is True
    assert charge_payload["booking"]["payment_status"] == "pending"
    assert charge_payload["transaction"]["type"] == "charge"
    assert charge_payload["transaction"]["source"] == "booking"
    assert charge_payload["transaction"]["amount"] == "-85.00"
    assert charge_payload["balance"] == "-85.00"

    record_response = client.post(
        f"/api/golf/bookings/{booking.id}/record-payment",
        headers=headers,
        json={},
    )
    assert record_response.status_code == 200
    record_payload = record_response.json()
    assert record_payload["decision"] == "allowed"
    assert record_payload["settlement_applied"] is True
    assert record_payload["booking"]["payment_status"] == "paid"
    assert record_payload["transaction"]["type"] == "payment"
    assert record_payload["transaction"]["source"] == "booking"
    assert record_payload["transaction"]["amount"] == "85.00"
    assert record_payload["balance"] == "0.00"

    persisted_booking = db_session.get(Booking, booking.id)
    assert persisted_booking is not None
    assert persisted_booking.payment_status == BookingPaymentStatus.PAID

    transactions = list(
        db_session.scalars(
            select(FinanceTransaction)
            .where(FinanceTransaction.reference_id == booking.id)
            .order_by(FinanceTransaction.created_at.asc(), FinanceTransaction.id.asc())
        ).all()
    )
    assert len(transactions) == 2
    assert transactions[0].account_id == account.id
    assert transactions[0].type == FinanceTransactionType.CHARGE
    assert transactions[0].source == FinanceTransactionSource.BOOKING
    assert transactions[1].type == FinanceTransactionType.PAYMENT
    assert transactions[1].source == FinanceTransactionSource.BOOKING


def test_booking_finance_actions_allow_marking_booking_complimentary(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="booking-finance-status-admin@example.com")
    customer = _create_person(db_session, email="booking-finance-status-customer@example.com")
    club = _create_club_with_config(db_session, name="Booking Status Club", slug="booking-status-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    course = _create_course(db_session, club=club, name="North")
    booking = _create_booking(db_session, club=club, course=course, person=customer)
    headers = _auth_headers(client, admin.email, str(club.id))

    response = client.patch(
        f"/api/golf/bookings/{booking.id}/payment-status",
        headers=headers,
        json={"payment_status": "complimentary"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "allowed"
    assert payload["update_applied"] is True
    assert payload["booking"]["payment_status"] == "complimentary"

    persisted_booking = db_session.get(Booking, booking.id)
    assert persisted_booking is not None
    assert persisted_booking.payment_status == BookingPaymentStatus.COMPLIMENTARY
    assert len(db_session.scalars(select(FinanceTransaction)).all()) == 0


def test_booking_finance_actions_require_operations_write_access(
    client: TestClient,
    db_session: Session,
) -> None:
    member_user = _create_user(db_session, email="booking-finance-member@example.com")
    customer = _create_person(db_session, email="booking-finance-member-customer@example.com")
    club = _create_club_with_config(db_session, name="Booking RBAC Club", slug="booking-rbac-club")
    _assign_membership(db_session, user=member_user, club=club, role=ClubMembershipRole.MEMBER)
    course = _create_course(db_session, club=club, name="North")
    booking = _create_booking(db_session, club=club, course=course, person=customer)
    headers = _auth_headers(client, member_user.email, str(club.id))

    response = client.patch(
        f"/api/golf/bookings/{booking.id}/payment-status",
        headers=headers,
        json={"payment_status": "waived"},
    )
    assert response.status_code == 403


def test_booking_finance_actions_are_scoped_to_the_selected_club(
    client: TestClient,
    db_session: Session,
) -> None:
    admin_a = _create_user(db_session, email="booking-finance-club-a@example.com")
    admin_b = _create_user(db_session, email="booking-finance-club-b@example.com")
    customer = _create_person(db_session, email="booking-finance-cross-club@example.com")
    club_a = _create_club_with_config(db_session, name="Booking Club A", slug="booking-club-a")
    club_b = _create_club_with_config(db_session, name="Booking Club B", slug="booking-club-b")
    _assign_membership(db_session, user=admin_a, club=club_a, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=admin_b, club=club_b, role=ClubMembershipRole.CLUB_ADMIN)
    account_customer = _create_account_customer(db_session, club=club_a, person=customer, account_code="MEM-200")
    _create_finance_account(db_session, club=club_a, account_customer=account_customer)
    course = _create_course(db_session, club=club_a, name="North")
    booking = _create_booking(db_session, club=club_a, course=course, person=customer)
    headers_b = _auth_headers(client, admin_b.email, str(club_b.id))

    response = client.post(
        f"/api/golf/bookings/{booking.id}/post-charge",
        headers=headers_b,
        json={"amount": "65.00"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    assert payload["posting_applied"] is False
    assert payload["failures"][0]["code"] == "booking_not_found"

    assert len(db_session.scalars(select(FinanceTransaction)).all()) == 0
