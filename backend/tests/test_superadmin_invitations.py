from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Club,
    ClubInvitation,
    ClubInvitationStatus,
    ClubMembership,
    ClubMembershipStatus,
    Person,
    User,
    UserType,
)


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
    club = Club(
        name=f"Club {slug}",
        slug=slug,
        location="Durban",
        timezone="Africa/Johannesburg",
    )
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _auth_headers(client: TestClient, email: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_superadmin_can_invite_existing_linked_user(
    client: TestClient, db_session: Session
) -> None:
    _create_user(db_session, email="root@example.com", user_type=UserType.SUPERADMIN)
    staff_user = _create_user(db_session, email="ops@example.com")
    club = _create_club(db_session, slug=f"invite-{uuid.uuid4().hex[:6]}")
    headers = _auth_headers(client, "root@example.com")

    response = client.post(
        f"/api/superadmin/clubs/{club.id}/invitations",
        headers=headers,
        json={"email": "ops@example.com", "role": "club_staff"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["linked_user_id"] == str(staff_user.id)
    assert payload["role"] == "club_staff"
    assert payload["status"] == "pending"
    assert payload["membership_status"] == "invited"
    assert payload["accept_token"]

    membership = db_session.scalar(
        db_session.query(ClubMembership)
        .filter_by(club_id=club.id, person_id=staff_user.person_id)
        .statement
    )
    assert membership is not None
    assert membership.status == ClubMembershipStatus.INVITED


def test_superadmin_can_invite_new_email_and_list_invitations(
    client: TestClient, db_session: Session
) -> None:
    _create_user(db_session, email="root@example.com", user_type=UserType.SUPERADMIN)
    club = _create_club(db_session, slug=f"new-invite-{uuid.uuid4().hex[:6]}")
    headers = _auth_headers(client, "root@example.com")

    create_response = client.post(
        f"/api/superadmin/clubs/{club.id}/invitations",
        headers=headers,
        json={"email": "new.staff@example.com", "role": "club_admin"},
    )

    assert create_response.status_code == 201
    create_payload = create_response.json()
    assert create_payload["linked_user_id"] is None
    assert create_payload["membership_status"] == "invited"
    assert create_payload["accept_token"]

    invitation = db_session.scalar(
        db_session.query(ClubInvitation)
        .filter_by(club_id=club.id, email="new.staff@example.com")
        .statement
    )
    assert invitation is not None
    assert invitation.status == ClubInvitationStatus.PENDING

    list_response = client.get(f"/api/superadmin/clubs/{club.id}/invitations", headers=headers)

    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload["total_count"] == 1
    assert payload["items"][0]["email"] == "new.staff@example.com"
    assert payload["items"][0]["accept_token"] is None
