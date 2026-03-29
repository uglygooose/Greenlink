from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import func, select
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


def _seed_course_stack(db: Session, *, club: Club) -> tuple[Course, Tee]:
    course = Course(club_id=club.id, name="North", holes=18, active=True)
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
    db.commit()
    db.refresh(course)
    db.refresh(tee)
    return course, tee


def _seed_club_config(db: Session, *, club: Club) -> ClubConfig:
    config = ClubConfig(
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
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def _seed_rules(db: Session, *, club: Club) -> None:
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
    db.add(ruleset)
    db.flush()
    db.add_all(
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
                type=BookingRuleType.MAX_BOOKINGS_PER_DAY,
                evaluation_order=1,
                config={"count": 3},
                active=True,
            ),
            BookingRule(
                ruleset_id=ruleset.id,
                type=BookingRuleType.MAX_FUTURE_BOOKINGS,
                evaluation_order=2,
                config={"count": 4},
                active=True,
            ),
            BookingRule(
                ruleset_id=ruleset.id,
                type=BookingRuleType.GUEST_LIMIT,
                evaluation_order=3,
                config={"count": 2},
                active=True,
            ),
        ]
    )
    db.commit()


def test_booking_create_allows_write_and_surfaces_in_tee_sheet(client: TestClient, db_session: Session) -> None:
    admin = _create_user(db_session, email="booking-admin@example.com")
    member = _create_user(db_session, email="booking-member@example.com")
    club = _create_club(db_session, name="Create Club", slug="create-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=member, club=club, role=ClubMembershipRole.MEMBER)
    course, tee = _seed_course_stack(db_session, club=club)
    _seed_club_config(db_session, club=club)
    _seed_rules(db_session, club=club)

    slot_datetime = datetime(2026, 3, 30, 4, 0, tzinfo=timezone.utc)
    db_session.add(
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=slot_datetime,
            player_capacity=4,
            manually_blocked=False,
            reserved_state_active=False,
            competition_controlled=False,
            event_controlled=False,
            externally_unavailable=False,
        )
    )
    db_session.commit()

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        "/api/golf/bookings",
        headers=headers,
        json={
            "course_id": str(course.id),
            "tee_id": str(tee.id),
            "slot_datetime": slot_datetime.isoformat(),
            "source": "admin",
            "applies_to": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=timezone.utc).isoformat(),
            "participants": [
                {
                    "participant_type": "member",
                    "person_id": str(member.person_id),
                    "is_primary": True,
                },
                {
                    "participant_type": "guest",
                    "guest_name": "Guest One",
                    "is_primary": False,
                },
            ],
        },
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["decision"] == "allowed"
    assert payload["booking"]["party_size"] == 2
    assert payload["booking"]["status"] == "reserved"
    assert any(item["code"] == "slot_capacity_available" for item in payload["availability"]["resolved_checks"])
    assert all(item["code"] == "live_concurrency_not_evaluated" for item in payload["availability"]["unresolved_checks"])
    assert db_session.scalar(select(func.count()).select_from(Booking)) == 1

    tee_sheet = client.get(
        "/api/golf/tee-sheet/day",
        headers=headers,
        params={
            "course_id": str(course.id),
            "date": date(2026, 3, 30).isoformat(),
            "membership_type": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=timezone.utc).isoformat(),
        },
    )
    assert tee_sheet.status_code == 200
    first_slot = tee_sheet.json()["rows"][0]["slots"][0]
    assert first_slot["occupancy"]["reserved_player_count"] == 2
    assert first_slot["party_summary"]["member_count"] == 1
    assert first_slot["party_summary"]["guest_count"] == 1


