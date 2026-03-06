from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any

from sqlalchemy import func, text

from app.auth import get_password_hash
from app.club_assignments import ensure_user_primary_club, sync_user_club_assignment
from app.club_config import invalidate_club_config_cache
from app.database import DB_SOURCE, SessionLocal
from app.models import (
    AccountingSetting,
    Club,
    ClubSetting,
    KpiTarget,
    PlatformState,
    SchemaVersion,
    User,
    UserClubAssignment,
    UserRole,
)
from app.observability import log_event
from app.people import sync_user_person
from app.runtime_env import is_local_like, is_production_like
from app.tee_profile import DEFAULT_TEE_SHEET_PROFILE, normalize_tee_sheet_profile
from app.umhlali_operational_seed import seed_umhlali_operational_inputs
from app.weather_alerts import DEFAULT_FORECAST_TIMEZONE, KNOWN_COURSE_COORDS

UMHLALI_CLUB_NAME = "Umhlali Country Club"
UMHLALI_CLUB_SLUG = "umhlali"
DEFAULT_SUPER_ADMIN_PASSWORD = "GreenLink123!"
DEFAULT_CLUB_ADMIN_PASSWORD = "Admin123!"
UMHLALI_HOME_CLUB_KEYWORDS = ["umhlali", "umhlali country club", "umhlali cc"]
UMHLALI_SUGGESTED_HOME_CLUBS = [
    "Umhlali Country Club",
    "Zimbali Country Club",
    "Prince's Grant Golf Estate",
    "Ballito Country Club",
]
TENANT_BACKFILL_TABLES = (
    "users",
    "people",
    "person_memberships",
    "members",
    "account_customers",
    "golf_day_bookings",
    "staff_role_profiles",
    "tee_times",
    "bookings",
    "ledger_entries",
    "day_closures",
    "accounting_settings",
    "fee_categories",
    "club_settings",
    "import_batches",
    "revenue_transactions",
    "kpi_targets",
    "pro_shop_products",
    "pro_shop_sales",
    "pro_shop_sale_items",
    "player_notifications",
    "audit_logs",
)
_UNSAFE_PASSWORD_VALUES = {
    "",
    "123",
    "123456",
    "password",
    "admin",
    "admin123",
    "changeme",
    "change_me",
}


def _env(key: str, default: str | None = None) -> str | None:
    raw = os.getenv(key)
    if raw is None:
        return default
    value = str(raw).strip()
    return value or default


def _env_true(key: str) -> bool:
    return str(os.getenv(key, "")).strip().lower() in {"1", "true", "yes", "y", "on"}


def _utcnow() -> datetime:
    return datetime.utcnow()


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, default=str, separators=(",", ":"))


def _role_value(raw) -> str:
    return str(getattr(raw, "value", raw) or "").strip().lower()


def _safe_int(value: Any) -> int | None:
    try:
        resolved = int(value)
    except Exception:
        return None
    return resolved if resolved > 0 else None


def _set_platform_state(db, key: str, value: Any) -> None:
    row = db.query(PlatformState).filter(PlatformState.key == key).first()
    encoded = value if isinstance(value, str) else _json_dumps(value)
    if row:
        row.value = encoded
        row.updated_at = _utcnow()
        return
    db.add(PlatformState(key=key, value=encoded, updated_at=_utcnow()))


def _set_schema_marker(db, component: str, version: int, *, status: str, details: dict[str, Any]) -> None:
    row = db.query(SchemaVersion).filter(SchemaVersion.component == component).first()
    if row:
        row.version = int(version)
        row.status = str(status or "ready")
        row.details_json = _json_dumps(details)
        row.updated_at = _utcnow()
        return
    db.add(
        SchemaVersion(
            component=str(component),
            version=int(version),
            status=str(status or "ready"),
            details_json=_json_dumps(details),
            updated_at=_utcnow(),
        )
    )


