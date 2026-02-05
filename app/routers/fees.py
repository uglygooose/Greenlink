# app/routers/fees.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.auth import get_db
from app import models
from app.fee_models import FeeCategory, FeeType
from pydantic import BaseModel
from datetime import date

from app.pricing import PricingContext, compute_age, normalize_gender, normalize_player_type, select_best_fee_category

router = APIRouter(prefix="/fees", tags=["fees"])

class FeeResponse(BaseModel):
    id: int
    code: int
    description: str
    price: float
    fee_type: str
    
    model_config = {"from_attributes": True}

@router.get("/", response_model=List[FeeResponse])
def get_all_fees(db: Session = Depends(get_db)):
    """Get all active fee categories"""
    return db.query(FeeCategory).filter(FeeCategory.active == 1).all()

@router.get("/golf", response_model=List[FeeResponse])
def get_golf_fees(db: Session = Depends(get_db)):
    """Get all golf fee categories"""
    return db.query(FeeCategory).filter(
        FeeCategory.fee_type == FeeType.GOLF,
        FeeCategory.active == 1
    ).all()

@router.get("/cart", response_model=List[FeeResponse])
def get_cart_fees(db: Session = Depends(get_db)):
    """Get all cart hire fees"""
    return db.query(FeeCategory).filter(
        FeeCategory.fee_type == FeeType.CART,
        FeeCategory.active == 1
    ).all()

@router.get("/code/{code}", response_model=FeeResponse)
def get_fee_by_code(code: int, db: Session = Depends(get_db)):
    """Get fee category by code"""
    return db.query(FeeCategory).filter(FeeCategory.code == code).first()

@router.get("/{fee_id}", response_model=FeeResponse)
def get_fee_by_id(fee_id: int, db: Session = Depends(get_db)):
    """Get fee category by ID"""
    return db.query(FeeCategory).filter(FeeCategory.id == fee_id).first()


class GolfFeeSuggestRequest(BaseModel):
    tee_time_id: int
    player_type: str
    gender: str | None = None
    birth_date: date | None = None
    age: int | None = None
    holes: int | None = None


@router.post("/suggest/golf", response_model=FeeResponse)
def suggest_golf_fee(req: GolfFeeSuggestRequest, db: Session = Depends(get_db)):
    """
    Suggest a single best-matching golf fee based on booking details.
    Useful for UIs that want "auto pricing" but still want to display the price before booking.
    """
    tee_time = db.query(models.TeeTime).filter(models.TeeTime.id == req.tee_time_id).first()
    if not tee_time:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Tee time not found")

    holes = int(req.holes or 18)
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
    )

    fee = select_best_fee_category(db, ctx)
    if not fee:
        from fastapi import HTTPException

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
    holes: int | None = None


@router.post("/suggest/cart", response_model=FeeResponse)
def suggest_cart_fee(req: CartFeeSuggestRequest, db: Session = Depends(get_db)):
    """
    Suggest a cart hire fee based on booking details (member/visitor + weekday/weekend + holes).
    """
    tee_time = db.query(models.TeeTime).filter(models.TeeTime.id == req.tee_time_id).first()
    if not tee_time:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Tee time not found")

    holes = int(req.holes or 18)
    player_type = normalize_player_type(req.player_type)

    ctx = PricingContext(
        fee_type=FeeType.CART,
        tee_time=tee_time.tee_time,
        player_type=player_type,
        holes=holes,
    )

    fee = select_best_fee_category(db, ctx)
    if not fee:
        from fastapi import HTTPException

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
