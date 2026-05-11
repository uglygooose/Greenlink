from __future__ import annotations

import uuid

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
    Person,
    User,
    UserType,
)


def _create_user(
    db: Session,
    *,
    email: str,
    user_type: UserType = UserType.USER,
    club: Club | None = None,
    role: ClubMembershipRole | None = None,
) -> User:
    local = email.split("@")[0]
    person = Person(
        first_name=local.title(),
        last_name="User",
        full_name=build_full_name(local.title(), "User"),
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        profile_metadata={},
    )
    db.add(person)
    db.flush()
    user = User(
        email=email,
        password_hash=hash_password("password123"),
        display_name=local,
        user_type=user_type,
        person_id=person.id,
    )
    db.add(user)
    db.flush()
    if club is not None and role is not None:
        db.add(
            ClubMembership(
                club_id=club.id,
                person_id=person.id,
                role=role,
                status=ClubMembershipStatus.ACTIVE,
            )
        )
    db.commit()
    db.refresh(user)
    return user


def _create_club(db: Session, *, slug: str) -> Club:
    club = Club(
        name=f"Club {slug}",
        slug=slug,
        location="Johannesburg",
        timezone="Africa/Johannesburg",
    )
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _auth_headers(client: TestClient, *, email: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _profile_payload(club_id: uuid.UUID, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "club_id": str(club_id),
        "code": "generic_ops",
        "name": "Generic Ops",
        "target_system": "generic_journal",
        "is_active": True,
        "mapping_config": {
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
                "refund": {
                    "debit_account_code": "4000-SALES",
                    "credit_account_code": "1100-AR",
                    "description_prefix": "Refund",
                },
            },
        },
    }
    payload.update(overrides)
    return payload


def test_superadmin_can_create_and_filter_accounting_profiles_by_club(
    client: TestClient,
    db_session: Session,
) -> None:
    root = _create_user(
        db_session,
        email=f"root_{uuid.uuid4().hex[:6]}@example.com",
        user_type=UserType.SUPERADMIN,
    )
    club_a = _create_club(db_session, slug=f"sa-acc-a-{uuid.uuid4().hex[:6]}")
    club_b = _create_club(db_session, slug=f"sa-acc-b-{uuid.uuid4().hex[:6]}")
    headers = _auth_headers(client, email=root.email)

    created_a = client.post(
        "/api/superadmin/accounting-profiles",
        headers=headers,
        json=_profile_payload(club_a.id),
    )
    created_b = client.post(
        "/api/superadmin/accounting-profiles",
        headers=headers,
        json=_profile_payload(
            club_b.id,
            code="sage_ops",
            name="Sage Ops",
            target_system="sage_like",
        ),
    )
    listed_all = client.get("/api/superadmin/accounting-profiles", headers=headers)
    listed_a = client.get(
        f"/api/superadmin/accounting-profiles?club_id={club_a.id}", headers=headers
    )

    assert created_a.status_code == 201
    assert created_b.status_code == 201
    assert listed_all.status_code == 200
    assert listed_all.json()["total_count"] == 2
    assert listed_a.status_code == 200
    assert listed_a.json()["total_count"] == 1
    assert listed_a.json()["profiles"][0]["club_id"] == str(club_a.id)
    assert listed_a.json()["profiles"][0]["club_name"] == club_a.name


