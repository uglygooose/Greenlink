from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Booking,
    BookingParticipant,
    BookingParticipantType,
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
    Tee,
    TeeSheetSlotState,
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


def _auth_headers(client: TestClient, email: str, club_id: str) -> dict[str, str]:
    login = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}", "X-Club-Id": club_id}


def test_tee_sheet_day_returns_generated_slots_and_persisted_state(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="teesheet@example.com")
    club = _create_club(db_session, name="Tee Sheet Club", slug="tee-sheet-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)
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
    db_session.add(
        ClubConfig(
            club_id=club.id,
            timezone="Africa/Johannesburg",
            operating_hours={
                "monday": {"open": "06:00", "close": "07:00", "closed": False},
                "tuesday": {"open": "06:00", "close": "07:00", "closed": False},
                "wednesday": {"open": "06:00", "close": "07:00", "closed": False},
                "thursday": {"open": "06:00", "close": "07:00", "closed": False},
                "friday": {"open": "06:00", "close": "07:00", "closed": False},
                "saturday": {"open": "06:00", "close": "07:00", "closed": False},
                "sunday": {"open": "06:00", "close": "07:00", "closed": False},
            },
            booking_window_days=14,
            cancellation_policy_hours=24,
            default_slot_interval_minutes=30,
        )
    )
    ruleset = BookingRuleSet(
        club_id=club.id,
        name="Member Window",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.CLUB,
        scope_ref_id=None,
        conflict_strategy=BookingRuleConflictStrategy.MERGE,
        priority=100,
        active=True,
    )
    db_session.add(ruleset)
    db_session.flush()
    db_session.add_all(
        [
            BookingRule(
                ruleset_id=ruleset.id,
                type=BookingRuleType.ADVANCE_WINDOW,
                evaluation_order=0,
                config={"days": 14},
                active=True,
            ),
            BookingRule(
                ruleset_id=ruleset.id,
                type=BookingRuleType.TIME_RESTRICTION,
                evaluation_order=1,
                config={"start_time": "06:00", "end_time": "07:00", "days": ["monday"]},
                active=True,
            ),
        ]
    )
    db_session.flush()
    first_slot = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    second_slot = datetime(2026, 3, 30, 4, 30, tzinfo=UTC)
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=tee.id,
        slot_datetime=first_slot,
        slot_interval_minutes=30,
        status=BookingStatus.RESERVED,
        source=BookingSource.ADMIN,
        party_size=2,
        primary_person_id=user.person_id,
        primary_membership_id=None,
    )
    db_session.add(booking)
    db_session.flush()
    primary_participant = BookingParticipant(
        booking_id=booking.id,
        person_id=user.person_id,
        club_membership_id=None,
        participant_type=BookingParticipantType.MEMBER,
        display_name="Primary Member",
        guest_name=None,
        sort_order=0,
        is_primary=True,
    )
    guest_participant = BookingParticipant(
        booking_id=booking.id,
        person_id=None,
        club_membership_id=None,
        participant_type=BookingParticipantType.GUEST,
        display_name="Guest One",
        guest_name="Guest One",
        sort_order=1,
        is_primary=False,
    )
    db_session.add_all(
        [
            TeeSheetSlotState(
                club_id=club.id,
                course_id=course.id,
                tee_id=tee.id,
                slot_datetime=first_slot,
                player_capacity=4,
            ),
            TeeSheetSlotState(
                club_id=club.id,
                course_id=course.id,
                tee_id=tee.id,
                slot_datetime=second_slot,
                player_capacity=4,
                occupied_player_count=0,
                reserved_player_count=1,
                confirmed_booking_count=0,
                reserved_booking_count=1,
                member_count=0,
                guest_count=0,
                staff_count=0,
                reserved_state_active=True,
                blocked_reason="Pending release",
            ),
            primary_participant,
            guest_participant,
        ]
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

    assert payload["interval_minutes"] == 30
    assert payload["membership_type"] == "member"
    assert len(payload["rows"]) == 2
    hole_1_row = next(row for row in payload["rows"] if row["start_lane"] == "hole_1")
    hole_10_row = next(row for row in payload["rows"] if row["start_lane"] == "hole_10")
    assert hole_1_row["label"] == "Blue"
    assert hole_10_row["label"] == "Blue"
    assert len(hole_1_row["slots"]) == 2
    assert len(hole_10_row["slots"]) == 2
    first_view = hole_1_row["slots"][0]
    second_view = hole_1_row["slots"][1]
    assert first_view["occupancy"]["reserved_player_count"] == 2
    assert first_view["party_summary"]["total_players"] == 2
    assert first_view["party_summary"]["member_count"] == 1
    assert first_view["party_summary"]["guest_count"] == 1
    assert len(first_view["bookings"]) == 1
    assert first_view["bookings"][0]["id"] == str(booking.id)
    assert first_view["bookings"][0]["status"] == "reserved"
    assert first_view["bookings"][0]["party_size"] == 2
    assert first_view["bookings"][0]["participants"][0]["id"] == str(primary_participant.id)
    assert first_view["bookings"][0]["participants"][0]["display_name"] == "Primary Member"
    assert first_view["bookings"][0]["participants"][1]["id"] == str(guest_participant.id)
    assert first_view["display_status"] == "indeterminate"
    assert any(
        item["code"] == "live_concurrency_not_evaluated" for item in first_view["unresolved_checks"]
    )
    assert second_view["bookings"] == []
    assert second_view["display_status"] == "reserved"
    assert second_view["state_flags"]["reserved_state_active"] is True
    assert hole_10_row["slots"][0]["bookings"] == []


def test_tee_sheet_day_defaults_reference_datetime_and_generates_rows_per_tee(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="teesheet-rows@example.com")
    club = _create_club(db_session, name="Rows Club", slug="rows-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    course = Course(club_id=club.id, name="North", holes=18, active=True)
    db_session.add(course)
    db_session.flush()
    db_session.add_all(
        [
            Tee(
                course_id=course.id,
                name="Blue",
                gender=None,
                slope_rating=128,
                course_rating="72.4",
                color_code="#1b4d8f",
                active=True,
            ),
            Tee(
                course_id=course.id,
                name="White",
                gender=None,
                slope_rating=120,
                course_rating="70.2",
                color_code="#d9d9d9",
                active=True,
            ),
        ]
    )
    db_session.add(
        ClubConfig(
            club_id=club.id,
            timezone="Africa/Johannesburg",
            operating_hours={
                "monday": {"open": "06:00", "close": "06:30", "closed": False},
                "tuesday": {"open": "06:00", "close": "06:30", "closed": False},
                "wednesday": {"open": "06:00", "close": "06:30", "closed": False},
                "thursday": {"open": "06:00", "close": "06:30", "closed": False},
                "friday": {"open": "06:00", "close": "06:30", "closed": False},
                "saturday": {"open": "06:00", "close": "06:30", "closed": False},
                "sunday": {"open": "06:00", "close": "06:30", "closed": False},
            },
            booking_window_days=14,
            cancellation_policy_hours=24,
            default_slot_interval_minutes=30,
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
        },
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()

    assert len(payload["rows"]) == 4
    labels = [row["label"] for row in payload["rows"]]
    assert labels.count("Blue") == 2
    assert labels.count("White") == 2
    assert {row["start_lane"] for row in payload["rows"]} == {"hole_1", "hole_10"}
    assert all(len(row["slots"]) == 1 for row in payload["rows"])
    assert all(row["slots"][0]["bookings"] == [] for row in payload["rows"])
    assert any(
        warning["code"] == "reference_datetime_defaulted_to_request_time"
        for warning in payload["warnings"]
    )


# ---------- WI-11 read-model coverage expansion ---------------------------
#
# Each test below exercises one decision the tee-sheet read model makes.
# Service entry point: TeeSheetService.load_day (HTTP route /api/golf/tee-sheet/day).
# Decisions covered: occupancy attribution, terminal-state visibility,
# blocked-slot flagging, slot-interval honouring, multi-tee aggregation,
# and tenant isolation.


def _seed_minimal_course_environment(
    db: Session,
    *,
    slug: str,
    open_hours_close: str = "07:00",
    interval_minutes: int = 30,
) -> tuple[Club, Course, Tee, User]:
    user = _create_user(db, email=f"rm-{slug}@example.com")
    club = _create_club(db, name=f"RM {slug}", slug=slug)
    _assign_membership(db, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    course = Course(club_id=club.id, name="Main", holes=18, active=True)
    db.add(course)
    db.flush()
    tee = Tee(
        course_id=course.id,
        name="Blue",
        gender=None,
        slope_rating=128,
        course_rating="72.4",
        color_code="#1b4d8f",
        active=True,
    )
    db.add(tee)
    db.add(
        ClubConfig(
            club_id=club.id,
            timezone="Africa/Johannesburg",
            operating_hours={
                day: {"open": "06:00", "close": open_hours_close, "closed": False}
                for day in (
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                    "sunday",
                )
            },
            booking_window_days=14,
            cancellation_policy_hours=24,
            default_slot_interval_minutes=interval_minutes,
        )
    )
    db.commit()
    db.refresh(course)
    db.refresh(tee)
    return club, course, tee, user


def _seed_booking_for_slot(
    db: Session,
    *,
    club: Club,
    course: Course,
    tee: Tee | None,
    person_id: uuid.UUID,
    slot_datetime: datetime,
    status: BookingStatus,
    party_size: int = 2,
    interval_minutes: int = 30,
) -> Booking:
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=tee.id if tee is not None else None,
        slot_datetime=slot_datetime,
        slot_interval_minutes=interval_minutes,
        status=status,
        source=BookingSource.ADMIN,
        party_size=party_size,
        primary_person_id=person_id,
        primary_membership_id=None,
    )
    db.add(booking)
    db.flush()
    db.add(
        BookingParticipant(
            booking_id=booking.id,
            person_id=person_id,
            club_membership_id=None,
            participant_type=BookingParticipantType.MEMBER,
            display_name="Primary",
            guest_name=None,
            sort_order=0,
            is_primary=True,
        )
    )
    db.commit()
    db.refresh(booking)
    return booking


def test_tee_sheet_zero_bookings_yields_empty_occupancy(
    client: TestClient, db_session: Session
) -> None:
    club, course, _tee, user = _seed_minimal_course_environment(db_session, slug="rm-empty")
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
    assert payload["rows"], "no rows generated"
    for row in payload["rows"]:
        for slot in row["slots"]:
            assert slot["bookings"] == []
            assert slot["occupancy"]["reserved_player_count"] == 0
            assert slot["occupancy"]["confirmed_booking_count"] == 0
            assert slot["party_summary"]["total_players"] == 0


def test_tee_sheet_surfaces_reserved_and_checked_in_bookings(
    client: TestClient, db_session: Session
) -> None:
    club, course, tee, user = _seed_minimal_course_environment(db_session, slug="rm-mixed")
    reserved_slot = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    checked_in_slot = datetime(2026, 3, 30, 4, 30, tzinfo=UTC)
    _seed_booking_for_slot(
        db_session,
        club=club,
        course=course,
        tee=tee,
        person_id=user.person_id,
        slot_datetime=reserved_slot,
        status=BookingStatus.RESERVED,
    )
    _seed_booking_for_slot(
        db_session,
        club=club,
        course=course,
        tee=tee,
        person_id=user.person_id,
        slot_datetime=checked_in_slot,
        status=BookingStatus.CHECKED_IN,
    )
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
    hole_1_row = next(row for row in payload["rows"] if row["start_lane"] == "hole_1")
    statuses = {slot["bookings"][0]["status"] for slot in hole_1_row["slots"] if slot["bookings"]}
    assert statuses == {"reserved", "checked_in"}


def test_tee_sheet_excludes_cancelled_bookings_from_visible_list(
    client: TestClient, db_session: Session
) -> None:
    club, course, tee, user = _seed_minimal_course_environment(db_session, slug="rm-cancel")
    slot = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    _seed_booking_for_slot(
        db_session,
        club=club,
        course=course,
        tee=tee,
        person_id=user.person_id,
        slot_datetime=slot,
        status=BookingStatus.CANCELLED,
    )
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
    hole_1_row = next(row for row in payload["rows"] if row["start_lane"] == "hole_1")
    first_slot_view = hole_1_row["slots"][0]
    assert first_slot_view["bookings"] == []


def test_tee_sheet_excludes_no_show_and_completed_paid_from_visible_list(
    client: TestClient, db_session: Session
) -> None:
    club, course, tee, user = _seed_minimal_course_environment(db_session, slug="rm-terminal")
    slot_no_show = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    slot_completed = datetime(2026, 3, 30, 4, 30, tzinfo=UTC)
    _seed_booking_for_slot(
        db_session,
        club=club,
        course=course,
        tee=tee,
        person_id=user.person_id,
        slot_datetime=slot_no_show,
        status=BookingStatus.NO_SHOW,
    )
    completed = _seed_booking_for_slot(
        db_session,
        club=club,
        course=course,
        tee=tee,
        person_id=user.person_id,
        slot_datetime=slot_completed,
        status=BookingStatus.COMPLETED,
    )
    # Completed + paid is excluded; completed + pending payment is retained
    # (per TeeSheetService._should_include_booking_in_sheet). Mark paid.
    completed.payment_status = None
    db_session.add(completed)
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
    hole_1_row = next(row for row in payload["rows"] if row["start_lane"] == "hole_1")
    for slot_view in hole_1_row["slots"][:2]:
        assert slot_view["bookings"] == []


def test_tee_sheet_blocked_slot_surfaces_state_flag_and_display_status(
    client: TestClient, db_session: Session
) -> None:
    club, course, tee, user = _seed_minimal_course_environment(db_session, slug="rm-blocked")
    slot = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    db_session.add(
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=slot,
            player_capacity=4,
            manually_blocked=True,
            blocked_reason="Maintenance",
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
    hole_1_row = next(row for row in payload["rows"] if row["start_lane"] == "hole_1")
    blocked_slot = hole_1_row["slots"][0]
    assert blocked_slot["state_flags"]["manually_blocked"] is True
    assert blocked_slot["display_status"] == "blocked"


def test_tee_sheet_honours_default_slot_interval_minutes(
    client: TestClient, db_session: Session
) -> None:
    # 60 minutes of operating window with 10-minute slots → 6 slots per row
    # (default behaviour: slot count = (close - open) / interval).
    club, course, _tee, user = _seed_minimal_course_environment(
        db_session, slug="rm-interval", open_hours_close="07:00", interval_minutes=10
    )
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
    assert payload["interval_minutes"] == 10
    hole_1_row = next(row for row in payload["rows"] if row["start_lane"] == "hole_1")
    assert len(hole_1_row["slots"]) == 6


def test_tee_sheet_is_tenant_scoped_across_clubs(client: TestClient, db_session: Session) -> None:
    """Read model for club A never returns bookings from club B."""
    club_a, course_a, tee_a, admin_a = _seed_minimal_course_environment(
        db_session, slug="rm-tenant-a"
    )
    club_b, course_b, tee_b, admin_b = _seed_minimal_course_environment(
        db_session, slug="rm-tenant-b"
    )
    slot = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    _seed_booking_for_slot(
        db_session,
        club=club_b,
        course=course_b,
        tee=tee_b,
        person_id=admin_b.person_id,
        slot_datetime=slot,
        status=BookingStatus.RESERVED,
    )
    headers_a = _auth_headers(client, admin_a.email, str(club_a.id))
    response = client.get(
        "/api/golf/tee-sheet/day",
        params={
            "course_id": str(course_a.id),
            "date": date(2026, 3, 30).isoformat(),
            "membership_type": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=UTC).isoformat(),
        },
        headers=headers_a,
    )
    assert response.status_code == 200
    payload = response.json()
    for row in payload["rows"]:
        for slot_view in row["slots"]:
            assert slot_view["bookings"] == [], (
                f"club_a tee sheet leaked a booking: {slot_view['bookings']}"
            )
