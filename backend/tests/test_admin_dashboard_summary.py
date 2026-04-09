from __future__ import annotations

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
    ClubConfig,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Course,
    Person,
    User,
)
from app.services import admin_dashboard_service as dashboard_service_module

OPERATING_HOURS = {
    day: {"open": "06:00", "close": "18:00", "closed": False}
    for day in (
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    )
}


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


def _create_club(db: Session, *, name: str, slug: str) -> Club:
    club = Club(name=name, slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _assign_membership(db: Session, *, user: User, club: Club) -> None:
    db.add(
        ClubMembership(
            person_id=user.person_id,
            club_id=club.id,
            role=ClubMembershipRole.CLUB_ADMIN,
            status=ClubMembershipStatus.ACTIVE,
            is_primary=True,
        )
    )
    db.commit()


def _seed_club_config(db: Session, *, club: Club) -> None:
    db.add(
        ClubConfig(
            club_id=club.id,
            timezone="Africa/Johannesburg",
            operating_hours=OPERATING_HOURS,
            default_slot_interval_minutes=10,
        )
    )
    db.commit()


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
    slot_datetime: datetime,
    status: BookingStatus,
    payment_status: BookingPaymentStatus | None,
) -> None:
    db.add(
        Booking(
            club_id=club.id,
            course_id=course.id,
            tee_id=None,
            start_lane=None,
            slot_datetime=slot_datetime,
            slot_interval_minutes=10,
            status=status,
            source=BookingSource.ADMIN,
            party_size=2,
            payment_status=payment_status,
            cart_flag=False,
            caddie_flag=False,
        )
    )
    db.commit()


def _login(client: TestClient, email: str) -> dict[str, object]:
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return response.json()


class _FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):  # type: ignore[override]
        frozen = cls(2026, 4, 9, 10, 0, tzinfo=UTC)
        return frozen.astimezone(tz) if tz is not None else frozen.replace(tzinfo=None)


def test_dashboard_summary_returns_today_operational_counts_without_cross_tenant_or_old_day_drift(
    client: TestClient,
    db_session: Session,
    monkeypatch,
) -> None:
    monkeypatch.setattr(dashboard_service_module, "datetime", _FrozenDateTime)

    user = _create_user(db_session, email="dashboard-admin@example.com")
    club = _create_club(db_session, name="Main Club", slug="main-club")
    other_club = _create_club(db_session, name="Other Club", slug="other-club")
    _assign_membership(db_session, user=user, club=club)
    _seed_club_config(db_session, club=club)
    _seed_club_config(db_session, club=other_club)
    course = _create_course(db_session, club=club, name="Main Course")
    other_course = _create_course(db_session, club=other_club, name="Other Course")

    _create_booking(
        db_session,
        club=club,
        course=course,
        slot_datetime=datetime(2026, 4, 9, 7, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
        payment_status=BookingPaymentStatus.PENDING,
    )
    _create_booking(
        db_session,
        club=club,
        course=course,
        slot_datetime=datetime(2026, 4, 9, 8, 30, tzinfo=UTC),
        status=BookingStatus.CHECKED_IN,
        payment_status=BookingPaymentStatus.PENDING,
    )
    _create_booking(
        db_session,
        club=club,
        course=course,
        slot_datetime=datetime(2026, 4, 9, 11, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
        payment_status=BookingPaymentStatus.PAID,
    )
    _create_booking(
        db_session,
        club=club,
        course=course,
        slot_datetime=datetime(2026, 4, 9, 6, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
        payment_status=BookingPaymentStatus.PAID,
    )
    _create_booking(
        db_session,
        club=club,
        course=course,
        slot_datetime=datetime(2026, 4, 9, 9, 0, tzinfo=UTC),
        status=BookingStatus.CANCELLED,
        payment_status=BookingPaymentStatus.PENDING,
    )
    _create_booking(
        db_session,
        club=club,
        course=course,
        slot_datetime=datetime(2026, 4, 8, 7, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
        payment_status=BookingPaymentStatus.PENDING,
    )
    _create_booking(
        db_session,
        club=club,
        course=course,
        slot_datetime=datetime(2026, 4, 8, 6, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
        payment_status=BookingPaymentStatus.PAID,
    )
    _create_booking(
        db_session,
        club=club,
        course=course,
        slot_datetime=datetime(2026, 4, 9, 12, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
        payment_status=BookingPaymentStatus.PAID,
    )
    _create_booking(
        db_session,
        club=other_club,
        course=other_course,
        slot_datetime=datetime(2026, 4, 9, 7, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
        payment_status=BookingPaymentStatus.PENDING,
    )
    _create_booking(
        db_session,
        club=other_club,
        course=other_course,
        slot_datetime=datetime(2026, 4, 9, 6, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
        payment_status=BookingPaymentStatus.PAID,
    )

    login = _login(client, "dashboard-admin@example.com")
    response = client.get(
        f"/api/admin/dashboard/summary?selected_club_id={club.id}",
        headers={"Authorization": f"Bearer {login['access_token']}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["member_count"] == 1
    assert "tee_occupancy" in payload
    assert "tee_warnings" in payload
    assert "recent_activity" in payload
    assert "active_targets" in payload
    assert payload["unpaid_bookings_today"] == 2
    assert payload["no_show_risk_count"] == 2
    assert payload["close_day_ready"] is False
