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


def _create_user(
    db: Session, *, email: str, role: ClubMembershipRole, club: Club
) -> tuple[User, ClubMembership]:
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
    assert [item["id"] for item in payload["history"]] == [
        str(cancelled_future.id),
        payload["history"][1]["id"],
    ]
    assert payload["history"][0]["status"] == "cancelled"
    assert payload["history"][1]["status"] == "completed"


def test_player_booking_read_model_is_member_only(client: TestClient, db_session: Session) -> None:
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


# ---------- Read-model coverage expansion --------------------------------
#
# Each test below exercises one decision the player-booking read model makes.
# Service entry point: PlayerBookingReadModelService.load_for_person.
# Decisions covered: empty-state, time-window filtering, terminal-status
# attribution, sort order, response-shape completeness, tenant isolation,
# per-person filtering, and pagination limits.


REFERENCE = "2026-04-10T10:00:00+02:00"


def test_player_read_model_returns_empty_for_member_with_no_bookings(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"player-empty-{uuid.uuid4().hex[:6]}")
    member, _membership = _create_user(
        db_session,
        email=f"player_empty_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.MEMBER,
        club=club,
    )
    headers = _auth_headers(client, email=member.email, club_id=str(club.id))
    response = client.get(
        "/api/golf/bookings/player",
        headers=headers,
        params={"reference_datetime": REFERENCE},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["upcoming"] == []
    assert payload["history"] == []


def test_player_read_model_upcoming_is_filtered_by_reference_datetime(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"player-future-{uuid.uuid4().hex[:6]}")
    member, membership = _create_user(
        db_session,
        email=f"player_future_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.MEMBER,
        club=club,
    )
    course, tee = _create_course_and_tee(db_session, club=club)
    past = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership,
        slot_datetime=datetime(2026, 4, 5, 8, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
    )
    future = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership,
        slot_datetime=datetime(2026, 4, 15, 8, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
    )
    headers = _auth_headers(client, email=member.email, club_id=str(club.id))
    response = client.get(
        "/api/golf/bookings/player",
        headers=headers,
        params={"reference_datetime": REFERENCE},
    )
    assert response.status_code == 200
    payload = response.json()
    upcoming_ids = [item["id"] for item in payload["upcoming"]]
    history_ids = [item["id"] for item in payload["history"]]
    assert str(future.id) in upcoming_ids
    assert str(past.id) in history_ids


def test_player_read_model_routes_terminal_states_to_history(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"player-terminal-{uuid.uuid4().hex[:6]}")
    member, membership = _create_user(
        db_session,
        email=f"player_terminal_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.MEMBER,
        club=club,
    )
    course, tee = _create_course_and_tee(db_session, club=club)
    cancelled = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership,
        slot_datetime=datetime(2026, 4, 12, 8, 0, tzinfo=UTC),
        status=BookingStatus.CANCELLED,
    )
    completed = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership,
        slot_datetime=datetime(2026, 4, 11, 8, 0, tzinfo=UTC),
        status=BookingStatus.COMPLETED,
    )
    no_show = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership,
        slot_datetime=datetime(2026, 4, 13, 8, 0, tzinfo=UTC),
        status=BookingStatus.NO_SHOW,
    )
    headers = _auth_headers(client, email=member.email, club_id=str(club.id))
    response = client.get(
        "/api/golf/bookings/player",
        headers=headers,
        params={"reference_datetime": REFERENCE},
    )
    assert response.status_code == 200
    payload = response.json()
    history_ids = {item["id"] for item in payload["history"]}
    assert {str(cancelled.id), str(completed.id), str(no_show.id)} <= history_ids
    upcoming_ids = {item["id"] for item in payload["upcoming"]}
    assert {str(cancelled.id), str(completed.id), str(no_show.id)}.isdisjoint(upcoming_ids)


