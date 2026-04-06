from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Booking,
    BookingParticipant,
    BookingParticipantType,
    BookingSource,
    BookingStatus,
    Club,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Course,
    Person,
    Tee,
    User,
)


def _create_club(db: Session, *, slug: str) -> Club:
    club = Club(name=f"Club {slug}", slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _create_user(db: Session, *, email: str, role: ClubMembershipRole, club: Club) -> tuple[User, ClubMembership]:
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
        is_primary=True,
    )
    db.add(membership)
    db.commit()
    db.refresh(user)
    db.refresh(membership)
    return user, membership


def _create_course_and_tee(db: Session, *, club: Club) -> tuple[Course, Tee]:
    course = Course(club_id=club.id, name="North Course", holes=18, active=True)
    db.add(course)
    db.flush()
    tee = Tee(
        course_id=course.id,
        name="Blue",
        gender="mixed",
        slope_rating=120,
        course_rating=72.1,
        color_code="#1D4ED8",
        active=True,
    )
    db.add(tee)
    db.commit()
    db.refresh(course)
    db.refresh(tee)
    return course, tee


def _create_booking(
    db: Session,
    *,
    club: Club,
    course: Course,
    tee: Tee,
    membership: ClubMembership,
    slot_datetime: datetime,
    status: BookingStatus,
    source: BookingSource = BookingSource.MEMBER_PORTAL,
    party_size: int = 1,
    guest_name: str | None = None,
) -> Booking:
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=tee.id,
        slot_datetime=slot_datetime,
        slot_interval_minutes=10,
        status=status,
        source=source,
        party_size=party_size,
        primary_person_id=membership.person_id,
        primary_membership_id=membership.id,
    )
    db.add(booking)
    db.flush()
    db.add(
        BookingParticipant(
            booking_id=booking.id,
            person_id=membership.person_id,
            club_membership_id=membership.id,
            participant_type=BookingParticipantType.MEMBER,
            display_name="Avery Player",
            sort_order=0,
            is_primary=True,
        )
    )
    if guest_name is not None:
        db.add(
            BookingParticipant(
                booking_id=booking.id,
                person_id=None,
                club_membership_id=None,
                participant_type=BookingParticipantType.GUEST,
                display_name=guest_name,
                guest_name=guest_name,
                sort_order=1,
                is_primary=False,
            )
        )
    db.commit()
    db.refresh(booking)
    return booking


def _auth_headers(client: TestClient, *, email: str, club_id: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}", "X-Club-Id": club_id}


def test_member_booking_read_model_returns_upcoming_and_history(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"player-rm-{uuid.uuid4().hex[:6]}")
    member, membership = _create_user(
        db_session,
        email=f"player_rm_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.MEMBER,
        club=club,
    )
    course, tee = _create_course_and_tee(db_session, club=club)

    upcoming = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership,
        slot_datetime=datetime(2026, 4, 12, 8, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
        party_size=2,
        guest_name="Chris Guest",
    )
    _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership,
        slot_datetime=datetime(2026, 4, 7, 8, 0, tzinfo=UTC),
        status=BookingStatus.COMPLETED,
    )
    cancelled_future = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership,
        slot_datetime=datetime(2026, 4, 15, 8, 0, tzinfo=UTC),
        status=BookingStatus.CANCELLED,
    )

    headers = _auth_headers(client, email=member.email, club_id=str(club.id))
    response = client.get(
        "/api/golf/bookings/player",
        headers=headers,
        params={"reference_datetime": "2026-04-10T10:00:00+02:00"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["timezone"] == "Africa/Johannesburg"
    assert [item["id"] for item in payload["upcoming"]] == [str(upcoming.id)]
    assert payload["upcoming"][0]["course_name"] == "North Course"
    assert payload["upcoming"][0]["tee_name"] == "Blue"
    assert payload["upcoming"][0]["local_date"] == "2026-04-12"
    assert payload["upcoming"][0]["local_time"] == "10:00"
    assert payload["upcoming"][0]["primary_participant_name"] == "Avery Player"
    assert payload["upcoming"][0]["participant_names"] == ["Avery Player", "Chris Guest"]
    assert payload["upcoming"][0]["party_size"] == 2
    assert [item["id"] for item in payload["history"]] == [str(cancelled_future.id), payload["history"][1]["id"]]
    assert payload["history"][0]["status"] == "cancelled"
    assert payload["history"][1]["status"] == "completed"


def test_player_booking_read_model_is_member_only(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"player-auth-{uuid.uuid4().hex[:6]}")
    admin, _membership = _create_user(
        db_session,
        email=f"player_admin_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.CLUB_ADMIN,
        club=club,
    )
    headers = _auth_headers(client, email=admin.email, club_id=str(club.id))

    response = client.get("/api/golf/bookings/player", headers=headers)

    assert response.status_code == 403
