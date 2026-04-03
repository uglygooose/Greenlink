from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select
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


def _seed_club_config(db: Session, *, club: Club) -> None:
    db.add(
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
    db.commit()


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
                type=BookingRuleType.GUEST_LIMIT,
                evaluation_order=1,
                config={"count": 2},
                active=True,
            ),
        ]
    )
    db.commit()


def _seed_slot_state(db: Session, *, club: Club, course: Course, tee: Tee, slot_datetime: datetime) -> None:
    db.add(
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
    db.commit()


def _seed_booking(
    db: Session,
    *,
    club: Club,
    course: Course,
    tee: Tee,
    slot_datetime: datetime,
    member_user: User,
    member_membership: ClubMembership,
    status: BookingStatus = BookingStatus.RESERVED,
) -> Booking:
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=tee.id,
        slot_datetime=slot_datetime,
        slot_interval_minutes=30,
        status=status,
        source=BookingSource.ADMIN,
        party_size=2,
        primary_person_id=member_user.person_id,
        primary_membership_id=member_membership.id,
        participants=[
            BookingParticipant(
                person_id=member_user.person_id,
                club_membership_id=member_membership.id,
                participant_type=BookingParticipantType.MEMBER,
                display_name=member_user.person.full_name,
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
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def test_booking_update_allows_reserved_party_edit_and_projects_to_tee_sheet(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="update-admin@example.com")
    member = _create_user(db_session, email="update-member@example.com")
    second_member = _create_user(db_session, email="update-second@example.com")
    club = _create_club(db_session, name="Update Club", slug="update-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    member_membership = _assign_membership(db_session, user=member, club=club, role=ClubMembershipRole.MEMBER)
    _assign_membership(db_session, user=second_member, club=club, role=ClubMembershipRole.MEMBER)
    course, tee = _seed_course_stack(db_session, club=club)
    _seed_club_config(db_session, club=club)
    _seed_rules(db_session, club=club)
    slot_datetime = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    _seed_slot_state(db_session, club=club, course=course, tee=tee, slot_datetime=slot_datetime)
    booking = _seed_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        slot_datetime=slot_datetime,
        member_user=member,
        member_membership=member_membership,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.patch(
        f"/api/golf/bookings/{booking.id}",
        headers=headers,
        json={
            "applies_to": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=UTC).isoformat(),
            "participants": [
                {
                    "participant_type": "member",
                    "person_id": str(second_member.person_id),
                    "is_primary": True,
                },
                {
                    "participant_type": "guest",
                    "guest_name": "Guest Alpha",
                    "is_primary": False,
                },
                {
                    "participant_type": "guest",
                    "guest_name": "Guest Beta",
                    "is_primary": False,
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"] == "allowed"
    assert payload["booking"]["party_size"] == 3
    assert payload["booking"]["primary_person_id"] == str(second_member.person_id)
    assert payload["booking"]["participants"][0]["display_name"] == second_member.person.full_name
    assert [item["display_name"] for item in payload["booking"]["participants"][1:]] == ["Guest Alpha", "Guest Beta"]

    tee_sheet = client.get(
        "/api/golf/tee-sheet/day",
        headers=headers,
        params={
            "course_id": str(course.id),
            "date": date(2026, 3, 30).isoformat(),
            "membership_type": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=UTC).isoformat(),
        },
    )
    assert tee_sheet.status_code == 200
    first_slot = tee_sheet.json()["rows"][0]["slots"][0]
    assert first_slot["occupancy"]["reserved_player_count"] == 3
    assert first_slot["party_summary"]["member_count"] == 1
    assert first_slot["party_summary"]["guest_count"] == 2
    assert first_slot["bookings"][0]["participants"][0]["display_name"] == second_member.person.full_name

    refreshed_booking = db_session.scalar(select(Booking).where(Booking.id == booking.id))
    assert refreshed_booking is not None
    assert refreshed_booking.party_size == 3


def test_booking_update_blocks_when_participant_lacks_membership(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="update-invalid-admin@example.com")
    member = _create_user(db_session, email="update-invalid-member@example.com")
    outsider = _create_user(db_session, email="update-outsider@example.com")
    club = _create_club(db_session, name="Update Validation Club", slug="update-validation-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    member_membership = _assign_membership(db_session, user=member, club=club, role=ClubMembershipRole.MEMBER)
    course, tee = _seed_course_stack(db_session, club=club)
    _seed_club_config(db_session, club=club)
    _seed_rules(db_session, club=club)
    slot_datetime = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    _seed_slot_state(db_session, club=club, course=course, tee=tee, slot_datetime=slot_datetime)
    booking = _seed_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        slot_datetime=slot_datetime,
        member_user=member,
        member_membership=member_membership,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.patch(
        f"/api/golf/bookings/{booking.id}",
        headers=headers,
        json={
            "applies_to": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=UTC).isoformat(),
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
    assert any(item["code"] == "membership_required" for item in payload["failures"])


def test_booking_update_blocks_non_editable_statuses(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="update-status-admin@example.com")
    member = _create_user(db_session, email="update-status-member@example.com")
    club = _create_club(db_session, name="Update Status Club", slug="update-status-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    member_membership = _assign_membership(db_session, user=member, club=club, role=ClubMembershipRole.MEMBER)
    course, tee = _seed_course_stack(db_session, club=club)
    _seed_club_config(db_session, club=club)
    _seed_rules(db_session, club=club)
    slot_datetime = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    _seed_slot_state(db_session, club=club, course=course, tee=tee, slot_datetime=slot_datetime)
    booking = _seed_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        slot_datetime=slot_datetime,
        member_user=member,
        member_membership=member_membership,
        status=BookingStatus.CHECKED_IN,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.patch(
        f"/api/golf/bookings/{booking.id}",
        headers=headers,
        json={
            "applies_to": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=UTC).isoformat(),
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
    assert payload["failures"][0]["code"] == "booking_status_not_editable"
    assert payload["failures"][0]["current_status"] == "checked_in"
