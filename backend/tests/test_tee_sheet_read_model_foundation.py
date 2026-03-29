from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Booking,
    BookingParticipant,
    BookingParticipantType,
    BookingSource,
    BookingRule,
    BookingRuleAppliesTo,
    BookingRuleConflictStrategy,
    BookingRuleScopeType,
    BookingRuleSet,
    BookingRuleType,
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


def _assign_membership(db: Session, *, user: User, club: Club, role: ClubMembershipRole) -> ClubMembership:
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
    first_slot = datetime(2026, 3, 30, 4, 0, tzinfo=timezone.utc)
    second_slot = datetime(2026, 3, 30, 4, 30, tzinfo=timezone.utc)
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
            BookingParticipant(
                booking_id=booking.id,
                person_id=user.person_id,
                club_membership_id=None,
                participant_type=BookingParticipantType.MEMBER,
                display_name="Primary Member",
                guest_name=None,
                sort_order=0,
                is_primary=True,
            ),
            BookingParticipant(
                booking_id=booking.id,
                person_id=None,
                club_membership_id=None,
                participant_type=BookingParticipantType.GUEST,
                display_name="Guest One",
                guest_name="Guest One",
                sort_order=1,
                is_primary=False,
            ),
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
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=timezone.utc).isoformat(),
        },
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["interval_minutes"] == 30
    assert payload["membership_type"] == "member"
    assert len(payload["rows"]) == 1
    assert payload["rows"][0]["label"] == "Blue"
    assert len(payload["rows"][0]["slots"]) == 2
    first_view = payload["rows"][0]["slots"][0]
    second_view = payload["rows"][0]["slots"][1]
    assert first_view["occupancy"]["reserved_player_count"] == 2
    assert first_view["party_summary"]["total_players"] == 2
    assert first_view["party_summary"]["member_count"] == 1
    assert first_view["party_summary"]["guest_count"] == 1
    assert first_view["display_status"] == "indeterminate"
    assert any(item["code"] == "live_concurrency_not_evaluated" for item in first_view["unresolved_checks"])
    assert second_view["display_status"] == "reserved"
    assert second_view["state_flags"]["reserved_state_active"] is True


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

    assert len(payload["rows"]) == 2
    assert payload["rows"][0]["label"] == "Blue"
    assert payload["rows"][1]["label"] == "White"
    assert len(payload["rows"][0]["slots"]) == 1
    assert any(warning["code"] == "reference_datetime_defaulted_to_request_time" for warning in payload["warnings"])
