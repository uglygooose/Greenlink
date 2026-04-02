"""TS-1: Lane identity and commercial hooks on tee sheet booking summaries.

Tests:
- start_lane is persisted on booking and appears in tee sheet slot booking summary
- cart_flag / caddie_flag / fee_label / payment_status appear in tee sheet booking summary
- dual-lane slot states can coexist at the same (course, tee, slot_datetime) with different start_lane
- member-created booking with explicit start_lane appears in tee sheet projection with correct data
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Booking,
    BookingParticipant,
    BookingParticipantType,
    BookingPaymentStatus,
    BookingRule,
    BookingRuleAppliesTo,
    BookingRuleConflictStrategy,
    BookingRuleScopeType,
    BookingRuleSet,
    BookingRuleType,
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
# Shared helpers
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


def _create_club_with_config(db: Session, *, name: str, slug: str) -> Club:
    club = Club(name=name, slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.flush()
    db.add(
        ClubConfig(
            club_id=club.id,
            timezone="Africa/Johannesburg",
            operating_hours={
                day: {"open": "06:00", "close": "07:00", "closed": False}
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
    db.commit()
    db.refresh(club)
    return club


def _assign_admin(db: Session, *, user: User, club: Club) -> ClubMembership:
    membership = ClubMembership(
        person_id=user.person_id,
        club_id=club.id,
        role=ClubMembershipRole.CLUB_ADMIN,
        status=ClubMembershipStatus.ACTIVE,
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


def _auth_headers(client: TestClient, email: str, club_id: str) -> dict[str, str]:
    login = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}", "X-Club-Id": club_id}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_start_lane_stored_on_booking_and_visible_in_tee_sheet(
    client: TestClient, db_session: Session
) -> None:
    """start_lane on a booking is returned in the tee sheet booking summary."""
    user = _create_user(db_session, email="lane-ts1@example.com")
    club = _create_club_with_config(db_session, name="Lane Club", slug="lane-club")
    _assign_admin(db_session, user=user, club=club)

    course = Course(club_id=club.id, name="Main", holes=18, active=True)
    db_session.add(course)
    db_session.flush()
    tee = Tee(
        course_id=course.id,
        name="Blue",
        gender="men",
        slope_rating=128,
        course_rating="72.4",
        color_code="#1b4d8f",
        active=True,
    )
    db_session.add(tee)
    db_session.flush()

    slot_dt = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=tee.id,
        start_lane=StartLane.HOLE_1,
        slot_datetime=slot_dt,
        slot_interval_minutes=30,
        status=BookingStatus.RESERVED,
        source=BookingSource.ADMIN,
        party_size=1,
        primary_person_id=user.person_id,
    )
    db_session.add(booking)
    db_session.flush()
    db_session.add(
        BookingParticipant(
            booking_id=booking.id,
            person_id=user.person_id,
            participant_type=BookingParticipantType.MEMBER,
            display_name="Lane Tester",
            sort_order=0,
            is_primary=True,
        )
    )
    db_session.commit()

    headers = _auth_headers(client, user.email, str(club.id))
    response = client.get(
        "/api/golf/tee-sheet/day",
        params={
            "course_id": str(course.id),
            "date": date(2026, 3, 30).isoformat(),
            "membership_type": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=UTC).isoformat(),
        },
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()

    row = next(row for row in payload["rows"] if row["start_lane"] == "hole_1")
    first_slot = row["slots"][0]
    assert len(first_slot["bookings"]) == 1
    booking_view = first_slot["bookings"][0]
    assert booking_view["start_lane"] == "hole_1"


def test_commercial_hooks_visible_in_tee_sheet_booking_summary(
    client: TestClient, db_session: Session
) -> None:
    """cart_flag, caddie_flag, fee_label, payment_status appear in tee sheet booking summary."""
    user = _create_user(db_session, email="commercial-ts1@example.com")
    club = _create_club_with_config(db_session, name="Commercial Club", slug="commercial-club")
    _assign_admin(db_session, user=user, club=club)

    course = Course(club_id=club.id, name="Main", holes=18, active=True)
    db_session.add(course)
    db_session.flush()
    tee = Tee(
        course_id=course.id,
        name="White",
        gender=None,
        slope_rating=120,
        course_rating="70.2",
        color_code="#d9d9d9",
        active=True,
    )
    db_session.add(tee)
    db_session.flush()

    slot_dt = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=tee.id,
        start_lane=StartLane.HOLE_10,
        cart_flag=True,
        caddie_flag=False,
        fee_label="Member Weekend Rate",
        payment_status=BookingPaymentStatus.PENDING,
        slot_datetime=slot_dt,
        slot_interval_minutes=30,
        status=BookingStatus.RESERVED,
        source=BookingSource.ADMIN,
        party_size=1,
        primary_person_id=user.person_id,
    )
    db_session.add(booking)
    db_session.flush()
    db_session.add(
        BookingParticipant(
            booking_id=booking.id,
            person_id=user.person_id,
            participant_type=BookingParticipantType.MEMBER,
            display_name="Commercial Tester",
            sort_order=0,
            is_primary=True,
        )
    )
    db_session.commit()

    headers = _auth_headers(client, user.email, str(club.id))
    response = client.get(
        "/api/golf/tee-sheet/day",
        params={
            "course_id": str(course.id),
            "date": date(2026, 3, 30).isoformat(),
            "membership_type": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=UTC).isoformat(),
        },
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()

    row = next(row for row in payload["rows"] if row["start_lane"] == "hole_10")
    first_slot = row["slots"][0]
    assert len(first_slot["bookings"]) == 1
    booking_view = first_slot["bookings"][0]
    assert booking_view["start_lane"] == "hole_10"
    assert booking_view["cart_flag"] is True
    assert booking_view["caddie_flag"] is False
    assert booking_view["fee_label"] == "Member Weekend Rate"
    assert booking_view["payment_status"] == "pending"


def test_dual_lane_slot_states_coexist_at_same_time(
    client: TestClient, db_session: Session
) -> None:
    """Two TeeSheetSlotState rows for hole_1 and hole_10 at same (course, tee, time) are valid."""
    user = _create_user(db_session, email="dual-lane-ts1@example.com")
    club = _create_club_with_config(db_session, name="Dual Lane Club", slug="dual-lane-club")
    _assign_admin(db_session, user=user, club=club)

    course = Course(club_id=club.id, name="Main", holes=18, active=True)
    db_session.add(course)
    db_session.flush()
    tee = Tee(
        course_id=course.id,
        name="Blue",
        gender="men",
        slope_rating=128,
        course_rating="72.4",
        color_code="#1b4d8f",
        active=True,
    )
    db_session.add(tee)
    db_session.flush()

    slot_dt = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)

    # Both lanes at same time — unique constraint must allow this
    db_session.add_all([
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            start_lane=StartLane.HOLE_1,
            slot_datetime=slot_dt,
            player_capacity=4,
        ),
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            start_lane=StartLane.HOLE_10,
            slot_datetime=slot_dt,
            player_capacity=4,
            manually_blocked=True,
            blocked_reason="10th tee closed for maintenance",
        ),
    ])
    db_session.commit()  # should not raise UniqueViolation

    # Verify both records exist
    from sqlalchemy import select
    states = db_session.scalars(
        select(TeeSheetSlotState).where(
            TeeSheetSlotState.course_id == course.id,
            TeeSheetSlotState.tee_id == tee.id,
            TeeSheetSlotState.slot_datetime == slot_dt,
        )
    ).all()
    assert len(states) == 2
    lanes = {s.start_lane for s in states}
    assert StartLane.HOLE_1 in lanes
    assert StartLane.HOLE_10 in lanes


def test_booking_created_via_api_with_start_lane_appears_in_tee_sheet(
    client: TestClient, db_session: Session
) -> None:
    """Booking created via POST /api/golf/bookings with start_lane appears correctly in tee sheet."""
    user = _create_user(db_session, email="api-lane-ts1@example.com")
    club = _create_club_with_config(db_session, name="API Lane Club", slug="api-lane-club")
    _assign_admin(db_session, user=user, club=club)

    course = Course(club_id=club.id, name="Main", holes=18, active=True)
    db_session.add(course)
    db_session.flush()
    tee = Tee(
        course_id=course.id,
        name="Red",
        gender="ladies",
        slope_rating=115,
        course_rating="68.0",
        color_code="#c0392b",
        active=True,
    )
    db_session.add(tee)
    db_session.flush()

    slot_dt = datetime(2026, 4, 7, 4, 0, tzinfo=UTC)  # Monday

    # Full rule set required for all checks to resolve (advance window, capacity, concurrency)
    ruleset = BookingRuleSet(
        club_id=club.id,
        name="Member Base",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.CLUB,
        scope_ref_id=None,
        conflict_strategy=BookingRuleConflictStrategy.MERGE,
        priority=100,
        active=True,
    )
    db_session.add(ruleset)
    db_session.flush()
    db_session.add_all([
        BookingRule(ruleset_id=ruleset.id, type=BookingRuleType.ADVANCE_WINDOW, evaluation_order=0, config={"days": 14}, active=True),
        BookingRule(ruleset_id=ruleset.id, type=BookingRuleType.MAX_BOOKINGS_PER_DAY, evaluation_order=1, config={"count": 3}, active=True),
        BookingRule(ruleset_id=ruleset.id, type=BookingRuleType.MAX_FUTURE_BOOKINGS, evaluation_order=2, config={"count": 4}, active=True),
        BookingRule(ruleset_id=ruleset.id, type=BookingRuleType.GUEST_LIMIT, evaluation_order=3, config={"count": 2}, active=True),
    ])
    # TeeSheetSlotState required for slot_capacity_available check to resolve
    db_session.add(
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=slot_dt,
            player_capacity=4,
        )
    )
    db_session.commit()

    headers = _auth_headers(client, user.email, str(club.id))

    create_response = client.post(
        "/api/golf/bookings",
        json={
            "course_id": str(course.id),
            "tee_id": str(tee.id),
            "start_lane": "hole_1",
            "slot_datetime": slot_dt.isoformat(),
            "source": "admin",
            "applies_to": "member",
            "reference_datetime": datetime(2026, 4, 2, 6, 0, tzinfo=UTC).isoformat(),
            "participants": [
                {
                    "participant_type": "member",
                    "person_id": str(user.person_id),
                    "is_primary": True,
                }
            ],
        },
        headers=headers,
    )
    assert create_response.status_code == 200
    create_payload = create_response.json()
    assert create_payload["decision"] == "allowed"
    assert create_payload["booking"]["start_lane"] == "hole_1"

    # Booking must appear in tee sheet projection
    ts_response = client.get(
        "/api/golf/tee-sheet/day",
        params={
            "course_id": str(course.id),
            "date": date(2026, 4, 7).isoformat(),
            "membership_type": "member",
            "reference_datetime": datetime(2026, 4, 2, 6, 0, tzinfo=UTC).isoformat(),
        },
        headers=headers,
    )
    assert ts_response.status_code == 200
    ts_payload = ts_response.json()

    # Find the slot with our booking
    booking_id = create_payload["booking"]["id"]
    found = False
    for row in ts_payload["rows"]:
        for slot in row["slots"]:
            for b in slot["bookings"]:
                if b["id"] == booking_id:
                    assert b["start_lane"] == "hole_1"
                    found = True
    assert found, "Booking created via API did not appear in tee sheet projection"


def test_same_time_bookings_are_projected_into_separate_lane_rows(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="projection-lanes@example.com")
    club = _create_club_with_config(db_session, name="Projection Club", slug="projection-club")
    _assign_admin(db_session, user=user, club=club)

    course = Course(club_id=club.id, name="Main", holes=18, active=True)
    db_session.add(course)
    db_session.flush()
    tee = Tee(
        course_id=course.id,
        name="Blue",
        gender="men",
        slope_rating=128,
        course_rating="72.4",
        color_code="#1b4d8f",
        active=True,
    )
    db_session.add(tee)
    db_session.flush()

    slot_dt = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    booking_hole_1 = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=tee.id,
        start_lane=StartLane.HOLE_1,
        slot_datetime=slot_dt,
        slot_interval_minutes=30,
        status=BookingStatus.RESERVED,
        source=BookingSource.ADMIN,
        party_size=1,
        primary_person_id=user.person_id,
    )
    booking_hole_10 = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=tee.id,
        start_lane=StartLane.HOLE_10,
        slot_datetime=slot_dt,
        slot_interval_minutes=30,
        status=BookingStatus.RESERVED,
        source=BookingSource.ADMIN,
        party_size=1,
        primary_person_id=user.person_id,
    )
    db_session.add_all([booking_hole_1, booking_hole_10])
    db_session.flush()
    db_session.add_all([
        BookingParticipant(
            booking_id=booking_hole_1.id,
            person_id=user.person_id,
            participant_type=BookingParticipantType.MEMBER,
            display_name="Lane One",
            sort_order=0,
            is_primary=True,
        ),
        BookingParticipant(
            booking_id=booking_hole_10.id,
            person_id=user.person_id,
            participant_type=BookingParticipantType.MEMBER,
            display_name="Lane Ten",
            sort_order=0,
            is_primary=True,
        ),
    ])
    db_session.commit()

    headers = _auth_headers(client, user.email, str(club.id))
    response = client.get(
        "/api/golf/tee-sheet/day",
        params={
            "course_id": str(course.id),
            "date": date(2026, 3, 30).isoformat(),
            "membership_type": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=UTC).isoformat(),
        },
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()

    same_time_rows = [
        row
        for row in payload["rows"]
        if row["tee_id"] == str(tee.id) and row["slots"][0]["slot_datetime"].startswith("2026-03-30T04:00:00")
    ]
    lane_rows = {row["start_lane"]: row for row in same_time_rows}
    assert "hole_1" in lane_rows
    assert "hole_10" in lane_rows
    assert lane_rows["hole_1"]["slots"][0]["bookings"][0]["id"] == str(booking_hole_1.id)
    assert lane_rows["hole_10"]["slots"][0]["bookings"][0]["id"] == str(booking_hole_10.id)
