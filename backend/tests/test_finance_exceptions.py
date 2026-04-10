from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Booking,
    BookingPaymentStatus,
    BookingSource,
    BookingStatus,
    Club,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Course,
    Order,
    OrderSource,
    OrderStatus,
    Person,
    User,
)


def _create_club(db: Session, *, slug: str, timezone: str = "Africa/Johannesburg") -> Club:
    club = Club(name=f"Club {slug}", slug=slug, timezone=timezone)
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _create_user(db: Session, *, email: str, club: Club, role: ClubMembershipRole) -> User:
    local = email.split("@")[0]
    person = Person(
        first_name=local.title(),
        last_name="Exc",
        full_name=build_full_name(local.title(), "Exc"),
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


def _create_person(db: Session, *, email: str) -> Person:
    local = email.split("@")[0]
    person = Person(
        first_name=local.title(),
        last_name="Player",
        full_name=build_full_name(local.title(), "Player"),
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        profile_metadata={},
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


def _create_course(db: Session, *, club: Club) -> Course:
    course = Course(club_id=club.id, name="Main", holes=18, active=True)
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
    slot_datetime: datetime,
    payment_status: BookingPaymentStatus | None = BookingPaymentStatus.PENDING,
    status: BookingStatus = BookingStatus.RESERVED,
) -> Booking:
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=None,
        slot_datetime=slot_datetime,
        slot_interval_minutes=10,
        status=status,
        source=BookingSource.ADMIN,
        party_size=2,
        primary_person_id=person.id,
        primary_membership_id=None,
        fee_label="Rate",
        payment_status=payment_status,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def _create_order(
    db: Session,
    *,
    club: Club,
    person: Person,
    created_at: datetime,
    status: OrderStatus = OrderStatus.PLACED,
) -> Order:
    order = Order(
        club_id=club.id,
        person_id=person.id,
        source=OrderSource.STAFF,
        status=status,
        created_at=created_at,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def _auth_headers(client: TestClient, *, email: str, club_id: uuid.UUID) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return {
        "Authorization": f"Bearer {response.json()['access_token']}",
        "X-Club-Id": str(club_id),
    }


# South Africa is UTC+2 so 2026-04-10T06:00:00 SAST = 2026-04-10T04:00:00 UTC
_TARGET_DATE = "2026-04-10"
_SLOT_UTC = datetime(2026, 4, 10, 6, 0, 0, tzinfo=UTC)   # 08:00 SAST on target date
_ORDER_UTC = datetime(2026, 4, 10, 8, 0, 0, tzinfo=UTC)  # 10:00 SAST on target date
_NEXT_DAY_UTC = datetime(2026, 4, 11, 4, 0, 0, tzinfo=UTC)  # 06:00 SAST next day (outside window)


def test_exceptions_returns_unpaid_bookings_and_unresolved_orders(
    client: TestClient,
    db_session: Session,
) -> None:
    slug = f"exc-happy-{uuid.uuid4().hex[:6]}"
    club = _create_club(db_session, slug=slug)
    admin = _create_user(db_session, email=f"exc_admin_{uuid.uuid4().hex[:6]}@test.com", club=club, role=ClubMembershipRole.CLUB_ADMIN)
    player = _create_person(db_session, email=f"exc_player_{uuid.uuid4().hex[:6]}@test.com")
    course = _create_course(db_session, club=club)
    headers = _auth_headers(client, email=admin.email, club_id=club.id)

    # Unpaid booking on target date — should appear
    _create_booking(db_session, club=club, course=course, person=player, slot_datetime=_SLOT_UTC, payment_status=BookingPaymentStatus.PENDING)
    # Paid booking on target date — should NOT appear
    _create_booking(db_session, club=club, course=course, person=player, slot_datetime=_SLOT_UTC, payment_status=BookingPaymentStatus.PAID)
    # Cancelled booking (unpaid) on target date — should NOT appear
    _create_booking(db_session, club=club, course=course, person=player, slot_datetime=_SLOT_UTC, payment_status=BookingPaymentStatus.PENDING, status=BookingStatus.CANCELLED)
    # Unpaid booking on next day — should NOT appear
    _create_booking(db_session, club=club, course=course, person=player, slot_datetime=_NEXT_DAY_UTC, payment_status=BookingPaymentStatus.PENDING)

    # Unresolved order on target date — should appear
    _create_order(db_session, club=club, person=player, created_at=_ORDER_UTC, status=OrderStatus.PLACED)
    # Collected order on target date — should NOT appear
    _create_order(db_session, club=club, person=player, created_at=_ORDER_UTC, status=OrderStatus.COLLECTED)
    # Cancelled order on target date — should NOT appear
    _create_order(db_session, club=club, person=player, created_at=_ORDER_UTC, status=OrderStatus.CANCELLED)

    response = client.get(f"/api/finance/exceptions?date={_TARGET_DATE}", headers=headers)
    assert response.status_code == 200
    data = response.json()

    assert data["date"] == _TARGET_DATE
    assert len(data["unpaid_bookings"]) == 1
    assert len(data["unresolved_orders"]) == 1
    assert data["total_exception_count"] == 2


def test_exceptions_returns_empty_when_no_exceptions(
    client: TestClient,
    db_session: Session,
) -> None:
    slug = f"exc-empty-{uuid.uuid4().hex[:6]}"
    club = _create_club(db_session, slug=slug)
    admin = _create_user(db_session, email=f"exc_empty_admin_{uuid.uuid4().hex[:6]}@test.com", club=club, role=ClubMembershipRole.CLUB_ADMIN)
    headers = _auth_headers(client, email=admin.email, club_id=club.id)

    response = client.get(f"/api/finance/exceptions?date={_TARGET_DATE}", headers=headers)
    assert response.status_code == 200
    data = response.json()

    assert data["date"] == _TARGET_DATE
    assert data["unpaid_bookings"] == []
    assert data["unresolved_orders"] == []
    assert data["total_exception_count"] == 0


def test_exceptions_tenant_isolation(
    client: TestClient,
    db_session: Session,
) -> None:
    slug_a = f"exc-iso-a-{uuid.uuid4().hex[:6]}"
    slug_b = f"exc-iso-b-{uuid.uuid4().hex[:6]}"
    club_a = _create_club(db_session, slug=slug_a)
    club_b = _create_club(db_session, slug=slug_b)
    admin_a = _create_user(db_session, email=f"exc_iso_a_{uuid.uuid4().hex[:6]}@test.com", club=club_a, role=ClubMembershipRole.CLUB_ADMIN)
    player = _create_person(db_session, email=f"exc_iso_player_{uuid.uuid4().hex[:6]}@test.com")
    course_b = _create_course(db_session, club=club_b)

    # Unpaid booking and unresolved order belong to club_b, not club_a
    _create_booking(db_session, club=club_b, course=course_b, person=player, slot_datetime=_SLOT_UTC, payment_status=BookingPaymentStatus.PENDING)
    _create_order(db_session, club=club_b, person=player, created_at=_ORDER_UTC, status=OrderStatus.PLACED)

    # Query as admin of club_a — should see nothing from club_b
    headers_a = _auth_headers(client, email=admin_a.email, club_id=club_a.id)
    response = client.get(f"/api/finance/exceptions?date={_TARGET_DATE}", headers=headers_a)
    assert response.status_code == 200
    data = response.json()

    assert data["total_exception_count"] == 0
    assert data["unpaid_bookings"] == []
    assert data["unresolved_orders"] == []


def test_exceptions_requires_auth(
    client: TestClient,
    db_session: Session,
) -> None:
    slug = f"exc-noauth-{uuid.uuid4().hex[:6]}"
    club = _create_club(db_session, slug=slug)
    response = client.get(f"/api/finance/exceptions?date={_TARGET_DATE}", headers={"X-Club-Id": str(club.id)})
    assert response.status_code == 401
