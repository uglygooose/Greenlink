# app/routers/profile.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from sqlalchemy import func, or_
from app.auth import get_db, get_current_user
from app import models

router = APIRouter(prefix="/profile", tags=["profile"])

class PlayerProfileUpdate(BaseModel):
    name: str
    phone: Optional[str] = None
    birth_date: Optional[str] = None  # YYYY-MM-DD format
    member_number: Optional[str] = None
    handicap_number: Optional[str] = None
    handicap_sa_id: Optional[str] = None
    home_course: Optional[str] = None
    account_type: Optional[str] = None  # member | visitor
    gender: Optional[str] = None
    player_category: Optional[str] = None
    handicap_index: Optional[float] = None

class PlayerProfileResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str] = None
    birth_date: Optional[str] = None
    member_number: Optional[str] = None
    handicap_number: Optional[str] = None
    handicap_sa_id: Optional[str] = None
    home_course: Optional[str] = None
    account_type: Optional[str] = None
    gender: Optional[str] = None
    player_category: Optional[str] = None
    handicap_index: Optional[float] = None
    age: Optional[int] = None
    linked_member_id: Optional[int] = None
    linked_member: bool = False
    greenlink_id: Optional[str] = None
    
    model_config = {"from_attributes": True}

def _name_parts(full_name: str | None) -> tuple[str, str]:
    raw = str(full_name or "").strip()
    if not raw:
        return "Member", "Unknown"
    if " " not in raw:
        return raw, "Unknown"
    first, last = raw.split(" ", 1)
    return first.strip() or "Member", last.strip() or "Unknown"


def _normalize_account_type(value: str | None) -> str | None:
    raw = (value or "").strip().lower()
    if not raw:
        return None
    if raw in {"member", "visitor", "non_affiliated"}:
        return raw
    return None


def _resolve_linked_member(
    db: Session,
    user: models.User,
    member_number_hint: str | None = None,
) -> models.Member | None:
    try:
        club_id = int(getattr(user, "club_id", None) or 0)
    except Exception:
        club_id = 0
    if club_id <= 0:
        return None

    hint = (member_number_hint or "").strip()
    if hint:
        row = (
            db.query(models.Member)
            .filter(models.Member.club_id == club_id, models.Member.member_number == hint, models.Member.active == 1)
            .first()
        )
        if row:
            return row

    email = str(getattr(user, "email", "") or "").strip().lower()
    if email:
        row = (
            db.query(models.Member)
            .filter(models.Member.club_id == club_id, func.lower(models.Member.email) == email, models.Member.active == 1)
            .first()
        )
        if row:
            return row

    handicap_sa_id = str(getattr(user, "handicap_sa_id", "") or "").strip().lower()
    if handicap_sa_id:
        row = (
            db.query(models.Member)
            .filter(models.Member.club_id == club_id, func.lower(models.Member.handicap_sa_id) == handicap_sa_id, models.Member.active == 1)
            .first()
        )
        if row:
            return row

    return None


def _upsert_linked_member(
    db: Session,
    user: models.User,
    update: PlayerProfileUpdate,
) -> models.Member | None:
    try:
        club_id = int(getattr(user, "club_id", None) or 0)
    except Exception:
        club_id = 0
    if club_id <= 0:
        return None

    member_number = (getattr(update, "member_number", None) or "").strip() or None
    member = _resolve_linked_member(db, user, member_number_hint=member_number)
    if not member:
        first_name, last_name = _name_parts(getattr(user, "name", None))
        member = models.Member(
            club_id=club_id,
            first_name=first_name,
            last_name=last_name,
            email=(str(getattr(user, "email", "") or "").strip().lower() or None),
            active=1,
        )
        db.add(member)

    first_name, last_name = _name_parts(getattr(user, "name", None))
    member.first_name = first_name
    member.last_name = last_name

    user_email = str(getattr(user, "email", "") or "").strip().lower()
    if user_email:
        email_conflict = (
            db.query(models.Member.id)
            .filter(
                models.Member.club_id == club_id,
                func.lower(models.Member.email) == user_email,
                models.Member.id != getattr(member, "id", None),
            )
            .first()
        )
        if not email_conflict:
            member.email = user_email

    if member_number:
        member_number_conflict = (
            db.query(models.Member.id)
            .filter(
                models.Member.club_id == club_id,
                models.Member.member_number == member_number,
                models.Member.id != getattr(member, "id", None),
            )
            .first()
        )
        if not member_number_conflict:
            member.member_number = member_number

    member.phone = (getattr(user, "phone", None) or member.phone or "").strip() or None
    member.handicap_number = (getattr(user, "handicap_number", None) or member.handicap_number or "").strip() or None
    member.handicap_sa_id = (getattr(user, "handicap_sa_id", None) or member.handicap_sa_id or "").strip() or None
    member.home_club = (getattr(user, "home_course", None) or member.home_club or "").strip() or None
    if getattr(user, "handicap_index", None) is not None:
        member.handicap_index = float(user.handicap_index)
    member.gender = (getattr(user, "gender", None) or member.gender or "").strip() or None
    member.player_category = (getattr(user, "player_category", None) or member.player_category or "").strip() or None
    member.student = bool(getattr(user, "player_category", None) == "student") if getattr(user, "player_category", None) else member.student
    member.active = 1
    return member


