# app/routers/super_admin.py
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import record_audit_event
from app.auth import get_db
from app.auth import get_password_hash
from app.club_assignments import sync_user_club_assignment
from app.models import Club, User, UserRole
from app.people import sync_user_person
from app.password_policy import assert_password_policy
from app.tenancy import require_super_admin


router = APIRouter(prefix="/api/super", tags=["super-admin"])


def _request_id(request: Request | None) -> str | None:
    if request is None:
        return None
    return str(getattr(getattr(request, "state", None), "request_id", "") or "").strip() or None


def _audit_super_event(
    db: Session,
    request: Request | None,
    actor: User | None,
    action: str,
    entity_type: str,
    *,
    entity_id: str | int | None = None,
    club_id: int | None = None,
    payload: dict | None = None,
) -> None:
    record_audit_event(
        db,
        action=action,
        entity_type=entity_type,
        actor_user_id=int(getattr(actor, "id", 0) or 0) or None,
        entity_id=entity_id,
        payload=payload,
        request_id=_request_id(request),
        club_id=(int(club_id) if club_id is not None else None),
    )


def _slugify(value: str) -> str:
    raw = (value or "").strip().lower()
    raw = re.sub(r"[^a-z0-9]+", "-", raw)
    raw = re.sub(r"-{2,}", "-", raw).strip("-")
    return raw[:80]


class ClubCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    active: Optional[bool] = True


class ClubUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    active: Optional[bool] = None


class ClubOut(BaseModel):
    id: int
    name: str
    slug: Optional[str] = None
    active: int
    created_at: datetime

    model_config = {"from_attributes": True}


class StaffUserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str  # admin | club_staff
    club_id: int
    force_reset: Optional[bool] = False


class StaffUserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None  # admin | club_staff
    club_id: Optional[int] = None


class StaffUserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    club_id: Optional[int] = None

    model_config = {"from_attributes": True}


def _parse_staff_role(raw: str | None) -> UserRole:
    r = (raw or "").strip().lower()
    if r == "admin":
        return UserRole.admin
    if r in {"club_staff", "staff", "proshop"}:
        return UserRole.club_staff
    raise HTTPException(status_code=400, detail="role must be 'admin' or 'club_staff'")