def _upsert_club_setting(db, club_id: int, key: str, value: str) -> None:
    row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == key).first()
    if row:
        row.value = value
        row.updated_at = _utcnow()
        return
    db.add(ClubSetting(club_id=int(club_id), key=key, value=value, updated_at=_utcnow()))


def _canonical_umhlali_name() -> str:
    return (_env("GREENLINK_DEFAULT_CLUB_NAME", UMHLALI_CLUB_NAME) or UMHLALI_CLUB_NAME).strip() or UMHLALI_CLUB_NAME


def _canonical_umhlali_slug() -> str:
    return (_env("GREENLINK_DEFAULT_CLUB_SLUG", UMHLALI_CLUB_SLUG) or UMHLALI_CLUB_SLUG).strip().lower() or UMHLALI_CLUB_SLUG


def _canonical_super_admin_email() -> str:
    return (_env("GREENLINK_SUPER_ADMIN_EMAIL", "greenlinkgolfsa@gmail.com") or "greenlinkgolfsa@gmail.com").strip().lower()


def _canonical_super_admin_password() -> str:
    return _env("GREENLINK_SUPER_ADMIN_PASSWORD", DEFAULT_SUPER_ADMIN_PASSWORD) or DEFAULT_SUPER_ADMIN_PASSWORD


def _canonical_umhlali_admin_email() -> str:
    return (_env("GREENLINK_DEFAULT_CLUB_ADMIN_EMAIL", "admin@umhlali.com") or "admin@umhlali.com").strip().lower()


def _canonical_umhlali_admin_password() -> str:
    return _env("GREENLINK_DEFAULT_CLUB_ADMIN_PASSWORD", DEFAULT_CLUB_ADMIN_PASSWORD) or DEFAULT_CLUB_ADMIN_PASSWORD


def _is_unsafe_bootstrap_password(password: str, known_default: str) -> bool:
    value = str(password or "").strip()
    if not value:
        return True
    if value == known_default:
        return True
    if value.lower() in _UNSAFE_PASSWORD_VALUES:
        return True
    return len(value) < 12


def _assert_safe_bootstrap_credentials(
    *,
    create_missing_users: bool,
    force_reset: bool,
    super_password: str,
    admin_password: str,
) -> None:
    if not is_production_like():
        return
    if not (create_missing_users or force_reset):
        return

    unsafe_vars: list[str] = []
    if _is_unsafe_bootstrap_password(super_password, DEFAULT_SUPER_ADMIN_PASSWORD):
        unsafe_vars.append("GREENLINK_SUPER_ADMIN_PASSWORD")
    if _is_unsafe_bootstrap_password(admin_password, DEFAULT_CLUB_ADMIN_PASSWORD):
        unsafe_vars.append("GREENLINK_DEFAULT_CLUB_ADMIN_PASSWORD")
    if unsafe_vars:
        joined = ", ".join(unsafe_vars)
        raise RuntimeError(
            f"Unsafe bootstrap credential configuration for production-like runtime. "
            f"Set strong values for: {joined}."
        )


def _umhlali_weather_defaults() -> tuple[str | None, str | None]:
    for item in KNOWN_COURSE_COORDS:
        keywords = [str(v or "").strip().lower() for v in (item.get("keywords") or []) if str(v or "").strip()]
        if "umhlali" not in keywords:
            continue
        lat = item.get("latitude")
        lon = item.get("longitude")
        return (str(lat) if lat is not None else None, str(lon) if lon is not None else None)
    return (None, None)


def _club_matches_umhlali(club: Club | None) -> bool:
    if club is None:
        return False
    slug = str(getattr(club, "slug", "") or "").strip().lower()
    name = str(getattr(club, "name", "") or "").strip().lower()
    return slug == _canonical_umhlali_slug() or name == _canonical_umhlali_name().strip().lower()


