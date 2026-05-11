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
    FinanceTransactionType,
    Person,
    User,
)

# ---------------------------------------------------------------------------
# Helpers (mirrored from test_booking_finance_actions.py — not extracted to
# a shared fixture so each test module remains self-contained and readable)
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


def _create_account_customer(
    db: Session, *, club: Club, person: Person, account_code: str
) -> AccountCustomer:
    ac = AccountCustomer(
        club_id=club.id,
        person_id=person.id,
        account_code=account_code,
        active=True,
        billing_metadata={},
    )
    db.add(ac)
    db.commit()
    db.refresh(ac)
    return ac


def _create_finance_account(
    db: Session,
    *,
    club: Club,
    account_customer: AccountCustomer,
    status: FinanceAccountStatus = FinanceAccountStatus.ACTIVE,
) -> FinanceAccount:
    account = FinanceAccount(
        club_id=club.id, account_customer_id=account_customer.id, status=status
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
    fee_amount: str | None = "450.00",
    payment_status: BookingPaymentStatus | None = None,
) -> Booking:
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=None,
        slot_datetime=datetime.fromisoformat("2026-04-15T09:00:00+02:00"),
        slot_interval_minutes=10,
        status=BookingStatus.RESERVED,
        source=BookingSource.ADMIN,
        party_size=1,
        primary_person_id=person.id,
        primary_membership_id=None,
        fee_label="Member Rate",
        fee_amount=fee_amount,
        fee_currency="ZAR",
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


