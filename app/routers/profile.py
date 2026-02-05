# app/routers/profile.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from sqlalchemy import or_
from app.auth import get_db, get_current_user
from app import models

router = APIRouter(prefix="/profile", tags=["profile"])

class PlayerProfileUpdate(BaseModel):
    name: str
    birth_date: Optional[str] = None  # YYYY-MM-DD format
    handicap_sa_id: Optional[str] = None
    home_course: Optional[str] = None

class PlayerProfileResponse(BaseModel):
    id: int
    name: str
    email: str
    birth_date: Optional[str] = None
    handicap_sa_id: Optional[str] = None
    home_course: Optional[str] = None
    age: Optional[int] = None
    handicap_number: Optional[str] = None
    greenlink_id: Optional[str] = None
    
    model_config = {"from_attributes": True}

@router.get("/me", response_model=PlayerProfileResponse)
def get_my_profile(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Get current player's profile"""
    user = db.query(models.User).filter(models.User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Calculate age if birth_date exists
    age = None
    if user.birth_date:
        today = datetime.now()
        age = today.year - user.birth_date.year - ((today.month, today.day) < (user.birth_date.month, user.birth_date.day))
    
    profile = PlayerProfileResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        birth_date=user.birth_date.strftime("%Y-%m-%d") if user.birth_date else None,
        handicap_sa_id=user.handicap_sa_id,
        home_course=user.home_course,
        age=age,
        handicap_number=user.handicap_number,
        greenlink_id=user.greenlink_id
    )
    return profile

@router.put("/me", response_model=PlayerProfileResponse)
def update_my_profile(profile_update: PlayerProfileUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Update current player's profile"""
    user = db.query(models.User).filter(models.User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    user.name = profile_update.name
    if profile_update.birth_date:
        try:
            user.birth_date = datetime.strptime(profile_update.birth_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    user.handicap_sa_id = profile_update.handicap_sa_id
    user.home_course = profile_update.home_course
    
    db.commit()
    db.refresh(user)
    
    # Calculate age
    age = None
    if user.birth_date:
        today = datetime.now()
        age = today.year - user.birth_date.year - ((today.month, today.day) < (user.birth_date.month, user.birth_date.day))
    
    response = PlayerProfileResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        birth_date=user.birth_date.strftime("%Y-%m-%d") if user.birth_date else None,
        handicap_sa_id=user.handicap_sa_id,
        home_course=user.home_course,
        age=age,
        handicap_number=user.handicap_number,
        greenlink_id=user.greenlink_id
    )
    return response

@router.get("/fees-available")
def get_available_fees(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Get fees available for current player based on age (prices hidden from players)"""
    user = db.query(models.User).filter(models.User.email == current_user.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Calculate age
    if not user.birth_date:
        raise HTTPException(status_code=400, detail="Please set your birth date in your profile")
    
    today = datetime.now()
    age = today.year - user.birth_date.year - ((today.month, today.day) < (user.birth_date.month, user.birth_date.day))
    
    # Get fees matching player's age
    from app.fee_models import FeeCategory
    fees = (
        db.query(FeeCategory)
        .filter(
            FeeCategory.active == 1,
            or_(FeeCategory.min_age == None, FeeCategory.min_age <= age),
            or_(FeeCategory.max_age == None, FeeCategory.max_age >= age),
        )
        .all()
    )
    
    # Hide prices from players - they only see fee descriptions
    return [{"id": f.id, "code": f.code, "description": f.description} for f in fees]