def test_booking_create_blocks_when_slot_capacity_is_exceeded(client: TestClient, db_session: Session) -> None:
    admin = _create_user(db_session, email="capacity-admin@example.com")
    member = _create_user(db_session, email="capacity-member@example.com")
    club = _create_club(db_session, name="Capacity Club", slug="capacity-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    member_membership = _assign_membership(db_session, user=member, club=club, role=ClubMembershipRole.MEMBER)
    course, tee = _seed_course_stack(db_session, club=club)
    _seed_club_config(db_session, club=club)
    _seed_rules(db_session, club=club)

    slot_datetime = datetime(2026, 3, 30, 4, 0, tzinfo=timezone.utc)
    db_session.add(
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=slot_datetime,
            player_capacity=2,
            manually_blocked=False,
            reserved_state_active=False,
            competition_controlled=False,
            event_controlled=False,
            externally_unavailable=False,
        )
    )
    existing_booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=tee.id,
        slot_datetime=slot_datetime,
        slot_interval_minutes=30,
        status=BookingStatus.RESERVED,
        source=BookingSource.ADMIN,
        party_size=2,
        primary_person_id=member.person_id,
        primary_membership_id=member_membership.id,
        participants=[
            BookingParticipant(
                person_id=member.person_id,
                club_membership_id=member_membership.id,
                participant_type=BookingParticipantType.MEMBER,
                display_name="Capacity Member",
                guest_name=None,
                sort_order=0,
                is_primary=True,
            ),
            BookingParticipant(
                person_id=None,
                club_membership_id=None,
                participant_type=BookingParticipantType.GUEST,
                display_name="Guest One",
                guest_name="Guest One",
                sort_order=1,
                is_primary=False,
            ),
        ],
    )
    db_session.add(existing_booking)
    db_session.commit()

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        "/api/golf/bookings",
        headers=headers,
        json={
            "course_id": str(course.id),
            "tee_id": str(tee.id),
            "slot_datetime": slot_datetime.isoformat(),
            "source": "admin",
            "applies_to": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=timezone.utc).isoformat(),
            "participants": [
                {
                    "participant_type": "member",
                    "person_id": str(member.person_id),
                    "is_primary": True,
                }
            ],
        },
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["decision"] == "blocked"
    assert payload["booking"] is None
    assert any(item["code"] == "slot_capacity_exceeded" for item in payload["availability"]["blockers"])
    assert db_session.scalar(select(func.count()).select_from(Booking)) == 1


def test_booking_create_returns_indeterminate_when_slot_state_is_incomplete(
    client: TestClient, db_session: Session
) -> None:
    admin = _create_user(db_session, email="indeterminate-admin@example.com")
    member = _create_user(db_session, email="indeterminate-member@example.com")
    club = _create_club(db_session, name="Indeterminate Club", slug="indeterminate-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=member, club=club, role=ClubMembershipRole.MEMBER)
    course, tee = _seed_course_stack(db_session, club=club)
    _seed_club_config(db_session, club=club)
    _seed_rules(db_session, club=club)

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        "/api/golf/bookings",
        headers=headers,
        json={
            "course_id": str(course.id),
            "tee_id": str(tee.id),
            "slot_datetime": datetime(2026, 3, 30, 4, 0, tzinfo=timezone.utc).isoformat(),
            "source": "admin",
            "applies_to": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=timezone.utc).isoformat(),
            "participants": [
                {
                    "participant_type": "member",
                    "person_id": str(member.person_id),
                    "is_primary": True,
                }
            ],
        },
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["decision"] == "indeterminate"
    assert payload["booking"] is None
    assert any(item["code"] == "occupancy_state_incomplete" for item in payload["availability"]["unresolved_checks"])
    assert db_session.scalar(select(func.count()).select_from(Booking)) == 0


def test_booking_create_blocks_when_member_participant_lacks_club_membership(
    client: TestClient, db_session: Session
) -> None:
    admin = _create_user(db_session, email="validation-admin@example.com")
    outsider = _create_user(db_session, email="outsider@example.com")
    club = _create_club(db_session, name="Validation Club", slug="validation-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    course, tee = _seed_course_stack(db_session, club=club)
    _seed_club_config(db_session, club=club)
    _seed_rules(db_session, club=club)
    db_session.add(
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=datetime(2026, 3, 30, 4, 0, tzinfo=timezone.utc),
            player_capacity=4,
            manually_blocked=False,
            reserved_state_active=False,
            competition_controlled=False,
            event_controlled=False,
            externally_unavailable=False,
        )
    )
    db_session.commit()

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(
        "/api/golf/bookings",
        headers=headers,
        json={
            "course_id": str(course.id),
            "tee_id": str(tee.id),
            "slot_datetime": datetime(2026, 3, 30, 4, 0, tzinfo=timezone.utc).isoformat(),
            "source": "admin",
            "applies_to": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=timezone.utc).isoformat(),
            "participants": [
                {
                    "participant_type": "member",
                    "person_id": str(outsider.person_id),
                    "is_primary": True,
                }
            ],
        },
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["decision"] == "blocked"
    assert payload["availability"] is None
    assert any(item["code"] == "membership_required" for item in payload["failures"])
    assert db_session.scalar(select(func.count()).select_from(Booking)) == 0
