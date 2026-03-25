from __future__ import annotations

from datetime import date, time as Time
from typing import Any, Callable, Optional

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.fee_models import FeeCategory, FeeType
from app.models import Booking
from app.platform_bootstrap import apply_reference_pricing_template


class PricingMatrixRowInput(BaseModel):
    code: Optional[int] = None
    description: str
    price: float
    fee_type: str
    active: bool = True
    audience: Optional[str] = None
    gender: Optional[str] = None
    day_kind: Optional[str] = None
    weekday: Optional[int] = None
    holes: Optional[int] = None
    min_age: Optional[int] = None
    max_age: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    start_time: Optional[Time] = None
    end_time: Optional[Time] = None
    priority: int = 0


class PricingTemplateApplyRequest(BaseModel):
    template: str = "umhlali"


def _fee_type_value(value: Any) -> str:
    return str(getattr(value, "value", value) or "").strip().lower()


def _serialize_fee_category(cat: FeeCategory) -> dict[str, Any]:
    return {
        "id": int(getattr(cat, "id", 0) or 0),
        "code": int(getattr(cat, "code", 0) or 0),
        "description": str(getattr(cat, "description", "") or "").strip(),
        "price": float(getattr(cat, "price", 0.0) or 0.0),
        "fee_type": _fee_type_value(getattr(cat, "fee_type", None)),
        "active": bool(int(getattr(cat, "active", 0) or 0)),
        "audience": getattr(cat, "audience", None),
        "gender": getattr(cat, "gender", None),
        "day_kind": getattr(cat, "day_kind", None),
        "weekday": getattr(cat, "weekday", None),
        "holes": getattr(cat, "holes", None),
        "min_age": getattr(cat, "min_age", None),
        "max_age": getattr(cat, "max_age", None),
        "start_date": cat.start_date.isoformat() if getattr(cat, "start_date", None) else None,
        "end_date": cat.end_date.isoformat() if getattr(cat, "end_date", None) else None,
        "start_time": getattr(cat, "start_time", None).strftime("%H:%M") if getattr(cat, "start_time", None) else None,
        "end_time": getattr(cat, "end_time", None).strftime("%H:%M") if getattr(cat, "end_time", None) else None,
        "priority": int(getattr(cat, "priority", 0) or 0),
    }


def _normalize_fee_filter_value(value: Any) -> str | None:
    raw = str(value or "").strip().lower()
    return raw or None


def _next_club_fee_code(db: Session, club_id: int) -> int:
    current = int(
        db.query(func.coalesce(func.max(FeeCategory.code), 1000))
        .filter(FeeCategory.club_id == int(club_id))
        .scalar()
        or 1000
    )
    return current + 1


def _resolve_fee_type(raw: str) -> FeeType:
    try:
        return FeeType(str(raw or "").strip().lower())
    except Exception as exc:
        allowed = ", ".join(sorted({member.value for member in FeeType}))
        raise HTTPException(status_code=400, detail=f"Invalid fee_type. Expected one of: {allowed}") from exc


def _upsert_pricing_matrix_row(
    db: Session,
    *,
    club_id: int,
    payload: PricingMatrixRowInput,
    existing: FeeCategory | None = None,
) -> FeeCategory:
    description = str(payload.description or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="description is required")
    if float(payload.price) < 0:
        raise HTTPException(status_code=400, detail="price cannot be negative")

    code = int(payload.code or getattr(existing, "code", 0) or 0)
    if code <= 0:
        code = _next_club_fee_code(db, club_id)

    if payload.holes not in {None, 9, 18}:
        raise HTTPException(status_code=400, detail="holes must be 9, 18, or empty")
    if payload.weekday is not None and int(payload.weekday) not in {0, 1, 2, 3, 4, 5, 6}:
        raise HTTPException(status_code=400, detail="weekday must be between 0 and 6")
    day_kind = _normalize_fee_filter_value(payload.day_kind)
    if day_kind not in {None, "weekday", "weekend"}:
        raise HTTPException(status_code=400, detail="day_kind must be weekday, weekend, or empty")
    if payload.start_date and payload.end_date and payload.start_date > payload.end_date:
        raise HTTPException(status_code=400, detail="start_date must be before or equal to end_date")
    if payload.min_age is not None and int(payload.min_age) < 0:
        raise HTTPException(status_code=400, detail="min_age cannot be negative")
    if payload.max_age is not None and int(payload.max_age) < 0:
        raise HTTPException(status_code=400, detail="max_age cannot be negative")
    if payload.min_age is not None and payload.max_age is not None and int(payload.min_age) > int(payload.max_age):
        raise HTTPException(status_code=400, detail="min_age must be less than or equal to max_age")

    duplicate_q = db.query(FeeCategory).filter(
        FeeCategory.club_id == int(club_id),
        FeeCategory.code == int(code),
    )
    if existing is not None and getattr(existing, "id", None):
        duplicate_q = duplicate_q.filter(FeeCategory.id != int(existing.id))
    if duplicate_q.first():
        raise HTTPException(status_code=409, detail=f"Fee code {code} already exists for this club")

    row = existing or FeeCategory(club_id=int(club_id))
    if existing is None:
        db.add(row)

    row.code = int(code)
    row.description = description
    row.price = float(payload.price)
    row.fee_type = _resolve_fee_type(payload.fee_type)
    row.active = 1 if payload.active else 0
    row.audience = _normalize_fee_filter_value(payload.audience)
    row.gender = _normalize_fee_filter_value(payload.gender)
    row.day_kind = day_kind
    row.weekday = int(payload.weekday) if payload.weekday is not None else None
    row.holes = int(payload.holes) if payload.holes is not None else None
    row.min_age = int(payload.min_age) if payload.min_age is not None else None
    row.max_age = int(payload.max_age) if payload.max_age is not None else None
    row.start_date = payload.start_date
    row.end_date = payload.end_date
    row.start_time = payload.start_time
    row.end_time = payload.end_time
    row.priority = int(payload.priority or 0)
    return row


