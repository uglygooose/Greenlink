# app/routers/fees.py
from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app.auth import get_db
from app.fee_models import FeeCategory, FeeType
from app.pricing import (
    PricingContext,
    compute_age,
    normalize_gender,
    normalize_player_type,
    pricing_tags_from_values,
    select_best_fee_category,
)
from app.tenancy import get_active_club_id

router = APIRouter(prefix="/fees", tags=["fees"])

class FeeResponse(BaseModel):
    id: int
    code: int
    description: str
    price: float
    fee_type: str
    
    model_config = {"from_attributes": True}


def _normalize_holes(value: int | None) -> int:
    try:
        holes = int(value or 18)
    except Exception:
        holes = 18
    return 9 if holes == 9 else 18


def _get_tee_time_for_club(db: Session, tee_time_id: int, club_id: int):
    tee_time = (
        db.query(models.TeeTime)
        .filter(models.TeeTime.id == int(tee_time_id), models.TeeTime.club_id == int(club_id))
        .first()
    )
    if not tee_time:
        raise HTTPException(status_code=404, detail="Tee time not found")
    return tee_time


def _fees_for_club(db: Session, club_id: int, fee_type: FeeType | None = None) -> list[FeeCategory]:
    """
    Return active fee categories for a club, including global defaults (club_id IS NULL),
    while preferring club-specific overrides when both exist for the same `code`.
    """
    q = db.query(FeeCategory).filter(FeeCategory.active == 1)
    if fee_type is not None:
        q = q.filter(FeeCategory.fee_type == fee_type)

    q = q.filter(or_(FeeCategory.club_id == int(club_id), FeeCategory.club_id.is_(None)))
    rows = q.order_by(FeeCategory.code.asc(), FeeCategory.id.asc()).all()

    # Prefer overrides for this club over global rows.
    by_code: dict[int, FeeCategory] = {}
    for row in rows:
        try:
            code = int(getattr(row, "code", None))
        except Exception:
            continue

        row_club = getattr(row, "club_id", None)
        if row_club is None:
            by_code.setdefault(code, row)
        elif int(row_club) == int(club_id):
            by_code[code] = row

    return [by_code[k] for k in sorted(by_code.keys())]


@router.get("/", response_model=List[FeeResponse])
def get_all_fees(db: Session = Depends(get_db), club_id: int = Depends(get_active_club_id)):
    """Get all active fee categories"""
    return _fees_for_club(db, club_id)

@router.get("/golf", response_model=List[FeeResponse])
def get_golf_fees(db: Session = Depends(get_db), club_id: int = Depends(get_active_club_id)):
    """Get all golf fee categories"""
    return _fees_for_club(db, club_id, fee_type=FeeType.GOLF)

@router.get("/cart", response_model=List[FeeResponse])
def get_cart_fees(db: Session = Depends(get_db), club_id: int = Depends(get_active_club_id)):
    """Get all cart hire fees"""
    return _fees_for_club(db, club_id, fee_type=FeeType.CART)

@router.get("/push-cart", response_model=List[FeeResponse])
def get_push_cart_fees(db: Session = Depends(get_db), club_id: int = Depends(get_active_club_id)):
    """Get all push cart fees"""
    return _fees_for_club(db, club_id, fee_type=FeeType.PUSH_CART)

@router.get("/caddy", response_model=List[FeeResponse])
def get_caddy_fees(db: Session = Depends(get_db), club_id: int = Depends(get_active_club_id)):
    """Get all caddy fees"""
    return _fees_for_club(db, club_id, fee_type=FeeType.CADDY)

