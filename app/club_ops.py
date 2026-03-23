from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models


_MODULE_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "key": "golf",
        "label": "Golf",
        "default_enabled": True,
        "description": "Tee sheet, bookings, check-in, scoring, and golf reporting.",
    },
    {
        "key": "tennis",
        "label": "Tennis",
        "default_enabled": False,
        "description": "Tennis member visibility and revenue target tracking.",
    },
    {
        "key": "bowls",
        "label": "Bowls",
        "default_enabled": True,
        "description": "Bowls member visibility and bowls revenue reporting.",
    },
    {
        "key": "pro_shop",
        "label": "Pro Shop",
        "default_enabled": True,
        "description": "POS sales, products, stock, and inventory analytics.",
    },
    {
        "key": "pub",
        "label": "Pub",
        "default_enabled": True,
        "description": "Clubhouse food and beverage revenue imports and reporting.",
    },
    {
        "key": "golf_days",
        "label": "Golf Days",
        "default_enabled": True,
        "description": "Golf day pipeline, account customers, and event operations.",
    },
    {
        "key": "members",
        "label": "Members",
        "default_enabled": True,
        "description": "Member directory, staff operations, and self-service player accounts.",
    },
    {
        "key": "communications",
        "label": "Communications",
        "default_enabled": True,
        "description": "Club news, announcements, and member-facing messaging.",
    },
)

_TARGET_CATALOG: tuple[dict[str, Any], ...] = (
    {"operation_key": "golf", "metric_key": "rounds", "label": "Golf Rounds", "unit": "rounds"},
    {"operation_key": "golf", "metric_key": "revenue", "label": "Golf Revenue", "unit": "currency"},
    {"operation_key": "golf_days", "metric_key": "pipeline", "label": "Golf Day Pipeline", "unit": "currency"},
    {"operation_key": "golf_days", "metric_key": "events", "label": "Golf Day Events", "unit": "events"},
    {"operation_key": "pro_shop", "metric_key": "revenue", "label": "Pro Shop Revenue", "unit": "currency"},
    {"operation_key": "pro_shop", "metric_key": "transactions", "label": "Pro Shop Transactions", "unit": "transactions"},
    {"operation_key": "pub", "metric_key": "revenue", "label": "Pub Revenue", "unit": "currency"},
    {"operation_key": "pub", "metric_key": "transactions", "label": "Pub Transactions", "unit": "transactions"},
    {"operation_key": "bowls", "metric_key": "revenue", "label": "Bowls Revenue", "unit": "currency"},
    {"operation_key": "bowls", "metric_key": "usage", "label": "Bowls Usage", "unit": "uses"},
    {"operation_key": "tennis", "metric_key": "revenue", "label": "Tennis Revenue", "unit": "currency"},
    {"operation_key": "tennis", "metric_key": "usage", "label": "Tennis Usage", "unit": "uses"},
    {"operation_key": "members", "metric_key": "active_members", "label": "Active Members", "unit": "members"},
)

_MODULE_BY_KEY = {str(row["key"]): row for row in _MODULE_CATALOG}
_TARGET_BY_KEY = {
    f"{str(row['operation_key'])}:{str(row['metric_key'])}": row
    for row in _TARGET_CATALOG
}


def module_catalog() -> list[dict[str, Any]]:
    return [dict(row) for row in _MODULE_CATALOG]


def target_catalog() -> list[dict[str, Any]]:
    return [dict(row) for row in _TARGET_CATALOG]


def normalize_module_keys(values: list[str] | None) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for raw in list(values or []):
        key = str(raw or "").strip().lower()
        if not key or key not in _MODULE_BY_KEY or key in seen:
            continue
        seen.add(key)
        normalized.append(key)
    return normalized


def module_settings_for_club(db: Session, club_id: int) -> list[dict[str, Any]]:
    rows = (
        db.query(models.ClubModuleSetting)
        .filter(models.ClubModuleSetting.club_id == int(club_id))
        .all()
    )
    enabled_by_key = {
        str(getattr(row, "module_key", "") or "").strip().lower(): bool(getattr(row, "enabled", False))
        for row in rows
    }

    payload: list[dict[str, Any]] = []
    for spec in _MODULE_CATALOG:
        key = str(spec["key"])
        payload.append(
            {
                "key": key,
                "label": str(spec["label"]),
                "description": str(spec["description"]),
                "enabled": bool(enabled_by_key.get(key, bool(spec["default_enabled"]))),
            }
        )
    return payload


def enabled_module_keys_for_club(db: Session, club_id: int) -> list[str]:
    return [
        str(row["key"])
        for row in module_settings_for_club(db, club_id)
        if bool(row.get("enabled"))
    ]