def _club_is_generic_bootstrap_artifact(club: Club | None) -> bool:
    if club is None:
        return False
    slug = str(getattr(club, "slug", "") or "").strip().lower()
    name = str(getattr(club, "name", "") or "").strip().lower()
    return slug in {"", "greenlink"} and name in {"greenlink", "greenlink club"}


def _find_umhlali_club(db) -> Club | None:
    slug = _canonical_umhlali_slug()
    club = db.query(Club).filter(func.lower(Club.slug) == slug.lower()).first()
    if club:
        return club
    return db.query(Club).filter(func.lower(Club.name) == _canonical_umhlali_name().strip().lower()).first()


def _ensure_umhlali_club_exists(db, diagnostics: dict[str, Any]) -> Club | None:
    club = _find_umhlali_club(db)
    clubs = db.query(Club).order_by(Club.id.asc()).all()
    total_clubs = len(clubs)
    total_active = sum(1 for row in clubs if int(getattr(row, "active", 0) or 0) == 1)

    if club:
        changed = False
        if str(getattr(club, "name", "") or "").strip() != _canonical_umhlali_name():
            club.name = _canonical_umhlali_name()
            changed = True
        if str(getattr(club, "slug", "") or "").strip().lower() != _canonical_umhlali_slug():
            existing_slug = db.query(Club.id).filter(func.lower(Club.slug) == _canonical_umhlali_slug(), Club.id != int(club.id)).first()
            if not existing_slug:
                club.slug = _canonical_umhlali_slug()
                changed = True
        if total_active == 0 and total_clubs == 1:
            club.active = 1
            changed = True
        if changed:
            diagnostics["notes"].append("Normalized existing Umhlali club record.")
        return club

    if total_clubs == 0:
        club = Club(name=_canonical_umhlali_name(), slug=_canonical_umhlali_slug(), active=1)
        db.add(club)
        db.flush()
        diagnostics["notes"].append("Created Umhlali as the initial launch club.")
        return club

    if total_clubs == 1 and _club_is_generic_bootstrap_artifact(clubs[0]):
        club = clubs[0]
        club.name = _canonical_umhlali_name()
        club.slug = _canonical_umhlali_slug()
        club.active = 1
        diagnostics["notes"].append("Normalized legacy generic bootstrap club into Umhlali.")
        return club

    if total_clubs > 1:
        diagnostics["warnings"].append(
            "Umhlali launch club is absent, but multiple clubs already exist. Preserving current tenancy state."
        )
    else:
        diagnostics["warnings"].append(
            "Single-club data exists without an Umhlali identifier. No automatic club rename was applied."
        )
    return None


def ensure_platform_roles_exist(db, diagnostics: dict[str, Any]) -> dict[str, int]:
    stats = {"normalized_users": 0, "assignment_upserts": 0, "unassigned_users": 0}
    users = db.query(User).order_by(User.id.asc()).all()
    for user in users:
        role = _role_value(getattr(user, "role", None)) or UserRole.player.value
        if role == UserRole.super_admin.value:
            if getattr(user, "club_id", None) is not None:
                user.club_id = None
                stats["normalized_users"] += 1
            continue

        before_club_id = _safe_int(getattr(user, "club_id", None))
        resolved_club_id = ensure_user_primary_club(db, user)
        if resolved_club_id:
            assignment = sync_user_club_assignment(
                db,
                user,
                club_id=int(resolved_club_id),
                role=role,
                is_primary=True,
            )
            if assignment is not None:
                stats["assignment_upserts"] += 1
            if before_club_id != resolved_club_id:
                stats["normalized_users"] += 1
            sync_user_person(db, user, source_system="platform_bootstrap")
            continue

        stats["unassigned_users"] += 1
        diagnostics["warnings"].append(
            f"User {getattr(user, 'email', 'unknown')} has role '{role}' but no club assignment."
        )

    return stats


