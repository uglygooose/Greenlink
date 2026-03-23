from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func

# Keep tests local/offline and deterministic.
os.environ.setdefault("FORCE_SQLITE", "1")
os.environ.setdefault("SQLITE_FALLBACK_URL", "sqlite:///./_codex_contract_test.db")
os.environ.setdefault("GREENLINK_ENV", "test")
os.environ.setdefault("GREENLINK_ASSUME_LOCAL", "1")
os.environ.setdefault("SECRET_KEY", "greenlink_test_secret_key_change_me_now")
os.environ.setdefault("DEMO_SEED_ADMIN", "0")

from app import models
from app.auth import get_password_hash
from app.database import SessionLocal
from app.main import app
from app.platform_bootstrap import (
    DEFAULT_CLUB_ADMIN_PASSWORD,
    DEFAULT_SUPER_ADMIN_PASSWORD,
    _assert_safe_bootstrap_credentials,
)


def _route_pairs_from_app() -> set[tuple[str, str]]:
    pairs: set[tuple[str, str]] = set()
    for route in app.routes:
        path = getattr(route, "path", None)
        if not path:
            continue
        methods = set(getattr(route, "methods", set()) or set())
        if "GET" in methods and "HEAD" in methods:
            methods.remove("HEAD")
        if not methods:
            methods = {""}
        for method in methods:
            pairs.add((str(method), str(path)))
    return pairs


def _seed_users() -> dict[str, int | str]:
    admin_email = "contract-admin@greenlinkqa.com"
    staff_email = "contract-staff@greenlinkqa.com"
    member_email = "contract-member@greenlinkqa.com"
    super_admin_email = "contract-super@greenlinkqa.com"
    password = "ContractPass!12345"

    with SessionLocal() as db:
        club_a = db.query(models.Club).filter(func.lower(models.Club.slug) == "contract-a").first()
        if not club_a:
            club_a = models.Club(name="Contract Club A", slug="contract-a", active=1)
            db.add(club_a)
            db.flush()

        club_b = db.query(models.Club).filter(func.lower(models.Club.slug) == "contract-b").first()
        if not club_b:
            club_b = models.Club(name="Contract Club B", slug="contract-b", active=1)
            db.add(club_b)
            db.flush()

        admin = db.query(models.User).filter(func.lower(models.User.email) == admin_email.lower()).first()
        if not admin:
            admin = models.User(
                name="Contract Admin",
                email=admin_email,
                password=get_password_hash(password),
                role=models.UserRole.admin,
                club_id=int(club_a.id),
            )
            db.add(admin)
            db.flush()
        else:
            admin.password = get_password_hash(password)
            admin.role = models.UserRole.admin
            admin.club_id = int(club_a.id)

        assignment = (
            db.query(models.UserClubAssignment)
            .filter(models.UserClubAssignment.user_id == int(admin.id), models.UserClubAssignment.club_id == int(club_a.id))
            .first()
        )
        if not assignment:
            db.add(
                models.UserClubAssignment(
                    user_id=int(admin.id),
                    club_id=int(club_a.id),
                    role=models.UserRole.admin.value,
                    is_primary=True,
                )
            )

        staff = db.query(models.User).filter(func.lower(models.User.email) == staff_email.lower()).first()
        if not staff:
            staff = models.User(
                name="Contract Staff",
                email=staff_email,
                password=get_password_hash(password),
                role=models.UserRole.club_staff,
                club_id=int(club_a.id),
            )
            db.add(staff)
            db.flush()
        else:
            staff.password = get_password_hash(password)
            staff.role = models.UserRole.club_staff
            staff.club_id = int(club_a.id)

        staff_assignment = (
            db.query(models.UserClubAssignment)
            .filter(models.UserClubAssignment.user_id == int(staff.id), models.UserClubAssignment.club_id == int(club_a.id))
            .first()
        )
        if not staff_assignment:
            db.add(
                models.UserClubAssignment(
                    user_id=int(staff.id),
                    club_id=int(club_a.id),
                    role=models.UserRole.club_staff.value,
                    is_primary=True,
                )
            )

        member = db.query(models.User).filter(func.lower(models.User.email) == member_email.lower()).first()
        if not member:
            member = models.User(
                name="Contract Member",
                email=member_email,
                password=get_password_hash(password),
                role=models.UserRole.player,
                club_id=int(club_b.id),
            )
            db.add(member)
            db.flush()
        else:
            member.password = get_password_hash(password)
            member.role = models.UserRole.player
            member.club_id = int(club_b.id)

        member_assignment = (
            db.query(models.UserClubAssignment)
            .filter(models.UserClubAssignment.user_id == int(member.id), models.UserClubAssignment.club_id == int(club_b.id))
            .first()
        )
        if not member_assignment:
            db.add(
                models.UserClubAssignment(
                    user_id=int(member.id),
                    club_id=int(club_b.id),
                    role=models.UserRole.player.value,
                    is_primary=True,
                )
            )

        super_admin = db.query(models.User).filter(func.lower(models.User.email) == super_admin_email.lower()).first()
        if not super_admin:
            super_admin = models.User(
                name="Contract Super",
                email=super_admin_email,
                password=get_password_hash(password),
                role=models.UserRole.super_admin,
                club_id=None,
            )
            db.add(super_admin)
            db.flush()
        else:
            super_admin.password = get_password_hash(password)
            super_admin.role = models.UserRole.super_admin
            super_admin.club_id = None

        db.commit()
        return {
            "admin_email": admin_email,
            "staff_email": staff_email,
            "member_email": member_email,
            "super_admin_email": super_admin_email,
            "password": password,
            "club_a_id": int(club_a.id),
            "club_b_id": int(club_b.id),
        }


