from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import Club, ClubMembership, ClubMembershipRole, ClubMembershipStatus, Person, User
from tests.conftest import assert_event_emitted


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


def _auth_headers(client: TestClient, email: str, club_id: str | None = None) -> dict[str, str]:
    login = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    if club_id is not None:
        headers["X-Club-Id"] = club_id
    return headers


def _create_course(
    client: TestClient, headers: dict[str, str], *, name: str = "Championship"
) -> dict[str, str]:
    response = client.post(
        "/api/golf/courses",
        headers=headers,
        json={"name": name, "holes": 18, "active": True},
    )
    assert response.status_code == 201
    return response.json()


def _create_tee(
    client: TestClient, headers: dict[str, str], course_id: str, *, name: str = "Blue"
) -> dict[str, str]:
    response = client.post(
        "/api/golf/tees",
        headers=headers,
        json={
            "course_id": course_id,
            "name": name,
            "gender": "men",
            "slope_rating": 128,
            "course_rating": "72.4",
            "color_code": "#1b4d8f",
            "active": True,
        },
    )
    assert response.status_code == 201
    return response.json()


def _create_rule_set(
    client: TestClient,
    headers: dict[str, str],
    *,
    name: str,
    rule_type: str,
    config: dict[str, object],
    active: bool,
) -> dict[str, object]:
    response = client.post(
        "/api/rules",
        headers=headers,
        json={
            "name": name,
            "applies_to": "member",
            "priority": 10,
            "active": active,
            "rules": [{"type": rule_type, "config": config, "active": True}],
        },
    )
    assert response.status_code == 201
    return response.json()


def _create_pricing_matrix(
    client: TestClient,
    headers: dict[str, str],
    *,
    name: str,
    applies_to: str = "member",
    active: bool,
    price: str = "325.00",
) -> dict[str, object]:
    response = client.post(
        "/api/pricing",
        headers=headers,
        json={
            "name": name,
            "active": active,
            "rules": [
                {
                    "applies_to": applies_to,
                    "player_type": "member_standard",
                    "holes": 18,
                    "day_type": "weekday",
                    "season": "any",
                    "time_band": "any",
                    "price": price,
                    "currency": "ZAR",
                    "active": True,
                }
            ],
        },
    )
    assert response.status_code == 201
    return response.json()