def ensure_super_admin_capabilities_exist(
    db,
    diagnostics: dict[str, Any],
    *,
    create_missing_users: bool,
    force_reset: bool,
    umhlali_club_id: int | None,
) -> dict[str, Any]:
    stats = {"super_admin_created": 0, "super_admin_reset": 0, "club_admin_created": 0, "club_admin_reset": 0}
    super_email = _canonical_super_admin_email()
    super_password = _canonical_super_admin_password()
    admin_email = _canonical_umhlali_admin_email()
    admin_password = _canonical_umhlali_admin_password()
    try:
        _assert_safe_bootstrap_credentials(
            create_missing_users=create_missing_users,
            force_reset=force_reset,
            super_password=super_password,
            admin_password=admin_password,
        )
    except RuntimeError as exc:
        diagnostics["warnings"].append(str(exc))
        create_missing_users = False
        force_reset = False

    super_user = db.query(User).filter(func.lower(User.email) == super_email).first()
    any_super_admin = db.query(User.id).filter(User.role == UserRole.super_admin).first()
    if not any_super_admin and not create_missing_users:
        diagnostics["warnings"].append("No super admin user is provisioned yet. Set GREENLINK_BOOTSTRAP=1 to create bootstrap credentials.")
    elif super_user is None and create_missing_users:
        super_user = User(
            name="Super Admin",
            email=super_email,
            password=get_password_hash(super_password),
            role=UserRole.super_admin,
            club_id=None,
        )
        db.add(super_user)
        stats["super_admin_created"] += 1
    elif super_user is not None:
        if getattr(super_user, "role", None) != UserRole.super_admin:
            super_user.role = UserRole.super_admin
        if getattr(super_user, "club_id", None) is not None:
            super_user.club_id = None
        if force_reset:
            super_user.password = get_password_hash(super_password)
            stats["super_admin_reset"] += 1

    if umhlali_club_id is None:
        return stats

    club_admin = db.query(User).filter(func.lower(User.email) == admin_email).first()
    if club_admin is None and create_missing_users:
        club_admin = User(
            name="Club Admin",
            email=admin_email,
            password=get_password_hash(admin_password),
            role=UserRole.admin,
            club_id=int(umhlali_club_id),
        )
        db.add(club_admin)
        db.flush()
        sync_user_club_assignment(
            db,
            club_admin,
            club_id=int(umhlali_club_id),
            role=UserRole.admin,
            is_primary=True,
        )
        stats["club_admin_created"] += 1
    elif club_admin is not None:
        if getattr(club_admin, "role", None) == UserRole.super_admin:
            diagnostics["warnings"].append("Bootstrap club admin email belongs to a super admin and was not altered.")
        else:
            club_admin.role = UserRole.admin
            club_admin.club_id = int(umhlali_club_id)
            sync_user_club_assignment(
                db,
                club_admin,
                club_id=int(umhlali_club_id),
                role=UserRole.admin,
                is_primary=True,
            )
            if force_reset:
                club_admin.password = get_password_hash(admin_password)
                stats["club_admin_reset"] += 1

    return stats