def test_superadmin_can_toggle_and_bind_accounting_profiles(
    client: TestClient,
    db_session: Session,
) -> None:
    root = _create_user(
        db_session,
        email=f"root_toggle_{uuid.uuid4().hex[:6]}@example.com",
        user_type=UserType.SUPERADMIN,
    )
    club = _create_club(db_session, slug=f"sa-bind-{uuid.uuid4().hex[:6]}")
    headers = _auth_headers(client, email=root.email)

    first = client.post(
        "/api/superadmin/accounting-profiles",
        headers=headers,
        json=_profile_payload(club.id, code="generic_ops", name="Generic Ops"),
    )
    second = client.post(
        "/api/superadmin/accounting-profiles",
        headers=headers,
        json=_profile_payload(
            club.id,
            code="pastel_ops",
            name="Pastel Ops",
            is_active=False,
            target_system="pastel_like",
        ),
    )
    toggle = client.patch(
        f"/api/superadmin/accounting-profiles/{second.json()['id']}/active",
        headers=headers,
        json={"is_active": True},
    )
    bind = client.post(
        f"/api/superadmin/clubs/{club.id}/onboarding/finance/bind-profile",
        headers=headers,
        json={"profile_id": second.json()["id"]},
    )
    deactivate = client.patch(
        f"/api/superadmin/accounting-profiles/{second.json()['id']}/active",
        headers=headers,
        json={"is_active": False},
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert toggle.status_code == 200
    assert toggle.json()["is_active"] is True
    assert bind.status_code == 200
    assert bind.json()["finance"]["selected_accounting_profile_id"] == second.json()["id"]
    assert bind.json()["finance"]["setup_complete"] is True
    assert deactivate.status_code == 200
    assert deactivate.json()["is_active"] is False

    profiles = {
        str(profile.id): profile
        for profile in db_session.query(AccountingExportProfile)
        .filter(AccountingExportProfile.club_id == club.id)
        .all()
    }
    assert profiles[first.json()["id"]].is_active is False
    assert profiles[second.json()["id"]].is_active is False


def test_superadmin_accounting_profile_routes_forbid_club_admin(
    client: TestClient,
    db_session: Session,
) -> None:
    club = _create_club(db_session, slug=f"sa-forbid-{uuid.uuid4().hex[:6]}")
    club_admin = _create_user(
        db_session,
        email=f"admin_{uuid.uuid4().hex[:6]}@example.com",
        club=club,
        role=ClubMembershipRole.CLUB_ADMIN,
    )
    headers = _auth_headers(client, email=club_admin.email)

    response = client.get("/api/superadmin/accounting-profiles", headers=headers)

    assert response.status_code == 403


def test_superadmin_can_parse_csv_template_and_fetch_sample_layout(
    client: TestClient,
    db_session: Session,
) -> None:
    root = _create_user(
        db_session,
        email=f"root_parse_{uuid.uuid4().hex[:6]}@example.com",
        user_type=UserType.SUPERADMIN,
    )
    headers = _auth_headers(client, email=root.email)

    parse_response = client.post(
        "/api/superadmin/accounting-profiles/parse-template",
        headers=headers,
        files={
            "file": (
                "sage-template.csv",
                "Date,Reference,Description,Debit,Credit,Amount\n2026-04-10,GL-1,Charge Green fee,1100-AR,4000-SALES,450.00\n",
                "text/csv",
            )
        },
    )
    sample_response = client.get(
        "/api/superadmin/accounting-profiles/sample-layout",
        headers=headers,
        params={"target_system": "pastel_like"},
    )

    assert parse_response.status_code == 200
    assert parse_response.json()["headerless"] is False
    assert parse_response.json()["suggested_target_system"] in {"generic_journal", "sage_like"}
    assert parse_response.json()["suggested_mapping"]["date"] == "Date"
    assert parse_response.json()["sample_rows"][0]["values"][0] == "2026-04-10"

    assert sample_response.status_code == 200
    assert sample_response.json()["target_system"] == "pastel_like"
    assert sample_response.json()["headerless"] is True
    assert "2026-04-10" in sample_response.json()["sample_csv"]


def test_superadmin_parse_template_detects_headerless_pastel_like_layout(
    client: TestClient,
    db_session: Session,
) -> None:
    root = _create_user(
        db_session,
        email=f"root_headerless_{uuid.uuid4().hex[:6]}@example.com",
        user_type=UserType.SUPERADMIN,
    )
    headers = _auth_headers(client, email=root.email)

    response = client.post(
        "/api/superadmin/accounting-profiles/parse-template",
        headers=headers,
        files={
            "file": (
                "pastel-template.csv",
                "2026-04-10,GL-1,1100AR,4000SAL,450.00,MEM001,Charge Green fee,booking\n",
                "text/csv",
            )
        },
    )

    assert response.status_code == 200
    assert response.json()["headerless"] is True
    assert response.json()["suggested_target_system"] == "pastel_like"
    assert response.json()["suggested_mapping"]["date"] == "Column A"
    assert response.json()["warnings"]
