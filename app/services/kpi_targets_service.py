from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.club_config import invalidate_club_config_cache
from app.fee_models import FeeCategory, FeeType
from app.models import ClubSetting, KpiTarget


class KpiTargetUpsertPayload(BaseModel):
    year: int
    metric: str
    annual_target: float


class TargetAssumptionsPayload(BaseModel):
    year: int
    member_round_share: float
    member_revenue_share: float
    revenue_mode: str = "derived"


def _safe_rollback(db: Session) -> None:
    try:
        db.rollback()
    except Exception:
        return


def _annual_target(db: Session, year: int, metric: str, default: float | None = None) -> float | None:
    try:
        club_id = db.info.get("club_id")
        if not club_id:
            return default
        row = (
            db.query(KpiTarget)
            .filter(KpiTarget.club_id == int(club_id), KpiTarget.year == int(year), KpiTarget.metric == str(metric))
            .first()
        )
        if row and row.annual_target is not None:
            return float(row.annual_target)
    except Exception:
        _safe_rollback(db)
    return default


def _float_setting(db: Session, key: str, default: float) -> float:
    try:
        club_id = db.info.get("club_id")
        if not club_id:
            return float(default)
        row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == str(key)).first()
        if not row:
            return float(default)
        raw = str(row.value or "").strip()
        return float(raw) if raw else float(default)
    except Exception:
        _safe_rollback(db)
        return float(default)


def _string_setting(db: Session, key: str, default: str) -> str:
    try:
        club_id = db.info.get("club_id")
        if not club_id:
            return str(default)
        row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == str(key)).first()
        if not row:
            return str(default)
        raw = str(row.value or "").strip()
        return raw or str(default)
    except Exception:
        _safe_rollback(db)
        return str(default)


def _upsert_setting(db: Session, key: str, value: int | float | str) -> None:
    club_id = db.info.get("club_id")
    if not club_id:
        raise HTTPException(status_code=400, detail="club_id is required")
    row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == str(key)).first()
    if row:
        row.value = str(value)
        row.updated_at = datetime.utcnow()
    else:
        db.add(ClubSetting(club_id=int(club_id), key=str(key), value=str(value)))
    invalidate_club_config_cache(int(club_id))


def _member_green_fee_18(db: Session) -> float:
    try:
        club_id = db.info.get("club_id")
        fee_q = db.query(FeeCategory).filter(FeeCategory.code == 1)
        if club_id:
            fee_q = fee_q.filter(or_(FeeCategory.club_id == int(club_id), FeeCategory.club_id.is_(None)))
        fee = fee_q.first()
        if fee and getattr(fee, "price", None) is not None:
            return float(fee.price)

        q = db.query(FeeCategory).filter(
            FeeCategory.active == 1,
            FeeCategory.fee_type == FeeType.GOLF,
            FeeCategory.audience == "member",
            FeeCategory.holes == 18,
            FeeCategory.day_kind.is_(None),
        )
        if club_id:
            q = q.filter(or_(FeeCategory.club_id == int(club_id), FeeCategory.club_id.is_(None)))
        fee = q.order_by(FeeCategory.priority.desc(), FeeCategory.code.asc()).first()
        if fee and getattr(fee, "price", None) is not None:
            return float(fee.price)
    except Exception:
        _safe_rollback(db)
    return 340.0


def _derive_annual_revenue_target_from_mix(db: Session, year: int, annual_rounds_target: float | None) -> float | None:
    if annual_rounds_target is None:
        return None

    member_round_share = _float_setting(db, "target_member_round_share", 0.50)
    member_revenue_share = _float_setting(db, "target_member_revenue_share", 0.33)
    if member_round_share <= 0 or member_round_share >= 1:
        member_round_share = 0.50
    if member_revenue_share <= 0 or member_revenue_share >= 1:
        member_revenue_share = 0.33

    member_fee = float(_member_green_fee_18(db))
    member_rounds = float(annual_rounds_target) * float(member_round_share)
    return (member_rounds * member_fee) / float(member_revenue_share)