def ensure_umhlali_defaults_exist(db, diagnostics: dict[str, Any], club_id: int | None) -> None:
    if club_id is None:
        return

    lat, lon = _umhlali_weather_defaults()
    settings = {
        "club_name": _canonical_umhlali_name(),
        "club_slug": _canonical_umhlali_slug(),
        "club_member_label": "Member",
        "club_visitor_label": "Visitor",
        "club_non_affiliated_label": "Non-affiliated",
        "club_currency_symbol": "R",
        "target_member_round_share": "0.55",
        "target_member_revenue_share": "0.35",
        "booking_window_member_days": "28",
        "booking_window_affiliated_days": "28",
        "booking_window_non_affiliated_days": "28",
        "booking_window_group_cancel_days": "10",
        "tee_sheet_profile": _json_dumps(normalize_tee_sheet_profile(DEFAULT_TEE_SHEET_PROFILE)),
        "club_home_club_keywords": _json_dumps(UMHLALI_HOME_CLUB_KEYWORDS),
        "club_suggested_home_clubs": _json_dumps(UMHLALI_SUGGESTED_HOME_CLUBS),
        "weather_timezone": DEFAULT_FORECAST_TIMEZONE,
    }
    if lat is not None:
        settings["weather_lat"] = str(lat)
    if lon is not None:
        settings["weather_lon"] = str(lon)

    for key, value in settings.items():
        _upsert_club_setting(db, int(club_id), key, value)

    accounting = db.query(AccountingSetting).filter(AccountingSetting.club_id == int(club_id)).first()
    if not accounting:
        db.add(AccountingSetting(club_id=int(club_id)))

    for metric, annual_target in (("rounds", 36000.0), ("revenue", 14500000.0)):
        row = (
            db.query(KpiTarget)
            .filter(KpiTarget.club_id == int(club_id), KpiTarget.year == 2026, KpiTarget.metric == metric)
            .first()
        )
        if row:
            row.annual_target = float(annual_target)
            row.updated_at = _utcnow()
            continue
        db.add(
            KpiTarget(
                club_id=int(club_id),
                year=2026,
                metric=metric,
                annual_target=float(annual_target),
            )
        )

    diagnostics["notes"].append("Ensured Umhlali club defaults, booking rules, and KPI targets.")


def ensure_umhlali_operational_inputs_exist(
    db,
    diagnostics: dict[str, Any],
    club_id: int | None,
) -> dict[str, Any]:
    result: dict[str, Any] = {"status": "skipped"}
    if club_id is None:
        return result

    auto_sync = _env_true("UMHLALI_OPERATIONAL_SYNC") or DB_SOURCE in {"SQLITE", "MYSQL"}
    force = _env_true("UMHLALI_OPERATIONAL_SYNC_FORCE")
    if not auto_sync and not force:
        return result

    try:
        result = seed_umhlali_operational_inputs(db, club_id=int(club_id), force=bool(force))
    except Exception as exc:
        diagnostics["warnings"].append(
            f"Umhlali operational seed failed: {type(exc).__name__}: {str(exc)[:180]}"
        )
        return {"status": "failed"}

    status = str(result.get("status") or "unknown")
    if status == "seeded":
        diagnostics["notes"].append("Loaded Umhlali members, account customers, golf-day bookings, and staff role profiles.")
    elif status == "already_seeded":
        diagnostics["notes"].append("Umhlali operational seed already present; no re-import required.")
    elif status == "missing_inputs":
        missing = ", ".join(str(v) for v in (result.get("missing_files") or [])[:4])
        diagnostics["warnings"].append(
            f"Umhlali operational source files not found ({missing or 'files missing'})."
        )
    return result


def _null_club_id_count(conn, table_name: str) -> int:
    return int(conn.execute(text(f"SELECT COUNT(*) FROM {table_name} WHERE club_id IS NULL")).scalar() or 0)


def _table_names(conn) -> set[str]:
    from sqlalchemy import inspect

    return set(inspect(conn).get_table_names())


def backfill_missing_club_scope(db, diagnostics: dict[str, Any], club_id: int | None) -> dict[str, Any]:
    result = {"backfilled_tables": [], "ambiguous_tables": []}
    if club_id is None:
        return result

    club_count = int(db.query(func.count(Club.id)).scalar() or 0)
    conn = db.connection()
    table_names = _table_names(conn)
    if club_count == 1:
        for table_name in TENANT_BACKFILL_TABLES:
            if table_name not in table_names:
                continue
            count = _null_club_id_count(conn, table_name)
            if count <= 0:
                continue
            if table_name == "users":
                conn.execute(
                    text(
                        "UPDATE users SET club_id = :club_id WHERE club_id IS NULL AND (role IS NULL OR role <> 'super_admin')"
                    ),
                    {"club_id": int(club_id)},
                )
            else:
                conn.execute(
                    text(f"UPDATE {table_name} SET club_id = :club_id WHERE club_id IS NULL"),
                    {"club_id": int(club_id)},
                )
            result["backfilled_tables"].append({"table": table_name, "rows": int(count)})
    else:
        for table_name in TENANT_BACKFILL_TABLES:
            if table_name not in table_names:
                continue
            count = _null_club_id_count(conn, table_name)
            if count <= 0:
                continue
            result["ambiguous_tables"].append({"table": table_name, "rows": int(count)})
            diagnostics["warnings"].append(
                f"Skipped club_id backfill for {table_name}: {count} row(s) remain ambiguous in a multi-club database."
            )
    return result


