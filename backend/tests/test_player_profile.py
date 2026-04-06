from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import Club, ClubMembership, ClubMembershipRole, ClubMembershipStatus, Person, User


def _create_club(db: Session, *, slug: str) -> Club:
    club = Club(name=f"Club {slug}", slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _create_member_user(db: Session, *, email: str, club: Club) -> tuple[User, ClubMembership]:
    person = Person(
        first_name="Avery",
        last_name="Player",
        full_name=build_full_name("Avery", "Player"),
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        phone="0820000000",
        profile_metadata={},
    )
    db.add(person)
    db.flush()
    user = User(
        email=email,
        password_hash=hash_password("password123"),
        display_name=person.full_name,
        person_id=person.id,
    )
    db.add(user)
    db.flush()
    membership = ClubMembership(
        person_id=person.id,
        club_id=club.id,
        role=ClubMembershipRole.MEMBER,
        status=ClubMembershipStatus.ACTIVE,
        is_primary=True,
    )
    db.add(membership)
    db.commit()
    db.refresh(user)
    db.refresh(membership)
    return user, membership


def _auth_headers(client: TestClient, *, email: str, club_id: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}", "X-Club-Id": club_id}


def test_player_profile_read_and_update(client: TestClient, db_session: Session) -> None:
    club = _create_club(db_session, slug=f"profile-{uuid.uuid4().hex[:6]}")
    user, _membership = _create_member_user(
        db_session,
        email=f"player_profile_{uuid.uuid4().hex[:6]}@test.com",
        club=club,
    )
    headers = _auth_headers(client, email=user.email, club_id=str(club.id))

    response = client.get("/api/people/me/profile", headers=headers)

    assert response.status_code == 200
    assert response.json() == {
        "person_id": str(user.person_id),
        "first_name": "Avery",
        "last_name": "Player",
        "full_name": "Avery Player",
        "contact_email": user.email,
        "account_email": user.email,
        "phone": "0820000000",
        "club_name": club.name,
    }

    update_response = client.patch(
        "/api/people/me/profile",
        headers=headers,
        json={
            "first_name": "Avery-Jane",
            "last_name": "Member",
            "contact_email": "avery.member@example.com",
            "phone": "0831112222",
        },
    )

    assert update_response.status_code == 200
    payload = update_response.json()
    assert payload["full_name"] == "Avery-Jane Member"
    assert payload["contact_email"] == "avery.member@example.com"
    assert payload["account_email"] == user.email
    assert payload["phone"] == "0831112222"

    db_session.refresh(user)
    assert user.display_name == "Avery-Jane Member"