@router.get("/clubs", response_model=list[ClubOut])
def list_clubs(db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    return db.query(Club).order_by(Club.active.desc(), Club.name.asc()).all()


@router.post("/clubs", response_model=ClubOut)
def create_club(
    payload: ClubCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_super_admin),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    slug = (payload.slug or "").strip()
    if not slug:
        slug = _slugify(name)
    else:
        slug = _slugify(slug)
    if not slug:
        raise HTTPException(status_code=400, detail="slug is required")

    existing = db.query(Club).filter(func.lower(Club.slug) == slug.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="slug already exists")

    club = Club(name=name, slug=slug, active=1 if payload.active else 0)
    db.add(club)
    _audit_super_event(
        db,
        request,
        actor,
        action="super_admin.club_created",
        entity_type="club",
        entity_id=slug,
        payload={"name": name, "slug": slug, "active": bool(payload.active)},
    )
    db.commit()
    db.refresh(club)
    return club


@router.put("/clubs/{club_id}", response_model=ClubOut)
def update_club(
    club_id: int,
    payload: ClubUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_super_admin),
):
    club = db.query(Club).filter(Club.id == int(club_id)).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    if payload.name is not None:
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        club.name = name

    if payload.slug is not None:
        slug = _slugify(payload.slug)
        if not slug:
            raise HTTPException(status_code=400, detail="slug cannot be empty")
        existing = (
            db.query(Club.id)
            .filter(func.lower(Club.slug) == slug.lower(), Club.id != club.id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="slug already exists")
        club.slug = slug

    if payload.active is not None:
        club.active = 1 if payload.active else 0

    _audit_super_event(
        db,
        request,
        actor,
        action="super_admin.club_updated",
        entity_type="club",
        entity_id=int(club.id),
        payload={"name": club.name, "slug": club.slug, "active": bool(club.active)},
    )
    db.commit()
    db.refresh(club)
    return club


@router.get("/staff", response_model=list[StaffUserOut])
def list_staff(
    role: Optional[str] = None,
    club_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    q = db.query(User).filter(User.role.in_([UserRole.admin, UserRole.club_staff]))
    if role is not None:
        q = q.filter(User.role == _parse_staff_role(role))
    if club_id is not None:
        q = q.filter(User.club_id == int(club_id))
    return q.order_by(User.role.asc(), func.lower(User.email).asc()).all()


@router.post("/staff", response_model=StaffUserOut)
def create_staff_user(
    payload: StaffUserCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_super_admin),
):
    club = db.query(Club).filter(Club.id == int(payload.club_id), Club.active == 1).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    email = str(payload.email).strip().lower()
    name = (payload.name or "").strip() or email
    if not payload.password:
        raise HTTPException(status_code=400, detail="password is required")
    assert_password_policy(payload.password, field_name="password")

    role = _parse_staff_role(payload.role)
    existing = db.query(User).filter(func.lower(User.email) == email).first()
    if existing:
        if not payload.force_reset:
            raise HTTPException(status_code=409, detail="User already exists (set force_reset=true to update)")
        existing.name = name
        existing.role = role
        existing.club_id = int(payload.club_id)
        existing.password = get_password_hash(payload.password)
        sync_user_club_assignment(
            db,
            existing,
            club_id=int(payload.club_id),
            role=role,
            is_primary=True,
        )
        sync_user_person(db, existing, source_system="super_admin")
        _audit_super_event(
            db,
            request,
            actor,
            action="super_admin.staff_reset",
            entity_type="user",
            entity_id=int(existing.id),
            club_id=int(payload.club_id),
            payload={"email": email, "role": str(role.value), "force_reset": True},
        )
        db.commit()
        db.refresh(existing)
        return existing

    user = User(
        name=name,
        email=email,
        password=get_password_hash(payload.password),
        role=role,
        club_id=int(payload.club_id),
    )
    db.add(user)
    db.flush()
    sync_user_club_assignment(
        db,
        user,
        club_id=int(payload.club_id),
        role=role,
        is_primary=True,
    )
    sync_user_person(db, user, source_system="super_admin")
    _audit_super_event(
        db,
        request,
        actor,
        action="super_admin.staff_created",
        entity_type="user",
        entity_id=email,
        club_id=int(payload.club_id),
        payload={"email": email, "role": str(role.value), "force_reset": False},
    )
    db.commit()
    db.refresh(user)
    return user


@router.put("/staff/{user_id}", response_model=StaffUserOut)
def update_staff_user(
    user_id: int,
    payload: StaffUserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_super_admin),
):
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == UserRole.super_admin:
        raise HTTPException(status_code=409, detail="Cannot modify super admin users via this endpoint")

    if payload.name is not None:
        user.name = (payload.name or "").strip() or user.name
    if payload.role is not None:
        user.role = _parse_staff_role(payload.role)
    if payload.club_id is not None:
        club = db.query(Club).filter(Club.id == int(payload.club_id), Club.active == 1).first()
        if not club:
            raise HTTPException(status_code=404, detail="Club not found")
        user.club_id = int(payload.club_id)
    if payload.password is not None:
        if not str(payload.password):
            raise HTTPException(status_code=400, detail="password cannot be empty")
        assert_password_policy(payload.password, field_name="password")
        user.password = get_password_hash(payload.password)

    sync_user_club_assignment(
        db,
        user,
        club_id=int(getattr(user, "club_id", 0) or 0) or None,
        role=getattr(user, "role", None),
        is_primary=True,
    )
    sync_user_person(db, user, source_system="super_admin")

    _audit_super_event(
        db,
        request,
        actor,
        action="super_admin.staff_updated",
        entity_type="user",
        entity_id=int(user.id),
        club_id=int(getattr(user, "club_id", 0) or 0) or None,
        payload={"email": str(user.email), "role": str(getattr(user.role, "value", user.role))},
    )
    db.commit()
    db.refresh(user)
    return user