def _build_profile_response(user: models.User, member: models.Member | None) -> PlayerProfileResponse:
    age = None
    if getattr(user, "birth_date", None):
        today = datetime.now()
        age = today.year - user.birth_date.year - ((today.month, today.day) < (user.birth_date.month, user.birth_date.day))

    return PlayerProfileResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        phone=getattr(user, "phone", None),
        birth_date=user.birth_date.strftime("%Y-%m-%d") if user.birth_date else None,
        member_number=getattr(member, "member_number", None),
        handicap_number=(getattr(user, "handicap_number", None) or getattr(member, "handicap_number", None)),
        handicap_sa_id=user.handicap_sa_id,
        home_course=user.home_course,
        account_type=getattr(user, "account_type", None),
        gender=getattr(user, "gender", None),
        player_category=getattr(user, "player_category", None),
        handicap_index=getattr(user, "handicap_index", None),
        age=age,
        linked_member_id=getattr(member, "id", None),
        linked_member=bool(getattr(member, "id", None)),
        greenlink_id=user.greenlink_id,
    )


@router.get("/me", response_model=PlayerProfileResponse)
def get_my_profile(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Get current player's profile"""
    user = db.query(models.User).filter(func.lower(models.User.email) == str(current_user.email).strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    member = _resolve_linked_member(db, user)
    return _build_profile_response(user, member)

@router.put("/me", response_model=PlayerProfileResponse)
def update_my_profile(profile_update: PlayerProfileUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Update current player's profile"""
    user = db.query(models.User).filter(func.lower(models.User.email) == str(current_user.email).strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    user.name = profile_update.name
    if profile_update.phone is not None:
        user.phone = (profile_update.phone or "").strip() or None
    if profile_update.birth_date is not None:
        if not str(profile_update.birth_date).strip():
            user.birth_date = None
        else:
            try:
                user.birth_date = datetime.strptime(profile_update.birth_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    if profile_update.handicap_number is not None:
        user.handicap_number = (profile_update.handicap_number or "").strip() or None
    if profile_update.handicap_sa_id is not None:
        user.handicap_sa_id = (profile_update.handicap_sa_id or "").strip() or None
    if profile_update.home_course is not None:
        user.home_course = (profile_update.home_course or "").strip() or None
    if profile_update.account_type is not None:
        user.account_type = _normalize_account_type(profile_update.account_type)
    if profile_update.gender is not None:
        user.gender = (profile_update.gender or "").strip() or None
    if profile_update.player_category is not None:
        user.player_category = (profile_update.player_category or "").strip() or None
    if profile_update.handicap_index is not None:
        try:
            user.handicap_index = float(profile_update.handicap_index)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid handicap index")

    member = _upsert_linked_member(db, user, profile_update)
    db.commit()
    db.refresh(user)
    if member is not None and getattr(member, "id", None):
        db.refresh(member)
    else:
        member = _resolve_linked_member(db, user, member_number_hint=(profile_update.member_number or None))
    return _build_profile_response(user, member)

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
    club_id = getattr(user, "club_id", None)
    q = db.query(FeeCategory).filter(
        FeeCategory.active == 1,
        or_(FeeCategory.min_age == None, FeeCategory.min_age <= age),
        or_(FeeCategory.max_age == None, FeeCategory.max_age >= age),
    )
    if club_id is not None:
        try:
            cid = int(club_id)
        except Exception:
            cid = 0
        if cid > 0:
            from sqlalchemy import or_ as sa_or

            q = q.filter(sa_or(FeeCategory.club_id == cid, FeeCategory.club_id == None))

    fees = q.all()

    # Prefer club-specific overrides over global rows for the same code.
    by_code = {}
    for f in fees:
        try:
            code = int(getattr(f, "code", None))
        except Exception:
            continue
        if getattr(f, "club_id", None) is None:
            by_code.setdefault(code, f)
        else:
            try:
                if int(getattr(f, "club_id")) == int(club_id):
                    by_code[code] = f
            except Exception:
                continue

    fees = [by_code[k] for k in sorted(by_code.keys())]
    
    # Hide prices from players - they only see fee descriptions
    return [{"id": f.id, "code": f.code, "description": f.description} for f in fees]