def test_player_read_model_is_tenant_scoped_across_clubs(
    client: TestClient, db_session: Session
) -> None:
    """A member's player read-model never returns bookings from a sibling club."""
    club_a = _create_club(db_session, slug=f"player-tenant-a-{uuid.uuid4().hex[:6]}")
    club_b = _create_club(db_session, slug=f"player-tenant-b-{uuid.uuid4().hex[:6]}")
    member_a, membership_a = _create_user(
        db_session,
        email=f"player_tenant_a_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.MEMBER,
        club=club_a,
    )
    _, membership_b_for_same_person = _create_user(
        db_session,
        email=f"player_tenant_b_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.MEMBER,
        club=club_b,
    )
    course_a, tee_a = _create_course_and_tee(db_session, club=club_a)
    course_b, tee_b = _create_course_and_tee(db_session, club=club_b)
    _create_booking(
        db_session,
        club=club_a,
        course=course_a,
        tee=tee_a,
        membership=membership_a,
        slot_datetime=datetime(2026, 4, 12, 8, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
    )
    _create_booking(
        db_session,
        club=club_b,
        course=course_b,
        tee=tee_b,
        membership=membership_b_for_same_person,
        slot_datetime=datetime(2026, 4, 12, 9, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
    )
    headers = _auth_headers(client, email=member_a.email, club_id=str(club_a.id))
    response = client.get(
        "/api/golf/bookings/player",
        headers=headers,
        params={"reference_datetime": REFERENCE},
    )
    assert response.status_code == 200
    payload = response.json()
    upcoming_courses = {item["course_name"] for item in payload["upcoming"]}
    # Both clubs' courses are named "North Course" by _create_course_and_tee, so
    # filter by booking IDs from club_a vs club_b instead.
    upcoming_ids = {item["id"] for item in payload["upcoming"]}
    club_a_bookings = {
        str(booking.id)
        for booking in db_session.scalars(
            db_session.query(Booking).filter(Booking.club_id == club_a.id).statement
        ).all()
    }
    club_b_bookings = {
        str(booking.id)
        for booking in db_session.scalars(
            db_session.query(Booking).filter(Booking.club_id == club_b.id).statement
        ).all()
    }
    assert upcoming_ids <= club_a_bookings
    assert upcoming_ids.isdisjoint(club_b_bookings)
    _ = upcoming_courses


def test_player_read_model_distinguishes_between_persons_on_same_club(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"player-distinct-{uuid.uuid4().hex[:6]}")
    member_one, membership_one = _create_user(
        db_session,
        email=f"player_one_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.MEMBER,
        club=club,
    )
    member_two, membership_two = _create_user(
        db_session,
        email=f"player_two_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.MEMBER,
        club=club,
    )
    course, tee = _create_course_and_tee(db_session, club=club)
    booking_one = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership_one,
        slot_datetime=datetime(2026, 4, 12, 8, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
    )
    booking_two = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership_two,
        slot_datetime=datetime(2026, 4, 12, 9, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
    )
    headers_one = _auth_headers(client, email=member_one.email, club_id=str(club.id))
    response_one = client.get(
        "/api/golf/bookings/player",
        headers=headers_one,
        params={"reference_datetime": REFERENCE},
    )
    headers_two = _auth_headers(client, email=member_two.email, club_id=str(club.id))
    response_two = client.get(
        "/api/golf/bookings/player",
        headers=headers_two,
        params={"reference_datetime": REFERENCE},
    )
    upcoming_one = {item["id"] for item in response_one.json()["upcoming"]}
    upcoming_two = {item["id"] for item in response_two.json()["upcoming"]}
    assert upcoming_one == {str(booking_one.id)}
    assert upcoming_two == {str(booking_two.id)}


def test_player_read_model_upcoming_is_sorted_chronologically_ascending(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"player-sort-{uuid.uuid4().hex[:6]}")
    member, membership = _create_user(
        db_session,
        email=f"player_sort_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.MEMBER,
        club=club,
    )
    course, tee = _create_course_and_tee(db_session, club=club)
    later = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership,
        slot_datetime=datetime(2026, 4, 20, 8, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
    )
    earlier = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership,
        slot_datetime=datetime(2026, 4, 12, 8, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
    )
    headers = _auth_headers(client, email=member.email, club_id=str(club.id))
    response = client.get(
        "/api/golf/bookings/player",
        headers=headers,
        params={"reference_datetime": REFERENCE},
    )
    upcoming_ids = [item["id"] for item in response.json()["upcoming"]]
    assert upcoming_ids == [str(earlier.id), str(later.id)]


def test_player_read_model_history_is_sorted_chronologically_descending(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"player-histsort-{uuid.uuid4().hex[:6]}")
    member, membership = _create_user(
        db_session,
        email=f"player_histsort_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.MEMBER,
        club=club,
    )
    course, tee = _create_course_and_tee(db_session, club=club)
    older = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership,
        slot_datetime=datetime(2026, 4, 1, 8, 0, tzinfo=UTC),
        status=BookingStatus.COMPLETED,
    )
    newer = _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership,
        slot_datetime=datetime(2026, 4, 7, 8, 0, tzinfo=UTC),
        status=BookingStatus.COMPLETED,
    )
    headers = _auth_headers(client, email=member.email, club_id=str(club.id))
    response = client.get(
        "/api/golf/bookings/player",
        headers=headers,
        params={"reference_datetime": REFERENCE},
    )
    history_ids = [item["id"] for item in response.json()["history"]]
    assert history_ids.index(str(newer.id)) < history_ids.index(str(older.id))