def _post_charge_and_record_payment(
    client: TestClient,
    headers: dict[str, str],
    booking_id: str,
    amount: str = "450.00",
) -> None:
    charge = client.post(
        f"/api/golf/bookings/{booking_id}/post-charge", headers=headers, json={"amount": amount}
    )
    assert charge.status_code == 200
    assert charge.json()["decision"] == "allowed"
    payment = client.post(
        f"/api/golf/bookings/{booking_id}/record-payment", headers=headers, json={}
    )
    assert payment.status_code == 200
    assert payment.json()["decision"] == "allowed"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_post_refund_full_amount_against_paid_booking(
    client: TestClient, db_session: Session
) -> None:
    """Full refund on a paid booking: appends REFUND transaction, reverts to PENDING."""
    admin = _create_user(db_session, email="refund-full-admin@example.com")
    customer = _create_person(db_session, email="refund-full-customer@example.com")
    club = _create_club_with_config(db_session, name="Refund Full Club", slug="refund-full-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    ac = _create_account_customer(db_session, club=club, person=customer, account_code="REF-001")
    _create_finance_account(db_session, club=club, account_customer=ac)
    course = _create_course(db_session, club=club, name="West")
    booking = _create_booking(
        db_session, club=club, course=course, person=customer, fee_amount="450.00"
    )
    headers = _auth_headers(client, admin.email, str(club.id))
    _post_charge_and_record_payment(client, headers, str(booking.id), amount="450.00")

    response = client.post(
        f"/api/golf/bookings/{booking.id}/post-refund",
        headers=headers,
        json={"amount": "450.00", "description": "Duplicate charge — full refund issued"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "allowed"
    assert payload["refund_applied"] is True
    assert payload["booking"]["payment_status"] == "pending"
    assert payload["transaction"]["type"] == "refund"
    assert payload["transaction"]["source"] == "booking"
    assert payload["transaction"]["amount"] == "450.00"
    # After charge(-450) + payment(+450) + refund(+450) = +450 credit balance
    assert payload["balance"] == "450.00"

    # Verify DB state: 3 transactions, correct types, append-only (none deleted/mutated)
    transactions = list(
        db_session.scalars(
            select(FinanceTransaction)
            .where(FinanceTransaction.reference_id == booking.id)
            .order_by(FinanceTransaction.created_at.asc(), FinanceTransaction.id.asc())
        ).all()
    )
    assert len(transactions) == 3
    types = [t.type for t in transactions]
    assert FinanceTransactionType.CHARGE in types
    assert FinanceTransactionType.PAYMENT in types
    assert FinanceTransactionType.REFUND in types

    db_session.expire_all()
    persisted = db_session.get(Booking, booking.id)
    assert persisted is not None
    assert persisted.payment_status == BookingPaymentStatus.PENDING


def test_post_refund_partial_amount_against_paid_booking(
    client: TestClient, db_session: Session
) -> None:
    """Partial refund (e.g. overcharge correction) appends REFUND for the delta."""
    admin = _create_user(db_session, email="refund-partial-admin@example.com")
    customer = _create_person(db_session, email="refund-partial-customer@example.com")
    club = _create_club_with_config(
        db_session, name="Refund Partial Club", slug="refund-partial-club"
    )
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    ac = _create_account_customer(db_session, club=club, person=customer, account_code="REF-002")
    _create_finance_account(db_session, club=club, account_customer=ac)
    course = _create_course(db_session, club=club, name="East")
    booking = _create_booking(
        db_session, club=club, course=course, person=customer, fee_amount="500.00"
    )
    headers = _auth_headers(client, admin.email, str(club.id))
    _post_charge_and_record_payment(client, headers, str(booking.id), amount="500.00")

    response = client.post(
        f"/api/golf/bookings/{booking.id}/post-refund",
        headers=headers,
        json={
            "amount": "50.00",
            "description": "Overcharge correction — member should have paid 450",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "allowed"
    assert payload["refund_applied"] is True
    assert payload["booking"]["payment_status"] == "pending"
    assert payload["transaction"]["type"] == "refund"
    assert payload["transaction"]["amount"] == "50.00"
    # charge(-500) + payment(+500) + refund(+50) = +50 credit
    assert payload["balance"] == "50.00"


def test_post_refund_defaults_to_full_charge_when_amount_omitted(
    client: TestClient, db_session: Session
) -> None:
    """Omitting amount defaults to the full original charge amount."""
    admin = _create_user(db_session, email="refund-default-admin@example.com")
    customer = _create_person(db_session, email="refund-default-customer@example.com")
    club = _create_club_with_config(
        db_session, name="Refund Default Club", slug="refund-default-club"
    )
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    ac = _create_account_customer(db_session, club=club, person=customer, account_code="REF-003")
    _create_finance_account(db_session, club=club, account_customer=ac)
    course = _create_course(db_session, club=club, name="South")
    booking = _create_booking(
        db_session, club=club, course=course, person=customer, fee_amount="380.00"
    )
    headers = _auth_headers(client, admin.email, str(club.id))
    _post_charge_and_record_payment(client, headers, str(booking.id), amount="380.00")

    response = client.post(
        f"/api/golf/bookings/{booking.id}/post-refund",
        headers=headers,
        json={},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "allowed"
    assert payload["refund_applied"] is True
    assert payload["transaction"]["amount"] == "380.00"


def test_post_refund_blocked_when_booking_not_paid(client: TestClient, db_session: Session) -> None:
    """Refund is blocked if the booking is not in PAID state (e.g. still PENDING)."""
    admin = _create_user(db_session, email="refund-notpaid-admin@example.com")
    customer = _create_person(db_session, email="refund-notpaid-customer@example.com")
    club = _create_club_with_config(
        db_session, name="Refund NotPaid Club", slug="refund-notpaid-club"
    )
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    ac = _create_account_customer(db_session, club=club, person=customer, account_code="REF-004")
    _create_finance_account(db_session, club=club, account_customer=ac)
    course = _create_course(db_session, club=club, name="North")
    # Booking has a charge posted (PENDING) but payment not yet recorded
    booking = _create_booking(
        db_session, club=club, course=course, person=customer, fee_amount="200.00"
    )
    headers = _auth_headers(client, admin.email, str(club.id))
    charge = client.post(
        f"/api/golf/bookings/{booking.id}/post-charge", headers=headers, json={"amount": "200.00"}
    )
    assert charge.json()["decision"] == "allowed"

    response = client.post(
        f"/api/golf/bookings/{booking.id}/post-refund",
        headers=headers,
        json={"amount": "200.00"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    assert payload["refund_applied"] is False
    failure_codes = [f["code"] for f in payload["failures"]]
    assert "booking_not_paid" in failure_codes


def test_post_refund_blocked_for_booking_not_in_club(
    client: TestClient, db_session: Session
) -> None:
    """Refund is blocked if the booking does not belong to the selected club."""
    admin = _create_user(db_session, email="refund-wrongclub-admin@example.com")
    customer = _create_person(db_session, email="refund-wrongclub-customer@example.com")
    club_a = _create_club_with_config(db_session, name="Refund Club A", slug="refund-club-a")
    club_b = _create_club_with_config(db_session, name="Refund Club B", slug="refund-club-b")
    _assign_membership(db_session, user=admin, club=club_a, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=admin, club=club_b, role=ClubMembershipRole.CLUB_ADMIN)
    course_b = _create_course(db_session, club=club_b, name="North B")
    booking_in_b = _create_booking(
        db_session, club=club_b, course=course_b, person=customer, fee_amount="300.00"
    )

    # Request uses club_a headers but booking belongs to club_b
    headers_a = _auth_headers(client, admin.email, str(club_a.id))
    response = client.post(
        f"/api/golf/bookings/{booking_in_b.id}/post-refund",
        headers=headers_a,
        json={"amount": "300.00"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    failure_codes = [f["code"] for f in payload["failures"]]
    assert "booking_not_found" in failure_codes


def test_post_refund_preserves_existing_transactions(
    client: TestClient, db_session: Session
) -> None:
    """Existing CHARGE and PAYMENT transactions are not mutated — append-only discipline."""
    admin = _create_user(db_session, email="refund-immutable-admin@example.com")
    customer = _create_person(db_session, email="refund-immutable-customer@example.com")
    club = _create_club_with_config(
        db_session, name="Refund Immutable Club", slug="refund-immutable-club"
    )
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    ac = _create_account_customer(db_session, club=club, person=customer, account_code="REF-005")
    _create_finance_account(db_session, club=club, account_customer=ac)
    course = _create_course(db_session, club=club, name="Central")
    booking = _create_booking(
        db_session, club=club, course=course, person=customer, fee_amount="600.00"
    )
    headers = _auth_headers(client, admin.email, str(club.id))
    _post_charge_and_record_payment(client, headers, str(booking.id), amount="600.00")

    before = list(
        db_session.scalars(
            select(FinanceTransaction)
            .where(FinanceTransaction.reference_id == booking.id)
            .order_by(FinanceTransaction.created_at.asc(), FinanceTransaction.id.asc())
        ).all()
    )
    before_ids = [str(t.id) for t in before]
    before_amounts = [str(t.amount) for t in before]

    client.post(
        f"/api/golf/bookings/{booking.id}/post-refund",
        headers=headers,
        json={"amount": "100.00"},
    )

    after = list(
        db_session.scalars(
            select(FinanceTransaction)
            .where(FinanceTransaction.reference_id == booking.id)
            .order_by(FinanceTransaction.created_at.asc(), FinanceTransaction.id.asc())
        ).all()
    )
    # Original two rows unchanged, one new row appended
    assert len(after) == 3
    assert [str(t.id) for t in after[:2]] == before_ids
    assert [str(t.amount) for t in after[:2]] == before_amounts
    assert after[2].type == FinanceTransactionType.REFUND
