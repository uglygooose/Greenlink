from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    AccountingExportProfile,
    Club,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    ClubModule,
    ClubOnboardingState,
    ClubOnboardingStep,
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


def _create_club(db: Session, *, name: str, slug: str) -> Club:
    club = Club(
        name=name,
        slug=slug,
        location="Durban",
        timezone="Africa/Johannesburg",
        onboarding_state=ClubOnboardingState.SETUP_IN_PROGRESS.value,
        onboarding_current_step=ClubOnboardingStep.FINANCE.value,
    )
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _auth_headers(client: TestClient, email: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_superadmin_can_create_club_and_initialize_onboarding(
    client: TestClient, db_session: Session
) -> None:
    _create_user(db_session, email="root@example.com", user_type=UserType.SUPERADMIN)
    headers = _auth_headers(client, "root@example.com")

    response = client.post(
        "/api/superadmin/clubs",
        headers=headers,
        json={
            "name": "Royal Cape",
            "location": "Cape Town",
            "timezone": "Africa/Johannesburg",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["name"] == "Royal Cape"
    assert payload["location"] == "Cape Town"
    assert payload["onboarding_state"] == "onboarding_started"
    assert payload["onboarding_current_step"] == "basic_info"
    assert payload["registry_status"] == "onboarding"


def test_superadmin_can_update_finance_selection_and_current_step(
    client: TestClient, db_session: Session
) -> None:
    root = _create_user(db_session, email="root@example.com", user_type=UserType.SUPERADMIN)
    club = _create_club(db_session, name="Pine Valley", slug="pine-valley")
    profile = AccountingExportProfile(
        club_id=club.id,
        code="generic_ops",
        name="Generic Ops",
        target_system="generic_journal",
        is_active=True,
        mapping_config_json={
            "reference_prefix": "GL",
            "fallback_customer_code": "UNASSIGNED",
            "transaction_mappings": {
                "charge": {
                    "debit_account_code": "1100-AR",
                    "credit_account_code": "4000-SALES",
                    "description_prefix": "Charge",
                },
                "payment": {
                    "debit_account_code": "1000-BANK",
                    "credit_account_code": "1100-AR",
                    "description_prefix": "Payment",
                },
                "adjustment": {
                    "debit_account_code": "9990-ADJUST",
                    "credit_account_code": "9990-ADJUST",
                    "description_prefix": "Adjust",
                },
            },
        },
        created_by_person_id=root.person_id,
    )
    db_session.add(profile)
    db_session.commit()
    headers = _auth_headers(client, "root@example.com")

    response = client.put(
        f"/api/superadmin/clubs/{club.id}/onboarding",
        headers=headers,
        json={
            "onboarding_current_step": "rules",
            "preferred_accounting_profile_id": str(profile.id),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["club"]["onboarding_current_step"] == "rules"
    assert payload["finance"]["selected_accounting_profile_id"] == str(profile.id)
    assert payload["finance"]["setup_complete"] is True


def test_superadmin_can_assign_existing_linked_user_to_club(
    client: TestClient, db_session: Session
) -> None:
    _create_user(db_session, email="root@example.com", user_type=UserType.SUPERADMIN)
    staff_user = _create_user(db_session, email="ops@example.com")
    club = _create_club(db_session, name="Pine Valley", slug="pine-valley")
    headers = _auth_headers(client, "root@example.com")

    candidates = client.get(
        f"/api/superadmin/clubs/{club.id}/assignment-candidates?q=ops",
        headers=headers,
    )
    assert candidates.status_code == 200
    assert candidates.json()["items"][0]["person_id"] == str(staff_user.person_id)

    response = client.post(
        f"/api/superadmin/clubs/{club.id}/assignments",
        headers=headers,
        json={"person_id": str(staff_user.person_id), "role": "club_staff"},
    )

    assert response.status_code == 201
    membership = db_session.query(ClubMembership).filter_by(club_id=club.id, person_id=staff_user.person_id).one()
    assert membership.role == ClubMembershipRole.CLUB_STAFF
    assert membership.status == ClubMembershipStatus.ACTIVE


def test_superadmin_can_update_enabled_modules_through_onboarding(
    client: TestClient, db_session: Session
) -> None:
    _create_user(db_session, email="root@example.com", user_type=UserType.SUPERADMIN)
    club = _create_club(db_session, name="Pine Valley", slug="pine-valley")
    db_session.add(ClubModule(club_id=club.id, module_key="golf", enabled=True))
    db_session.commit()
    headers = _auth_headers(client, "root@example.com")

    response = client.put(
        f"/api/superadmin/clubs/{club.id}/onboarding",
        headers=headers,
        json={
            "onboarding_current_step": "modules",
            "enabled_module_keys": ["finance", "communications"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["club"]["onboarding_current_step"] == "modules"
    assert sorted(payload["modules"]["enabled_module_keys"]) == ["communications", "finance"]
    module_keys = sorted(
        module.module_key
        for module in db_session.query(ClubModule).filter(ClubModule.club_id == club.id).all()
    )
    assert module_keys == ["communications", "finance"]


def test_superadmin_routes_are_forbidden_to_club_admin(
    client: TestClient, db_session: Session
) -> None:
    club_admin = _create_user(db_session, email="admin@example.com")
    club = _create_club(db_session, name="Pine Valley", slug="pine-valley")
    db_session.add(
        ClubMembership(
            club_id=club.id,
            person_id=club_admin.person_id,
            role=ClubMembershipRole.CLUB_ADMIN,
            status=ClubMembershipStatus.ACTIVE,
        )
    )
    db_session.commit()
    headers = _auth_headers(client, "admin@example.com")

    response = client.get("/api/superadmin/clubs", headers=headers)

    assert response.status_code == 403
