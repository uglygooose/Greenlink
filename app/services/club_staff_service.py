from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from app.auth import get_password_hash
from app.models import StaffRoleProfile, User, UserRole
from app.password_policy import assert_password_policy
from app.people import sync_user_person
from app.club_assignments import sync_user_club_assignment


class StaffUpsertPayload(BaseModel):
    name: str
    email: str
    password: str | None = None
    role: str = "club_staff"
    force_reset: bool | None = False


def _parse_staff_role_for_club_admin(raw: str | None) -> UserRole:
    role = (raw or "").strip().lower()
    if role in {"club_staff", "staff", "proshop"}:
        return UserRole.club_staff
    raise HTTPException(status_code=400, detail="role must be 'club_staff'")


def _find_user_by_email_global(db: Session, email: str) -> User | None:
    normalized = (email or "").strip().lower()
    if not normalized:
        return None

    had_scope = "club_id" in getattr(db, "info", {})
    saved_scope = getattr(db, "info", {}).get("club_id")
    if had_scope:
        db.info.pop("club_id", None)
    try:
        return db.query(User).filter(func.lower(User.email) == normalized).first()
    finally:
        if had_scope:
            db.info["club_id"] = saved_scope


def list_staff_users_payload(
    db: Session,
    *,
    club_id: int,
    skip: int = 0,
    limit: int = 50,
    q: str | None = None,
    sort: str | None = "name_asc",
) -> dict[str, Any]:
    query = (
        db.query(User)
        .filter(User.role.in_([UserRole.admin, UserRole.club_staff]))
        .filter(User.club_id == int(club_id))
    )
    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        query = query.filter(or_(func.lower(User.name).like(like), func.lower(User.email).like(like)))

    total = query.count()
    sort_key = str(sort or "name_asc").strip().lower()
    if sort_key == "name_desc":
        order = [func.lower(User.name).desc(), User.id.desc()]
    else:
        order = [func.lower(cast(User.role, String)).asc(), func.lower(User.name).asc(), User.id.asc()]

    rows = query.order_by(*order).offset(skip).limit(limit).all()
    user_ids = [int(user.id) for user in rows if getattr(user, "id", None) is not None]
    profiles = []
    if user_ids:
        profiles = (
            db.query(StaffRoleProfile)
            .filter(
                StaffRoleProfile.club_id == int(club_id),
                StaffRoleProfile.linked_user_id.in_(user_ids),
            )
            .order_by(StaffRoleProfile.id.asc())
            .all()
        )

    profile_map = {
        int(profile.linked_user_id): {
            "role_label": str(getattr(profile, "role_label", "") or "").strip() or None,
            "operation_area": str(getattr(profile, "operation_area", "") or "").strip() or None,
            "user_type": str(getattr(profile, "user_type", "") or "").strip() or None,
            "source_file": str(getattr(profile, "source_file", "") or "").strip() or None,
        }
        for profile in profiles
        if getattr(profile, "linked_user_id", None)
    }

    return {
        "total": total,
        "staff": [
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": getattr(user.role, "value", user.role),
                "operational_role": (profile_map.get(int(user.id)) or {}).get("role_label"),
                "operation_area": (profile_map.get(int(user.id)) or {}).get("operation_area"),
                "user_type": (profile_map.get(int(user.id)) or {}).get("user_type"),
                "source_file": (profile_map.get(int(user.id)) or {}).get("source_file"),
            }
            for user in rows
        ],
    }


