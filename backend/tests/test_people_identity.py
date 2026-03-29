from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email, normalize_phone
from app.models import (
    Club,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Person,
    ReadinessStatus,
    User,
    UserType,
)
from app.schemas.people import ClubMembershipCreateRequest
from app.services.people_service import PeopleService


def _create_person(
    db: Session,
    *,
    first_name: str,
    last_name: str = "",
    email: str | None = None,
    phone: str | None = None,
) -> Person:
    person = Person(
        first_name=first_name,
        last_name=last_name,
        full_name=build_full_name(first_name, last_name),
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        phone=phone,
        normalized_phone=normalize_phone(phone),
        profile_metadata={},
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


def _create_user(
    db: Session,
    *,
    email: str,
    user_type: UserType = UserType.USER,
    linked_person: Person | None = None,
) -> User:
    user = User(
        email=email,
        password_hash=hash_password("password123"),
        display_name=email.split("@")[0],
        user_type=user_type,
        person_id=linked_person.id if linked_person else None,
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
    person: Person,
    club: Club,
    role: ClubMembershipRole,
    status: ClubMembershipStatus = ClubMembershipStatus.ACTIVE,
    is_primary: bool = False,
    membership_number: str | None = None,
) -> ClubMembership:
    membership = ClubMembership(
        person_id=person.id,
        club_id=club.id,
        role=role,
        status=status,
        is_primary=is_primary,
        membership_number=membership_number,
        membership_metadata={},
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


def _auth_headers(client: TestClient, email: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_superadmin_can_create_and_update_person(client: TestClient, db_session: Session) -> None:
    linked_person = _create_person(
        db_session, first_name="Root", last_name="Admin", email="root@example.com"
    )
    _create_user(
        db_session,
        email="root@example.com",
        user_type=UserType.SUPERADMIN,
        linked_person=linked_person,
    )
    headers = _auth_headers(client, "root@example.com")

    created = client.post(
        "/api/people",
        headers=headers,
        json={
            "first_name": "Jordan",
            "last_name": "Miles",
            "email": "Jordan.Miles@Example.com",
            "phone": "+27 82 555 0101",
        },
    )
    assert created.status_code == 201
    person_id = created.json()["id"]
    assert created.json()["email"] == "jordan.miles@example.com"

    updated = client.patch(
        f"/api/people/{person_id}",
        headers=headers,
        json={"phone": "082 555 0101", "notes": "Updated in Phase 2 test"},
    )
    assert updated.status_code == 200
    assert updated.json()["phone"] == "082 555 0101"
    assert updated.json()["notes"] == "Updated in Phase 2 test"


def test_club_admin_can_create_membership_and_list_club_people(
    client: TestClient, db_session: Session
) -> None:
    admin_person = _create_person(
        db_session, first_name="Ava", last_name="Admin", email="admin@example.com"
    )
    admin_user = _create_user(db_session, email="admin@example.com", linked_person=admin_person)
    club = _create_club(db_session, name="Links", slug="links")
    _assign_membership(
        db_session,
        person=admin_person,
        club=club,
        role=ClubMembershipRole.CLUB_ADMIN,
        is_primary=True,
    )
    target_person = _create_person(
        db_session, first_name="Sam", last_name="Member", email="sam@example.com"
    )
    headers = _auth_headers(client, admin_user.email)

    membership = client.post(
        f"/api/people/memberships?selected_club_id={club.id}",
        headers=headers,
        json={
            "person_id": str(target_person.id),
            "role": "member",
            "status": "active",
            "membership_number": "M-1001",
        },
    )
    assert membership.status_code == 201
    assert membership.json()["membership_number"] == "M-1001"

    directory = client.get(
        f"/api/people/club-directory?selected_club_id={club.id}",
        headers=headers,
    )
    assert directory.status_code == 200
    assert str(target_person.id) in {item["person"]["id"] for item in directory.json()}


def test_same_person_can_belong_to_multiple_clubs(db_session: Session) -> None:
    service = PeopleService(db_session)
    person = _create_person(
        db_session, first_name="Multi", last_name="Club", email="multi@example.com"
    )
    club_one = _create_club(db_session, name="North", slug="north-club")
    club_two = _create_club(db_session, name="South", slug="south-club")

    service.upsert_membership(
        club_id=club_one.id,
        payload=ClubMembershipCreateRequest(
            person_id=person.id,
            role=ClubMembershipRole.MEMBER,
            status=ClubMembershipStatus.ACTIVE,
            membership_number="N-1",
        ),
    )
    service.upsert_membership(
        club_id=club_two.id,
        payload=ClubMembershipCreateRequest(
            person_id=person.id,
            role=ClubMembershipRole.CLUB_STAFF,
            status=ClubMembershipStatus.ACTIVE,
            membership_number="S-1",
        ),
    )

    memberships = service.list_person_memberships(person_id=person.id)
    assert len(memberships) == 2
    assert {item.club_id for item in memberships} == {club_one.id, club_two.id}


def test_user_can_exist_unlinked_then_be_linked_to_person(db_session: Session) -> None:
    person = _create_person(
        db_session, first_name="Linked", last_name="Later", email="later@example.com"
    )
    user = _create_user(db_session, email="later-login@example.com", linked_person=None)
    assert user.person_id is None

    service = PeopleService(db_session)
    service.link_user_to_person(user, person)

    db_session.refresh(user)
    assert user.person_id == person.id


def test_duplicate_detection_by_email_and_phone(client: TestClient, db_session: Session) -> None:
    root_person = _create_person(
        db_session, first_name="Root", last_name="Admin", email="root@example.com"
    )
    _create_user(
        db_session,
        email="root@example.com",
        user_type=UserType.SUPERADMIN,
        linked_person=root_person,
    )
    headers = _auth_headers(client, "root@example.com")
    first = _create_person(
        db_session,
        first_name="Casey",
        last_name="One",
        email="casey@example.com",
        phone="+27 82 123 4567",
    )
    _create_person(
        db_session,
        first_name="Casey",
        last_name="Two",
        email="CASEY@example.com",
        phone="0821234567",
    )

    response = client.get(f"/api/people/{first.id}/integrity", headers=headers)
    assert response.status_code == 200
    assert len(response.json()["duplicate_candidates"]) == 1
    assert response.json()["profile"]["status"] == ReadinessStatus.WARNING


def test_readiness_evaluation_flags_missing_contact_and_membership_number(
    client: TestClient, db_session: Session
) -> None:
    root_person = _create_person(
        db_session, first_name="Root", last_name="Admin", email="root@example.com"
    )
    _create_user(
        db_session,
        email="root@example.com",
        user_type=UserType.SUPERADMIN,
        linked_person=root_person,
    )
    headers = _auth_headers(client, "root@example.com")
    person = _create_person(db_session, first_name="No", last_name="", email=None, phone=None)
    club = _create_club(db_session, name="Profile Club", slug="profile-club")
    _assign_membership(
        db_session,
        person=person,
        club=club,
        role=ClubMembershipRole.MEMBER,
        membership_number=None,
    )

    response = client.get(f"/api/people/{person.id}/integrity", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["profile"]["status"] == ReadinessStatus.BLOCKED
    assert payload["memberships"][0]["status"] == ReadinessStatus.BLOCKED


def test_account_customer_creation_basics(client: TestClient, db_session: Session) -> None:
    admin_person = _create_person(
        db_session, first_name="Bill", last_name="Admin", email="bill@example.com"
    )
    admin_user = _create_user(db_session, email="bill@example.com", linked_person=admin_person)
    club = _create_club(db_session, name="Billing Club", slug="billing-club")
    _assign_membership(
        db_session,
        person=admin_person,
        club=club,
        role=ClubMembershipRole.CLUB_ADMIN,
        is_primary=True,
    )
    target_person = _create_person(
        db_session, first_name="Deb", last_name="Tor", email="deb@example.com"
    )
    _assign_membership(
        db_session,
        person=target_person,
        club=club,
        role=ClubMembershipRole.MEMBER,
        membership_number="D-01",
    )
    headers = _auth_headers(client, admin_user.email)

    response = client.post(
        f"/api/people/account-customers?selected_club_id={club.id}",
        headers=headers,
        json={"person_id": str(target_person.id), "account_code": "AC-100"},
    )
    assert response.status_code == 201
    assert response.json()["account_code"] == "AC-100"


def test_bulk_intake_preview_and_process_classify_expected_outcomes(
    client: TestClient, db_session: Session
) -> None:
    admin_person = _create_person(
        db_session, first_name="Batch", last_name="Admin", email="batch@example.com"
    )
    admin_user = _create_user(db_session, email="batch@example.com", linked_person=admin_person)
    club = _create_club(db_session, name="Import Club", slug="import-club")
    _assign_membership(
        db_session,
        person=admin_person,
        club=club,
        role=ClubMembershipRole.CLUB_ADMIN,
        is_primary=True,
    )
    existing_person = _create_person(
        db_session,
        first_name="Existing",
        last_name="Member",
        email="existing@example.com",
    )
    _create_person(
        db_session,
        first_name="Ambiguous",
        last_name="One",
        email="duplicate@example.com",
    )
    _create_person(
        db_session,
        first_name="Ambiguous",
        last_name="Two",
        email="DUPLICATE@example.com",
    )
    _assign_membership(
        db_session,
        person=existing_person,
        club=club,
        role=ClubMembershipRole.MEMBER,
        membership_number="OLD-1",
    )
    headers = _auth_headers(client, admin_user.email)
    payload = {
        "rows": [
            {"source_row_id": "new", "first_name": "New", "email": "new@example.com"},
            {
                "source_row_id": "update",
                "first_name": "Existing",
                "email": "existing@example.com",
                "membership_number": "NEW-1",
            },
            {
                "source_row_id": "duplicate",
                "first_name": "Ambiguous",
                "email": "duplicate@example.com",
            },
            {
                "source_row_id": "same",
                "first_name": "Existing",
                "email": "existing@example.com",
                "membership_number": "NEW-1",
            },
        ]
    }

    preview = client.post(
        f"/api/people/bulk-intake/preview?selected_club_id={club.id}",
        headers=headers,
        json=payload,
    )
    assert preview.status_code == 200
    assert preview.json()["counts"]["create_person_create_membership"] == 1
    assert preview.json()["counts"]["match_existing_update_membership"] == 2
    assert preview.json()["counts"]["reject_row"] == 1

    process = client.post(
        f"/api/people/bulk-intake/process?selected_club_id={club.id}",
        headers=headers,
        json=payload,
    )
    assert process.status_code == 200
    assert process.json()["counts"]["create_person_create_membership"] == 1
    assert process.json()["counts"]["match_existing_update_membership"] == 1

    follow_up = client.post(
        f"/api/people/bulk-intake/preview?selected_club_id={club.id}",
        headers=headers,
        json={
            "rows": [
                {
                    "source_row_id": "same",
                    "first_name": "Existing",
                    "email": "existing@example.com",
                    "membership_number": "NEW-1",
                }
            ]
        },
    )
    assert follow_up.status_code == 200
    assert follow_up.json()["counts"]["warning_only"] == 1


def test_member_cannot_access_people_management_api(
    client: TestClient, db_session: Session
) -> None:
    person = _create_person(
        db_session, first_name="Mia", last_name="Member", email="mia@example.com"
    )
    user = _create_user(db_session, email="mia@example.com", linked_person=person)
    club = _create_club(db_session, name="Member Club", slug="member-club")
    _assign_membership(
        db_session,
        person=person,
        club=club,
        role=ClubMembershipRole.MEMBER,
        is_primary=True,
    )
    headers = _auth_headers(client, user.email)

    response = client.get(
        f"/api/people/club-directory?selected_club_id={club.id}",
        headers=headers,
    )
    assert response.status_code == 403


def test_people_routes_require_explicit_selected_club(
    client: TestClient, db_session: Session
) -> None:
    person = _create_person(
        db_session, first_name="Alex", last_name="Admin", email="alex@example.com"
    )
    user = _create_user(db_session, email="alex@example.com", linked_person=person)
    club = _create_club(db_session, name="Explicit Club", slug="explicit-club")
    _assign_membership(
        db_session,
        person=person,
        club=club,
        role=ClubMembershipRole.CLUB_ADMIN,
        is_primary=True,
    )
    headers = _auth_headers(client, user.email)

    response = client.get("/api/people/club-directory", headers=headers)
    assert response.status_code == 403


def test_club_admin_cannot_access_people_from_other_club(
    client: TestClient, db_session: Session
) -> None:
    admin_person = _create_person(
        db_session, first_name="Nora", last_name="Admin", email="nora@example.com"
    )
    user = _create_user(db_session, email="nora@example.com", linked_person=admin_person)
    club_one = _create_club(db_session, name="One", slug="one-club")
    club_two = _create_club(db_session, name="Two", slug="two-club")
    _assign_membership(
        db_session,
        person=admin_person,
        club=club_one,
        role=ClubMembershipRole.CLUB_ADMIN,
        is_primary=True,
    )
    remote_person = _create_person(
        db_session, first_name="Remote", last_name="Member", email="remote@example.com"
    )
    _assign_membership(
        db_session,
        person=remote_person,
        club=club_two,
        role=ClubMembershipRole.MEMBER,
        membership_number="T-10",
    )
    headers = _auth_headers(client, user.email)

    response = client.get(
        f"/api/people/{remote_person.id}?selected_club_id={club_one.id}",
        headers=headers,
    )
    assert response.status_code == 404


def test_club_staff_can_preview_bulk_intake_but_cannot_process(
    client: TestClient, db_session: Session
) -> None:
    staff_person = _create_person(
        db_session, first_name="Staff", last_name="User", email="staff@example.com"
    )
    user = _create_user(db_session, email="staff@example.com", linked_person=staff_person)
    club = _create_club(db_session, name="Staff Club", slug="staff-club")
    _assign_membership(
        db_session,
        person=staff_person,
        club=club,
        role=ClubMembershipRole.CLUB_STAFF,
        is_primary=True,
    )
    headers = _auth_headers(client, user.email)
    payload = {
        "rows": [
            {"source_row_id": "preview", "first_name": "Preview", "email": "preview@example.com"}
        ]
    }

    preview = client.post(
        f"/api/people/bulk-intake/preview?selected_club_id={club.id}",
        headers=headers,
        json=payload,
    )
    assert preview.status_code == 200

    process = client.post(
        f"/api/people/bulk-intake/process?selected_club_id={club.id}",
        headers=headers,
        json=payload,
    )
    assert process.status_code == 403
