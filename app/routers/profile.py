# app/routers/profile.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import math
from sqlalchemy import func, or_
from app.auth import get_db, get_current_user
from app import models
from app.fee_models import FeeCategory, FeeType
from app.people import sync_member_person, sync_user_person
from app.tenancy import get_active_club_id
from app.weather_alerts import append_booking_note, serialize_notification_payload

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


class PlayerNotificationAction(BaseModel):
    action: str


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


def _normalize_name(value: str | None) -> str:
    name = str(value or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    return name[:120]


def _normalize_gender(value: str | None) -> str | None:
    raw = str(value or "").strip().lower()
    if not raw:
        return None
    if raw in {"male", "female", "unknown"}:
        return raw
    return None


def _normalize_player_category(value: str | None) -> str | None:
    raw = str(value or "").strip().lower()
    if not raw:
        return None
    if raw in {"adult", "student", "pensioner", "junior"}:
        return raw
    return None


def _normalize_handicap_index(value: float | None) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid handicap index")
    if not math.isfinite(parsed):
        raise HTTPException(status_code=400, detail="Invalid handicap index")
    if parsed < 0 or parsed > 60:
        raise HTTPException(status_code=400, detail="Handicap index must be between 0 and 60")
    return parsed


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
    if getattr(member, "membership_status", None) in (None, ""):
        member.membership_status = "active"
    if getattr(member, "membership_category", None) in (None, ""):
        member.membership_category = "User Account"
    sync_member_person(db, member, source_system="player_profile")
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


def _require_player_user(current_user: models.User = Depends(get_current_user)) -> models.User:
    if getattr(current_user, "role", None) != models.UserRole.player:
        raise HTTPException(status_code=403, detail="Player access required")
    return current_user


@router.get("/me", response_model=PlayerProfileResponse)
def get_my_profile(db: Session = Depends(get_db), current_user: models.User = Depends(_require_player_user)):
    """Get current player's profile"""
    user = db.query(models.User).filter(func.lower(models.User.email) == str(current_user.email).strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    member = _resolve_linked_member(db, user)
    return _build_profile_response(user, member)

@router.put("/me", response_model=PlayerProfileResponse)
def update_my_profile(
    profile_update: PlayerProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(_require_player_user),
):
    """Update current player's profile"""
    user = db.query(models.User).filter(func.lower(models.User.email) == str(current_user.email).strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    user.name = _normalize_name(profile_update.name)
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
        normalized_account_type = _normalize_account_type(profile_update.account_type)
        if normalized_account_type is None and str(profile_update.account_type).strip():
            raise HTTPException(status_code=400, detail="account_type must be member, visitor, or non_affiliated")
        user.account_type = normalized_account_type
    if profile_update.gender is not None:
        normalized_gender = _normalize_gender(profile_update.gender)
        if normalized_gender is None and str(profile_update.gender).strip():
            raise HTTPException(status_code=400, detail="gender must be male, female, or unknown")
        user.gender = normalized_gender
    if profile_update.player_category is not None:
        normalized_category = _normalize_player_category(profile_update.player_category)
        if normalized_category is None and str(profile_update.player_category).strip():
            raise HTTPException(status_code=400, detail="player_category must be adult, student, pensioner, or junior")
        user.player_category = normalized_category
    if profile_update.handicap_index is not None:
        user.handicap_index = _normalize_handicap_index(profile_update.handicap_index)

    sync_user_person(db, user, source_system="player_profile")
    member = _upsert_linked_member(db, user, profile_update)
    db.commit()
    db.refresh(user)
    if member is not None and getattr(member, "id", None):
        db.refresh(member)
    else:
        member = _resolve_linked_member(db, user, member_number_hint=(profile_update.member_number or None))
    return _build_profile_response(user, member)


@router.get("/notifications")
def list_my_notifications(
    limit: int = Query(30, ge=1, le=100),
    state: str = Query("open", description="open|unread|responded|all"),
    kind: str = Query("weather_reconfirm"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(_require_player_user),
    club_id: int = Depends(get_active_club_id),
):
    state_norm = str(state or "open").strip().lower()
    kind_norm = str(kind or "").strip().lower()

    try:
        q = db.query(models.PlayerNotification).filter(
            models.PlayerNotification.club_id == int(club_id),
            models.PlayerNotification.user_id == int(current_user.id),
        )
        if kind_norm and kind_norm != "all":
            q = q.filter(models.PlayerNotification.kind == kind_norm)

        if state_norm == "unread":
            q = q.filter(models.PlayerNotification.status == "unread")
        elif state_norm == "responded":
            q = q.filter(models.PlayerNotification.status == "responded")
        elif state_norm == "open":
            q = q.filter(
                or_(
                    models.PlayerNotification.status.in_(["unread", "read"]),
                    models.PlayerNotification.status.is_(None),
                ),
                models.PlayerNotification.response.is_(None),
            )

        rows = q.order_by(models.PlayerNotification.created_at.desc()).limit(int(limit)).all()

        unread_q = db.query(func.count(models.PlayerNotification.id)).filter(
            models.PlayerNotification.club_id == int(club_id),
            models.PlayerNotification.user_id == int(current_user.id),
            models.PlayerNotification.status == "unread",
        )
        if kind_norm and kind_norm != "all":
            unread_q = unread_q.filter(models.PlayerNotification.kind == kind_norm)
        unread_count = unread_q.scalar() or 0
    except Exception:
        db.rollback()
        return {
            "count": 0,
            "unread": 0,
            "items": [],
        }

    items = []
    for row in rows:
        payload = serialize_notification_payload(getattr(row, "payload_json", None))
        items.append(
            {
                "id": int(getattr(row, "id", 0) or 0),
                "kind": str(getattr(row, "kind", "") or ""),
                "title": str(getattr(row, "title", "") or ""),
                "body": str(getattr(row, "body", "") or ""),
                "status": str(getattr(row, "status", "") or ""),
                "response": str(getattr(row, "response", "") or ""),
                "requires_action": bool(getattr(row, "requires_action", False)),
                "booking_id": int(getattr(row, "booking_id", 0) or 0) if getattr(row, "booking_id", None) else None,
                "tee_time_id": int(getattr(row, "tee_time_id", 0) or 0) if getattr(row, "tee_time_id", None) else None,
                "topic_key": str(getattr(row, "topic_key", "") or ""),
                "created_at": getattr(row, "created_at", None).isoformat() if getattr(row, "created_at", None) else None,
                "read_at": getattr(row, "read_at", None).isoformat() if getattr(row, "read_at", None) else None,
                "responded_at": getattr(row, "responded_at", None).isoformat() if getattr(row, "responded_at", None) else None,
                "payload": payload,
            }
        )

    return {
        "count": len(items),
        "unread": int(unread_count),
        "items": items,
    }


@router.post("/notifications/{notification_id}/action")
def respond_to_notification(
    notification_id: int,
    req: PlayerNotificationAction,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(_require_player_user),
    club_id: int = Depends(get_active_club_id),
):
    action_raw = str(getattr(req, "action", "") or "").strip().lower()
    action_labels = {
        "confirm_playing": "confirmed playing",
        "request_cancel": "requested cancellation",
        "request_callback": "requested a callback",
    }
    if action_raw not in action_labels:
        raise HTTPException(status_code=400, detail="Unsupported action")

    try:
        row = (
            db.query(models.PlayerNotification)
            .filter(
                models.PlayerNotification.id == int(notification_id),
                models.PlayerNotification.club_id == int(club_id),
                models.PlayerNotification.user_id == int(current_user.id),
            )
            .first()
        )
    except Exception as e:
        db.rollback()
        message = str(e).lower()
        if "player_notifications" in message and ("does not exist" in message or "no such table" in message):
            raise HTTPException(status_code=503, detail="Notification storage not initialized.")
        raise HTTPException(status_code=500, detail="Failed to load notification")
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")

    now = datetime.utcnow()
    if str(getattr(row, "response", "") or "").strip().lower() != action_raw:
        row.response = action_raw
    row.status = "responded"
    row.responded_at = now
    row.read_at = now

    booking_id = int(getattr(row, "booking_id", 0) or 0)
    if booking_id > 0:
        booking = (
            db.query(models.Booking)
            .filter(models.Booking.id == booking_id, models.Booking.club_id == int(club_id))
            .first()
        )
        if booking:
            stamp = now.strftime("%d/%m/%y %H:%M")
            detail = action_labels[action_raw]
            booking.notes = append_booking_note(
                booking.notes,
                f"[Weather reconfirm {stamp}] Player {detail} via app.",
            )
            if action_raw == "request_cancel":
                booking.notes = append_booking_note(
                    booking.notes,
                    "Action required: review weather cancellation request with player.",
                )

    db.commit()
    return {
        "ok": True,
        "notification_id": int(getattr(row, "id", 0) or 0),
        "status": str(getattr(row, "status", "") or ""),
        "response": str(getattr(row, "response", "") or ""),
        "booking_id": booking_id if booking_id > 0 else None,
    }

@router.get("/fees-available")
def get_available_fees(db: Session = Depends(get_db), current_user: models.User = Depends(_require_player_user)):
    """Get fees available for current player based on age (prices hidden from players)"""
    user = (
        db.query(models.User)
        .filter(func.lower(models.User.email) == str(current_user.email).strip().lower())
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Calculate age
    if not user.birth_date:
        raise HTTPException(status_code=400, detail="Please set your birth date in your profile")
    
    today = datetime.now()
    age = today.year - user.birth_date.year - ((today.month, today.day) < (user.birth_date.month, user.birth_date.day))
    
    # Get fees matching player's age
    club_id = getattr(user, "club_id", None)
    q = db.query(FeeCategory).filter(
        FeeCategory.active == 1,
        FeeCategory.fee_type == FeeType.GOLF,
        or_(FeeCategory.min_age.is_(None), FeeCategory.min_age <= age),
        or_(FeeCategory.max_age.is_(None), FeeCategory.max_age >= age),
    )
    if club_id is not None:
        try:
            cid = int(club_id)
        except Exception:
            cid = 0
        if cid > 0:
            q = q.filter(or_(FeeCategory.club_id == cid, FeeCategory.club_id.is_(None)))

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
