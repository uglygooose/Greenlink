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
)


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
    db: Session,
    *,
    user: User,
    club: Club,
    role: ClubMembershipRole,
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


def _auth_headers(client: TestClient, *, email: str, password: str = "password123") -> dict:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_create_blast_returns_draft_status(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, name="Blast Club", slug=f"blast-{uuid.uuid4().hex[:6]}")
    admin = _create_user(db_session, email=f"blast_admin_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)

    headers = _auth_headers(client, email=admin.email)
    headers["X-Club-Id"] = str(club.id)

    response = client.post(
        "/api/comms/blasts",
        headers=headers,
        json={
            "subject": "Weekend Competition",
            "body": "Please note that the weekend competition has been moved to Sunday.",
            "target_segment": "members",
            "channel": "in_app",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["subject"] == "Weekend Competition"
    assert data["status"] == "draft"
    assert data["target_segment"] == "members"
    assert data["channel"] == "in_app"
    assert data["sent_at"] is None
    assert data["recipient_count"] is None


def test_list_blasts_returns_club_blasts_only(
    client: TestClient, db_session: Session
) -> None:
    club_a = _create_club(db_session, name="Blast Club A", slug=f"blast-a-{uuid.uuid4().hex[:6]}")
    club_b = _create_club(db_session, name="Blast Club B", slug=f"blast-b-{uuid.uuid4().hex[:6]}")
    admin_a = _create_user(db_session, email=f"blast_admin_a_{uuid.uuid4().hex[:6]}@test.com")
    admin_b = _create_user(db_session, email=f"blast_admin_b_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=admin_a, club=club_a, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=admin_b, club=club_b, role=ClubMembershipRole.CLUB_ADMIN)

    # Create blast in club A
    headers_a = _auth_headers(client, email=admin_a.email)
    headers_a["X-Club-Id"] = str(club_a.id)
    client.post(
        "/api/comms/blasts",
        headers=headers_a,
        json={"subject": "Club A blast", "body": "Body A", "target_segment": "all", "channel": "in_app"},
    )

    # Create blast in club B
    headers_b = _auth_headers(client, email=admin_b.email)
    headers_b["X-Club-Id"] = str(club_b.id)
    client.post(
        "/api/comms/blasts",
        headers=headers_b,
        json={"subject": "Club B blast", "body": "Body B", "target_segment": "all", "channel": "in_app"},
    )

    # Admin A should only see their club's blasts
    response = client.get("/api/comms/blasts", headers=headers_a)
    assert response.status_code == 200
    data = response.json()
    assert data["total_count"] == 1
    assert data["blasts"][0]["subject"] == "Club A blast"


def test_staff_user_cannot_create_blast(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, name="Staff Blast Club", slug=f"staff-blast-{uuid.uuid4().hex[:6]}")
    staff = _create_user(db_session, email=f"staff_blast_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff, club=club, role=ClubMembershipRole.CLUB_STAFF)

    headers = _auth_headers(client, email=staff.email)
    headers["X-Club-Id"] = str(club.id)

    response = client.post(
        "/api/comms/blasts",
        headers=headers,
        json={"subject": "Unauthorized", "body": "Staff cannot send blasts.", "target_segment": "all", "channel": "in_app"},
    )
    assert response.status_code == 403


def test_send_blast_marks_sent_and_records_recipient_count(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, name="Send Blast Club", slug=f"send-blast-{uuid.uuid4().hex[:6]}")
    admin = _create_user(db_session, email=f"send_admin_{uuid.uuid4().hex[:6]}@test.com")
    member1 = _create_user(db_session, email=f"send_member1_{uuid.uuid4().hex[:6]}@test.com")
    member2 = _create_user(db_session, email=f"send_member2_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=member1, club=club, role=ClubMembershipRole.MEMBER)
    _assign_membership(db_session, user=member2, club=club, role=ClubMembershipRole.MEMBER)

    headers = _auth_headers(client, email=admin.email)
    headers["X-Club-Id"] = str(club.id)

    # Create draft blast targeting members
    create_resp = client.post(
        "/api/comms/blasts",
        headers=headers,
        json={"subject": "Members Notice", "body": "Notice body.", "target_segment": "members", "channel": "in_app"},
    )
    assert create_resp.status_code == 201
    blast_id = create_resp.json()["id"]

    # Send it
    send_resp = client.post(f"/api/comms/blasts/{blast_id}/send", headers=headers)
    assert send_resp.status_code == 200
    data = send_resp.json()
    assert data["status"] == "sent"
    assert data["recipient_count"] == 2
    assert "delivery_note" in data


def test_send_blast_all_segment_includes_all_active_roles(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, name="All Segment Club", slug=f"all-seg-{uuid.uuid4().hex[:6]}")
    admin = _create_user(db_session, email=f"all_admin_{uuid.uuid4().hex[:6]}@test.com")
    staff = _create_user(db_session, email=f"all_staff_{uuid.uuid4().hex[:6]}@test.com")
    member = _create_user(db_session, email=f"all_member_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=staff, club=club, role=ClubMembershipRole.CLUB_STAFF)
    _assign_membership(db_session, user=member, club=club, role=ClubMembershipRole.MEMBER)

    headers = _auth_headers(client, email=admin.email)
    headers["X-Club-Id"] = str(club.id)

    create_resp = client.post(
        "/api/comms/blasts",
        headers=headers,
        json={"subject": "All Hands", "body": "Club-wide notice.", "target_segment": "all", "channel": "in_app"},
    )
    blast_id = create_resp.json()["id"]

    send_resp = client.post(f"/api/comms/blasts/{blast_id}/send", headers=headers)
    assert send_resp.status_code == 200
    # admin (1) + staff (1) + member (1) = 3
    assert send_resp.json()["recipient_count"] == 3


def test_send_nonexistent_blast_returns_404(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, name="404 Blast Club", slug=f"blast-404-{uuid.uuid4().hex[:6]}")
    admin = _create_user(db_session, email=f"blast_404_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=admin, club=club, role=ClubMembershipRole.CLUB_ADMIN)

    headers = _auth_headers(client, email=admin.email)
    headers["X-Club-Id"] = str(club.id)

    fake_id = uuid.uuid4()
    response = client.post(f"/api/comms/blasts/{fake_id}/send", headers=headers)
    assert response.status_code == 404


def test_blast_from_another_club_is_not_accessible(
    client: TestClient, db_session: Session
) -> None:
    """Admin from club B cannot send a blast that belongs to club A."""
    club_a = _create_club(db_session, name="Tenant A", slug=f"tenant-a-{uuid.uuid4().hex[:6]}")
    club_b = _create_club(db_session, name="Tenant B", slug=f"tenant-b-{uuid.uuid4().hex[:6]}")
    admin_a = _create_user(db_session, email=f"tenant_a_{uuid.uuid4().hex[:6]}@test.com")
    admin_b = _create_user(db_session, email=f"tenant_b_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=admin_a, club=club_a, role=ClubMembershipRole.CLUB_ADMIN)
    _assign_membership(db_session, user=admin_b, club=club_b, role=ClubMembershipRole.CLUB_ADMIN)

    headers_a = _auth_headers(client, email=admin_a.email)
    headers_a["X-Club-Id"] = str(club_a.id)
    headers_b = _auth_headers(client, email=admin_b.email)
    headers_b["X-Club-Id"] = str(club_b.id)

    # Admin A creates a blast
    create_resp = client.post(
        "/api/comms/blasts",
        headers=headers_a,
        json={"subject": "Club A secret", "body": "Do not share.", "target_segment": "all", "channel": "in_app"},
    )
    blast_id = create_resp.json()["id"]

    # Admin B tries to send it using club B context — should 404 (blast not found in club B)
    send_resp = client.post(f"/api/comms/blasts/{blast_id}/send", headers=headers_b)
    assert send_resp.status_code == 404
