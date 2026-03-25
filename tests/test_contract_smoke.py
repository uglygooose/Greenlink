from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

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
    club_a_player_email = "contract-club-a-player@greenlinkqa.com"
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

        club_a_player = db.query(models.User).filter(func.lower(models.User.email) == club_a_player_email.lower()).first()
        if not club_a_player:
            club_a_player = models.User(
                name="Contract Club A Player",
                email=club_a_player_email,
                password=get_password_hash(password),
                role=models.UserRole.player,
                club_id=int(club_a.id),
            )
            db.add(club_a_player)
            db.flush()
        else:
            club_a_player.password = get_password_hash(password)
            club_a_player.role = models.UserRole.player
            club_a_player.club_id = int(club_a.id)

        club_a_player_assignment = (
            db.query(models.UserClubAssignment)
            .filter(models.UserClubAssignment.user_id == int(club_a_player.id), models.UserClubAssignment.club_id == int(club_a.id))
            .first()
        )
        if not club_a_player_assignment:
            db.add(
                models.UserClubAssignment(
                    user_id=int(club_a_player.id),
                    club_id=int(club_a.id),
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
            "club_a_player_email": club_a_player_email,
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


def test_admin_shell_communications_owned_by_module():
    root = Path(__file__).resolve().parents[1]
    admin_html = (root / "frontend" / "admin.html").read_text(encoding="utf-8")
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    communications_js = (root / "frontend" / "js" / "admin" / "communications.js").read_text(encoding="utf-8")

    assert "js/admin/communications.js" in admin_html
    assert "GreenLinkAdminCommunications" in communications_js
    assert "GreenLinkAdminCommunications.bundle" in admin_js
    assert "GreenLinkAdminCommunications.renderWorkspace" in admin_js
    assert "GreenLinkAdminCommunications.submitForm" in admin_js


def test_admin_shell_club_settings_owned_by_module():
    root = Path(__file__).resolve().parents[1]
    admin_html = (root / "frontend" / "admin.html").read_text(encoding="utf-8")
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    club_settings_js = (root / "frontend" / "js" / "admin" / "club-settings.js").read_text(encoding="utf-8")

    assert "js/admin/club-settings.js" in admin_html
    assert "GreenLinkAdminClubSettings" in club_settings_js
    assert "GreenLinkAdminClubSettings.bundle" in admin_js
    assert "GreenLinkAdminClubSettings.renderWorkspace" in admin_js
    assert "GreenLinkAdminClubSettings.submitBookingWindowForm" in admin_js
    assert "GreenLinkAdminClubSettings.submitClubProfileForm" in admin_js


def test_admin_shell_staff_panel_owned_by_module():
    root = Path(__file__).resolve().parents[1]
    admin_html = (root / "frontend" / "admin.html").read_text(encoding="utf-8")
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    staff_panel_js = (root / "frontend" / "js" / "admin" / "staff-panel.js").read_text(encoding="utf-8")

    assert "js/admin/staff-panel.js" in admin_html
    assert "GreenLinkAdminStaffPanel" in staff_panel_js
    assert "GreenLinkAdminStaffPanel.renderPanel" in admin_js
    assert "GreenLinkAdminStaffPanel.submitForm" in admin_js
    assert "GreenLinkAdminStaffPanel.resetForm" in admin_js
    assert "GreenLinkAdminStaffPanel.editUser" in admin_js


def test_admin_shell_members_panel_owned_by_module():
    root = Path(__file__).resolve().parents[1]
    admin_html = (root / "frontend" / "admin.html").read_text(encoding="utf-8")
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    members_panel_js = (root / "frontend" / "js" / "admin" / "members-panel.js").read_text(encoding="utf-8")

    assert "js/admin/members-panel.js" in admin_html
    assert "GreenLinkAdminMembersPanel" in members_panel_js
    assert "GreenLinkAdminMembersPanel.renderPanel" in admin_js
    assert "GreenLinkAdminMembersPanel.renderLegacyPanel" in admin_js
    assert "GreenLinkAdminMembersPanel.submitMemberForm" in admin_js
    assert "GreenLinkAdminMembersPanel.submitSearchForm" in admin_js
    assert "GreenLinkAdminMembersPanel.clearSearch" in admin_js


def test_admin_shell_account_customers_owned_by_module():
    root = Path(__file__).resolve().parents[1]
    admin_html = (root / "frontend" / "admin.html").read_text(encoding="utf-8")
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    account_customers_js = (root / "frontend" / "js" / "admin" / "accountCustomers.js").read_text(encoding="utf-8")

    assert "js/admin/accountCustomers.js" in admin_html
    assert "GreenLinkAdminAccountCustomers" in account_customers_js
    assert "GreenLinkAdminAccountCustomers.renderAccountCustomerStack" in admin_js
    assert "GreenLinkAdminAccountCustomers.renderDebtorWatchCard" in admin_js
    assert "GreenLinkAdminAccountCustomers.renderDebtorWatchEmbedded" in admin_js


def test_admin_shell_golf_day_ops_owned_by_module():
    root = Path(__file__).resolve().parents[1]
    admin_html = (root / "frontend" / "admin.html").read_text(encoding="utf-8")
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    golf_day_ops_js = (root / "frontend" / "js" / "admin" / "golf-day-ops.js").read_text(encoding="utf-8")

    assert "js/admin/golf-day-ops.js" in admin_html
    assert "GreenLinkAdminGolfDayOps" in golf_day_ops_js
    assert "GreenLinkAdminGolfDayOps.renderPanel" in admin_js
    assert "GreenLinkAdminGolfDayOps.submitForm" in admin_js
    assert "GreenLinkAdminGolfDayOps.resetForm" in admin_js
    assert "GreenLinkAdminGolfDayOps.loadIntoForms" in admin_js
    assert "GreenLinkAdminGolfDayOps.markPaid" in admin_js
    assert "GreenLinkAdminGolfDayOps.markCompleted" in admin_js
    assert "GreenLinkAdminGolfDayOps.submitAllocationForm" in admin_js


def test_admin_shell_pro_shop_owned_by_module():
    root = Path(__file__).resolve().parents[1]
    admin_html = (root / "frontend" / "admin.html").read_text(encoding="utf-8")
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    pro_shop_js = (root / "frontend" / "js" / "admin" / "pro-shop.js").read_text(encoding="utf-8")

    assert "js/admin/pro-shop.js" in admin_html
    assert "GreenLinkAdminProShop" in pro_shop_js
    assert "GreenLinkAdminProShop.renderPanel" in admin_js
    assert "GreenLinkAdminProShop.editProduct" in admin_js
    assert "GreenLinkAdminProShop.adjustStockPrompt" in admin_js
    assert "GreenLinkAdminProShop.submitProductForm" in admin_js
    assert "GreenLinkAdminProShop.submitSaleForm" in admin_js


def test_admin_shell_imports_workspace_owned_by_module():
    root = Path(__file__).resolve().parents[1]
    admin_html = (root / "frontend" / "admin.html").read_text(encoding="utf-8")
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    imports_js = (root / "frontend" / "js" / "admin" / "imports-workspace.js").read_text(encoding="utf-8")

    assert "js/admin/imports-workspace.js" in admin_html
    assert "GreenLinkAdminImportsWorkspace" in imports_js
    assert "GreenLinkAdminImportsWorkspace.bundle" in admin_js
    assert "GreenLinkAdminImportsWorkspace.renderWorkspace" in admin_js
    assert "GreenLinkAdminImportsWorkspace.resetSettingsForm" in admin_js
    assert "GreenLinkAdminImportsWorkspace.loadSettingsIntoForm" in admin_js
    assert "GreenLinkAdminImportsWorkspace.submitSettingsForm" in admin_js
    assert "GreenLinkAdminImportsWorkspace.submitRevenueForm" in admin_js
    assert "GreenLinkAdminImportsWorkspace.submitMembersForm" in admin_js


def test_admin_shell_operational_targets_owned_by_module():
    root = Path(__file__).resolve().parents[1]
    admin_html = (root / "frontend" / "admin.html").read_text(encoding="utf-8")
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    targets_js = (root / "frontend" / "js" / "admin" / "operational-targets.js").read_text(encoding="utf-8")

    assert "js/admin/operational-targets.js" in admin_html
    assert "GreenLinkAdminOperationalTargets" in targets_js
    assert "GreenLinkAdminOperationalTargets.submitForm" in admin_js


def test_admin_shell_reports_workspace_owned_by_module():
    root = Path(__file__).resolve().parents[1]
    admin_html = (root / "frontend" / "admin.html").read_text(encoding="utf-8")
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    reports_js = (root / "frontend" / "js" / "admin" / "reports-workspace.js").read_text(encoding="utf-8")

    assert "js/admin/reports-workspace.js" in admin_html
    assert "GreenLinkAdminReportsWorkspace" in reports_js
    assert "GreenLinkAdminReportsWorkspace.bundle" in admin_js
    assert "GreenLinkAdminReportsWorkspace.renderWorkspace" in admin_js


def test_admin_shell_finance_reporting_owned_by_module():
    root = Path(__file__).resolve().parents[1]
    admin_html = (root / "frontend" / "admin.html").read_text(encoding="utf-8")
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    finance_js = (root / "frontend" / "js" / "admin" / "finance-reporting.js").read_text(encoding="utf-8")

    assert "js/admin/finance-reporting.js" in admin_html
    assert "GreenLinkAdminFinanceReporting" in finance_js
    assert "GreenLinkAdminFinanceReporting.renderLedgerWorkspace" in admin_js
    assert "GreenLinkAdminFinanceReporting.renderCashbookWorkspace" in admin_js
    assert "GreenLinkAdminFinanceReporting.repairLedgerBooking" in admin_js
    assert "GreenLinkAdminFinanceReporting.exportCashbookCsv" in admin_js
    assert "GreenLinkAdminFinanceReporting.closeCashbookDay" in admin_js
    assert "function renderLedgerWorkspace(bundle)" not in admin_js
    assert "function renderCashbookWorkspace(bundle)" not in admin_js


def test_admin_finance_reporting_backend_owned_by_service():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    finance_service_py = (root / "app" / "services" / "finance_reporting_service.py").read_text(encoding="utf-8")

    assert "from app.services.finance_reporting_service import (" in admin_py
    assert "return get_revenue_analytics_payload(" in admin_py
    assert "return get_ledger_entries_payload(" in admin_py
    assert "def _normalize_revenue_stream(" not in admin_py
    assert "def _pro_shop_revenue_source_clause(" not in admin_py
    assert "def _days_in_year(" not in admin_py
    assert "def get_revenue_analytics_payload(" in finance_service_py
    assert "def get_ledger_entries_payload(" in finance_service_py


def test_admin_operational_alerts_backend_owned_by_service():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    alerts_service_py = (root / "app" / "services" / "operational_alerts_service.py").read_text(encoding="utf-8")

    assert "from app.services.operational_alerts_service import (" in admin_py
    assert "return get_operational_alerts_payload(" in admin_py
    assert "ADMIN_ALERTS_CACHE" not in admin_py
    assert "def get_operational_alerts_payload(" in alerts_service_py
    assert "ADMIN_ALERTS_CACHE = TTLCache" in alerts_service_py


def test_admin_dashboard_backend_owned_by_service():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    dashboard_service_py = (root / "app" / "services" / "dashboard_metrics_service.py").read_text(encoding="utf-8")

    assert "from app.services.dashboard_metrics_service import (" in admin_py
    assert "return get_dashboard_stats_payload(" in admin_py
    assert "ADMIN_DASHBOARD_CACHE" not in admin_py
    assert "normalize_dashboard_view(" not in admin_py
    assert "project_dashboard_payload(" not in admin_py
    assert "def get_dashboard_stats_payload(" in dashboard_service_py
    assert "ADMIN_DASHBOARD_CACHE = TTLCache" in dashboard_service_py
    assert "normalize_dashboard_view(" in dashboard_service_py
    assert "project_dashboard_payload(" in dashboard_service_py


def test_admin_pricing_matrix_backend_owned_by_service():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    pricing_service_py = (root / "app" / "services" / "pricing_matrix_service.py").read_text(encoding="utf-8")

    assert "from app.services.pricing_matrix_service import (" in admin_py
    assert "return get_fee_categories_payload(" in admin_py
    assert "return get_pricing_matrix_payload(" in admin_py
    assert "return create_pricing_matrix_row_payload(" in admin_py
    assert "return update_pricing_matrix_row_payload(" in admin_py
    assert "return delete_pricing_matrix_row_payload(" in admin_py
    assert "return apply_pricing_matrix_reference_payload(" in admin_py
    assert "def _upsert_pricing_matrix_row(" not in admin_py
    assert "def get_pricing_matrix_payload(" in pricing_service_py
    assert "def create_pricing_matrix_row_payload(" in pricing_service_py
    assert "def update_pricing_matrix_row_payload(" in pricing_service_py
    assert "def delete_pricing_matrix_row_payload(" in pricing_service_py
    assert "def apply_pricing_matrix_reference_payload(" in pricing_service_py


def test_admin_audit_logs_backend_owned_by_service():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    audit_service_py = (root / "app" / "services" / "audit_logs_service.py").read_text(encoding="utf-8")

    assert "from app.services.audit_logs_service import get_audit_logs_payload" in admin_py
    assert "return get_audit_logs_payload(" in admin_py
    assert "db.query(AuditLog)" not in admin_py
    assert "actor_names: dict[int, str] = {}" not in admin_py
    assert "def get_audit_logs_payload(" in audit_service_py
    assert "db.query(AuditLog)" in audit_service_py


def test_admin_targets_backend_owned_by_services():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    admin_targets_service_py = (root / "app" / "services" / "admin_targets_service.py").read_text(encoding="utf-8")
    kpi_service_py = (root / "app" / "services" / "kpi_targets_service.py").read_text(encoding="utf-8")
    operational_service_py = (root / "app" / "services" / "operational_targets_service.py").read_text(encoding="utf-8")

    assert "from app.services.admin_targets_service import (" in admin_py
    assert "return upsert_kpi_target_command(" in admin_py
    assert "return update_target_assumptions_command(" in admin_py
    assert "return upsert_operational_target_settings_command(" in admin_py
    assert "class OperationalTargetInput(BaseModel):" not in admin_py
    assert "class OperationalTargetUpsertPayload(BaseModel):" not in admin_py
    assert "def upsert_kpi_target_command(" in admin_targets_service_py
    assert "def update_target_assumptions_command(" in admin_targets_service_py
    assert "def upsert_operational_target_settings_command(" in admin_targets_service_py
    assert "def upsert_kpi_target_payload(" in kpi_service_py
    assert "def update_target_assumptions_payload(" in kpi_service_py
    assert "class OperationalTargetUpsertPayload(BaseModel):" in operational_service_py


def test_admin_communications_backend_owned_by_service():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    communications_service_py = (root / "app" / "services" / "club_communications_service.py").read_text(encoding="utf-8")

    assert "from app.services.club_communications_service import (" in admin_py
    assert "return list_club_communications_payload(" in admin_py
    assert "return create_club_communication_record(" in admin_py
    assert "return update_club_communication_record(" in admin_py
    assert "db.query(ClubCommunication)" not in admin_py
    assert "def list_club_communications_payload(" in communications_service_py
    assert "def create_club_communication(" in communications_service_py
    assert "def update_club_communication(" in communications_service_py


def test_admin_club_settings_backend_owned_by_service():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    settings_service_py = (root / "app" / "services" / "club_settings_service.py").read_text(encoding="utf-8")

    assert "from app.services.club_settings_service import (" in admin_py
    assert "return get_booking_window_settings_payload(" in admin_py
    assert "return update_booking_window_settings_payload(" in admin_py
    assert "return get_club_profile_settings_payload(" in admin_py
    assert "return update_club_profile_settings_payload(" in admin_py
    assert '@router.get("/tee-sheet-profile")' in admin_py
    assert "def get_booking_window_settings_payload(" in settings_service_py
    assert "def update_booking_window_settings_payload(" in settings_service_py
    assert "def get_club_profile_settings_payload(" in settings_service_py
    assert "def update_club_profile_settings_payload(" in settings_service_py


def test_admin_staff_backend_owned_by_service():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    staff_service_py = (root / "app" / "services" / "club_staff_service.py").read_text(encoding="utf-8")

    assert "from app.services.club_staff_service import (" in admin_py
    assert "return get_staff_role_context_payload(" in admin_py
    assert "return list_staff_users_payload(" in admin_py
    assert "return create_staff_user_for_club_payload(" in admin_py
    assert "return update_staff_user_for_club_payload(" in admin_py
    assert "def get_staff_role_context_payload(" in staff_service_py
    assert "def list_staff_users_payload(" in staff_service_py
    assert "def create_staff_user_for_club_payload(" in staff_service_py
    assert "def update_staff_user_for_club_payload(" in staff_service_py


def test_admin_members_and_people_lookup_backend_owned_by_services():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    members_service_py = (root / "app" / "services" / "club_members_service.py").read_text(encoding="utf-8")
    people_lookup_service_py = (root / "app" / "services" / "club_people_lookup_service.py").read_text(encoding="utf-8")

    assert "from app.services.club_members_service import (" in admin_py
    assert "return list_members_payload(" in admin_py
    assert "return create_member_payload(" in admin_py
    assert "return update_member_payload(" in admin_py
    assert "return get_member_detail_payload(" in admin_py
    assert "return search_members_payload(" in admin_py
    assert "from app.services.club_people_lookup_service import (" in admin_py
    assert "return list_players_payload(" in admin_py
    assert "return get_player_detail_payload(" in admin_py
    assert "return list_guests_payload(" in admin_py
    assert "def list_members_payload(" in members_service_py
    assert "def create_member_payload(" in members_service_py
    assert "def update_member_payload(" in members_service_py
    assert "def get_member_detail_payload(" in members_service_py
    assert "def search_members_payload(" in members_service_py
    assert "def list_players_payload(" in people_lookup_service_py
    assert "def get_player_detail_payload(" in people_lookup_service_py
    assert "def list_guests_payload(" in people_lookup_service_py


def test_admin_account_customers_backend_owned_by_service():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    account_customers_service_py = (root / "app" / "services" / "account_customers_service.py").read_text(encoding="utf-8")

    assert "from app.services.account_customers_service import (" in admin_py
    assert "return list_account_customers_payload(" in admin_py
    assert "return create_account_customer_payload(" in admin_py
    assert "return update_account_customer_payload(" in admin_py
    assert "def list_account_customers_payload(" in account_customers_service_py
    assert "def create_account_customer_payload(" in account_customers_service_py
    assert "def update_account_customer_payload(" in account_customers_service_py


def test_admin_golf_day_bookings_backend_owned_by_service():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    golf_day_service_py = (root / "app" / "services" / "golf_day_bookings_service.py").read_text(encoding="utf-8")

    assert "from app.services.golf_day_bookings_service import (" in admin_py
    assert "return list_golf_day_bookings_payload(" in admin_py
    assert "return create_golf_day_booking_payload(" in admin_py
    assert "return update_golf_day_booking_payload(" in admin_py
    assert "def list_golf_day_bookings_payload(" in golf_day_service_py
    assert "def create_golf_day_booking_payload(" in golf_day_service_py
    assert "def update_golf_day_booking_payload(" in golf_day_service_py


def test_admin_pro_shop_backend_owned_by_service():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    pro_shop_service_py = (root / "app" / "services" / "pro_shop_service.py").read_text(encoding="utf-8")

    assert "from app.services.pro_shop_service import (" in admin_py
    assert "return list_pro_shop_products_payload(" in admin_py
    assert "return create_pro_shop_product_payload(" in admin_py
    assert "return update_pro_shop_product_payload(" in admin_py
    assert "return adjust_pro_shop_stock_payload(" in admin_py
    assert "return list_pro_shop_sales_payload(" in admin_py
    assert "return create_pro_shop_sale_payload(" in admin_py
    assert "def list_pro_shop_products_payload(" in pro_shop_service_py
    assert "def create_pro_shop_product_payload(" in pro_shop_service_py
    assert "def update_pro_shop_product_payload(" in pro_shop_service_py
    assert "def adjust_pro_shop_stock_payload(" in pro_shop_service_py
    assert "def list_pro_shop_sales_payload(" in pro_shop_service_py
    assert "def create_pro_shop_sale_payload(" in pro_shop_service_py


def test_admin_phase1_deferred_residues_remain_in_router():
    root = Path(__file__).resolve().parents[1]
    admin_py = (root / "app" / "routers" / "admin.py").read_text(encoding="utf-8")

    assert "def _audit_event(" in admin_py
    assert "def _invalidate_admin_caches(" in admin_py
    assert '@router.get("/summary")' in admin_py
    assert '@router.get("/tee-sheet-profile")' in admin_py
    assert '@router.put("/tee-sheet-profile")' in admin_py
    assert '@router.post("/tee-sheet/bulk-book")' in admin_py
    assert '@router.delete("/tee-sheet/bulk-book/{group_id}")' in admin_py
    assert '@router.get("/tee-sheet/weather/preview")' in admin_py
    assert '@router.get("/tee-sheet/weather/auto-flags")' in admin_py
    assert '@router.post("/tee-sheet/weather/reconfirm")' in admin_py
    assert '@router.get("/tee-sheet/weather/responses")' in admin_py
    assert '@router.get("/tee-times")' in admin_py
    assert '@router.get("/bookings")' in admin_py
    assert '@router.get("/bookings/{booking_id}")' in admin_py
    assert '@router.put("/bookings/{booking_id}/status")' in admin_py
    assert '@router.delete("/bookings/{booking_id}")' in admin_py
    assert '@router.put("/bookings/{booking_id}/payment-method")' in admin_py
    assert '@router.put("/bookings/{booking_id}/account-code")' in admin_py
    assert '@router.put("/bookings/batch-update")' in admin_py
    assert '@router.put("/players/{player_id}/price")' in admin_py
    assert '@router.get("/players/{player_id}/price-info")' in admin_py
    assert '@router.put("/bookings/{booking_id}/price")' in admin_py
    assert "from app.services.dashboard_metrics_service import (" in admin_py
    assert "from app.services.finance_reporting_service import (" in admin_py


def test_admin_dashboard_fetches_declare_explicit_views():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    reports_js = (root / "frontend" / "js" / "admin" / "reports-workspace.js").read_text(encoding="utf-8")

    assert "/api/admin/dashboard?view=" in admin_js
    for view in [
        "overview",
        "today",
        "golf_overview",
        "golf_days",
        "operations_overview",
        "operations_module",
        "reports_performance",
    ]:
        assert view in admin_js or view in reports_js


def test_dashboard_view_invalidation_tracks_explicit_phase2_views():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")

    assert "function invalidateSharedDashboardViews(" in admin_js
    for view in [
        "overview",
        "today",
        "golf_overview",
        "golf_days",
        "operations_overview",
        "operations_module",
        "reports_performance",
    ]:
        assert f'"{view}"' in admin_js
    assert "invalidateSharedDashboardViews([" in admin_js


def test_reports_panels_do_not_pull_dashboard_support_fetches():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    reports_js = (root / "frontend" / "js" / "admin" / "reports-workspace.js").read_text(encoding="utf-8")

    assert 'loadSharedDashboardPayload({ signal, view: "reports_support" })' not in reports_js
    assert 'loadSharedDashboardPayload({ signal, view: "reports_performance" })' in reports_js
    assert "function reportsRevenueCacheKey(" in admin_js
    assert "async function loadSharedReportsRevenue(" in admin_js
    assert 'deps.loadSharedReportsRevenue({ signal, period: "wtd" })' in reports_js
    assert 'deps.loadSharedReportsRevenue({ signal, period: "mtd" })' in reports_js


def test_reports_performance_panel_does_not_pull_operational_targets():
    root = Path(__file__).resolve().parents[1]
    reports_js = (root / "frontend" / "js" / "admin" / "reports-workspace.js").read_text(encoding="utf-8")

    assert 'if (panel === "targets") {' in reports_js
    assert 'const targets = await deps.loadSharedOperationalTargets({ signal, year: new Date().getFullYear() });' in reports_js
    assert 'const [dashboard, revenue] = await Promise.all([' in reports_js
    assert 'return { panel, dashboard, revenue };' in reports_js


def test_settings_targets_panel_uses_shared_operational_targets_loader():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")

    assert 'if (panel === "targets") {' in admin_js
    assert 'const targets = await loadSharedOperationalTargets({ signal, year: new Date().getFullYear() });' in admin_js
    assert 'const targets = await fetchJsonSafe("/api/admin/operation-targets"' not in admin_js


def test_modular_admin_workspaces_use_scoped_refresh_paths():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    club_settings_js = (root / "frontend" / "js" / "admin" / "club-settings.js").read_text(encoding="utf-8")
    communications_js = (root / "frontend" / "js" / "admin" / "communications.js").read_text(encoding="utf-8")
    golf_day_ops_js = (root / "frontend" / "js" / "admin" / "golf-day-ops.js").read_text(encoding="utf-8")
    imports_workspace_js = (root / "frontend" / "js" / "admin" / "imports-workspace.js").read_text(encoding="utf-8")
    operational_targets_js = (root / "frontend" / "js" / "admin" / "operational-targets.js").read_text(encoding="utf-8")
    pro_shop_js = (root / "frontend" / "js" / "admin" / "pro-shop.js").read_text(encoding="utf-8")

    assert admin_js.count("async function refreshActiveGolfWorkspace(") == 1
    assert "refreshActiveSettingsWorkspace" in club_settings_js
    assert "renderCurrentWorkspace(" not in club_settings_js
    assert "refreshActiveCommunicationsWorkspace" in communications_js
    assert "renderCurrentWorkspace(" not in communications_js
    assert "refreshActiveGolfWorkspace" in golf_day_ops_js
    assert "renderCurrentWorkspace(" not in golf_day_ops_js
    assert "refreshActiveReportsWorkspace" in imports_workspace_js
    assert "refreshActiveSettingsWorkspace" in imports_workspace_js
    assert "renderCurrentWorkspace(" not in imports_workspace_js
    assert "refreshActiveReportsWorkspace" in operational_targets_js
    assert "refreshActiveSettingsWorkspace" in operational_targets_js
    assert "renderCurrentWorkspace(" not in operational_targets_js
    assert "refreshActiveOperationsWorkspace" in pro_shop_js
    assert "renderCurrentWorkspace(" not in pro_shop_js


def test_dashboard_stream_toggle_rerenders_from_state_before_refetch():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")

    assert "function rerenderActiveOverviewWorkspaceFromState()" in admin_js
    assert 'if (!["overview", "today"].includes(state.route?.workspace || "")) return false;' in admin_js
    assert 'if (target.hasAttribute("data-dashboard-stream")) {' in admin_js
    assert "if (rerenderActiveOverviewWorkspaceFromState()) return;" in admin_js


def test_communications_workspace_avoids_shared_dashboard_bundle():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    communications_js = (root / "frontend" / "js" / "admin" / "communications.js").read_text(encoding="utf-8")

    assert "loadSharedDashboardData" not in communications_js
    assert "loadOperationalAlertsShared" in communications_js
    assert "loadSharedFinanceBase" in communications_js
    assert "emptyFinanceBasePayload" in communications_js
    assert "loadOperationalAlertsShared" in admin_js
    assert "loadSharedFinanceBase" in admin_js
    assert "emptyFinanceBasePayload" in admin_js


def test_admin_refresh_action_prefers_scoped_non_protected_workspace_refreshes():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")

    assert "async function refreshActiveOverviewWorkspace()" in admin_js
    assert "async function refreshCurrentWorkspaceFromScope()" in admin_js
    assert 'if (["overview", "today"].includes(workspace)) return refreshActiveOverviewWorkspace();' in admin_js
    assert 'if (workspace === "members") return refreshActiveMembersWorkspace();' in admin_js
    assert 'if (workspace === "reports") return refreshActiveReportsWorkspace();' in admin_js
    assert 'if (workspace === "settings") return refreshActiveSettingsWorkspace();' in admin_js
    assert 'if (workspace === "communications") return refreshActiveCommunicationsWorkspace();' in admin_js
    assert 'if (workspace === "operations") return refreshActiveOperationsWorkspace();' in admin_js
    assert 'if (target.hasAttribute("data-refresh")) return refreshCurrentWorkspaceFromScope();' in admin_js


def test_imports_bundle_is_shared_cached_for_reports_and_settings():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    imports_js = (root / "frontend" / "js" / "admin" / "imports-workspace.js").read_text(encoding="utf-8")
    reports_js = (root / "frontend" / "js" / "admin" / "reports-workspace.js").read_text(encoding="utf-8")

    assert "function importsBundleCacheKey(" in admin_js
    assert "return `imports-bundle:" in admin_js
    assert "return loadSharedResource(" in admin_js
    assert "importsBundleCacheKey({ clubKey, date })" in admin_js
    assert "invalidateImportsWorkspaceSharedBundle" in admin_js
    assert "deps.invalidateImportsWorkspaceSharedBundle();" in imports_js
    assert 'if (panel === "imports") {' in reports_js
    assert 'const importsBundle = await deps.loadImportsWorkspaceBundle({ signal });' in reports_js
    assert 'const importsBundle = await deps.loadImportsWorkspaceBundle({ signal, financeBase });' not in reports_js


def test_reports_revenue_reads_are_shared_cached_and_summary_invalidated():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    reports_js = (root / "frontend" / "js" / "admin" / "reports-workspace.js").read_text(encoding="utf-8")

    assert "function reportsRevenueCacheKey(" in admin_js
    assert "async function loadSharedReportsRevenue(" in admin_js
    assert 'deleteSharedCacheKey(reportsRevenueCacheKey("mtd", clubKey));' in admin_js
    assert 'deleteSharedCacheKey(reportsRevenueCacheKey("wtd", clubKey));' in admin_js
    assert 'deps.loadSharedReportsRevenue({ signal, period: "wtd" })' in reports_js
    assert 'deps.loadSharedReportsRevenue({ signal, period: "mtd" })' in reports_js


def test_operations_member_area_previews_are_shared_cached_and_invalidated():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    imports_js = (root / "frontend" / "js" / "admin" / "imports-workspace.js").read_text(encoding="utf-8")
    members_js = (root / "frontend" / "js" / "admin" / "members-panel.js").read_text(encoding="utf-8")

    assert "function membersAreaPreviewCacheKey(" in admin_js
    assert "async function loadSharedMembersAreaPreview(" in admin_js
    assert 'const members = await loadSharedMembersAreaPreview({ area: panel, signal });' in admin_js
    assert "invalidateMemberAreaPreview" in admin_js
    assert "deps.invalidateMemberAreaPreview(payload.primary_operation);" in members_js
    assert "deps.invalidateMemberAreaPreview();" in imports_js


def test_members_workspace_shares_default_active_account_customer_read():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")

    assert "function activeAccountCustomersCacheKey(" in admin_js
    assert "async function loadSharedActiveAccountCustomers(" in admin_js
    assert 'loadSharedActiveAccountCustomers({ signal })' in admin_js
    assert 'membersUi.query\n                ? fetchJson(`/api/admin/account-customers?${accountCustomerQuery.toString()}`, { signal })\n                : loadSharedActiveAccountCustomers({ signal })' in admin_js


def test_recent_members_preview_is_shared_and_invalidated_for_people_surfaces():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    communications_js = (root / "frontend" / "js" / "admin" / "communications.js").read_text(encoding="utf-8")
    members_js = (root / "frontend" / "js" / "admin" / "members-panel.js").read_text(encoding="utf-8")
    imports_js = (root / "frontend" / "js" / "admin" / "imports-workspace.js").read_text(encoding="utf-8")

    assert "function recentMembersPreviewCacheKey(" in admin_js
    assert "async function loadSharedRecentMembersPreview(" in admin_js
    assert "loadSharedRecentMembersPreview({ signal })" in admin_js
    assert "loadSharedRecentMembersPreview({ signal })" in communications_js
    assert "deps.invalidateRecentMembersPreview();" in members_js
    assert "deps.invalidateRecentMembersPreview();" in imports_js


def test_communications_workspace_uses_shared_list_and_invalidates_it():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    communications_js = (root / "frontend" / "js" / "admin" / "communications.js").read_text(encoding="utf-8")

    assert "async function loadSharedCommunicationsWorkspaceList(" in admin_js
    assert "function invalidateCommunicationsWorkspaceList(" in admin_js
    assert "loadSharedCommunicationsWorkspaceList" in admin_js
    assert "deps.loadSharedCommunicationsWorkspaceList({ signal, publishedOnly: shell === \"staff\" })" in communications_js
    assert "deps.invalidateCommunicationsWorkspaceList();" in communications_js


def test_staff_panel_uses_shared_staff_read_and_invalidates_it():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    staff_js = (root / "frontend" / "js" / "admin" / "staff-panel.js").read_text(encoding="utf-8")

    assert "function staffListCacheKey(" in admin_js
    assert "async function loadSharedStaffList(" in admin_js
    assert "loadSharedStaffList({ signal })" in admin_js
    assert "invalidateStaffListPreview" in admin_js
    assert "deps.invalidateStaffListPreview();" in staff_js


def test_pro_shop_operations_panel_uses_shared_reads_and_invalidates_them():
    root = Path(__file__).resolve().parents[1]
    admin_js = (root / "frontend" / "admin.js").read_text(encoding="utf-8")
    pro_shop_js = (root / "frontend" / "js" / "admin" / "pro-shop.js").read_text(encoding="utf-8")

    assert "function proShopProductsCacheKey(" in admin_js
    assert "function proShopSalesCacheKey(" in admin_js
    assert "async function loadSharedProShopProducts(" in admin_js
    assert "async function loadSharedProShopSales(" in admin_js
    assert "function invalidateProShopPanelSharedData(" in admin_js
    assert "loadSharedProShopProducts({ signal })" in admin_js
    assert "loadSharedProShopSales({ signal })" in admin_js
    assert "invalidateProShopPanelSharedData" in admin_js
    assert "deps.invalidateProShopPanelSharedData();" in pro_shop_js
    assert "deps.invalidateProShopPanelSharedData({ includeFinanceBase: true });" in pro_shop_js


def test_player_shell_stages_startup_and_lazy_loads_tee_times():
    root = Path(__file__).resolve().parents[1]
    player_js = (root / "frontend" / "player.js").read_text(encoding="utf-8")

    assert "await Promise.all([loadProfile(), loadBookingWindow()]);" in player_js
    assert "await Promise.all([loadMyBookings(), loadNotifications(), loadClubFeed()]);" in player_js
    assert "rerenderHomeSurface();" in player_js
    assert "renderWeatherAlerts();" in player_js
    assert "renderClubFeed();" in player_js
    assert "renderRounds();" in player_js
    assert "if (state.pendingRouteTab === \"bookings\" || state.pendingRouteTeeTimeId)" in player_js
    assert "async function ensureBookingsViewReady(forceRefresh = false)" in player_js
    assert "if (next === \"bookings\" && ensureData)" in player_js


def test_player_shell_uses_scoped_rerenders_for_partial_refreshes():
    root = Path(__file__).resolve().parents[1]
    player_js = (root / "frontend" / "player.js").read_text(encoding="utf-8")

    assert "function rerenderBookingsSurface()" in player_js
    assert "function rerenderNotificationsSurface()" in player_js
    assert "function rerenderFeedSurface()" in player_js
    assert "function rerenderProfileSurface()" in player_js
    assert "function updateStatusBannerFromState()" in player_js
    assert "rerenderNotificationsSurface();\n    renderRounds();" in player_js
    assert "rerenderBookingsSurface();" in player_js
    assert "rerenderFeedSurface();" in player_js
    assert "rerenderProfileSurface();" in player_js


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


def test_admin_dashboard_read_model_declares_consumer_view(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["admin_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    response = client.get("/api/admin/dashboard?view=reports_performance", headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    meta = payload.get("_meta") or {}
    assert meta["view"] == "reports_performance"
    assert meta["shared_catch_all"] is False
    assert "club_admin.reports.performance" in list(meta.get("intended_consumers") or [])
    assert "imports" in payload


def test_admin_can_create_and_update_club_communication(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["admin_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    create_response = client.post(
        "/api/admin/communications",
        headers=headers,
        json={
            "kind": "announcement",
            "audience": "members",
            "status": "draft",
            "title": "Contract Communication",
            "summary": "Draft summary",
            "body": "Draft body",
            "pinned": False,
        },
    )
    assert create_response.status_code == 200, create_response.text
    created = create_response.json()
    communication_id = int(created["id"])
    assert created["title"] == "Contract Communication"
    assert created["status"] == "draft"

    update_response = client.put(
        f"/api/admin/communications/{communication_id}",
        headers=headers,
        json={
            "kind": "announcement",
            "audience": "all",
            "status": "published",
            "title": "Contract Communication Published",
            "summary": "Published summary",
            "body": "Published body",
            "pinned": True,
        },
    )
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    assert updated["id"] == communication_id
    assert updated["status"] == "published"
    assert updated["audience"] == "all"
    assert updated["pinned"] is True


def test_admin_can_update_booking_window_and_club_profile(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["admin_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    booking_window_response = client.put(
        "/api/admin/booking-window",
        headers=headers,
        json={
            "member_days": 21,
            "affiliated_days": 14,
            "non_affiliated_days": 7,
            "group_cancel_days": 5,
        },
    )
    assert booking_window_response.status_code == 200, booking_window_response.text
    booking_window = booking_window_response.json()
    assert booking_window["member_days"] == 21
    assert booking_window["group_cancel_days"] == 5

    club_profile_response = client.put(
        "/api/admin/club-profile",
        headers=headers,
        json={
            "club_name": "Contract Club A Updated",
            "location": "Umhlanga",
            "currency_symbol": "R",
        },
    )
    assert club_profile_response.status_code == 200, club_profile_response.text
    club_profile = club_profile_response.json()
    assert club_profile["club_name"] == "Contract Club A Updated"
    assert (club_profile.get("details") or {}).get("location") == "Umhlanga"


def test_admin_can_create_and_read_operational_targets(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["admin_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    update_response = client.put(
        "/api/admin/operation-targets",
        headers=headers,
        json={
            "year": 2026,
            "targets": [
                {
                    "operation_key": "golf",
                    "metric_key": "rounds",
                    "target_value": 4200,
                    "unit": "rounds",
                    "notes": "Contract target",
                }
            ],
        },
    )
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    assert updated["status"] == "success"
    assert updated["year"] == 2026
    assert any(
        str(row["operation_key"]) == "golf"
        and str(row["metric_key"]) == "rounds"
        and float(row["target_value"]) == 4200.0
        for row in updated["targets"]
    )

    read_response = client.get("/api/admin/operation-targets?year=2026", headers=headers)
    assert read_response.status_code == 200, read_response.text
    payload = read_response.json()
    assert payload["year"] == 2026
    assert "catalog" in payload
    assert any(
        str(row["operation_key"]) == "golf"
        and str(row["metric_key"]) == "rounds"
        and float(row["target_value"]) == 4200.0
        for row in payload["targets"]
    )
    with SessionLocal() as db:
        audit_row = (
            db.query(models.AuditLog)
            .filter(
                models.AuditLog.club_id == int(seeded_contract["club_a_id"]),
                models.AuditLog.action == "club_operational_targets.upserted",
                models.AuditLog.entity_id == f"{int(seeded_contract['club_a_id'])}:2026",
            )
            .order_by(models.AuditLog.id.desc())
            .first()
        )
        assert audit_row is not None


def test_admin_can_update_kpi_targets_and_assumptions(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["admin_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    rounds_response = client.put(
        "/api/admin/targets",
        headers=headers,
        json={
            "year": 2026,
            "metric": "rounds",
            "annual_target": 36000,
        },
    )
    assert rounds_response.status_code == 200, rounds_response.text
    rounds_payload = rounds_response.json()
    assert rounds_payload["status"] == "ok"
    assert rounds_payload["metric"] == "rounds"
    assert float(rounds_payload["annual_target"]) == 36000.0

    assumptions_response = client.put(
        "/api/admin/targets/assumptions",
        headers=headers,
        json={
            "year": 2026,
            "member_round_share": 0.55,
            "member_revenue_share": 0.35,
            "revenue_mode": "derived",
        },
    )
    assert assumptions_response.status_code == 200, assumptions_response.text
    assumptions_payload = assumptions_response.json()
    assert assumptions_payload["year"] == 2026
    assert float(assumptions_payload["rounds_target"]) == 36000.0
    assert assumptions_payload["revenue_mode"] == "derived"
    assert assumptions_payload["revenue_source"] == "derived_from_mix"
    assert float(assumptions_payload["assumptions"]["member_round_share"]) == 0.55
    assert float(assumptions_payload["assumptions"]["member_revenue_share"]) == 0.35
    assert assumptions_payload["revenue_target"] is not None

    read_response = client.get("/api/admin/targets?year=2026", headers=headers)
    assert read_response.status_code == 200, read_response.text
    read_payload = read_response.json()
    assert read_payload["year"] == 2026
    assert float(read_payload["rounds_target"]) == 36000.0
    assert read_payload["revenue_mode"] == "derived"
    assert float(read_payload["assumptions"]["member_round_share"]) == 0.55
    assert float(read_payload["assumptions"]["member_revenue_share"]) == 0.35
    with SessionLocal() as db:
        rounds_audit = (
            db.query(models.AuditLog)
            .filter(
                models.AuditLog.club_id == int(seeded_contract["club_a_id"]),
                models.AuditLog.action == "kpi_target.upserted",
                models.AuditLog.entity_id == "2026:rounds",
            )
            .order_by(models.AuditLog.id.desc())
            .first()
        )
        assumptions_audit = (
            db.query(models.AuditLog)
            .filter(
                models.AuditLog.club_id == int(seeded_contract["club_a_id"]),
                models.AuditLog.action == "kpi_target.assumptions_updated",
                models.AuditLog.entity_id == "2026:assumptions",
            )
            .order_by(models.AuditLog.id.desc())
            .first()
        )
        assert rounds_audit is not None
        assert assumptions_audit is not None


def test_admin_can_create_and_update_staff_user(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["admin_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    create_response = client.post(
        "/api/admin/staff",
        headers=headers,
        json={
            "name": "Contract Operator",
            "email": "contract-operator@greenlinkqa.com",
            "password": "ContractPass!12345",
            "role": "club_staff",
            "force_reset": True,
        },
    )
    assert create_response.status_code == 200, create_response.text
    created = create_response.json()
    user_id = int(created["user_id"])

    list_response = client.get("/api/admin/staff?limit=50", headers=headers)
    assert list_response.status_code == 200, list_response.text
    rows = list_response.json()["staff"]
    assert any(int(row["id"]) == user_id for row in rows)

    update_response = client.put(
        f"/api/admin/staff/{user_id}",
        headers=headers,
        json={
            "name": "Contract Operator Updated",
            "email": "contract-operator@greenlinkqa.com",
            "password": None,
            "role": "club_staff",
            "force_reset": False,
        },
    )
    assert update_response.status_code == 200, update_response.text
    assert update_response.json()["status"] == "success"


def test_staff_role_context_route_reflects_club_profile(client: TestClient, seeded_contract: dict[str, int | str]):
    with SessionLocal() as db:
        staff = db.query(models.User).filter(func.lower(models.User.email) == str(seeded_contract["staff_email"]).lower()).first()
        assert staff is not None
        profile = (
            db.query(models.StaffRoleProfile)
            .filter(
                models.StaffRoleProfile.club_id == int(seeded_contract["club_a_id"]),
                models.StaffRoleProfile.linked_user_id == int(staff.id),
            )
            .first()
        )
        if not profile:
            profile = models.StaffRoleProfile(
                club_id=int(seeded_contract["club_a_id"]),
                staff_name=str(staff.name),
                role_label="Accounts Clerk",
                linked_user_id=int(staff.id),
                operation_area="finance",
                user_type="club_staff",
                source_file="contract-test",
            )
            db.add(profile)
        else:
            profile.staff_name = str(staff.name)
            profile.role_label = "Accounts Clerk"
            profile.operation_area = "finance"
            profile.user_type = "club_staff"
            profile.source_file = "contract-test"
        db.commit()

    token = _login(
        client,
        email=str(seeded_contract["staff_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    response = client.get("/api/admin/staff-role-context", headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["role_label"] == "Accounts Clerk"
    assert payload["default_page"] == "cashbook"
    assert payload["matched_profile_id"]


def test_admin_can_create_update_and_read_member(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["admin_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    create_response = client.post(
        "/api/admin/members",
        headers=headers,
        json={
            "first_name": "Contract",
            "last_name": "Member Record",
            "email": "contract-member-record@greenlinkqa.com",
            "member_number": "GL-CONTRACT-001",
            "primary_operation": "golf",
            "home_club": "Contract Club A",
            "active": True,
        },
    )
    assert create_response.status_code == 200, create_response.text
    member_id = int(create_response.json()["member_id"])

    list_response = client.get("/api/admin/members?limit=20&q=GL-CONTRACT-001", headers=headers)
    assert list_response.status_code == 200, list_response.text
    members = list_response.json()["members"]
    assert any(int(row["id"]) == member_id for row in members)

    update_response = client.put(
        f"/api/admin/members/{member_id}",
        headers=headers,
        json={
            "first_name": "Contract",
            "last_name": "Member Updated",
            "email": "contract-member-record@greenlinkqa.com",
            "member_number": "GL-CONTRACT-001",
            "primary_operation": "golf",
            "home_club": "Contract Club A",
            "membership_status": "active",
            "active": True,
        },
    )
    assert update_response.status_code == 200, update_response.text
    assert update_response.json()["status"] == "success"

    detail_response = client.get(f"/api/admin/members/{member_id}", headers=headers)
    assert detail_response.status_code == 200, detail_response.text
    detail = detail_response.json()
    assert int(detail["member"]["id"]) == member_id
    assert detail["member"]["last_name"] == "Member Updated"

    search_response = client.get("/api/admin/members/search?q=GL-CONTRACT-001", headers=headers)
    assert search_response.status_code == 200, search_response.text
    assert any(int(row["id"]) == member_id for row in search_response.json()["members"])


def test_staff_can_list_players_and_read_player_detail(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["staff_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    list_response = client.get("/api/admin/players?q=contract-club-a-player", headers=headers)
    assert list_response.status_code == 200, list_response.text
    payload = list_response.json()
    assert "players" in payload
    assert any(str(row.get("email") or "").lower() == str(seeded_contract["club_a_player_email"]).lower() for row in payload["players"])

    player_row = next(row for row in payload["players"] if str(row.get("email") or "").lower() == str(seeded_contract["club_a_player_email"]).lower())
    detail_response = client.get(f"/api/admin/players/{int(player_row['id'])}", headers=headers)
    assert detail_response.status_code == 200, detail_response.text
    detail = detail_response.json()
    assert str(detail["email"]).lower() == str(seeded_contract["club_a_player_email"]).lower()
    assert "recent_bookings" in detail


def test_staff_can_list_guests_payload_shape(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["staff_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    response = client.get("/api/admin/guests?limit=20", headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "total" in payload
    assert "guests" in payload


def test_admin_can_create_update_and_list_account_customer(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["admin_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}
    unique_code = f"ACC-CONTRACT-{uuid4().hex[:8].upper()}"

    create_response = client.post(
        "/api/admin/account-customers",
        headers=headers,
        json={
            "name": "Contract Debtor",
            "account_code": unique_code,
            "billing_contact": "Accounts Desk",
            "terms": "30 days",
            "customer_type": "corporate",
            "active": True,
        },
    )
    assert create_response.status_code == 200, create_response.text
    created = create_response.json()
    created_row = created["account_customer"]
    account_customer_id = int(created_row["id"])
    assert created_row["account_code"] == unique_code

    list_response = client.get(f"/api/admin/account-customers?q={unique_code}", headers=headers)
    assert list_response.status_code == 200, list_response.text
    rows = list_response.json()["account_customers"]
    assert any(int(row["id"]) == account_customer_id for row in rows)

    update_response = client.put(
        f"/api/admin/account-customers/{account_customer_id}",
        headers=headers,
        json={
            "name": "Contract Debtor Updated",
            "account_code": unique_code,
            "billing_contact": "Accounts Desk Updated",
            "terms": "45 days",
            "customer_type": "corporate",
            "active": True,
        },
    )
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    updated_row = updated["account_customer"]
    assert int(updated_row["id"]) == account_customer_id
    assert updated_row["name"] == "Contract Debtor Updated"
    assert updated_row["terms"] == "45 days"


def test_admin_can_create_update_and_list_golf_day_booking(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["admin_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}

    create_response = client.post(
        "/api/admin/golf-day-bookings",
        headers=headers,
        json={
            "event_name": "Contract Golf Day",
            "event_date": "2026-04-10",
            "amount": 2500,
            "balance_due": 2500,
            "payment_status": "pending",
            "contact_name": "Contract Contact",
            "invoice_reference": "GL-GD-001",
            "notes": "Created by contract test",
        },
    )
    assert create_response.status_code == 200, create_response.text
    created = create_response.json()
    golf_day_booking_id = int(created["id"])

    list_response = client.get("/api/admin/golf-day-bookings?q=Contract Golf Day", headers=headers)
    assert list_response.status_code == 200, list_response.text
    rows = list_response.json()["bookings"]
    assert any(int(row["id"]) == golf_day_booking_id for row in rows)

    update_response = client.put(
        f"/api/admin/golf-day-bookings/{golf_day_booking_id}",
        headers=headers,
        json={
            "event_name": "Contract Golf Day Updated",
            "event_date": "2026-04-10",
            "amount": 2500,
            "balance_due": 0,
            "payment_status": "paid",
            "contact_name": "Contract Contact Updated",
            "invoice_reference": "GL-GD-001",
            "notes": "Updated by contract test",
        },
    )
    assert update_response.status_code == 200, update_response.text
    assert update_response.json()["status"] == "success"

    refreshed = client.get("/api/admin/golf-day-bookings?q=Contract Golf Day Updated", headers=headers)
    assert refreshed.status_code == 200, refreshed.text
    refreshed_rows = refreshed.json()["bookings"]
    matched = next(row for row in refreshed_rows if int(row["id"]) == golf_day_booking_id)
    assert matched["payment_status"] == "paid"
    assert matched["event_name"] == "Contract Golf Day Updated"


def test_admin_can_filter_audit_logs(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["admin_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}
    request_marker = f"contract-audit-{uuid4().hex[:8]}"

    with SessionLocal() as db:
        admin = db.query(models.User).filter(func.lower(models.User.email) == str(seeded_contract["admin_email"]).lower()).first()
        assert admin is not None
        admin_id = int(admin.id)
        db.add(
            models.AuditLog(
                club_id=int(seeded_contract["club_a_id"]),
                actor_user_id=admin_id,
                action="member_updated",
                entity_type="member",
                entity_id="CONTRACT-AUDIT-001",
                request_id=request_marker,
                payload_json='{"note":"contract audit payload"}',
                created_at=datetime.utcnow() - timedelta(minutes=1),
            )
        )
        db.add(
            models.AuditLog(
                club_id=int(seeded_contract["club_a_id"]),
                actor_user_id=admin_id,
                action="staff_updated",
                entity_type="staff",
                entity_id="CONTRACT-AUDIT-IGNORE",
                request_id=f"{request_marker}-other",
                payload_json='{"note":"other payload"}',
                created_at=datetime.utcnow(),
            )
        )
        db.commit()

    response = client.get(
        (
            "/api/admin/audit-logs"
            f"?action=member_updated&entity_type=member&actor_user_id={admin_id}&q={request_marker}&limit=10"
        ),
        headers=headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["total"] >= 1
    assert len(payload["items"]) >= 1

    matched = next(item for item in payload["items"] if item["request_id"] == request_marker)
    assert matched["action"] == "member_updated"
    assert matched["entity_type"] == "member"
    assert matched["entity_id"] == "CONTRACT-AUDIT-001"
    assert matched["actor_user_id"] == admin_id
    assert matched["actor_name"] == "Contract Admin"
    assert matched["payload_json"] == '{"note":"contract audit payload"}'
    assert matched["created_at"]


def test_admin_can_create_update_and_sell_pro_shop_product(client: TestClient, seeded_contract: dict[str, int | str]):
    token = _login(
        client,
        email=str(seeded_contract["admin_email"]),
        password=str(seeded_contract["password"]),
    )
    headers = {"Authorization": f"Bearer {token}"}
    unique_sku = f"SKU-{uuid4().hex[:8].upper()}"

    create_response = client.post(
        "/api/admin/pro-shop/products",
        headers=headers,
        json={
            "sku": unique_sku,
            "name": "Contract Polo",
            "category": "Apparel",
            "unit_price": 249.99,
            "cost_price": 120.0,
            "stock_qty": 8,
            "reorder_level": 2,
            "active": True,
        },
    )
    assert create_response.status_code == 200, create_response.text
    created_product = create_response.json()["product"]
    product_id = int(created_product["id"])
    assert created_product["sku"] == unique_sku

    update_response = client.put(
        f"/api/admin/pro-shop/products/{product_id}",
        headers=headers,
        json={
            "sku": unique_sku,
            "name": "Contract Polo Updated",
            "category": "Apparel",
            "unit_price": 259.99,
            "cost_price": 125.0,
            "stock_qty": 10,
            "reorder_level": 3,
            "active": True,
        },
    )
    assert update_response.status_code == 200, update_response.text
    assert update_response.json()["product"]["name"] == "Contract Polo Updated"

    list_response = client.get(f"/api/admin/pro-shop/products?q={unique_sku}", headers=headers)
    assert list_response.status_code == 200, list_response.text
    product_rows = list_response.json()["products"]
    assert any(int(row["id"]) == product_id for row in product_rows)

    sale_response = client.post(
        "/api/admin/pro-shop/sales",
        headers=headers,
        json={
            "customer_name": "Contract Walk-In",
            "payment_method": "card",
            "notes": "Contract pro shop sale",
            "discount": 0,
            "tax": 0,
            "items": [{"product_id": product_id, "quantity": 2}],
        },
    )
    assert sale_response.status_code == 200, sale_response.text
    sale = sale_response.json()["sale"]
    assert sale["customer_name"] == "Contract Walk-In"
    assert len(sale["items"]) == 1

    sales_list_response = client.get("/api/admin/pro-shop/sales?limit=20&days=30", headers=headers)
    assert sales_list_response.status_code == 200, sales_list_response.text
    sales_rows = sales_list_response.json()["sales"]
    assert any(int(row["id"]) == int(sale["id"]) for row in sales_rows)


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
