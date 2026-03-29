from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import Club, ClubMembership, ClubMembershipRole, ClubMembershipStatus, Person, User

VALID_OPERATING_HOURS = {
    "monday": {"open": "06:00", "close": "18:00", "closed": False},
    "tuesday": {"open": "06:00", "close": "18:00", "closed": False},
    "wednesday": {"open": "06:00", "close": "18:00", "closed": False},
    "thursday": {"open": "06:00", "close": "18:00", "closed": False},
    "friday": {"open": "06:00", "close": "18:00", "closed": False},
    "saturday": {"open": "06:00", "close": "18:00", "closed": False},
    "sunday": {"open": "06:00", "close": "18:00", "closed": False},
}


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


def _auth_headers(client: TestClient, email: str, club_id: str | None = None) -> dict[str, str]:
    login = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    if club_id is not None:
        headers["X-Club-Id"] = club_id
    return headers


def test_club_admin_can_manage_operational_rules_foundation(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="ops-admin@example.com")
    club = _create_club(db_session, name="Operations Club", slug="operations-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    other_club = _create_club(db_session, name="Other Club", slug="other-club")
    other_user = _create_user(db_session, email="other-admin@example.com")
    _assign_membership(
        db_session,
        user=other_user,
        club=other_club,
        role=ClubMembershipRole.CLUB_ADMIN,
    )

    headers = _auth_headers(client, user.email, str(club.id))

    config = client.get("/api/clubs/config", headers=headers)
    assert config.status_code == 200
    assert config.json()["timezone"] == "Africa/Johannesburg"
    assert config.json()["booking_window_days"] == 14

    updated_config = client.put(
        "/api/clubs/config",
        headers=headers,
        json={
            "timezone": "UTC",
            "operating_hours": {**VALID_OPERATING_HOURS, "monday": {"open": "05:30", "close": "18:30", "closed": False}},
            "booking_window_days": 21,
            "cancellation_policy_hours": 12,
            "default_slot_interval_minutes": 10,
        },
    )
    assert updated_config.status_code == 200
    assert updated_config.json()["timezone"] == "UTC"

    course = client.post(
        "/api/golf/courses",
        headers=headers,
        json={"name": "Championship", "holes": 18, "active": True},
    )
    assert course.status_code == 201
    assert course.json()["club_id"] == str(club.id)

    other_course = client.post(
        "/api/golf/courses",
        headers=_auth_headers(client, other_user.email, str(other_club.id)),
        json={"name": "South Course", "holes": 9, "active": True},
    )
    assert other_course.status_code == 201

    tee = client.post(
        "/api/golf/tees",
        headers=headers,
        json={
            "course_id": course.json()["id"],
            "name": "Blue",
            "gender": "men",
            "slope_rating": 128,
            "course_rating": "72.4",
            "color_code": "#1b4d8f",
            "active": True,
        },
    )
    assert tee.status_code == 201
    assert tee.json()["course_name"] == "Championship"

    cross_club_tee = client.post(
        "/api/golf/tees",
        headers=headers,
        json={
            "course_id": other_course.json()["id"],
            "name": "White",
            "gender": "mixed",
            "slope_rating": 120,
            "course_rating": "70.2",
            "color_code": "#eeeeee",
            "active": True,
        },
    )
    assert cross_club_tee.status_code == 404

    rule_set = client.post(
        "/api/rules",
        headers=headers,
        json={
            "name": "Member Standard",
            "applies_to": "member",
            "priority": 10,
            "active": True,
            "rules": [{"type": "advance_window", "config": {"days": 14}, "active": True}],
        },
    )
    assert rule_set.status_code == 201
    assert rule_set.json()["rules"][0]["type"] == "advance_window"
    assert rule_set.json()["scope_type"] == "club"
    assert rule_set.json()["conflict_strategy"] == "first_match"
    assert rule_set.json()["rules"][0]["evaluation_order"] == 0

    updated_rule_set = client.put(
        f"/api/rules/{rule_set.json()['id']}",
        headers=headers,
        json={
            "name": "Member Standard",
            "applies_to": "member",
            "priority": 5,
            "active": True,
            "rules": [{"type": "max_future_bookings", "config": {"count": 3}, "active": True}],
        },
    )
    assert updated_rule_set.status_code == 200
    assert updated_rule_set.json()["priority"] == 5
    assert updated_rule_set.json()["rules"][0]["type"] == "max_future_bookings"

    matrix = client.post(
        "/api/pricing",
        headers=headers,
        json={
            "name": "Standard Matrix",
            "active": True,
            "rules": [
                {
                    "applies_to": "member",
                    "day_type": "weekday",
                    "time_band": "morning",
                    "price": "325.00",
                    "currency": "ZAR",
                    "active": True,
                }
            ],
        },
    )
    assert matrix.status_code == 201
    assert matrix.json()["rules"][0]["price"] == "325.00"

    updated_matrix = client.put(
        f"/api/pricing/{matrix.json()['id']}",
        headers=headers,
        json={
            "name": "Standard Matrix",
            "active": True,
            "rules": [
                {
                    "applies_to": "guest",
                    "day_type": "weekend",
                    "time_band": "afternoon",
                    "price": "475.00",
                    "currency": "ZAR",
                    "active": True,
                }
            ],
        },
    )
    assert updated_matrix.status_code == 200
    assert updated_matrix.json()["rules"][0]["applies_to"] == "guest"


def test_club_staff_has_limited_operational_access(client: TestClient, db_session: Session) -> None:
    user = _create_user(db_session, email="ops-staff@example.com")
    club = _create_club(db_session, name="Staff Club", slug="staff-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_STAFF)
    headers = _auth_headers(client, user.email, str(club.id))

    config = client.get("/api/clubs/config", headers=headers)
    assert config.status_code == 200

    denied = client.put(
        "/api/clubs/config",
        headers=headers,
        json={
            "timezone": "UTC",
            "operating_hours": VALID_OPERATING_HOURS,
            "booking_window_days": 14,
            "cancellation_policy_hours": 24,
            "default_slot_interval_minutes": 10,
        },
    )
    assert denied.status_code == 403

    course = client.post(
        "/api/golf/courses",
        headers=headers,
        json={"name": "Staff Managed", "holes": 9, "active": True},
    )
    assert course.status_code == 201

    rule_set = client.post(
        "/api/rules",
        headers=headers,
        json={
            "name": "Guest Rule",
            "applies_to": "guest",
            "priority": 20,
            "active": True,
            "rules": [{"type": "guest_limit", "config": {"count": 3}, "active": True}],
        },
    )
    assert rule_set.status_code == 201

    pricing = client.post(
        "/api/pricing",
        headers=headers,
        json={
            "name": "Staff Pricing",
            "active": True,
            "rules": [
                {
                    "applies_to": "guest",
                    "day_type": "weekday",
                    "time_band": "custom",
                    "time_band_ref": "staff-window",
                    "price": "250.00",
                    "currency": "ZAR",
                    "active": True,
                }
            ],
        },
    )
    assert pricing.status_code == 201


def test_operational_settings_require_explicit_selected_club(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="explicit@example.com")
    club = _create_club(db_session, name="Explicit Club", slug="explicit-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)

    headers = _auth_headers(client, user.email)
    response = client.get("/api/clubs/config", headers=headers)

    assert response.status_code == 403
    assert response.json()["message"] == "Explicit selected club is required"


def test_operational_settings_reject_malformed_config_payloads(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="validation@example.com")
    club = _create_club(db_session, name="Validation Club", slug="validation-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    headers = _auth_headers(client, user.email, str(club.id))

    config_response = client.put(
        "/api/clubs/config",
        headers=headers,
        json={
            "timezone": "UTC",
            "operating_hours": {"monday": {"open": "06:00", "close": "18:00", "closed": False}},
            "booking_window_days": 14,
            "cancellation_policy_hours": 24,
            "default_slot_interval_minutes": 10,
        },
    )
    assert config_response.status_code == 422

    rules_response = client.post(
        "/api/rules",
        headers=headers,
        json={
            "name": "Broken Rule",
            "applies_to": "member",
            "priority": 10,
            "active": True,
            "rules": [{"type": "advance_window", "config": {"count": 3}, "active": True}],
        },
    )
    assert rules_response.status_code == 422
