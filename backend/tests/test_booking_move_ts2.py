"""TS-2: Booking move backend command surface.

Tests:
- valid same-day move (time change) — booking is updated, tee sheet reflects new slot
- valid same-day move (lane change) — start_lane updated
- blocked: target slot manually_blocked
- blocked: target slot competition_controlled
- blocked: target slot reserved_state_active
- blocked: target slot capacity exceeded
- blocked: move crosses day boundary
- blocked: no-op move (same slot/lane/tee)
- blocked: booking in non-moveable status (cancelled)
- lifecycle transition safety: only reserved/checked_in are moveable
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select
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
    ClubConfig,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Course,
    Person,
    StartLane,
    Tee,
    TeeSheetSlotState,
    User,
)


# ---------------------------------------------------------------------------
# Shared fixtures
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


def _setup_club(db: Session, *, name: str, slug: str) -> tuple[Club, Course, Tee]:
    club = Club(name=name, slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.flush()
    db.add(
        ClubConfig(
            club_id=club.id,
            timezone="Africa/Johannesburg",
            operating_hours={
                day: {"open": "06:00", "close": "12:00", "closed": False}
                for day in [
                    "monday", "tuesday", "wednesday", "thursday",
                    "friday", "saturday", "sunday",
                ]
            },
            booking_window_days=14,
            cancellation_policy_hours=24,
            default_slot_interval_minutes=30,
        )
    )
    course = Course(club_id=club.id, name="Main", holes=18, active=True)
    db.add(course)
    db.flush()
    tee = Tee(
        course_id=course.id,
        name="Blue",
        gender="men",
        slope_rating=128,
        course_rating="72.4",
        color_code="#1b4d8f",
        active=True,
    )
    db.add(tee)
    db.commit()
    db.refresh(club)
    db.refresh(course)
    db.refresh(tee)
    return club, course, tee


def _create_admin(db: Session, *, email: str, club: Club) -> User:
    user = _create_user(db, email=email)
    db.add(
        ClubMembership(
            person_id=user.person_id,
            club_id=club.id,
            role=ClubMembershipRole.CLUB_ADMIN,
            status=ClubMembershipStatus.ACTIVE,
        )
    )
    db.commit()
    return user


def _create_booking(
    db: Session,
    *,
    club: Club,
    course: Course,
    tee: Tee,
    person_id: object,
    slot_datetime: datetime,
    status: BookingStatus = BookingStatus.RESERVED,
    start_lane: StartLane | None = None,
    party_size: int = 2,
) -> Booking:
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=tee.id,
        start_lane=start_lane,
        slot_datetime=slot_datetime,
        slot_interval_minutes=30,
        status=status,
        source=BookingSource.ADMIN,
        party_size=party_size,
        primary_person_id=person_id,
    )
    db.add(booking)
    db.flush()
    db.add(
        BookingParticipant(
            booking_id=booking.id,
            person_id=person_id,
            participant_type=BookingParticipantType.MEMBER,
            display_name="Test Member",
            sort_order=0,
            is_primary=True,
        )
    )
    db.commit()
    db.refresh(booking)
    return booking


def _auth_headers(client: TestClient, email: str, club_id: str) -> dict[str, str]:
    login = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}", "X-Club-Id": club_id}


# Johannesburg is UTC+2
# 06:00 local = 04:00 UTC
SLOT_0600 = datetime(2026, 4, 6, 4, 0, tzinfo=UTC)   # 06:00 local Monday
SLOT_0630 = datetime(2026, 4, 6, 4, 30, tzinfo=UTC)  # 06:30 local Monday
SLOT_0700 = datetime(2026, 4, 6, 5, 0, tzinfo=UTC)   # 07:00 local Monday
SLOT_NEXT_DAY = datetime(2026, 4, 7, 4, 0, tzinfo=UTC)  # Tuesday


# ---------------------------------------------------------------------------
# Valid move tests
# ---------------------------------------------------------------------------


def test_move_booking_valid_time_change(client: TestClient, db_session: Session) -> None:
    """A reserved booking can be moved to a different same-day slot."""
    club, course, tee = _setup_club(db_session, name="Move Club A", slug="move-club-a")
    admin = _create_admin(db_session, email="move-admin-a@example.com", club=club)
    booking = _create_booking(
        db_session, club=club, course=course, tee=tee,
        person_id=admin.person_id, slot_datetime=SLOT_0600, party_size=2,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={"target_slot_datetime": SLOT_0630.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "allowed"


def test_move_capacity_is_lane_aware(
    client: TestClient, db_session: Session
) -> None:
    club, course, tee = _setup_club(db_session, name="Move Club M", slug="move-club-m")
    admin = _create_admin(db_session, email="move-admin-m@example.com", club=club)
    booking = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        person_id=admin.person_id,
        slot_datetime=SLOT_0600,
        start_lane=StartLane.HOLE_1,
        party_size=2,
    )
    other_user = _create_user(db_session, email="move-other-m@example.com")
    db_session.add(
        ClubMembership(
            person_id=other_user.person_id,
            club_id=club.id,
            role=ClubMembershipRole.MEMBER,
            status=ClubMembershipStatus.ACTIVE,
        )
    )
    db_session.flush()
    db_session.add(
        Booking(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            start_lane=StartLane.HOLE_1,
            slot_datetime=SLOT_0630,
            slot_interval_minutes=30,
            status=BookingStatus.RESERVED,
            source=BookingSource.ADMIN,
            party_size=3,
            primary_person_id=other_user.person_id,
        )
    )
    db_session.add_all([
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            start_lane=StartLane.HOLE_1,
            slot_datetime=SLOT_0630,
            player_capacity=4,
        ),
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            start_lane=StartLane.HOLE_10,
            slot_datetime=SLOT_0630,
            player_capacity=4,
        ),
    ])
    db_session.commit()

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={"target_slot_datetime": SLOT_0630.isoformat(), "target_start_lane": "hole_10"},
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "allowed"
    assert payload["booking"]["start_lane"] == "hole_10"


def test_move_block_state_is_lane_aware(
    client: TestClient, db_session: Session
) -> None:
    club, course, tee = _setup_club(db_session, name="Move Club N", slug="move-club-n")
    admin = _create_admin(db_session, email="move-admin-n@example.com", club=club)
    booking = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        person_id=admin.person_id,
        slot_datetime=SLOT_0600,
        start_lane=StartLane.HOLE_1,
        party_size=1,
    )
    db_session.add_all([
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            start_lane=StartLane.HOLE_1,
            slot_datetime=SLOT_0630,
            player_capacity=4,
        ),
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            start_lane=StartLane.HOLE_10,
            slot_datetime=SLOT_0630,
            manually_blocked=True,
            blocked_reason="10th tee closed",
        ),
    ])
    db_session.commit()

    headers = _auth_headers(client, admin.email, str(club.id))
    blocked = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={"target_slot_datetime": SLOT_0630.isoformat(), "target_start_lane": "hole_10"},
        headers=headers,
    )
    assert blocked.status_code == 200
    blocked_payload = blocked.json()
    assert blocked_payload["decision"] == "blocked"
    assert blocked_payload["failures"][0]["code"] == "target_slot_manually_blocked"

    allowed = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={"target_slot_datetime": SLOT_0630.isoformat(), "target_start_lane": "hole_1"},
        headers=headers,
    )
    assert allowed.status_code == 200
    allowed_payload = allowed.json()
    assert allowed_payload["decision"] == "allowed"


def test_move_booking_valid_lane_change(client: TestClient, db_session: Session) -> None:
    """A booking can be moved to a different lane at the same time."""
    club, course, tee = _setup_club(db_session, name="Move Club B", slug="move-club-b")
    admin = _create_admin(db_session, email="move-admin-b@example.com", club=club)
    booking = _create_booking(
        db_session, club=club, course=course, tee=tee,
        person_id=admin.person_id, slot_datetime=SLOT_0600,
        start_lane=StartLane.HOLE_1, party_size=1,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={
            "target_slot_datetime": SLOT_0600.isoformat(),
            "target_start_lane": "hole_10",
        },
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "allowed"
    assert payload["transition_applied"] is True
    assert payload["booking"]["start_lane"] == "hole_10"


def test_move_checked_in_booking_is_allowed(client: TestClient, db_session: Session) -> None:
    """Checked-in bookings are also moveable."""
    club, course, tee = _setup_club(db_session, name="Move Club C", slug="move-club-c")
    admin = _create_admin(db_session, email="move-admin-c@example.com", club=club)
    booking = _create_booking(
        db_session, club=club, course=course, tee=tee,
        person_id=admin.person_id, slot_datetime=SLOT_0600,
        status=BookingStatus.CHECKED_IN, party_size=1,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={"target_slot_datetime": SLOT_0700.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "allowed"
    assert payload["transition_applied"] is True


# ---------------------------------------------------------------------------
# Rejection tests — each must carry a reason code
# ---------------------------------------------------------------------------


def test_move_blocked_target_manually_blocked(client: TestClient, db_session: Session) -> None:
    """Move to a manually blocked slot is rejected with reason."""
    club, course, tee = _setup_club(db_session, name="Move Club D", slug="move-club-d")
    admin = _create_admin(db_session, email="move-admin-d@example.com", club=club)
    booking = _create_booking(
        db_session, club=club, course=course, tee=tee,
        person_id=admin.person_id, slot_datetime=SLOT_0600, party_size=1,
    )
    db_session.add(
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=SLOT_0630,
            manually_blocked=True,
            blocked_reason="Course maintenance",
        )
    )
    db_session.commit()

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={"target_slot_datetime": SLOT_0630.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    assert payload["transition_applied"] is False
    assert any(f["code"] == "target_slot_manually_blocked" for f in payload["failures"])
    assert "Course maintenance" in payload["failures"][0]["message"]


def test_move_blocked_target_competition_controlled(client: TestClient, db_session: Session) -> None:
    """Move to a competition-controlled slot is rejected."""
    club, course, tee = _setup_club(db_session, name="Move Club E", slug="move-club-e")
    admin = _create_admin(db_session, email="move-admin-e@example.com", club=club)
    booking = _create_booking(
        db_session, club=club, course=course, tee=tee,
        person_id=admin.person_id, slot_datetime=SLOT_0600, party_size=1,
    )
    db_session.add(
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=SLOT_0630,
            competition_controlled=True,
        )
    )
    db_session.commit()

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={"target_slot_datetime": SLOT_0630.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    assert any(f["code"] == "target_slot_competition_controlled" for f in payload["failures"])


def test_move_blocked_capacity_exceeded(client: TestClient, db_session: Session) -> None:
    """Move is rejected when target slot is at capacity."""
    club, course, tee = _setup_club(db_session, name="Move Club F", slug="move-club-f")
    admin = _create_admin(db_session, email="move-admin-f@example.com", club=club)

    # Booking to be moved (party_size=2)
    booking = _create_booking(
        db_session, club=club, course=course, tee=tee,
        person_id=admin.person_id, slot_datetime=SLOT_0600, party_size=2,
    )
    # Target slot already has 3 players, capacity is 4 — moving 2 would overflow
    other_user = _create_user(db_session, email="move-other-f@example.com")
    db_session.add(
        ClubMembership(
            person_id=other_user.person_id,
            club_id=club.id,
            role=ClubMembershipRole.MEMBER,
            status=ClubMembershipStatus.ACTIVE,
        )
    )
    db_session.flush()
    existing_booking = Booking(
        club_id=club.id, course_id=course.id, tee_id=tee.id,
        slot_datetime=SLOT_0630, slot_interval_minutes=30,
        status=BookingStatus.RESERVED, source=BookingSource.ADMIN,
        party_size=3, primary_person_id=other_user.person_id,
    )
    db_session.add(existing_booking)
    db_session.add(
        TeeSheetSlotState(
            club_id=club.id, course_id=course.id, tee_id=tee.id,
            slot_datetime=SLOT_0630, player_capacity=4,
        )
    )
    db_session.commit()

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={"target_slot_datetime": SLOT_0630.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    assert any(f["code"] == "target_slot_capacity_exceeded" for f in payload["failures"])
    assert "1 player spot(s) remaining" in payload["failures"][0]["message"]


def test_move_blocked_crosses_day_boundary(client: TestClient, db_session: Session) -> None:
    """Move to a different day is rejected."""
    club, course, tee = _setup_club(db_session, name="Move Club G", slug="move-club-g")
    admin = _create_admin(db_session, email="move-admin-g@example.com", club=club)
    booking = _create_booking(
        db_session, club=club, course=course, tee=tee,
        person_id=admin.person_id, slot_datetime=SLOT_0600, party_size=1,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={"target_slot_datetime": SLOT_NEXT_DAY.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    assert any(f["code"] == "move_crosses_day_boundary" for f in payload["failures"])


def test_move_blocked_no_op(client: TestClient, db_session: Session) -> None:
    """Move to same slot, lane, and tee is rejected as no-op."""
    club, course, tee = _setup_club(db_session, name="Move Club H", slug="move-club-h")
    admin = _create_admin(db_session, email="move-admin-h@example.com", club=club)
    booking = _create_booking(
        db_session, club=club, course=course, tee=tee,
        person_id=admin.person_id, slot_datetime=SLOT_0600,
        start_lane=StartLane.HOLE_1, party_size=1,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={
            "target_slot_datetime": SLOT_0600.isoformat(),
            "target_start_lane": "hole_1",
            "target_tee_id": str(tee.id),
        },
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    assert any(f["code"] == "move_is_no_op" for f in payload["failures"])


def test_move_blocked_cancelled_booking(client: TestClient, db_session: Session) -> None:
    """Cancelled booking cannot be moved."""
    club, course, tee = _setup_club(db_session, name="Move Club I", slug="move-club-i")
    admin = _create_admin(db_session, email="move-admin-i@example.com", club=club)
    booking = _create_booking(
        db_session, club=club, course=course, tee=tee,
        person_id=admin.person_id, slot_datetime=SLOT_0600,
        status=BookingStatus.CANCELLED, party_size=1,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={"target_slot_datetime": SLOT_0630.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    assert any(f["code"] == "booking_status_not_moveable" for f in payload["failures"])
    assert payload["failures"][0]["current_status"] == "cancelled"


def test_move_blocked_completed_booking(client: TestClient, db_session: Session) -> None:
    """Completed booking cannot be moved."""
    club, course, tee = _setup_club(db_session, name="Move Club J", slug="move-club-j")
    admin = _create_admin(db_session, email="move-admin-j@example.com", club=club)
    booking = _create_booking(
        db_session, club=club, course=course, tee=tee,
        person_id=admin.person_id, slot_datetime=SLOT_0600,
        status=BookingStatus.COMPLETED, party_size=1,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={"target_slot_datetime": SLOT_0630.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    assert any(f["code"] == "booking_status_not_moveable" for f in payload["failures"])
    assert payload["failures"][0]["current_status"] == "completed"


def test_move_blocked_no_show_booking(client: TestClient, db_session: Session) -> None:
    """No-show booking cannot be moved."""
    club, course, tee = _setup_club(db_session, name="Move Club K", slug="move-club-k")
    admin = _create_admin(db_session, email="move-admin-k@example.com", club=club)
    booking = _create_booking(
        db_session, club=club, course=course, tee=tee,
        person_id=admin.person_id, slot_datetime=SLOT_0600,
        status=BookingStatus.NO_SHOW, party_size=1,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={"target_slot_datetime": SLOT_0630.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "blocked"
    assert any(f["code"] == "booking_status_not_moveable" for f in payload["failures"])


def test_move_capacity_not_enforced_when_no_slot_state(
    client: TestClient, db_session: Session
) -> None:
    """When no TeeSheetSlotState exists for the target slot, capacity is not enforced."""
    club, course, tee = _setup_club(db_session, name="Move Club L", slug="move-club-l")
    admin = _create_admin(db_session, email="move-admin-l@example.com", club=club)
    booking = _create_booking(
        db_session, club=club, course=course, tee=tee,
        person_id=admin.person_id, slot_datetime=SLOT_0600, party_size=8,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        f"/api/golf/bookings/{booking.id}/move",
        json={"target_slot_datetime": SLOT_0700.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    # No slot state → no capacity constraint → move is allowed
    assert payload["decision"] == "allowed"
