from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import Club, ClubMembership, ClubMembershipRole, ClubMembershipStatus, Person, User, UserType


def _create_user(db: Session, *, email: str, user_type: UserType = UserType.USER) -> User:
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
        user_type=user_type,
        person_id=person.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_club(db: Session, *, slug: str) -> Club:
    club = Club(name=f"Club {slug}", slug=slug, location="Durban", timezone="Africa/Johannesburg")
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
    status: ClubMembershipStatus = ClubMembershipStatus.ACTIVE,
) -> None:
    db.add(
        ClubMembership(
            person_id=user.person_id,
            club_id=club.id,
            role=role,
            status=status,
            is_primary=True,
        )
    )
    db.commit()


def _auth_headers(client: TestClient, email: str, club_id: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return {
        "Authorization": f"Bearer {response.json()['access_token']}",
        "X-Club-Id": club_id,
    }


def test_targets_metric_catalog_and_lifecycle(client: TestClient, db_session: Session) -> None:
    user = _create_user(db_session, email="admin@example.com")
    club = _create_club(db_session, slug="targets")
    _assign_membership(db_session, user=user, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    headers = _auth_headers(client, "admin@example.com", str(club.id))

    catalog = client.get("/api/targets/metrics", headers=headers)
    assert catalog.status_code == 200
    assert any(item["domain_key"] == "golf" for item in catalog.json()["items"])

    created = client.post(
        "/api/targets",
        headers=headers,
        json={
            "domain_key": "golf",
            "metric_key": "rounds_booked",
            "period_key": "monthly",
            "period_start": "2026-05-01",
            "period_end": "2026-05-31",
            "target_value": 240,
        },
    )
    assert created.status_code == 200
    payload = created.json()
    assert payload["domain_label"] == "Golf"
    assert payload["metric_label"] == "Rounds booked"
    assert payload["unit"] == "count"
    assert payload["archived"] is False

    listed = client.get("/api/targets", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["total_count"] == 1

    updated = client.patch(
        f"/api/targets/{payload['id']}",
        headers=headers,
        json={
            "domain_key": "golf",
            "metric_key": "golf_revenue",
            "period_key": "monthly",
            "period_start": "2026-05-01",
            "period_end": "2026-05-31",
            "target_value": 180000,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["metric_key"] == "golf_revenue"
    assert updated.json()["unit"] == "currency"

    archived = client.post(f"/api/targets/{payload['id']}/archive", headers=headers)
    assert archived.status_code == 200
    assert archived.json()["archived"] is True


def test_targets_reject_unknown_metrics_and_scope_to_selected_club(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="admin@example.com")
    club_one = _create_club(db_session, slug="targets-one")
    club_two = _create_club(db_session, slug="targets-two")
    _assign_membership(db_session, user=user, club=club_one, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=user, club=club_two, role=ClubMembershipRole.CLUB_ADMIN)
    headers_one = _auth_headers(client, "admin@example.com", str(club_one.id))
    headers_two = _auth_headers(client, "admin@example.com", str(club_two.id))

    invalid = client.post(
        "/api/targets",
        headers=headers_one,
        json={
            "domain_key": "golf",
            "metric_key": "made_up_metric",
            "period_key": "monthly",
            "period_start": "2026-05-01",
            "period_end": "2026-05-31",
            "target_value": 240,
        },
    )
    assert invalid.status_code == 400
    assert invalid.json()["code"] == "club_target_metric_invalid"

    created = client.post(
        "/api/targets",
        headers=headers_one,
        json={
            "domain_key": "members",
            "metric_key": "active_members",
            "period_key": "monthly",
            "period_start": "2026-05-01",
            "period_end": "2026-05-31",
            "target_value": 400,
        },
    )
    assert created.status_code == 200

    listed_other_club = client.get("/api/targets", headers=headers_two)
    assert listed_other_club.status_code == 200
    assert listed_other_club.json()["items"] == []