def test_player_read_model_response_item_shape_is_fully_populated(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"player-shape-{uuid.uuid4().hex[:6]}")
    member, membership = _create_user(
        db_session,
        email=f"player_shape_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.MEMBER,
        club=club,
    )
    course, tee = _create_course_and_tee(db_session, club=club)
    _create_booking(
        db_session,
        club=club,
        course=course,
        tee=tee,
        membership=membership,
        slot_datetime=datetime(2026, 4, 12, 8, 0, tzinfo=UTC),
        status=BookingStatus.RESERVED,
        guest_name="Friend",
    )
    headers = _auth_headers(client, email=member.email, club_id=str(club.id))
    response = client.get(
        "/api/golf/bookings/player",
        headers=headers,
        params={"reference_datetime": REFERENCE},
    )
    assert response.status_code == 200
    item = response.json()["upcoming"][0]
    expected_keys = {
        "id",
        "status",
        "source",
        "slot_datetime",
        "holes",
        "local_date",
        "local_time",
        "course_name",
        "tee_name",
        "start_lane",
        "party_size",
        "primary_participant_name",
        "participant_names",
        "fee_label",
        "fee_amount",
        "fee_currency",
        "payment_status",
    }
    assert expected_keys <= set(item.keys()), f"missing keys: {expected_keys - set(item.keys())}"
    assert item["course_name"] == "North Course"
    assert item["tee_name"] == "Blue"
    assert item["primary_participant_name"] == "Avery Player"
    assert item["participant_names"] == ["Avery Player", "Friend"]


def test_player_read_model_honours_upcoming_and_history_limits(
    client: TestClient, db_session: Session
) -> None:
    """Direct service call — the HTTP route forwards default limits.

    PlayerBookingReadModelService.load_for_person defaults to upcoming_limit=5,
    history_limit=10. This test seeds beyond both and asserts the service
    truncates.
    """
    from app.services.player_booking_read_model_service import (
        PlayerBookingReadModelService,
    )

    club = _create_club(db_session, slug=f"player-limit-{uuid.uuid4().hex[:6]}")
    _, membership = _create_user(
        db_session,
        email=f"player_limit_{uuid.uuid4().hex[:6]}@test.com",
        role=ClubMembershipRole.MEMBER,
        club=club,
    )
    course, tee = _create_course_and_tee(db_session, club=club)
    # 6 upcoming RESERVED bookings (default upcoming_limit=5)
    for hour in range(6):
        _create_booking(
            db_session,
            club=club,
            course=course,
            tee=tee,
            membership=membership,
            slot_datetime=datetime(2026, 4, 15 + hour, 8, 0, tzinfo=UTC),
            status=BookingStatus.RESERVED,
        )
    # 12 historical COMPLETED bookings (default history_limit=10)
    for day in range(12):
        _create_booking(
            db_session,
            club=club,
            course=course,
            tee=tee,
            membership=membership,
            slot_datetime=datetime(2026, 3, 1 + day, 8, 0, tzinfo=UTC),
            status=BookingStatus.COMPLETED,
        )
    response = PlayerBookingReadModelService(db_session).load_for_person(
        club=club,
        person_id=membership.person_id,
        reference_datetime=datetime(2026, 4, 10, 0, 0, tzinfo=UTC),
    )
    assert len(response.upcoming) == 5
    assert len(response.history) == 10
