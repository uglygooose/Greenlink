from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.club_ops import operational_targets_for_club, target_catalog, upsert_operational_targets


class OperationalTargetInput(BaseModel):
    operation_key: str
    metric_key: str
    target_value: float
    unit: str | None = None
    notes: str | None = None


class OperationalTargetUpsertPayload(BaseModel):
    year: int
    targets: list[OperationalTargetInput]


def get_operational_target_settings_payload(
    db: Session,
    *,
    club_id: int,
    year: int,
) -> dict[str, Any]:
    target_year = int(year)
    if target_year < 2000 or target_year > 2100:
        raise HTTPException(status_code=400, detail="invalid year")
    return {
        "year": int(target_year),
        "catalog": target_catalog(),
        "targets": operational_targets_for_club(db, int(club_id), int(target_year)),
    }


def upsert_operational_target_settings_payload(
    db: Session,
    *,
    club_id: int,
    year: int,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    target_year = int(year)
    if target_year < 2000 or target_year > 2100:
        raise HTTPException(status_code=400, detail="invalid year")
    result = upsert_operational_targets(
        db,
        club_id=int(club_id),
        year=int(target_year),
        rows=[dict(row) for row in list(rows or [])],
    )
    return {"status": "success", "year": int(target_year), "targets": result}