def get_fee_categories_payload(db: Session, *, club_id: int) -> list[dict[str, Any]]:
    q = db.query(FeeCategory).filter(FeeCategory.active == 1)
    if int(club_id) > 0:
        q = q.filter(or_(FeeCategory.club_id == int(club_id), FeeCategory.club_id.is_(None)))
    categories = q.order_by(FeeCategory.fee_type.asc(), FeeCategory.code.asc()).all()
    return [_serialize_fee_category(cat) for cat in categories]


def get_pricing_matrix_payload(db: Session, *, club_id: int) -> dict[str, Any]:
    rows = (
        db.query(FeeCategory)
        .filter(FeeCategory.club_id == int(club_id))
        .order_by(FeeCategory.fee_type.asc(), FeeCategory.code.asc(), FeeCategory.id.asc())
        .all()
    )
    return {
        "rows": [_serialize_fee_category(row) for row in rows],
        "club_id": int(club_id),
        "reference_templates": ["umhlali"],
    }


def create_pricing_matrix_row_payload(
    db: Session,
    *,
    club_id: int,
    payload: PricingMatrixRowInput,
    invalidate_club_config_cache: Callable[[int], None],
    invalidate_admin_caches: Callable[[int | None], None],
) -> dict[str, Any]:
    row = _upsert_pricing_matrix_row(db, club_id=int(club_id), payload=payload, existing=None)
    db.commit()
    db.refresh(row)
    invalidate_club_config_cache(int(club_id))
    invalidate_admin_caches(int(club_id))
    return {"status": "success", "row": _serialize_fee_category(row)}


def update_pricing_matrix_row_payload(
    db: Session,
    *,
    club_id: int,
    fee_id: int,
    payload: PricingMatrixRowInput,
    invalidate_club_config_cache: Callable[[int], None],
    invalidate_admin_caches: Callable[[int | None], None],
) -> dict[str, Any]:
    row = db.query(FeeCategory).filter(FeeCategory.id == int(fee_id), FeeCategory.club_id == int(club_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Pricing row not found")
    _upsert_pricing_matrix_row(db, club_id=int(club_id), payload=payload, existing=row)
    db.commit()
    db.refresh(row)
    invalidate_club_config_cache(int(club_id))
    invalidate_admin_caches(int(club_id))
    return {"status": "success", "row": _serialize_fee_category(row)}


def delete_pricing_matrix_row_payload(
    db: Session,
    *,
    club_id: int,
    fee_id: int,
    invalidate_club_config_cache: Callable[[int], None],
    invalidate_admin_caches: Callable[[int | None], None],
) -> dict[str, Any]:
    row = db.query(FeeCategory).filter(FeeCategory.id == int(fee_id), FeeCategory.club_id == int(club_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Pricing row not found")

    booking_exists = db.query(Booking.id).filter(Booking.fee_category_id == int(fee_id)).first() is not None
    action = "deleted"
    if booking_exists:
        row.active = 0
        action = "deactivated"
    else:
        db.delete(row)
    db.commit()
    invalidate_club_config_cache(int(club_id))
    invalidate_admin_caches(int(club_id))
    return {"status": "success", "action": action, "fee_id": int(fee_id)}


def apply_pricing_matrix_reference_payload(
    db: Session,
    *,
    club_id: int,
    payload: PricingTemplateApplyRequest,
    invalidate_club_config_cache: Callable[[int], None],
    invalidate_admin_caches: Callable[[int | None], None],
) -> dict[str, Any]:
    result = apply_reference_pricing_template(
        db,
        club_id=int(club_id),
        template_key=str(payload.template or "umhlali").strip().lower(),
        overwrite_existing=True,
    )
    db.commit()
    invalidate_club_config_cache(int(club_id))
    invalidate_admin_caches(int(club_id))
    return {"status": "success", **result}
