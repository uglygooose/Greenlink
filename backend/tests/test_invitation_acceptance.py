from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Club,
    ClubMembership,
    ClubMembershipRole,
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
    club = Club(name=f"Club {slug}", slug=slug, location="Durban", timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _auth_headers(client: TestClient, email: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_new_user_can_accept_invitation_and_activate_membership(
    client: TestClient, db_session: Session
) -> None:
    _create_user(db_session, email="root@example.com", user_type=UserType.SUPERADMIN)
    club = _create_club(db_session, slug=f"accept-{uuid.uuid4().hex[:6]}")
    headers = _auth_headers(client, "root@example.com")

    invite = client.post(
        f"/api/superadmin/clubs/{club.id}/invitations",
        headers=headers,
        json={"email": "new.accept@example.com", "role": "club_staff"},
    )
    assert invite.status_code == 201
    accept_token = invite.json()["accept_token"]

    accept = client.post(
        "/api/auth/invitations/accept",
        json={
            "token": accept_token,
            "password": "password123",
            "display_name": "Jamie Staff",
        },
    )

    assert accept.status_code == 200
    assert accept.json()["user"]["email"] == "new.accept@example.com"
    assert "greenlink_refresh_token" in client.cookies

    user = db_session.scalar(db_session.query(User).filter_by(email="new.accept@example.com").statement)
    assert user is not None
    membership = db_session.scalar(
        db_session.query(ClubMembership).filter_by(club_id=club.id, person_id=user.person_id).statement
    )
    assert membership is not None
    assert membership.status == ClubMembershipStatus.ACTIVE
    assert membership.is_primary is True


def test_existing_linked_user_invitation_requires_login_flow(
    client: TestClient, db_session: Session
) -> None:
    _create_user(db_session, email="root@example.com", user_type=UserType.SUPERADMIN)
    _create_user(db_session, email="ops@example.com")
    club = _create_club(db_session, slug=f"accept-linked-{uuid.uuid4().hex[:6]}")
    headers = _auth_headers(client, "root@example.com")

    invite = client.post(
        f"/api/superadmin/clubs/{club.id}/invitations",
        headers=headers,
        json={"email": "ops@example.com", "role": "club_admin"},
    )
    assert invite.status_code == 201

    accept = client.post(
        "/api/auth/invitations/accept",
        json={
            "token": invite.json()["accept_token"],
            "password": "password123",
            "display_name": "Ops User",
        },
    )

    assert accept.status_code == 400
    assert accept.json()["code"] == "invitation_existing_user_login_required"


def test_existing_linked_user_can_activate_invitation_after_login(
    client: TestClient, db_session: Session
) -> None:
    _create_user(db_session, email="root@example.com", user_type=UserType.SUPERADMIN)
    staff_user = _create_user(db_session, email="ops@example.com")
    club = _create_club(db_session, slug=f"activate-linked-{uuid.uuid4().hex[:6]}")
    headers = _auth_headers(client, "root@example.com")

    invite = client.post(
        f"/api/superadmin/clubs/{club.id}/invitations",
        headers=headers,
        json={"email": "ops@example.com", "role": "club_admin"},
    )
    assert invite.status_code == 201

    activate = client.post(
        "/api/auth/invitations/activate",
        headers=_auth_headers(client, "ops@example.com"),
        json={"token": invite.json()["accept_token"]},
    )

    assert activate.status_code == 200
    assert activate.json()["status"] == "accepted"
    assert activate.json()["membership_status"] == "active"

    membership = db_session.scalar(
        db_session.query(ClubMembership).filter_by(club_id=club.id, person_id=staff_user.person_id).statement
    )
    assert membership is not None
    assert membership.role == ClubMembershipRole.CLUB_ADMIN
    assert membership.status == ClubMembershipStatus.ACTIVE
