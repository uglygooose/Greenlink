# app/routers/fees.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.auth import get_db
from app.fee_models import FeeCategory, FeeType
from pydantic import BaseModel

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
