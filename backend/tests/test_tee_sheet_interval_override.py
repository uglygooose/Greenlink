"""Phase 10 cleanup / Slice 11.5 — interval_minutes override on GET /tee-sheet/day.

The endpoint accepts an optional ``interval_minutes`` query parameter
that lets callers request a specific slot bucketing. When absent, the
service falls back to ``ClubConfig.default_slot_interval_minutes``
(existing behaviour). When provided, the value must be one of the
Phase 8 segmented-control set: {6, 8, 10, 12}.

Range validation lives at the Pydantic layer (``ge=6, le=12`` →
out-of-range values return 422). The set check at the route body rejects
intermediates (7, 9, 11) with 400. Type errors (e.g. ``'abc'``) return
the standard Pydantic 422.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Club,
    ClubConfig,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Course,
    Person,
    Tee,
    User,
)


def _create_user(db: Session, *, email: str) -> User:
    local = email.split("@")[0]
    person = Person(
        first_name=local.title(),
        last_name="User",
        full_name=build_full_name(local.title(), "User"),
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
    db.commit()
    db.refresh(user)
    return user


def _auth_headers(client: TestClient, email: str, club_id: str) -> dict[str, str]:
    login = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}", "X-Club-Id": club_id}


def _seed_environment(
    db: Session,
    *,
    slug: str,
    default_interval: int = 30,
    open_close: tuple[str, str] = ("06:00", "06:24"),
) -> tuple[Club, Course, User]:
    """Set up a club with a tight operating window so the slot count is
    small enough to assert exactly. Default 24-minute window keeps the
    slot count modest: at 6m → 4 slots, 8m → 3, 12m → 2, 10m → 3.
    """
    open_hours, close_hours = open_close
    user = _create_user(db, email=f"int-{slug}@example.com")
    club = Club(name=f"Interval {slug}", slug=f"int-{slug}", timezone="Africa/Johannesburg")
    db.add(club)
    db.flush()
    db.add(
        ClubMembership(
            person_id=user.person_id,
            club_id=club.id,
            role=ClubMembershipRole.CLUB_ADMIN,
            status=ClubMembershipStatus.ACTIVE,
        )
    )
    course = Course(club_id=club.id, name="Main", holes=18, active=True)
    db.add(course)
    db.flush()
    db.add(
        Tee(
            course_id=course.id,
            name="Blue",
            gender=None,
            slope_rating=128,
            course_rating="72.4",
            color_code="#1b4d8f",
            active=True,
        )
    )
    db.add(
        ClubConfig(
            club_id=club.id,
            timezone="Africa/Johannesburg",
            operating_hours={
                day_name: {"open": open_hours, "close": close_hours, "closed": False}
                for day_name in (
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
            default_slot_interval_minutes=default_interval,
        )
    )
    db.commit()
    db.refresh(club)
    db.refresh(course)
    return club, course, user


def _day_request(
    client: TestClient,
    *,
    club: Club,
    course: Course,
    user_email: str,
    interval_minutes: int | str | None = None,
):
    headers = _auth_headers(client, user_email, str(club.id))
    params: dict[str, str] = {
        "course_id": str(course.id),
        "date": date(2026, 6, 1).isoformat(),
        "membership_type": "member",
        "reference_datetime": datetime(2026, 5, 30, 6, 0, tzinfo=UTC).isoformat(),
    }
    if interval_minutes is not None:
        params["interval_minutes"] = str(interval_minutes)
    return client.get("/api/golf/tee-sheet/day", params=params, headers=headers)


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------


def test_omitted_interval_returns_club_default(client: TestClient, db_session: Session) -> None:
    club, course, user = _seed_environment(db_session, slug="default", default_interval=12)
    resp = _day_request(client, club=club, course=course, user_email=user.email)
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["interval_minutes"] == 12


def test_interval_override_6_buckets_slots_at_6_minutes(
    client: TestClient, db_session: Session
) -> None:
    club, course, user = _seed_environment(db_session, slug="six", default_interval=12)
    resp = _day_request(client, club=club, course=course, user_email=user.email, interval_minutes=6)
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["interval_minutes"] == 6
    # 06:00..06:24 in 6-minute buckets → 06:00, 06:06, 06:12, 06:18 = 4 slots per row.
    assert len(payload["rows"]) >= 1
    slots = payload["rows"][0]["slots"]
    assert len(slots) == 4
    local_times = [slot["local_time"] for slot in slots]
    assert local_times == ["06:00:00", "06:06:00", "06:12:00", "06:18:00"]


def test_interval_override_8_buckets_slots_at_8_minutes(
    client: TestClient, db_session: Session
) -> None:
    club, course, user = _seed_environment(db_session, slug="eight")
    resp = _day_request(client, club=club, course=course, user_email=user.email, interval_minutes=8)
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["interval_minutes"] == 8
    slots = payload["rows"][0]["slots"]
    assert len(slots) == 3
    assert [s["local_time"] for s in slots] == ["06:00:00", "06:08:00", "06:16:00"]


def test_interval_override_10_buckets_slots_at_10_minutes(
    client: TestClient, db_session: Session
) -> None:
    club, course, user = _seed_environment(db_session, slug="ten")
    resp = _day_request(client, club=club, course=course, user_email=user.email, interval_minutes=10)
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["interval_minutes"] == 10
    slots = payload["rows"][0]["slots"]
    assert len(slots) == 3
    assert [s["local_time"] for s in slots] == ["06:00:00", "06:10:00", "06:20:00"]


def test_interval_override_12_buckets_slots_at_12_minutes(
    client: TestClient, db_session: Session
) -> None:
    club, course, user = _seed_environment(db_session, slug="twelve")
    resp = _day_request(client, club=club, course=course, user_email=user.email, interval_minutes=12)
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["interval_minutes"] == 12
    slots = payload["rows"][0]["slots"]
    assert len(slots) == 2
    assert [s["local_time"] for s in slots] == ["06:00:00", "06:12:00"]


# ---------------------------------------------------------------------------
# Rejection paths
# ---------------------------------------------------------------------------


def test_interval_override_7_rejected_by_set_check_with_400(
    client: TestClient, db_session: Session
) -> None:
    club, course, user = _seed_environment(db_session, slug="seven")
    resp = _day_request(client, club=club, course=course, user_email=user.email, interval_minutes=7)
    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert "must be one of" in body.get("detail", "").lower()


def test_interval_override_9_rejected_by_set_check_with_400(
    client: TestClient, db_session: Session
) -> None:
    club, course, user = _seed_environment(db_session, slug="nine")
    resp = _day_request(client, club=club, course=course, user_email=user.email, interval_minutes=9)
    assert resp.status_code == 400, resp.text


def test_interval_override_11_rejected_by_set_check_with_400(
    client: TestClient, db_session: Session
) -> None:
    club, course, user = _seed_environment(db_session, slug="eleven")
    resp = _day_request(client, club=club, course=course, user_email=user.email, interval_minutes=11)
    assert resp.status_code == 400, resp.text


def test_interval_override_5_rejected_below_range_with_422(
    client: TestClient, db_session: Session
) -> None:
    """ge=6 on the Pydantic Query annotation makes 5 a 422, not a 400."""
    club, course, user = _seed_environment(db_session, slug="five")
    resp = _day_request(client, club=club, course=course, user_email=user.email, interval_minutes=5)
    assert resp.status_code == 422, resp.text


def test_interval_override_15_rejected_above_range_with_422(
    client: TestClient, db_session: Session
) -> None:
    """le=12 on the Pydantic Query annotation makes 15 a 422, not a 400."""
    club, course, user = _seed_environment(db_session, slug="fifteen")
    resp = _day_request(client, club=club, course=course, user_email=user.email, interval_minutes=15)
    assert resp.status_code == 422, resp.text


def test_interval_override_non_integer_rejected_with_422(
    client: TestClient, db_session: Session
) -> None:
    club, course, user = _seed_environment(db_session, slug="alpha")
    resp = _day_request(
        client, club=club, course=course, user_email=user.email, interval_minutes="abc"
    )
    assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# Persistence guard
# ---------------------------------------------------------------------------


def test_override_does_not_mutate_club_default(client: TestClient, db_session: Session) -> None:
    """An override is request-scoped — ClubConfig.default_slot_interval_minutes
    is untouched by the request."""
    club, course, user = _seed_environment(db_session, slug="immutable", default_interval=10)
    resp = _day_request(client, club=club, course=course, user_email=user.email, interval_minutes=6)
    assert resp.status_code == 200
    assert resp.json()["interval_minutes"] == 6

    # Re-read the club config straight from the DB; the persisted default is
    # unchanged.
    db_session.expire_all()
    config = db_session.scalar(select(ClubConfig).where(ClubConfig.club_id == club.id))
    assert config is not None
    assert config.default_slot_interval_minutes == 10

    # And a follow-up request without an override returns the persisted default.
    resp_default = _day_request(client, club=club, course=course, user_email=user.email)
    assert resp_default.status_code == 200
    assert resp_default.json()["interval_minutes"] == 10