def is_module_enabled(db: Session, club_id: int, module_key: str) -> bool:
    key = str(module_key or "").strip().lower()
    if not key or key not in _MODULE_BY_KEY:
        return False
    enabled = {str(row["key"]): bool(row.get("enabled")) for row in module_settings_for_club(db, club_id)}
    return bool(enabled.get(key, False))


def assert_club_module_enabled(db: Session, club_id: int, module_key: str) -> None:
    key = str(module_key or "").strip().lower()
    if key not in _MODULE_BY_KEY:
        raise HTTPException(status_code=400, detail=f"Unknown module: {module_key}")
    if not is_module_enabled(db, club_id, key):
        raise HTTPException(
            status_code=409,
            detail=f"{_MODULE_BY_KEY[key]['label']} is disabled for this club",
        )


def upsert_club_modules(db: Session, club_id: int, enabled_module_keys: list[str] | None) -> list[dict[str, Any]]:
    enabled = set(normalize_module_keys(enabled_module_keys))
    existing = {
        str(getattr(row, "module_key", "") or "").strip().lower(): row
        for row in (
            db.query(models.ClubModuleSetting)
            .filter(models.ClubModuleSetting.club_id == int(club_id))
            .all()
        )
    }
    now = datetime.utcnow()
    for spec in _MODULE_CATALOG:
        key = str(spec["key"])
        row = existing.get(key)
        is_enabled = key in enabled
        if row is None:
            db.add(
                models.ClubModuleSetting(
                    club_id=int(club_id),
                    module_key=key,
                    enabled=is_enabled,
                    configured_at=now,
                    updated_at=now,
                )
            )
            continue
        row.enabled = is_enabled
        row.updated_at = now
    db.flush()
    return module_settings_for_club(db, club_id)


def _target_lookup_key(operation_key: str, metric_key: str) -> str:
    return f"{str(operation_key or '').strip().lower()}:{str(metric_key or '').strip().lower()}"


def serialize_operational_target(row: models.ClubOperationalTarget | None, *, default: dict[str, Any], year: int) -> dict[str, Any]:
    return {
        "id": int(getattr(row, "id", 0) or 0) or None,
        "year": int(getattr(row, "year", year) or year),
        "operation_key": str(default["operation_key"]),
        "metric_key": str(default["metric_key"]),
        "label": str(default["label"]),
        "unit": str(getattr(row, "unit", None) or default["unit"]),
        "target_value": float(getattr(row, "target_value", 0.0) or 0.0),
        "notes": str(getattr(row, "notes", "") or "").strip() or None,
        "configured": bool(row is not None),
    }


def operational_targets_for_club(db: Session, club_id: int, year: int) -> list[dict[str, Any]]:
    rows = (
        db.query(models.ClubOperationalTarget)
        .filter(
            models.ClubOperationalTarget.club_id == int(club_id),
            models.ClubOperationalTarget.year == int(year),
        )
        .all()
    )
    by_key = {
        _target_lookup_key(getattr(row, "operation_key", None), getattr(row, "metric_key", None)): row
        for row in rows
    }
    payload: list[dict[str, Any]] = []
    for spec in _TARGET_CATALOG:
        key = _target_lookup_key(spec["operation_key"], spec["metric_key"])
        payload.append(
            serialize_operational_target(
                by_key.get(key),
                default=spec,
                year=int(year),
            )
        )
    return payload


def upsert_operational_targets(
    db: Session,
    *,
    club_id: int,
    year: int,
    rows: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    existing = {
        _target_lookup_key(getattr(row, "operation_key", None), getattr(row, "metric_key", None)): row
        for row in (
            db.query(models.ClubOperationalTarget)
            .filter(
                models.ClubOperationalTarget.club_id == int(club_id),
                models.ClubOperationalTarget.year == int(year),
            )
            .all()
        )
    }
    now = datetime.utcnow()
    for payload in list(rows or []):
        operation_key = str(payload.get("operation_key") or "").strip().lower()
        metric_key = str(payload.get("metric_key") or "").strip().lower()
        lookup = _target_lookup_key(operation_key, metric_key)
        spec = _TARGET_BY_KEY.get(lookup)
        if spec is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported operation target: {operation_key}:{metric_key}",
            )
        try:
            target_value = float(payload.get("target_value"))
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid target value for {operation_key}:{metric_key}",
            )
        if target_value < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Target value must be >= 0 for {operation_key}:{metric_key}",
            )
        row = existing.get(lookup)
        if row is None:
            row = models.ClubOperationalTarget(
                club_id=int(club_id),
                year=int(year),
                operation_key=operation_key,
                metric_key=metric_key,
                created_at=now,
            )
            db.add(row)
        row.target_value = float(target_value)
        row.unit = str(payload.get("unit") or spec["unit"]).strip() or str(spec["unit"])
        row.notes = str(payload.get("notes") or "").strip() or None
        row.updated_at = now
    db.flush()
    return operational_targets_for_club(db, club_id, int(year))
