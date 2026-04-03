from __future__ import annotations

import uuid
from datetime import datetime, timezone

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
from app.models.enums import NewsPostStatus, NewsPostVisibility
from app.models.news_post import NewsPost


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


def _create_post(
    db: Session,
    *,
    club: Club,
    author_person_id,
    title: str,
    body: str,
    visibility: NewsPostVisibility,
    status: NewsPostStatus,
    pinned: bool = False,
    published_at: datetime | None = None,
) -> NewsPost:
    post = NewsPost(
        club_id=club.id,
        author_person_id=author_person_id,
        title=title,
        body=body,
        visibility=visibility,
        status=status,
        pinned=pinned,
        published_at=published_at,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def _auth_headers(client: TestClient, *, email: str, password: str = "password123") -> dict:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_list_published_news_feed_allows_members_and_filters_visible_posts(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(db_session, name="Comms Club", slug=f"comms-{uuid.uuid4().hex[:6]}")
    member = _create_user(db_session, email=f"comms_member_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=member, club=club, role=ClubMembershipRole.MEMBER)

    _create_post(
        db_session,
        club=club,
        author_person_id=member.person_id,
        title="Pinned Update",
        body="Pinned published post",
        visibility=NewsPostVisibility.MEMBERS_ONLY,
        status=NewsPostStatus.PUBLISHED,
        pinned=True,
        published_at=datetime(2026, 4, 2, 9, 0, tzinfo=timezone.utc),
    )
    _create_post(
        db_session,
        club=club,
        author_person_id=member.person_id,
        title="Public Update",
        body="Visible to everyone",
        visibility=NewsPostVisibility.PUBLIC,
        status=NewsPostStatus.PUBLISHED,
        published_at=datetime(2026, 4, 2, 8, 0, tzinfo=timezone.utc),
    )
    _create_post(
        db_session,
        club=club,
        author_person_id=member.person_id,
        title="Draft Update",
        body="Not visible yet",
        visibility=NewsPostVisibility.MEMBERS_ONLY,
        status=NewsPostStatus.DRAFT,
    )
    _create_post(
        db_session,
        club=club,
        author_person_id=member.person_id,
        title="Internal Update",
        body="Staff only",
        visibility=NewsPostVisibility.INTERNAL,
        status=NewsPostStatus.PUBLISHED,
        published_at=datetime(2026, 4, 2, 7, 0, tzinfo=timezone.utc),
    )

    headers = _auth_headers(client, email=member.email)
    headers["X-Club-Id"] = str(club.id)

    response = client.get("/api/comms/feed", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert [post["title"] for post in data["posts"]] == ["Pinned Update", "Public Update"]
    assert data["total_count"] == 2


def test_create_news_post_uses_current_user_person_as_author(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(
        db_session,
        name="Comms Admin Club",
        slug=f"comms-admin-{uuid.uuid4().hex[:6]}",
    )
    admin_user = _create_user(db_session, email=f"comms_admin_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=admin_user, club=club, role=ClubMembershipRole.CLUB_ADMIN)

    headers = _auth_headers(client, email=admin_user.email)
    headers["X-Club-Id"] = str(club.id)

    response = client.post(
        "/api/comms/posts",
        headers=headers,
        json={
            "title": "Opening Hours",
            "body": "The halfway house opens at 06:30 tomorrow.",
            "visibility": "members_only",
            "pinned": True,
            "publish": True,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Opening Hours"
    assert data["status"] == "published"
    assert data["author"]["person_id"] == str(admin_user.person_id)


def test_staff_user_cannot_create_news_posts(
    client: TestClient, db_session: Session
) -> None:
    club = _create_club(
        db_session,
        name="Comms Staff Club",
        slug=f"comms-staff-{uuid.uuid4().hex[:6]}",
    )
    staff_user = _create_user(db_session, email=f"comms_staff_{uuid.uuid4().hex[:6]}@test.com")
    _assign_membership(db_session, user=staff_user, club=club, role=ClubMembershipRole.CLUB_STAFF)

    headers = _auth_headers(client, email=staff_user.email)
    headers["X-Club-Id"] = str(club.id)

    response = client.post(
        "/api/comms/posts",
        headers=headers,
        json={
            "title": "Staff Update",
            "body": "Staff should not publish member updates.",
            "visibility": "members_only",
            "pinned": False,
            "publish": True,
        },
    )

    assert response.status_code == 403
    assert response.json()["message"] == "Club admin access is required for club configuration changes"
