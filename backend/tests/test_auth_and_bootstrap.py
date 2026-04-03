from __future__ import annotations

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
    PlatformState,
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


def _create_club(db: Session, *, name: str, slug: str) -> Club:
    club = Club(name=name, slug=slug, timezone="Africa/Johannesburg")
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
    is_primary: bool = False,
) -> ClubMembership:
    membership = ClubMembership(
        person_id=user.person_id,
        club_id=club.id,
        role=role,
        status=status,
        is_primary=is_primary,
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


def _login(client: TestClient, email: str) -> dict[str, object]:
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return response.json()


def test_platform_bootstrap_locks_after_first_success(
    client: TestClient, db_session: Session
) -> None:
    response = client.post(
        "/api/platform/bootstrap",
        json={
            "superadmin": {
                "email": "root@example.com",
                "password": "password123",
                "display_name": "Root",
            },
            "initial_club": {
                "name": "Green Hills",
                "slug": "green-hills",
                "timezone": "Africa/Johannesburg",
            },
            "initial_club_modules": ["member_portal"],
        },
    )
    assert response.status_code == 201
    assert response.json()["status"] == "initialized"

    second = client.post(
        "/api/platform/bootstrap",
        json={
            "superadmin": {
                "email": "second@example.com",
                "password": "password123",
                "display_name": "Second",
            }
        },
    )
    assert second.status_code == 409
    state = db_session.get(PlatformState, 1)
    assert state is not None
    assert state.is_initialized is True


def test_login_refresh_and_logout_flow(client: TestClient, db_session: Session) -> None:
    _create_user(db_session, email="member@example.com")

    login = _login(client, "member@example.com")
    assert login["token_type"] == "bearer"
    assert "greenlink_refresh_token" in client.cookies

    refresh = client.post("/api/auth/refresh")
    assert refresh.status_code == 200
    rotated_cookie = client.cookies.get("greenlink_refresh_token")
    assert rotated_cookie is not None

    logout = client.post(
        "/api/auth/logout", headers={"Authorization": f"Bearer {refresh.json()['access_token']}"}
    )
    assert logout.status_code == 204

    failed_refresh = client.post("/api/auth/refresh")
    assert failed_refresh.status_code == 401


def test_bootstrap_autoselects_single_active_membership(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="staff@example.com")
    club = _create_club(db_session, name="Club One", slug="club-one")
    _assign_membership(
        db_session, user=user, club=club, role=ClubMembershipRole.CLUB_STAFF, is_primary=True
    )

    login = _login(client, "staff@example.com")
    access_token = login["access_token"]
    response = client.get(
        "/api/session/bootstrap", headers={"Authorization": f"Bearer {access_token}"}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["selected_club_id"] == str(club.id)
    assert payload["landing_path"] == "/admin/dashboard"
    assert payload["club_selection_required"] is False


def test_bootstrap_requires_selection_for_multiple_active_memberships(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="multi@example.com")
    club_one = _create_club(db_session, name="North", slug="north")
    club_two = _create_club(db_session, name="South", slug="south")
    _assign_membership(db_session, user=user, club=club_one, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(
        db_session, user=user, club=club_two, role=ClubMembershipRole.CLUB_STAFF, is_primary=True
    )

    login = _login(client, "multi@example.com")
    access_token = login["access_token"]

    response = client.get(
        "/api/session/bootstrap", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert response.status_code == 200
    assert response.json()["club_selection_required"] is True
    assert response.json()["landing_path"] == "/select-club"

    selected = client.get(
        f"/api/session/bootstrap?selected_club_id={club_two.id}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert selected.status_code == 200
    assert selected.json()["selected_club_id"] == str(club_two.id)


def test_bootstrap_denies_club_scope_for_zero_active_memberships(
    client: TestClient, db_session: Session
) -> None:
    user = _create_user(db_session, email="invited@example.com")
    club = _create_club(db_session, name="Pending", slug="pending")
    _assign_membership(
        db_session,
        user=user,
        club=club,
        role=ClubMembershipRole.MEMBER,
        status=ClubMembershipStatus.INVITED,
    )

    login = _login(client, "invited@example.com")
    access_token = login["access_token"]
    response = client.get(
        "/api/session/bootstrap", headers={"Authorization": f"Bearer {access_token}"}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["selected_club_id"] is None
    assert payload["role_shell"] is None
    assert payload["available_clubs"][0]["selectable"] is False


def test_superadmin_can_preview_without_default_club(
    client: TestClient, db_session: Session
) -> None:
    _create_user(db_session, email="root@example.com", user_type=UserType.SUPERADMIN)
    club = _create_club(db_session, name="Preview Club", slug="preview-club")
    login = _login(client, "root@example.com")
    access_token = login["access_token"]

    response = client.get(
        "/api/session/bootstrap", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert response.status_code == 200
    assert response.json()["landing_path"] == "/superadmin/clubs"
    assert response.json()["role_shell"] == "superadmin"
    assert response.json()["available_clubs"][0]["club_id"] == str(club.id)

    selected = client.get(
        f"/api/session/bootstrap?selected_club_id={club.id}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert selected.status_code == 200
    assert selected.json()["selected_club_id"] == str(club.id)


def test_superadmin_bootstrap_ignores_deleted_selected_club(
    client: TestClient, db_session: Session
) -> None:
    _create_user(db_session, email="root@example.com", user_type=UserType.SUPERADMIN)
    club = _create_club(db_session, name="Archived Club", slug="archived-club")
    login = _login(client, "root@example.com")
    access_token = login["access_token"]

    selected = client.get(
        f"/api/session/bootstrap?selected_club_id={club.id}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert selected.status_code == 200
    assert selected.json()["selected_club_id"] == str(club.id)

    db_session.delete(club)
    db_session.commit()

    deleted_selected = client.get(
        f"/api/session/bootstrap?selected_club_id={club.id}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert deleted_selected.status_code == 200
    payload = deleted_selected.json()
    assert payload["selected_club_id"] is None
    assert payload["selected_club"] is None
    assert payload["available_clubs"] == []
    assert payload["landing_path"] == "/superadmin/clubs"