@pytest.fixture(scope="module")
def seeded_contract():
    return _seed_users()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _login(client: TestClient, email: str, password: str) -> str:
    response = client.post(
        "/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    token = str(payload.get("access_token") or "")
    assert token
    return token


def test_route_snapshot_preserved():
    baseline_path = Path(__file__).resolve().parent / "route_snapshot_baseline.json"
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    expected_pairs = {(str(item["method"]), str(item["path"])) for item in list(baseline.get("routes") or [])}
    current_pairs = _route_pairs_from_app()

    missing = sorted(expected_pairs - current_pairs)
    assert not missing, f"Missing routes: {missing[:20]}"
    # Contract guard from prior audit baseline.
    assert len(current_pairs) >= 126


def test_health_startup_diagnostics_available(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert "startup" in payload
    startup = payload.get("startup") or {}
    assert str(startup.get("status") or "").lower() != "failed"


def test_admin_shell_no_longer_embeds_legacy_tee_or_booking_pages():
    admin_js = (Path(__file__).resolve().parents[1] / "frontend" / "admin.js").read_text(encoding="utf-8")
    admin_css = (Path(__file__).resolve().parents[1] / "frontend" / "admin-style.css").read_text(encoding="utf-8")

    forbidden_js_markers = [
        "data-open-tee-sheet",
        "/frontend/tsheet.html?embedded=1",
        "/frontend/booking.html?embedded=1",
        "<iframe",
    ]
    for marker in forbidden_js_markers:
        assert marker not in admin_js, f"Legacy embed marker still present in admin shell JS: {marker}"

    forbidden_css_markers = [
        ".embedded-workspace",
        ".embedded-workspace-frame",
        ".golf-embedded-frame",
    ]
    for marker in forbidden_css_markers:
        assert marker not in admin_css, f"Legacy embed styling still present in admin shell CSS: {marker}"


def test_frontend_pages_are_not_frameable_by_default(client: TestClient):
    response = client.get("/frontend/admin.html")
    assert response.status_code == 200
    assert str(response.headers.get("X-Frame-Options") or "").upper() == "DENY"


def test_metrics_fails_closed_in_production_without_token(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GREENLINK_ENV", "production")
    monkeypatch.setenv("GREENLINK_ASSUME_LOCAL", "0")
    monkeypatch.delenv("METRICS_TOKEN", raising=False)
    monkeypatch.delenv("METRICS_ALLOW_UNAUTHENTICATED", raising=False)

    response = client.get("/metrics")
    assert response.status_code == 403


def test_metrics_allows_local_without_token(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GREENLINK_ENV", "development")
    monkeypatch.setenv("GREENLINK_ASSUME_LOCAL", "1")
    monkeypatch.delenv("METRICS_TOKEN", raising=False)
    monkeypatch.delenv("METRICS_ALLOW_UNAUTHENTICATED", raising=False)

    response = client.get("/metrics")
    assert response.status_code == 200
    payload = response.json()
    assert "routes" in payload


def test_metrics_requires_token_when_configured(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("GREENLINK_ENV", "production")
    monkeypatch.setenv("GREENLINK_ASSUME_LOCAL", "0")
    monkeypatch.setenv("METRICS_TOKEN", "contract-metrics-token")
    monkeypatch.setenv("METRICS_ALLOW_UNAUTHENTICATED", "0")

    forbidden = client.get("/metrics")
    assert forbidden.status_code == 403

    allowed = client.get("/metrics", headers={"X-Metrics-Token": "contract-metrics-token"})
    assert allowed.status_code == 200


def test_auth_and_admin_tenancy_scope(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["admin_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    ok_response = client.get("/api/admin/dashboard", headers=headers)
    assert ok_response.status_code == 200, ok_response.text

    wrong_club = client.get(
        f"/api/admin/dashboard?club_id={int(seeded_contract['club_b_id'])}",
        headers=headers,
    )
    assert wrong_club.status_code == 403


def test_super_admin_requires_club_context(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["super_admin_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    missing_club = client.get("/api/admin/dashboard", headers=headers)
    assert missing_club.status_code == 400

    with_club = client.get(
        f"/api/admin/dashboard?club_id={int(seeded_contract['club_a_id'])}",
        headers=headers,
    )
    assert with_club.status_code == 200, with_club.text


def test_staff_can_read_club_communications(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["staff_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    response = client.get("/api/admin/communications?status=published", headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "communications" in payload


def test_session_bootstrap_role_shells_and_club_scope(client: TestClient, seeded_contract: dict[str, int | str]):
    admin_token = _login(
        client,
        email=str(seeded_contract["admin_email"]),
        password=str(seeded_contract["password"]),
    )
    admin_response = client.get("/api/session/bootstrap", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_response.status_code == 200, admin_response.text
    admin_payload = admin_response.json()
    assert admin_payload["role_shell"] == "club_admin"
    assert admin_payload["default_workspace"] == "overview"
    assert admin_payload["landing_path"] == "/frontend/admin.html?workspace=overview"
    assert admin_payload["effective_club"]["id"] == int(seeded_contract["club_a_id"])
    assert admin_payload["allowed_workspaces"] == [
        "overview",
        "golf",
        "operations",
        "members",
        "communications",
        "reports",
        "settings",
    ]

    staff_token = _login(
        client,
        email=str(seeded_contract["staff_email"]),
        password=str(seeded_contract["password"]),
    )
    staff_response = client.get("/api/session/bootstrap", headers={"Authorization": f"Bearer {staff_token}"})
    assert staff_response.status_code == 200, staff_response.text
    staff_payload = staff_response.json()
    assert staff_payload["role_shell"] == "staff"
    assert staff_payload["default_workspace"] == "today"
    assert staff_payload["landing_path"] == "/frontend/admin.html?workspace=today"
    assert staff_payload["effective_club"]["id"] == int(seeded_contract["club_a_id"])
    assert staff_payload["allowed_workspaces"] == ["today", "golf", "operations", "members", "communications"]

    member_token = _login(
        client,
        email=str(seeded_contract["member_email"]),
        password=str(seeded_contract["password"]),
    )
    member_response = client.get("/api/session/bootstrap", headers={"Authorization": f"Bearer {member_token}"})
    assert member_response.status_code == 200, member_response.text
    member_payload = member_response.json()
    assert member_payload["role_shell"] == "member"
    assert member_payload["default_workspace"] == "home"
    assert member_payload["landing_path"] == "/frontend/dashboard.html?view=home"
    assert member_payload["effective_club"]["id"] == int(seeded_contract["club_b_id"])
    assert member_payload["allowed_workspaces"] == ["home", "bookings", "news", "messages", "profile"]

    super_token = _login(
        client,
        email=str(seeded_contract["super_admin_email"]),
        password=str(seeded_contract["password"]),
    )
    super_headers = {"Authorization": f"Bearer {super_token}"}
    super_response = client.get("/api/session/bootstrap", headers=super_headers)
    assert super_response.status_code == 200, super_response.text
    super_payload = super_response.json()
    assert super_payload["role_shell"] == "super_admin"
    assert super_payload["default_workspace"] == "overview"
    assert super_payload["effective_club"] is None
    assert super_payload["allowed_workspaces"] == ["overview", "clubs", "onboarding", "demo", "users", "settings"]

    preview_response = client.get(
        f"/api/session/bootstrap?preview_club_id={int(seeded_contract['club_b_id'])}",
        headers=super_headers,
    )
    assert preview_response.status_code == 200, preview_response.text
    preview_payload = preview_response.json()
    assert preview_payload["preview_club"]["id"] == int(seeded_contract["club_b_id"])


def test_bootstrap_guard_blocks_unsafe_default_passwords(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.platform_bootstrap.is_production_like", lambda: True)
    with pytest.raises(RuntimeError):
        _assert_safe_bootstrap_credentials(
            create_missing_users=True,
            force_reset=False,
            super_password=DEFAULT_SUPER_ADMIN_PASSWORD,
            admin_password="StrongAdminPassword!123",
        )
    with pytest.raises(RuntimeError):
        _assert_safe_bootstrap_credentials(
            create_missing_users=True,
            force_reset=False,
            super_password="StrongSuperPassword!123",
            admin_password=DEFAULT_CLUB_ADMIN_PASSWORD,
        )


def test_bootstrap_guard_allows_strong_passwords(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.platform_bootstrap.is_production_like", lambda: True)
    _assert_safe_bootstrap_credentials(
        create_missing_users=True,
        force_reset=True,
        super_password="StrongSuperPassword!123",
        admin_password="StrongAdminPassword!123",
    )