def _active_club_rows(db) -> list[dict[str, Any]]:
    rows = db.query(Club).filter(Club.active == 1).order_by(Club.name.asc(), Club.id.asc()).all()
    payload = []
    for row in rows:
        payload.append(
            {
                "id": int(row.id),
                "name": str(getattr(row, "name", "") or "").strip() or f"Club {row.id}",
                "slug": str(getattr(row, "slug", "") or "").strip() or None,
                "active": int(getattr(row, "active", 0) or 0),
            }
        )
    return payload


def _status_from_diagnostics(errors: list[str], warnings: list[str]) -> str:
    if errors:
        return "failed"
    if warnings:
        return "needs_attention"
    return "ready"


def get_platform_state_payload(db, runtime: dict[str, Any] | None = None) -> dict[str, Any]:
    active_clubs = _active_club_rows(db)
    runtime = runtime or {}
    bootstrap = runtime.get("platform") if isinstance(runtime, dict) else None
    schema = runtime.get("schema") if isinstance(runtime, dict) else None

    status = str((bootstrap or {}).get("status") or runtime.get("status") or "ready")
    warnings = list((bootstrap or {}).get("warnings") or runtime.get("warnings") or [])
    errors = list((bootstrap or {}).get("errors") or runtime.get("errors") or [])
    umhlali_present = db.query(Club.id).filter(func.lower(Club.slug) == _canonical_umhlali_slug()).first() is not None

    return {
        "status": status,
        "warnings": warnings,
        "errors": errors,
        "launch_club_slug": _canonical_umhlali_slug(),
        "launch_club_name": _canonical_umhlali_name(),
        "umhlali_present": bool(umhlali_present),
        "active_clubs": active_clubs,
        "active_club_count": len(active_clubs),
        "requires_club_selection": len(active_clubs) > 1,
        "schema": schema or {},
        "bootstrap": bootstrap or {},
    }