def get_target_model_payload(db: Session, *, year: int) -> dict[str, Any]:
    target_year = int(year)
    annual_rounds_target = _annual_target(db, target_year, "rounds", default=35000.0)
    annual_revenue_override = _annual_target(db, target_year, "revenue", default=None)
    revenue_mode = _string_setting(db, "target_revenue_mode", "derived").strip().lower()
    if revenue_mode not in {"derived", "manual"}:
        revenue_mode = "derived"

    derived_revenue_target = _derive_annual_revenue_target_from_mix(
        db,
        target_year,
        float(annual_rounds_target) if annual_rounds_target is not None else None,
    )

    if revenue_mode == "manual" and annual_revenue_override is not None:
        active_revenue_target = float(annual_revenue_override)
        revenue_source = "manual_override"
    else:
        active_revenue_target = (
            float(derived_revenue_target)
            if derived_revenue_target is not None
            else (float(annual_revenue_override) if annual_revenue_override is not None else None)
        )
        revenue_source = "derived_from_mix" if derived_revenue_target is not None else (
            "manual_override" if annual_revenue_override is not None else "unconfigured"
        )

    return {
        "year": int(target_year),
        "rounds_target": float(annual_rounds_target) if annual_rounds_target is not None else None,
        "revenue_target": active_revenue_target,
        "revenue_mode": revenue_mode,
        "revenue_source": revenue_source,
        "revenue_override": float(annual_revenue_override) if annual_revenue_override is not None else None,
        "revenue_derived": float(derived_revenue_target) if derived_revenue_target is not None else None,
        "assumptions": {
            "member_round_share": float(_float_setting(db, "target_member_round_share", 0.50)),
            "member_revenue_share": float(_float_setting(db, "target_member_revenue_share", 0.33)),
            "member_fee_18": float(_member_green_fee_18(db)),
        },
    }


def get_target_settings_payload(db: Session, *, year: int) -> dict[str, Any]:
    target_year = int(year)
    if target_year < 2000 or target_year > 2100:
        raise HTTPException(status_code=400, detail="invalid year")
    return get_target_model_payload(db, year=target_year)


def upsert_kpi_target_payload(
    db: Session,
    *,
    club_id: int,
    payload: KpiTargetUpsertPayload,
) -> dict[str, Any]:
    metric = str(payload.metric or "").strip().lower()
    if metric not in {"revenue", "rounds"}:
        raise HTTPException(status_code=400, detail="metric must be 'revenue' or 'rounds'")
    if int(payload.year) < 2000 or int(payload.year) > 2100:
        raise HTTPException(status_code=400, detail="invalid year")
    if float(payload.annual_target) < 0:
        raise HTTPException(status_code=400, detail="annual_target must be >= 0")
    if int(club_id) <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

    row = (
        db.query(KpiTarget)
        .filter(
            KpiTarget.club_id == int(club_id),
            KpiTarget.year == int(payload.year),
            KpiTarget.metric == metric,
        )
        .first()
    )
    if not row:
        row = KpiTarget(
            club_id=int(club_id),
            year=int(payload.year),
            metric=metric,
            annual_target=float(payload.annual_target),
        )
        db.add(row)
    else:
        row.annual_target = float(payload.annual_target)
        row.updated_at = datetime.utcnow()

    return {
        "status": "ok",
        "year": int(payload.year),
        "metric": metric,
        "annual_target": float(payload.annual_target),
    }


def update_target_assumptions_payload(
    db: Session,
    *,
    payload: TargetAssumptionsPayload,
) -> dict[str, Any]:
    target_year = int(payload.year or datetime.utcnow().year)
    if target_year < 2000 or target_year > 2100:
        raise HTTPException(status_code=400, detail="invalid year")

    member_round_share = float(payload.member_round_share)
    member_revenue_share = float(payload.member_revenue_share)
    revenue_mode = str(payload.revenue_mode or "derived").strip().lower()

    if member_round_share <= 0 or member_round_share >= 1:
        raise HTTPException(status_code=400, detail="member_round_share must be between 0 and 1")
    if member_revenue_share <= 0 or member_revenue_share >= 1:
        raise HTTPException(status_code=400, detail="member_revenue_share must be between 0 and 1")
    if revenue_mode not in {"derived", "manual"}:
        raise HTTPException(status_code=400, detail="revenue_mode must be 'derived' or 'manual'")

    _upsert_setting(db, "target_member_round_share", round(member_round_share, 6))
    _upsert_setting(db, "target_member_revenue_share", round(member_revenue_share, 6))
    _upsert_setting(db, "target_revenue_mode", revenue_mode)
    db.flush()
    return get_target_model_payload(db, year=target_year)
