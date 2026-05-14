"""TeeSheetLock test suite — Phase 10 / Slice 8.5.

Mix of HTTP-level (FastAPI TestClient) and service-level (direct
TeeSheetLockService) coverage. HTTP tests exercise the route + auth
guard + status-code contract; service tests exercise the IntegrityError
race-handling path that's hard to trigger through a single TestClient
session.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.datetime import utc_now
from app.core.exceptions import ConflictError
from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Club,
    ClubConfig,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Course,
    DomainEventRecord,
    Person,
    TeeSheetLock,
    User,
)
from app.services.tee_sheet_lock_service import (
    LOCK_TTL_SECONDS,
    TeeSheetLockConflict,
    TeeSheetLockService,
)

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _create_club(db: Session, *, slug: str) -> Club:
    club = Club(name=f"Club {slug}", slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.flush()
    db.add(
        ClubConfig(
            club_id=club.id,
            timezone="Africa/Johannesburg",
            operating_hours={
                day: {"open": "06:00", "close": "20:00", "closed": False}
                for day in [
                    "monday", "tuesday", "wednesday", "thursday",
                    "friday", "saturday", "sunday",
                ]
            },
            booking_window_days=14,
            cancellation_policy_hours=24,
            default_slot_interval_minutes=8,
        )
    )
    db.commit()
    db.refresh(club)
    return club


def _create_course(db: Session, *, club: Club, name: str = "Main") -> Course:
    course = Course(club_id=club.id, name=name, holes=18, active=True)
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


def _create_user(
    db: Session,
    *,
    email: str,
    club: Club,
    role: ClubMembershipRole = ClubMembershipRole.CLUB_STAFF,
) -> User:
    local = email.split("@")[0]
    person = Person(
        first_name=local.title(),
        last_name="Op",
        full_name=build_full_name(local.title(), "Op"),
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        profile_metadata={},
    )
    db.add(person)
    db.flush()
    user = User(
        email=email,
        password_hash=hash_password("password123"),
        display_name=local.title(),
        person_id=person.id,
    )
    db.add(user)
    db.flush()
    db.add(
        ClubMembership(
            person_id=person.id,
            club_id=club.id,
            role=role,
            status=ClubMembershipStatus.ACTIVE,
        )
    )
    db.commit()
    db.refresh(user)
    return user


def _auth_headers(client: TestClient, *, email: str, club: Club) -> dict:
    resp = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert resp.status_code == 200, resp.text
    return {
        "Authorization": f"Bearer {resp.json()['access_token']}",
        "X-Club-Id": str(club.id),
    }


def _slot_iso(offset_minutes: int = 0) -> str:
    return (datetime.now(UTC) + timedelta(days=1, minutes=offset_minutes)).isoformat()


def _slot_datetime(offset_minutes: int = 0) -> datetime:
    return datetime.now(UTC) + timedelta(days=1, minutes=offset_minutes)


def _count_events(db: Session, event_type: str, aggregate_id: str) -> int:
    return len(
        list(
            db.scalars(
                select(DomainEventRecord).where(
                    DomainEventRecord.event_type == event_type,
                    DomainEventRecord.aggregate_id == aggregate_id,
                )
            ).all()
        )
    )


# ---------------------------------------------------------------------------
# HTTP — acquire
# ---------------------------------------------------------------------------


def test_acquire_lock_returns_201_with_lock_detail_and_emits_event(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"lk-acq-{uuid.uuid4().hex[:6]}")
    course = _create_course(db_session, club=club)
    user = _create_user(db_session, email=f"lk_a_{uuid.uuid4().hex[:6]}@test.com", club=club)
    headers = _auth_headers(client, email=user.email, club=club)

    slot = _slot_iso()
    resp = client.post(
        "/api/golf/tee-sheet/locks",
        headers=headers,
        json={"course_id": str(course.id), "slot_datetime": slot},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["holder_user_id"] == str(user.id)
    assert body["holder_display_name"] == user.display_name
    assert body["course_id"] == str(course.id)
    assert body["remaining_seconds"] <= LOCK_TTL_SECONDS
    assert body["remaining_seconds"] >= LOCK_TTL_SECONDS - 5

    # Event emitted
    assert _count_events(db_session, "tee_sheet_lock.acquired", body["id"]) == 1


def test_acquire_returns_409_with_existing_lock_when_already_held(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"lk-cf-{uuid.uuid4().hex[:6]}")
    course = _create_course(db_session, club=club)
    holder = _create_user(db_session, email=f"lk_h_{uuid.uuid4().hex[:6]}@test.com", club=club)
    challenger = _create_user(db_session, email=f"lk_c_{uuid.uuid4().hex[:6]}@test.com", club=club)

    holder_headers = _auth_headers(client, email=holder.email, club=club)
    challenger_headers = _auth_headers(client, email=challenger.email, club=club)
    slot = _slot_iso(15)

    first = client.post(
        "/api/golf/tee-sheet/locks",
        headers=holder_headers,
        json={"course_id": str(course.id), "slot_datetime": slot},
    )
    assert first.status_code == 201

    second = client.post(
        "/api/golf/tee-sheet/locks",
        headers=challenger_headers,
        json={"course_id": str(course.id), "slot_datetime": slot},
    )
    assert second.status_code == 409
    detail = second.json()["detail"]
    assert detail["existing_lock"]["holder_user_id"] == str(holder.id)
    assert detail["existing_lock"]["holder_display_name"] == holder.display_name
    assert "currently held" in detail["message"].lower()


def test_acquire_after_expiry_succeeds_and_emits_release_then_acquire(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"lk-ex-{uuid.uuid4().hex[:6]}")
    course = _create_course(db_session, club=club)
    holder = _create_user(db_session, email=f"lk_he_{uuid.uuid4().hex[:6]}@test.com", club=club)
    new_holder = _create_user(db_session, email=f"lk_ne_{uuid.uuid4().hex[:6]}@test.com", club=club)
    slot = _slot_datetime(30)

    # Pre-seed an expired lock directly via the DB to avoid sleeping.
    expired_lock = TeeSheetLock(
        club_id=club.id,
        course_id=course.id,
        slot_datetime=slot,
        holder_user_id=holder.id,
        expires_at=utc_now() - timedelta(seconds=5),
    )
    db_session.add(expired_lock)
    db_session.commit()
    expired_lock_id = expired_lock.id

    headers = _auth_headers(client, email=new_holder.email, club=club)
    resp = client.post(
        "/api/golf/tee-sheet/locks",
        headers=headers,
        json={"course_id": str(course.id), "slot_datetime": slot.isoformat()},
    )
    assert resp.status_code == 201, resp.text
    new_lock_id = resp.json()["id"]

    db_session.expire_all()
    assert _count_events(db_session, "tee_sheet_lock.released", str(expired_lock_id)) == 1
    assert _count_events(db_session, "tee_sheet_lock.acquired", new_lock_id) == 1
    # Old row is gone, replaced by the new acquire.
    assert db_session.get(TeeSheetLock, expired_lock_id) is None


# ---------------------------------------------------------------------------
# HTTP — renew
# ---------------------------------------------------------------------------


def test_renew_extends_ttl_and_emits_event(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, slug=f"lk-rn-{uuid.uuid4().hex[:6]}")
    course = _create_course(db_session, club=club)
    user = _create_user(db_session, email=f"lk_rn_{uuid.uuid4().hex[:6]}@test.com", club=club)
    headers = _auth_headers(client, email=user.email, club=club)

    acquire_resp = client.post(
        "/api/golf/tee-sheet/locks",
        headers=headers,
        json={"course_id": str(course.id), "slot_datetime": _slot_iso(45)},
    )
    lock_id = acquire_resp.json()["id"]
    original_expires_at = acquire_resp.json()["expires_at"]

    renew_resp = client.post(f"/api/golf/tee-sheet/locks/{lock_id}/renew", headers=headers)
    assert renew_resp.status_code == 200
    assert renew_resp.json()["expires_at"] >= original_expires_at
    assert _count_events(db_session, "tee_sheet_lock.renewed", lock_id) == 1


def test_renew_by_non_holder_returns_409(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, slug=f"lk-rnh-{uuid.uuid4().hex[:6]}")
    course = _create_course(db_session, club=club)
    holder = _create_user(db_session, email=f"lk_rh_{uuid.uuid4().hex[:6]}@test.com", club=club)
    other = _create_user(db_session, email=f"lk_ro_{uuid.uuid4().hex[:6]}@test.com", club=club)

    holder_headers = _auth_headers(client, email=holder.email, club=club)
    other_headers = _auth_headers(client, email=other.email, club=club)

    acquire_resp = client.post(
        "/api/golf/tee-sheet/locks",
        headers=holder_headers,
        json={"course_id": str(course.id), "slot_datetime": _slot_iso(60)},
    )
    lock_id = acquire_resp.json()["id"]

    bad = client.post(f"/api/golf/tee-sheet/locks/{lock_id}/renew", headers=other_headers)
    assert bad.status_code == 409
    assert bad.json()["code"] == "tee_sheet_lock_not_held_by_caller"


def test_renew_expired_lock_returns_409(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, slug=f"lk-rx-{uuid.uuid4().hex[:6]}")
    course = _create_course(db_session, club=club)
    user = _create_user(db_session, email=f"lk_rx_{uuid.uuid4().hex[:6]}@test.com", club=club)
    headers = _auth_headers(client, email=user.email, club=club)

    expired = TeeSheetLock(
        club_id=club.id,
        course_id=course.id,
        slot_datetime=_slot_datetime(75),
        holder_user_id=user.id,
        expires_at=utc_now() - timedelta(seconds=2),
    )
    db_session.add(expired)
    db_session.commit()

    resp = client.post(f"/api/golf/tee-sheet/locks/{expired.id}/renew", headers=headers)
    assert resp.status_code == 409
    assert resp.json()["code"] == "tee_sheet_lock_not_found_or_expired"


# ---------------------------------------------------------------------------
# HTTP — release
# ---------------------------------------------------------------------------


def test_release_returns_204_and_emits_event(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, slug=f"lk-rl-{uuid.uuid4().hex[:6]}")
    course = _create_course(db_session, club=club)
    user = _create_user(db_session, email=f"lk_rl_{uuid.uuid4().hex[:6]}@test.com", club=club)
    headers = _auth_headers(client, email=user.email, club=club)

    acquire_resp = client.post(
        "/api/golf/tee-sheet/locks",
        headers=headers,
        json={"course_id": str(course.id), "slot_datetime": _slot_iso(90)},
    )
    lock_id = acquire_resp.json()["id"]

    rel = client.delete(f"/api/golf/tee-sheet/locks/{lock_id}", headers=headers)
    assert rel.status_code == 204
    assert db_session.get(TeeSheetLock, uuid.UUID(lock_id)) is None
    assert _count_events(db_session, "tee_sheet_lock.released", lock_id) == 1


def test_release_by_non_holder_returns_409(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, slug=f"lk-rlh-{uuid.uuid4().hex[:6]}")
    course = _create_course(db_session, club=club)
    holder = _create_user(db_session, email=f"lk_rlh_{uuid.uuid4().hex[:6]}@test.com", club=club)
    other = _create_user(db_session, email=f"lk_rlo_{uuid.uuid4().hex[:6]}@test.com", club=club)
    holder_headers = _auth_headers(client, email=holder.email, club=club)
    other_headers = _auth_headers(client, email=other.email, club=club)

    acquire_resp = client.post(
        "/api/golf/tee-sheet/locks",
        headers=holder_headers,
        json={"course_id": str(course.id), "slot_datetime": _slot_iso(105)},
    )
    lock_id = acquire_resp.json()["id"]

    resp = client.delete(f"/api/golf/tee-sheet/locks/{lock_id}", headers=other_headers)
    assert resp.status_code == 409
    assert resp.json()["code"] == "tee_sheet_lock_not_held_by_caller"


def test_release_nonexistent_lock_is_idempotent_204(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"lk-rln-{uuid.uuid4().hex[:6]}")
    _create_course(db_session, club=club)
    user = _create_user(db_session, email=f"lk_rln_{uuid.uuid4().hex[:6]}@test.com", club=club)
    headers = _auth_headers(client, email=user.email, club=club)
    resp = client.delete(f"/api/golf/tee-sheet/locks/{uuid.uuid4()}", headers=headers)
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# HTTP — list
# ---------------------------------------------------------------------------


def test_list_active_returns_only_non_expired_locks(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"lk-ls-{uuid.uuid4().hex[:6]}")
    course = _create_course(db_session, club=club)
    user = _create_user(db_session, email=f"lk_ls_{uuid.uuid4().hex[:6]}@test.com", club=club)
    headers = _auth_headers(client, email=user.email, club=club)

    now = utc_now()
    day = (now + timedelta(days=1)).date()

    # One active lock + one expired lock on the same day, different slots.
    active = TeeSheetLock(
        club_id=club.id,
        course_id=course.id,
        slot_datetime=datetime(day.year, day.month, day.day, 7, 0, tzinfo=UTC),
        holder_user_id=user.id,
        expires_at=now + timedelta(seconds=30),
    )
    expired = TeeSheetLock(
        club_id=club.id,
        course_id=course.id,
        slot_datetime=datetime(day.year, day.month, day.day, 7, 8, tzinfo=UTC),
        holder_user_id=user.id,
        expires_at=now - timedelta(seconds=30),
    )
    db_session.add_all([active, expired])
    db_session.commit()

    resp = client.get(
        f"/api/golf/tee-sheet/locks?course_id={course.id}&date={day.isoformat()}",
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["locks"]) == 1
    assert body["locks"][0]["id"] == str(active.id)


def test_list_with_no_locks_returns_empty_array(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, slug=f"lk-le-{uuid.uuid4().hex[:6]}")
    course = _create_course(db_session, club=club)
    user = _create_user(db_session, email=f"lk_le_{uuid.uuid4().hex[:6]}@test.com", club=club)
    headers = _auth_headers(client, email=user.email, club=club)

    day = (utc_now() + timedelta(days=1)).date()
    resp = client.get(
        f"/api/golf/tee-sheet/locks?course_id={course.id}&date={day.isoformat()}",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json() == {"locks": []}


# ---------------------------------------------------------------------------
# Service-level — race condition + auth path coverage
# ---------------------------------------------------------------------------


def test_acquire_race_falls_back_to_conflict_when_unique_constraint_fires(
    db_session: Session,
) -> None:
    """Simulates two concurrent acquires hitting the unique constraint.

    Patches the service's existence-check to return None even when a row
    is already present — equivalent to two threads both finishing
    SELECT before either INSERT lands. The second flush() raises
    IntegrityError; the service catches it, re-reads the winner row, and
    returns a TeeSheetLockConflict. This exercises the optimistic-locking
    fallback path.
    """

    club = _create_club(db_session, slug=f"lk-race-{uuid.uuid4().hex[:6]}")
    course = _create_course(db_session, club=club)
    holder = _create_user(db_session, email=f"lk_rcA_{uuid.uuid4().hex[:6]}@test.com", club=club)
    challenger = _create_user(
        db_session, email=f"lk_rcB_{uuid.uuid4().hex[:6]}@test.com", club=club
    )
    slot = _slot_datetime(120)

    service = TeeSheetLockService(db_session)
    first = service.acquire(
        club_id=club.id,
        course_id=course.id,
        slot_datetime=slot,
        holder_user_id=holder.id,
    )
    assert isinstance(first, TeeSheetLock)
    db_session.commit()

    # Patch the existence check to claim there's no row even though one
    # exists. The INSERT will then race the unique constraint.
    with patch.object(TeeSheetLockService, "_load_lock_for_slot") as load_mock:
        # First call (existence check before INSERT) returns None →
        # service proceeds to INSERT.
        # Second call (post-IntegrityError re-read) returns the real row.
        real = db_session.scalar(
            select(TeeSheetLock).where(
                TeeSheetLock.course_id == course.id,
                TeeSheetLock.slot_datetime == slot,
            )
        )
        load_mock.side_effect = [None, real]
        result = service.acquire(
            club_id=club.id,
            course_id=course.id,
            slot_datetime=slot,
            holder_user_id=challenger.id,
        )

    assert isinstance(result, TeeSheetLockConflict)
    assert result.existing_lock.holder_user_id == holder.id


def test_renew_missing_lock_raises_conflict(db_session: Session) -> None:
    club = _create_club(db_session, slug=f"lk-rm-{uuid.uuid4().hex[:6]}")
    user = _create_user(db_session, email=f"lk_rm_{uuid.uuid4().hex[:6]}@test.com", club=club)
    service = TeeSheetLockService(db_session)
    with pytest.raises(ConflictError) as exc:
        service.renew(club_id=club.id, lock_id=uuid.uuid4(), holder_user_id=user.id)
    assert exc.value.code == "tee_sheet_lock_not_found_or_expired"


def test_service_release_emits_event_for_holder(db_session: Session) -> None:
    club = _create_club(db_session, slug=f"lk-rs-{uuid.uuid4().hex[:6]}")
    course = _create_course(db_session, club=club)
    user = _create_user(db_session, email=f"lk_rs_{uuid.uuid4().hex[:6]}@test.com", club=club)
    service = TeeSheetLockService(db_session)
    lock = service.acquire(
        club_id=club.id,
        course_id=course.id,
        slot_datetime=_slot_datetime(135),
        holder_user_id=user.id,
    )
    assert isinstance(lock, TeeSheetLock)
    db_session.commit()
    lock_id = lock.id
    service.release(club_id=club.id, lock_id=lock_id, holder_user_id=user.id)
    db_session.commit()
    assert db_session.get(TeeSheetLock, lock_id) is None
    assert _count_events(db_session, "tee_sheet_lock.released", str(lock_id)) == 1
