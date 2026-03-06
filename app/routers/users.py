# app/routers/users.py
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import List
from sqlalchemy.orm import Session
from app.auth import get_current_user, get_db
from app import crud, schemas, models
from app.password_policy import assert_password_policy
from app.rate_limit import SIGNUP_RATE_LIMITER, client_ip_from_request

router = APIRouter(prefix="/users", tags=["users"])


def _resolve_signup_club_id(db: Session, club_id: int | None, club_slug: str | None) -> int | None:
    resolved_id: int | None = None

    if club_id is not None:
        try:
            cid = int(club_id)
        except Exception:
            cid = 0
        if cid > 0:
            row = db.query(models.Club).filter(models.Club.id == cid, models.Club.active == 1).first()
            if not row:
                raise HTTPException(status_code=404, detail="Club not found")
            resolved_id = int(row.id)

    if resolved_id is None and club_slug:
        slug = str(club_slug or "").strip().lower()
        if slug:
            row = db.query(models.Club).filter(models.Club.slug == slug, models.Club.active == 1).first()
            if not row:
                raise HTTPException(status_code=404, detail="Club not found")
            resolved_id = int(row.id)

    if resolved_id is None:
        clubs = db.query(models.Club).filter(models.Club.active == 1).order_by(models.Club.id.asc()).all()
        if len(clubs) == 1:
            resolved_id = int(clubs[0].id)
        elif len(clubs) == 0:
            # Fresh DB (no clubs yet): allow creating an account without a club assignment.
            resolved_id = None
        else:
            raise HTTPException(status_code=400, detail="club_id or club_slug is required")

    return resolved_id


@router.post("/", response_model=schemas.UserResponse)
def create_user(
    user: schemas.UserCreate,
    request: Request,
    club_id: int | None = Query(None),
    club_slug: str | None = Query(None),
    db: Session = Depends(get_db),
):
    ip = client_ip_from_request(request)
    allowed, retry_after, _remaining = SIGNUP_RATE_LIMITER.check(f"signup:{ip}")
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many account creation attempts. Please try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )

    assert_password_policy(getattr(user, "password", None), field_name="password")
    resolved_club_id = _resolve_signup_club_id(db, club_id=club_id, club_slug=club_slug)
    return crud.create_user(db, user, club_id=resolved_club_id)

@router.get("/", response_model=List[schemas.UserResponse])
def list_users(db: Session = Depends(get_db), current=Depends(get_current_user)):
    if getattr(current, "role", None) != models.UserRole.super_admin:
        raise HTTPException(status_code=403, detail="Super admin access required")
    return db.query(models.User).order_by(models.User.id.asc()).all()

@router.get("/me", response_model=schemas.UserResponse)
def get_current_user_info(current_user: models.User = Depends(get_current_user)):
    """Get current logged in user info"""
    return current_user