@router.get("/code/{code}", response_model=FeeResponse)
def get_fee_by_code(code: int, db: Session = Depends(get_db), club_id: int = Depends(get_active_club_id)):
    """Get fee category by code"""
    rows = (
        db.query(FeeCategory)
        .filter(
            FeeCategory.active == 1,
            FeeCategory.code == int(code),
            or_(FeeCategory.club_id == int(club_id), FeeCategory.club_id.is_(None)),
        )
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Fee category not found")

    for row in rows:
        row_club = getattr(row, "club_id", None)
        if row_club is not None and int(row_club) == int(club_id):
            return row

    return rows[0]

@router.get("/{fee_id}", response_model=FeeResponse)
def get_fee_by_id(fee_id: int, db: Session = Depends(get_db), club_id: int = Depends(get_active_club_id)):
    """Get fee category by ID"""
    row = db.query(FeeCategory).filter(FeeCategory.id == int(fee_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Fee category not found")

    row_club = getattr(row, "club_id", None)
    if row_club is not None and int(row_club) != int(club_id):
        raise HTTPException(status_code=404, detail="Fee category not found")
    return row


class GolfFeeSuggestRequest(BaseModel):
    tee_time_id: int
    player_type: str
    gender: str | None = None
    player_category: str | None = None
    birth_date: date | None = None
    age: int | None = None
    holes: int | None = None


@router.post("/suggest/golf", response_model=FeeResponse)
def suggest_golf_fee(req: GolfFeeSuggestRequest, db: Session = Depends(get_db), club_id: int = Depends(get_active_club_id)):
    """
    Suggest a single best-matching golf fee based on booking details.
    Useful for UIs that want "auto pricing" but still want to display the price before booking.
    """
    tee_time = _get_tee_time_for_club(db, req.tee_time_id, club_id)
    holes = _normalize_holes(req.holes)
    player_type = normalize_player_type(req.player_type)
    gender = normalize_gender(req.gender)

    age = req.age
    if age is None and req.birth_date:
        age = compute_age(tee_time.tee_time.date(), req.birth_date)

    ctx = PricingContext(
        fee_type=FeeType.GOLF,
        tee_time=tee_time.tee_time,
        player_type=player_type,
        gender=gender,
        holes=holes,
        age=age,
        pricing_tags=pricing_tags_from_values(req.player_category),
    )

    fee = select_best_fee_category(db, ctx)
    if not fee:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "No matching golf fee found for the given details.",
                "context": {
                    "player_type": player_type,
                    "gender": gender,
                    "holes": holes,
                    "age": age,
                    "tee_time": tee_time.tee_time.isoformat(),
                },
            },
        )

    return fee


class CartFeeSuggestRequest(BaseModel):
    tee_time_id: int
    player_type: str
    player_category: str | None = None
    birth_date: date | None = None
    age: int | None = None
    holes: int | None = None


@router.post("/suggest/cart", response_model=FeeResponse)
def suggest_cart_fee(req: CartFeeSuggestRequest, db: Session = Depends(get_db), club_id: int = Depends(get_active_club_id)):
    """
    Suggest a cart hire fee based on booking details (member/visitor + weekday/weekend + holes).
    """
    tee_time = _get_tee_time_for_club(db, req.tee_time_id, club_id)
    holes = _normalize_holes(req.holes)
    player_type = normalize_player_type(req.player_type)
    age = req.age
    if age is None and req.birth_date:
        age = compute_age(tee_time.tee_time.date(), req.birth_date)

    ctx = PricingContext(
        fee_type=FeeType.CART,
        tee_time=tee_time.tee_time,
        player_type=player_type,
        holes=holes,
        age=age,
        pricing_tags=pricing_tags_from_values(req.player_category),
    )

    fee = select_best_fee_category(db, ctx)
    if not fee:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "No matching cart fee found for the given details.",
                "context": {
                    "player_type": player_type,
                    "holes": holes,
                    "tee_time": tee_time.tee_time.isoformat(),
                },
            },
        )

    return fee


class AddOnFeeSuggestRequest(BaseModel):
    tee_time_id: int
    player_type: str
    player_category: str | None = None
    birth_date: date | None = None
    age: int | None = None
    holes: int | None = None


@router.post("/suggest/push-cart", response_model=FeeResponse)
def suggest_push_cart_fee(req: AddOnFeeSuggestRequest, db: Session = Depends(get_db), club_id: int = Depends(get_active_club_id)):
    """
    Suggest a push cart fee based on booking details.
    """
    tee_time = _get_tee_time_for_club(db, req.tee_time_id, club_id)
    holes = _normalize_holes(req.holes)
    player_type = normalize_player_type(req.player_type)
    age = req.age
    if age is None and req.birth_date:
        age = compute_age(tee_time.tee_time.date(), req.birth_date)

    ctx = PricingContext(
        fee_type=FeeType.PUSH_CART,
        tee_time=tee_time.tee_time,
        player_type=player_type,
        holes=holes,
        age=age,
        pricing_tags=pricing_tags_from_values(req.player_category),
    )

    fee = select_best_fee_category(db, ctx)
    if not fee:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "No matching push cart fee found for the given details.",
                "context": {
                    "player_type": player_type,
                    "holes": holes,
                    "tee_time": tee_time.tee_time.isoformat(),
                },
            },
        )

    return fee


@router.post("/suggest/caddy", response_model=FeeResponse)
def suggest_caddy_fee(req: AddOnFeeSuggestRequest, db: Session = Depends(get_db), club_id: int = Depends(get_active_club_id)):
    """
    Suggest a caddy fee based on booking details.
    """
    tee_time = _get_tee_time_for_club(db, req.tee_time_id, club_id)
    holes = _normalize_holes(req.holes)
    player_type = normalize_player_type(req.player_type)
    age = req.age
    if age is None and req.birth_date:
        age = compute_age(tee_time.tee_time.date(), req.birth_date)

    ctx = PricingContext(
        fee_type=FeeType.CADDY,
        tee_time=tee_time.tee_time,
        player_type=player_type,
        holes=holes,
        age=age,
        pricing_tags=pricing_tags_from_values(req.player_category),
    )

    fee = select_best_fee_category(db, ctx)
    if not fee:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "No matching caddy fee found for the given details.",
                "context": {
                    "player_type": player_type,
                    "holes": holes,
                    "tee_time": tee_time.tee_time.isoformat(),
                },
            },
        )

    return fee