def ensure_platform_ready() -> dict[str, Any]:
    diagnostics: dict[str, Any] = {
        "status": "booting",
        "db_source": DB_SOURCE,
        "launch_club_slug": _canonical_umhlali_slug(),
        "launch_club_name": _canonical_umhlali_name(),
        "warnings": [],
        "errors": [],
        "notes": [],
        "role_stats": {},
        "backfill": {},
        "operational_seed": {},
        "bootstrap_users": {},
        "active_clubs": [],
        "bootstrap_sequence": [],
        "timestamp": _utcnow().isoformat(),
    }

    bootstrap_enabled = _env_true("GREENLINK_BOOTSTRAP")
    bootstrap_force_reset = _env_true("GREENLINK_BOOTSTRAP_FORCE_RESET")
    create_missing_users = bootstrap_enabled or (DB_SOURCE in {"MYSQL", "SQLITE"} and is_local_like())
    force_reset = bootstrap_force_reset or (DB_SOURCE == "SQLITE" and is_local_like())

    with SessionLocal() as db:
        try:
            diagnostics["bootstrap_sequence"].append("tenant_bootstrap_start")
            umhlali = _ensure_umhlali_club_exists(db, diagnostics)
            diagnostics["bootstrap_sequence"].append("launch_club_resolved")
            umhlali_club_id = int(umhlali.id) if umhlali is not None and _club_matches_umhlali(umhlali) else None

            if umhlali_club_id is not None:
                ensure_umhlali_defaults_exist(db, diagnostics, umhlali_club_id)
                diagnostics["bootstrap_sequence"].append("umhlali_defaults_ready")

            diagnostics["backfill"] = backfill_missing_club_scope(db, diagnostics, umhlali_club_id)
            diagnostics["bootstrap_sequence"].append("club_scope_backfill")
            diagnostics["role_stats"] = ensure_platform_roles_exist(db, diagnostics)
            diagnostics["bootstrap_sequence"].append("roles_normalized")
            diagnostics["bootstrap_users"] = ensure_super_admin_capabilities_exist(
                db,
                diagnostics,
                create_missing_users=create_missing_users,
                force_reset=force_reset,
                umhlali_club_id=umhlali_club_id,
            )
            diagnostics["bootstrap_sequence"].append("bootstrap_users_normalized")
            diagnostics["role_stats"] = ensure_platform_roles_exist(db, diagnostics)
            diagnostics["bootstrap_sequence"].append("roles_revalidated")
            diagnostics["operational_seed"] = ensure_umhlali_operational_inputs_exist(
                db,
                diagnostics,
                umhlali_club_id,
            )
            diagnostics["bootstrap_sequence"].append("umhlali_operational_seed")

            active_clubs = _active_club_rows(db)
            diagnostics["active_clubs"] = active_clubs
            if not active_clubs:
                diagnostics["errors"].append("No active clubs are available after bootstrap.")
            diagnostics["bootstrap_sequence"].append("active_clubs_verified")

            diagnostics["status"] = _status_from_diagnostics(diagnostics["errors"], diagnostics["warnings"])
            diagnostics["timestamp"] = _utcnow().isoformat()

            _set_schema_marker(
                db,
                "tenant_bootstrap",
                1,
                status=diagnostics["status"],
                details={
                    "launch_club_slug": diagnostics["launch_club_slug"],
                    "warnings": diagnostics["warnings"],
                    "errors": diagnostics["errors"],
                },
            )
            _set_platform_state(db, "platform.bootstrap_status", diagnostics["status"])
            _set_platform_state(db, "platform.launch_club_slug", diagnostics["launch_club_slug"])
            _set_platform_state(db, "platform.launch_club_name", diagnostics["launch_club_name"])
            _set_platform_state(db, "platform.last_bootstrap_at", diagnostics["timestamp"])
            _set_platform_state(db, "platform.last_bootstrap_warnings", diagnostics["warnings"])
            _set_platform_state(db, "platform.last_bootstrap_errors", diagnostics["errors"])
            _set_platform_state(db, "platform.active_clubs", active_clubs)

            db.commit()
            invalidate_club_config_cache(None)
            log_event(
                "info",
                "platform.bootstrap.completed",
                status=diagnostics["status"],
                warnings=len(diagnostics["warnings"]),
                errors=len(diagnostics["errors"]),
                active_clubs=len(active_clubs),
                launch_club_slug=diagnostics["launch_club_slug"],
            )
            return diagnostics
        except Exception as exc:
            db.rollback()
            diagnostics["errors"].append(f"{type(exc).__name__}: {str(exc)[:240]}")
            diagnostics["status"] = "failed"
            diagnostics["timestamp"] = _utcnow().isoformat()
            try:
                _set_schema_marker(
                    db,
                    "tenant_bootstrap",
                    1,
                    status="failed",
                    details={"errors": diagnostics["errors"]},
                )
                _set_platform_state(db, "platform.bootstrap_status", diagnostics["status"])
                _set_platform_state(db, "platform.last_bootstrap_at", diagnostics["timestamp"])
                _set_platform_state(db, "platform.last_bootstrap_errors", diagnostics["errors"])
                db.commit()
            except Exception:
                db.rollback()
            log_event(
                "error",
                "platform.bootstrap.failed",
                error_type=type(exc).__name__,
                error=str(exc)[:240],
            )
            return diagnostics
