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


def _seed_slot_state(
    db: Session,
    *,
    club: Club,
    course: Course,
    tee: Tee,
    slot_datetime: datetime,
    player_capacity: int = 4,
) -> None:
    db.add(
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=slot_datetime,
            player_capacity=player_capacity,
            manually_blocked=False,
            reserved_state_active=False,
            competition_controlled=False,
            event_controlled=False,
            externally_unavailable=False,
        )
    )
    db.commit()


def _persist_booking(
    db: Session,
    *,
    club: Club,
    course: Course,
    tee: Tee,
    slot_datetime: datetime,
    status: BookingStatus,
    member: User,
    membership: ClubMembership,
) -> Booking:
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=tee.id,
        slot_datetime=slot_datetime,
        slot_interval_minutes=30,
        status=status,
        source=BookingSource.ADMIN,
        party_size=1,
        primary_person_id=member.person_id,
        primary_membership_id=membership.id,
        participants=[
            BookingParticipant(
                person_id=member.person_id,
                club_membership_id=membership.id,
                participant_type=BookingParticipantType.MEMBER,
                display_name="Member One",
                guest_name=None,
                sort_order=0,
                is_primary=True,
            )
        ],
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def test_booking_cancel_allows_reserved_booking_and_reflects_in_tee_sheet(
    client: TestClient, db_session: Session
) -> None:
    admin = _create_user(db_session, email="cancel-admin@example.com")
    member = _create_user(db_session, email="cancel-member@example.com")
    club = _create_club(db_session, name="Cancel Club", slug="cancel-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=member, club=club, role=ClubMembershipRole.MEMBER)
    course, tee = _seed_course_stack(db_session, club=club)
    _seed_club_config(db_session, club=club)
    _seed_rules(db_session, club=club)

    slot_datetime = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    _seed_slot_state(
        db_session,
        club=club,
        course=course,
        tee=tee,
        slot_datetime=slot_datetime,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    create_response = client.post(
        "/api/golf/bookings",
        headers=headers,
        json={
            "course_id": str(course.id),
            "tee_id": str(tee.id),
            "slot_datetime": slot_datetime.isoformat(),
            "source": "admin",
            "applies_to": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=UTC).isoformat(),
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
    assert create_response.status_code == 200
    booking_id = create_response.json()["booking"]["id"]

    before_cancel = client.get(
        "/api/golf/tee-sheet/day",
        headers=headers,
        params={
            "course_id": str(course.id),
            "date": date(2026, 3, 30).isoformat(),
            "membership_type": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=UTC).isoformat(),
        },
    )
    assert before_cancel.status_code == 200
    before_slot = before_cancel.json()["rows"][0]["slots"][0]
    assert before_slot["occupancy"]["reserved_player_count"] == 2
    assert before_slot["occupancy"]["reserved_booking_count"] == 1

    cancel_response = client.post(
        f"/api/golf/bookings/{booking_id}/cancel",
        headers=headers,
    )
    assert cancel_response.status_code == 200
    cancel_payload = cancel_response.json()

    assert cancel_payload["decision"] == "allowed"
    assert cancel_payload["transition_applied"] is True
    assert cancel_payload["booking"]["status"] == "cancelled"

    persisted = db_session.scalar(select(Booking).where(Booking.id == booking_id))
    assert persisted is not None
    assert persisted.status == BookingStatus.CANCELLED

    after_cancel = client.get(
        "/api/golf/tee-sheet/day",
        headers=headers,
        params={
            "course_id": str(course.id),
            "date": date(2026, 3, 30).isoformat(),
            "membership_type": "member",
            "reference_datetime": datetime(2026, 3, 25, 6, 0, tzinfo=UTC).isoformat(),
        },
    )
    assert after_cancel.status_code == 200
    after_slot = after_cancel.json()["rows"][0]["slots"][0]
    assert after_slot["occupancy"]["reserved_player_count"] == 0
    assert after_slot["occupancy"]["reserved_booking_count"] == 0
    assert after_slot["party_summary"]["total_players"] == 0


def test_booking_cancel_blocks_non_cancellable_checked_in_booking(
    client: TestClient, db_session: Session
) -> None:
    admin = _create_user(db_session, email="cancel-block-admin@example.com")
    member = _create_user(db_session, email="cancel-block-member@example.com")
    club = _create_club(db_session, name="Cancel Block Club", slug="cancel-block-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    member_membership = _assign_membership(
        db_session,
        user=member,
        club=club,
        role=ClubMembershipRole.MEMBER,
    )
    course, tee = _seed_course_stack(db_session, club=club)
    slot_datetime = datetime(2026, 3, 30, 4, 0, tzinfo=UTC)
    booking = _persist_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        slot_datetime=slot_datetime,
        status=BookingStatus.CHECKED_IN,
        member=member,
        membership=member_membership,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    response = client.post(f"/api/golf/bookings/{booking.id}/cancel", headers=headers)
    assert response.status_code == 200
    payload = response.json()

    assert payload["decision"] == "blocked"
    assert payload["transition_applied"] is False
    assert payload["booking"]["status"] == "checked_in"
    assert payload["failures"][0]["code"] == "booking_status_not_cancellable"
    assert payload["failures"][0]["current_status"] == "checked_in"

    persisted = db_session.scalar(select(Booking).where(Booking.id == booking.id))
    assert persisted is not None
    assert persisted.status == BookingStatus.CHECKED_IN


def test_booking_cancel_enforces_selected_club_scope(client: TestClient, db_session: Session) -> None:
    admin_a = _create_user(db_session, email="cancel-tenant-a@example.com")
    admin_b = _create_user(db_session, email="cancel-tenant-b@example.com")
    member_a = _create_user(db_session, email="cancel-tenant-member@example.com")
    club_a = _create_club(db_session, name="Club A", slug="club-a")
    club_b = _create_club(db_session, name="Club B", slug="club-b")
    _assign_membership(db_session, user=admin_a, club=club_a, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=admin_b, club=club_b, role=ClubMembershipRole.CLUB_ADMIN)
    member_membership = _assign_membership(
        db_session,
        user=member_a,
        club=club_a,
        role=ClubMembershipRole.MEMBER,
    )
    course_a, tee_a = _seed_course_stack(db_session, club=club_a)
    booking = _persist_booking(
        db_session,
        club=club_a,
        course=course_a,
        tee=tee_a,
        slot_datetime=datetime(2026, 3, 30, 4, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
        member=member_a,
        membership=member_membership,
    )

    headers = _auth_headers(client, admin_b.email, str(club_b.id))
    response = client.post(f"/api/golf/bookings/{booking.id}/cancel", headers=headers)
    assert response.status_code == 200
    payload = response.json()

    assert payload["decision"] == "blocked"
    assert payload["booking"] is None
    assert payload["failures"][0]["code"] == "booking_not_found"

    persisted = db_session.scalar(select(Booking).where(Booking.id == booking.id))
    assert persisted is not None
    assert persisted.status == BookingStatus.RESERVED


def test_booking_cancel_is_idempotent_for_already_cancelled_booking(
    client: TestClient, db_session: Session
) -> None:
    admin = _create_user(db_session, email="cancel-repeat-admin@example.com")
    member = _create_user(db_session, email="cancel-repeat-member@example.com")
    club = _create_club(db_session, name="Cancel Repeat Club", slug="cancel-repeat-club")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    member_membership = _assign_membership(
        db_session,
        user=member,
        club=club,
        role=ClubMembershipRole.MEMBER,
    )
    course, tee = _seed_course_stack(db_session, club=club)
    booking = _persist_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        slot_datetime=datetime(2026, 3, 30, 4, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
        member=member,
        membership=member_membership,
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    first_response = client.post(f"/api/golf/bookings/{booking.id}/cancel", headers=headers)
    assert first_response.status_code == 200
    assert first_response.json()["decision"] == "allowed"
    assert first_response.json()["transition_applied"] is True

    second_response = client.post(f"/api/golf/bookings/{booking.id}/cancel", headers=headers)
    assert second_response.status_code == 200
    payload = second_response.json()

    assert payload["decision"] == "allowed"
    assert payload["transition_applied"] is False
    assert payload["booking"]["status"] == "cancelled"
    assert payload["failures"] == []

    persisted = db_session.scalar(select(Booking).where(Booking.id == booking.id))
    assert persisted is not None
    assert persisted.status == BookingStatus.CANCELLED
