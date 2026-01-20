# app/routers/users.py
from fastapi import APIRouter, Depends
from typing import List
from sqlalchemy.orm import Session
from app.auth import get_current_user, get_db
from app import crud, schemas, models

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    return crud.create_user(db, user)

@router.get("/", response_model=List[schemas.UserResponse])
def list_users(db: Session = Depends(get_db), current=Depends(get_current_user)):
    # keep it auth-protected
    return db.query(models.User).all()

@router.get("/me", response_model=schemas.UserResponse)
def get_current_user_info(current_user: models.User = Depends(get_current_user)):
    """Get current logged in user info"""
    return current_user