def create_staff_user_for_club_payload(
    db: Session,
    *,
    club_id: int,
    payload: StaffUpsertPayload,
) -> dict[str, Any]:
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="valid email is required")
    name = (payload.name or "").strip() or email
    role = _parse_staff_role_for_club_admin(payload.role)

    existing = _find_user_by_email_global(db, email)
    if existing:
        if existing.role == UserRole.super_admin:
            raise HTTPException(status_code=409, detail="Cannot modify super admin user")
        if existing.role == UserRole.admin:
            raise HTTPException(status_code=409, detail="Admin users are managed by Super Admin")

        existing_club_id = int(getattr(existing, "club_id", 0) or 0)
        if existing_club_id and existing_club_id != int(club_id):
            raise HTTPException(status_code=409, detail="User exists in another club")

        if not existing_club_id and existing.role == UserRole.player and bool(payload.force_reset):
            existing.club_id = int(club_id)
            existing_club_id = int(club_id)

        if existing_club_id != int(club_id):
            raise HTTPException(status_code=409, detail="User exists but is not assigned to this club")
        if existing.role not in {UserRole.club_staff, UserRole.player}:
            raise HTTPException(status_code=409, detail="User exists with a non-staff role")
        if not bool(payload.force_reset):
            raise HTTPException(status_code=409, detail="User already exists (set force_reset=true to update)")

        existing.name = name
        existing.role = role
        existing.club_id = int(club_id)
        if payload.password:
            assert_password_policy(payload.password, field_name="password")
            existing.password = get_password_hash(payload.password)
        sync_user_club_assignment(
            db,
            existing,
            club_id=int(club_id),
            role=role,
            is_primary=True,
        )
        sync_user_person(db, existing, source_system="staff_upsert")
        db.commit()
        db.refresh(existing)
        return {"status": "success", "user_id": existing.id}

    if not payload.password:
        raise HTTPException(status_code=400, detail="password is required for new staff users")
    assert_password_policy(payload.password, field_name="password")

    user = User(
        name=name,
        email=email,
        password=get_password_hash(payload.password),
        role=role,
        club_id=int(club_id),
    )
    db.add(user)
    db.flush()
    sync_user_club_assignment(
        db,
        user,
        club_id=int(club_id),
        role=role,
        is_primary=True,
    )
    sync_user_person(db, user, source_system="staff_upsert")
    db.commit()
    db.refresh(user)
    return {"status": "success", "user_id": user.id}


def update_staff_user_for_club_payload(
    db: Session,
    *,
    club_id: int,
    user_id: int,
    payload: StaffUpsertPayload,
) -> dict[str, Any]:
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == UserRole.super_admin:
        raise HTTPException(status_code=409, detail="Cannot modify super admin user")
    if user.role == UserRole.admin:
        raise HTTPException(status_code=409, detail="Admin users are managed by Super Admin")
    if user.role != UserRole.club_staff:
        raise HTTPException(status_code=409, detail="Only club_staff users can be modified here")
    if int(getattr(user, "club_id", 0) or 0) != int(club_id):
        raise HTTPException(status_code=403, detail="Cannot edit another club's staff")

    user.name = (payload.name or "").strip() or user.name
    user.role = _parse_staff_role_for_club_admin(payload.role)
    if payload.password:
        assert_password_policy(payload.password, field_name="password")
        user.password = get_password_hash(payload.password)

    if (payload.email or "").strip() and (payload.email or "").strip().lower() != str(user.email or "").lower():
        raise HTTPException(status_code=400, detail="email cannot be changed; create a new staff user instead")

    sync_user_club_assignment(
        db,
        user,
        club_id=int(club_id),
        role=getattr(user, "role", None),
        is_primary=True,
    )
    sync_user_person(db, user, source_system="staff_upsert")
    db.commit()
    return {"status": "success"}


def get_staff_role_context_payload(
    db: Session,
    *,
    club_id: int,
    staff_user: User,
) -> dict[str, Any]:
    if int(club_id) <= 0:
        return {"role_label": None, "default_page": "tee-times"}

    name = str(getattr(staff_user, "name", "") or "").strip().lower()
    profile = (
        db.query(StaffRoleProfile)
        .filter(
            StaffRoleProfile.club_id == int(club_id),
            or_(
                StaffRoleProfile.linked_user_id == int(getattr(staff_user, "id", 0) or 0),
                func.lower(StaffRoleProfile.staff_name) == name,
            ),
        )
        .order_by(StaffRoleProfile.linked_user_id.desc(), StaffRoleProfile.id.asc())
        .first()
    )

    role_label = str(getattr(profile, "role_label", "") or "").strip() if profile else ""
    role_key = role_label.lower()
    default_page = "tee-times"
    if "account" in role_key or "bookkeeper" in role_key:
        default_page = "cashbook"
    elif "sports manager" in role_key:
        default_page = "bookings"
    elif "retail" in role_key or "pro shop manager" in role_key:
        default_page = "pro-shop"
    elif "green fees" in role_key:
        default_page = "tee-times"

    return {
        "role_label": role_label or None,
        "default_page": default_page,
        "matched_profile_id": int(profile.id) if profile else None,
    }