def test_golf_settings_readiness_tracks_real_setup_state(
    client: TestClient,
    db_session: Session,
) -> None:
    user = _create_user(db_session, email="readiness@example.com")
    club = _create_club(db_session, name="Readiness Club", slug="readiness-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    headers = _auth_headers(client, user.email, str(club.id))

    readiness = client.get("/api/golf/settings/readiness", headers=headers)
    assert readiness.status_code == 200
    assert readiness.json() == {
        "courses_configured": False,
        "tees_configured": False,
        "rules_configured": False,
        "pricing_configured": False,
        "overall_ready": False,
    }

    course = _create_course(client, headers)
    readiness = client.get("/api/golf/settings/readiness", headers=headers)
    assert readiness.json()["courses_configured"] is True
    assert readiness.json()["tees_configured"] is False

    _create_tee(client, headers, course["id"])
    readiness = client.get("/api/golf/settings/readiness", headers=headers)
    assert readiness.json()["tees_configured"] is True
    assert readiness.json()["rules_configured"] is False

    _create_rule_set(
        client,
        headers,
        name="Member Standard",
        rule_type="advance_window",
        config={"days": 14},
        active=True,
    )
    readiness = client.get("/api/golf/settings/readiness", headers=headers)
    assert readiness.json()["rules_configured"] is True
    assert readiness.json()["pricing_configured"] is False

    _create_pricing_matrix(client, headers, name="Default Matrix", active=True)
    readiness = client.get("/api/golf/settings/readiness", headers=headers)
    assert readiness.json() == {
        "courses_configured": True,
        "tees_configured": True,
        "rules_configured": True,
        "pricing_configured": True,
        "overall_ready": True,
    }


def test_golf_settings_publish_flow_enforces_setup_order(
    client: TestClient,
    db_session: Session,
) -> None:
    user = _create_user(db_session, email="order@example.com")
    club = _create_club(db_session, name="Order Club", slug="order-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    headers = _auth_headers(client, user.email, str(club.id))

    tee_without_course = client.post(
        "/api/golf/tees",
        headers=headers,
        json={
            "course_id": "00000000-0000-0000-0000-000000000001",
            "name": "Blue",
            "gender": "men",
            "slope_rating": 128,
            "course_rating": "72.4",
            "color_code": "#1b4d8f",
            "active": True,
        },
    )
    assert tee_without_course.status_code == 409

    rules_draft = _create_rule_set(
        client,
        headers,
        name="Draft Rule Set",
        rule_type="advance_window",
        config={"days": 10},
        active=False,
    )
    blocked_rules = client.post(
        "/api/golf/settings/rules/publish",
        headers=headers,
        json={"rule_set_id": rules_draft["id"]},
    )
    assert blocked_rules.status_code == 409

    course = _create_course(client, headers)
    still_blocked_rules = client.post(
        "/api/golf/settings/rules/publish",
        headers=headers,
        json={"rule_set_id": rules_draft["id"]},
    )
    assert still_blocked_rules.status_code == 409

    _create_tee(client, headers, course["id"])
    published_rules = client.post(
        "/api/golf/settings/rules/publish",
        headers=headers,
        json={"rule_set_id": rules_draft["id"]},
    )
    assert published_rules.status_code == 200
    assert published_rules.json()["rule_set"]["status"] == "active"
    assert_event_emitted(
        db_session,
        entity_type="rule_set",
        entity_id=published_rules.json()["rule_set"]["id"],
        action="settings.rule_set.published",
    )

    pricing_draft = _create_pricing_matrix(client, headers, name="Draft Matrix", active=False)
    published_pricing = client.post(
        "/api/golf/settings/pricing/publish",
        headers=headers,
        json={"matrix_id": pricing_draft["id"]},
    )
    assert published_pricing.status_code == 200
    assert published_pricing.json()["pricing_matrix"]["status"] == "active"
    assert_event_emitted(
        db_session,
        entity_type="pricing_matrix",
        entity_id=published_pricing.json()["pricing_matrix"]["id"],
        action="settings.pricing_matrix.published",
    )


def test_golf_settings_rollback_restores_previous_active_versions(
    client: TestClient,
    db_session: Session,
) -> None:
    user = _create_user(db_session, email="rollback@example.com")
    club = _create_club(db_session, name="Rollback Club", slug="rollback-club")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    headers = _auth_headers(client, user.email, str(club.id))

    course = _create_course(client, headers)
    _create_tee(client, headers, course["id"])

    original_rules = _create_rule_set(
        client,
        headers,
        name="Original Rules",
        rule_type="advance_window",
        config={"days": 21},
        active=True,
    )
    next_rules = _create_rule_set(
        client,
        headers,
        name="Weekend Rules",
        rule_type="guest_limit",
        config={"count": 2},
        active=False,
    )
    publish_rules = client.post(
        "/api/golf/settings/rules/publish",
        headers=headers,
        json={"rule_set_id": next_rules["id"]},
    )
    assert publish_rules.status_code == 200
    assert publish_rules.json()["rule_set"]["id"] == next_rules["id"]

    rollback_rules = client.post("/api/golf/settings/rules/rollback", headers=headers, json={})
    assert rollback_rules.status_code == 200
    assert rollback_rules.json()["rule_set"]["id"] == original_rules["id"]
    assert rollback_rules.json()["rule_set"]["rules"][0]["type"] == "advance_window"

    original_pricing = _create_pricing_matrix(
        client,
        headers,
        name="Original Matrix",
        active=True,
        price="250.00",
    )
    next_pricing = _create_pricing_matrix(
        client,
        headers,
        name="Holiday Matrix",
        active=False,
        price="475.00",
    )
    publish_pricing = client.post(
        "/api/golf/settings/pricing/publish",
        headers=headers,
        json={"matrix_id": next_pricing["id"]},
    )
    assert publish_pricing.status_code == 200
    assert publish_pricing.json()["pricing_matrix"]["id"] == next_pricing["id"]

    rollback_pricing = client.post("/api/golf/settings/pricing/rollback", headers=headers, json={})
    assert rollback_pricing.status_code == 200
    assert rollback_pricing.json()["pricing_matrix"]["id"] == original_pricing["id"]
    assert rollback_pricing.json()["pricing_matrix"]["rules"][0]["price"] == "250.00"


def test_golf_settings_endpoints_respect_rbac_and_tenant_boundaries(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = _create_user(db_session, email="admin@example.com")
    member = _create_user(db_session, email="member@example.com")
    other_admin = _create_user(db_session, email="other-admin@example.com")
    club = _create_club(db_session, name="Club One", slug="club-one")
    other_club = _create_club(db_session, name="Club Two", slug="club-two")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=member, club=club, role=ClubMembershipRole.MEMBER)
    _assign_membership(
        db_session, user=other_admin, club=other_club, role=ClubMembershipRole.CLUB_ADMIN
    )

    headers = _auth_headers(client, admin.email, str(club.id))
    other_headers = _auth_headers(client, other_admin.email, str(other_club.id))
    member_headers = _auth_headers(client, member.email, str(club.id))

    course = _create_course(client, headers)
    _create_tee(client, headers, course["id"])
    own_rule_set = _create_rule_set(
        client,
        headers,
        name="Club One Rules",
        rule_type="advance_window",
        config={"days": 14},
        active=False,
    )
    other_course = _create_course(client, other_headers, name="Other Course")
    _create_tee(client, other_headers, other_course["id"], name="White")
    other_rule_set = _create_rule_set(
        client,
        other_headers,
        name="Club Two Rules",
        rule_type="advance_window",
        config={"days": 7},
        active=False,
    )

    member_readiness = client.get("/api/golf/settings/readiness", headers=member_headers)
    assert member_readiness.status_code == 403

    member_publish = client.post(
        "/api/golf/settings/rules/publish",
        headers=member_headers,
        json={"rule_set_id": own_rule_set["id"]},
    )
    assert member_publish.status_code == 403

    cross_club_publish = client.post(
        "/api/golf/settings/rules/publish",
        headers=headers,
        json={"rule_set_id": other_rule_set["id"]},
    )
    assert cross_club_publish.status_code == 404
