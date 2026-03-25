from __future__ import annotations

from datetime import date, datetime
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import case, desc, func, or_
from sqlalchemy.orm import Session, load_only, selectinload

from app.models import Booking, BookingStatus, Member, TeeTime, User, UserRole
from app.people import (
    classify_membership_group,
    normalize_membership_status,
    normalize_primary_operation,
    sync_member_person,
)
from app.pricing import (
    normalize_member_pricing_mode,
    pricing_mode_to_player_type,
    resolve_booking_pricing_profile,
)

MEMBER_PRICING_MODE_LABELS = {
    "membership_default": "Default by membership type",
    "visitor_override": "Visitor rate override",
    "non_affiliated_override": "Non-affiliated visitor override",
    "reciprocity_override": "Reciprocity override",
}


class MemberUpsertPayload(BaseModel):
    member_number: str | None = None
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    handicap_number: str | None = None
    home_club: str | None = None
    gender: str | None = None
    player_category: str | None = None
    student: bool | None = None
    handicap_index: float | None = None
    handicap_sa_id: str | None = None
    country_of_residence: str | None = None
    membership_category: str | None = None
    membership_category_raw: str | None = None
    primary_operation: str | None = None
    membership_status: str | None = None
    member_lifecycle_status: str | None = None
    pricing_mode: str | None = None
    pricing_note: str | None = None
    record_status: str | None = None
    person_type: str | None = None
    membership_date: date | None = None
    membership_expiration: date | None = None
    source_file: str | None = None
    source_row_number: int | None = None
    import_reference: str | None = None
    golf_access: bool | None = None
    tennis_access: bool | None = None
    bowls_access: bool | None = None
    squash_access: bool | None = None
    active: bool | None = True


def _member_pricing_payload(member: Member, db: Session | None = None) -> dict[str, Any]:
    pricing_mode = normalize_member_pricing_mode(getattr(member, "pricing_mode", None))
    updated_by_id = int(getattr(member, "pricing_override_updated_by_user_id", 0) or 0) or None
    updated_by_name = None
    if db is not None and updated_by_id:
        user = db.query(User).filter(User.id == updated_by_id).first()
        updated_by_name = str(getattr(user, "name", "") or "").strip() or str(getattr(user, "email", "") or "").strip() or None
    membership_text = getattr(member, "membership_category_raw", None) or getattr(member, "membership_category", None)
    profile = resolve_booking_pricing_profile(
        tee_time=datetime.utcnow(),
        member=member,
        membership_category=membership_text,
        player_category=getattr(member, "player_category", None),
        birth_date=getattr(member, "birth_date", None),
        has_member_link=bool(getattr(member, "id", None)),
        handicap_sa_id=getattr(member, "handicap_sa_id", None),
        home_club=getattr(member, "home_club", None),
    )
    applied_player_type = str(getattr(profile, "player_type", "") or "").strip().lower() or None
    pricing_tags = {str(tag or "").strip().lower() for tag in (getattr(profile, "pricing_tags", ()) or ()) if str(tag or "").strip()}
    pricing_source = str(getattr(profile, "pricing_source", "") or "").strip() or "membership_default"
    if pricing_source == "member_override":
        applied_label = {
            "visitor": "Visitor Override",
            "non_affiliated": "Non-affiliated Override",
            "reciprocity": "Reciprocity Override",
        }.get(applied_player_type, "Override")
    elif "pensioner" in pricing_tags:
        applied_label = "Veteran Rate"
    elif "student" in pricing_tags:
        applied_label = "Student Rate"
    elif "junior" in pricing_tags or "scholar" in pricing_tags:
        applied_label = "Junior Rate"
    else:
        applied_label = {
            "member": "Member Rate",
            "visitor": "Visitor Rate",
            "non_affiliated": "Non-affiliated Rate",
            "reciprocity": "Reciprocity Rate",
        }.get(applied_player_type, "Membership Default")
    return {
        "pricing_mode": pricing_mode,
        "pricing_label": MEMBER_PRICING_MODE_LABELS.get(pricing_mode, MEMBER_PRICING_MODE_LABELS["membership_default"]),
        "pricing_override_player_type": pricing_mode_to_player_type(pricing_mode),
        "applied_pricing_label": applied_label,
        "applied_pricing_player_type": applied_player_type,
        "applied_pricing_source": pricing_source,
        "pricing_note": getattr(member, "pricing_note", None),
        "pricing_override_updated_at": getattr(member, "pricing_override_updated_at", None).isoformat() if getattr(member, "pricing_override_updated_at", None) else None,
        "pricing_override_updated_by_user_id": updated_by_id,
        "pricing_override_updated_by_name": updated_by_name,
    }


def _normalize_membership_area(raw: str | None) -> str:
    value = str(raw or "").strip().lower()
    if not value or value in {"all", "any"}:
        return "all"
    if value in {"home_owner", "homeowners"}:
        return "homeowners"
    if value in {"non_golf", "non-golf"}:
        return "other"
    if value in {"proshop", "pro_shop"}:
        return "pro_shop"
    return value


def _membership_area_clause(area_norm: str):
    primary_op = func.lower(func.coalesce(Member.primary_operation, ""))
    category_col = func.lower(func.coalesce(Member.membership_category, ""))
    raw_category_col = func.lower(func.coalesce(Member.membership_category_raw, ""))
    person_type_col = func.lower(func.coalesce(Member.person_type, ""))
    player_col = func.lower(func.coalesce(Member.player_category, ""))
    explicit_non_golf = or_(
        category_col.like("%non golf%"),
        category_col.like("%non-golf%"),
        category_col.like("%bowls%"),
        category_col.like("%padel%"),
        category_col.like("%tennis%"),
        category_col.like("%squash%"),
        category_col.like("%home owner%"),
        category_col.like("%homeowner%"),
        category_col.like("%house%"),
        category_col.like("%social%"),
        category_col.like("%staff%"),
        player_col.in_(["bowls", "padel", "tennis", "squash", "homeowners", "house", "social", "staff", "other"]),
    )
    if area_norm == "all":
        return None
    if area_norm == "golf":
        return or_(primary_op == "golf", Member.golf_access.is_(True), player_col == "golf", ~explicit_non_golf)
    if area_norm == "bowls":
        return or_(primary_op == "bowls", Member.bowls_access.is_(True), player_col == "bowls", category_col.like("%bowls%"))
    if area_norm == "padel":
        return or_(
            primary_op == "padel",
            player_col == "padel",
            category_col.like("%padel%"),
            raw_category_col.like("%padel%"),
        )
    if area_norm == "tennis":
        return or_(primary_op == "tennis", Member.tennis_access.is_(True), player_col == "tennis", category_col.like("%tennis%"))
    if area_norm == "squash":
        return or_(primary_op == "squash", Member.squash_access.is_(True), player_col == "squash", category_col.like("%squash%"))
    if area_norm == "general":
        return or_(
            primary_op == "general",
            person_type_col == "staff",
            category_col.like("%home owner%"),
            category_col.like("%homeowner%"),
            category_col.like("%house%"),
            category_col.like("%social%"),
            raw_category_col.like("%general%"),
        )
    if area_norm == "homeowners":
        return or_(primary_op == "general", player_col == "homeowners", category_col.like("%home owner%"), category_col.like("%homeowner%"))
    if area_norm == "house":
        return or_(player_col == "house", category_col.like("%house%"))
    if area_norm == "social":
        return or_(player_col == "social", category_col.like("%social%"))
    if area_norm == "staff":
        return or_(person_type_col == "staff", player_col == "staff", category_col.like("%staff%"))
    if area_norm == "pro_shop":
        return or_(primary_op == "pro shop", primary_op == "pro_shop", category_col.like("%pro shop%"))
    return explicit_non_golf


def _membership_status_clause(status_norm: str):
    normalized = normalize_membership_status(status_norm)
    status_col = func.lower(func.coalesce(Member.membership_status, ""))
    if normalized == "all":
        return None
    if normalized == "active":
        return or_(status_col == "active", Member.active == 1)
    if normalized == "hold":
        return or_(status_col == "hold", status_col == "suspended")
    if normalized == "inactive":
        return or_(status_col == "inactive", Member.active == 0)
    return status_col == normalized


def list_members_payload(
    db: Session,
    *,
    skip: int = 0,
    limit: int = 50,
    q: str | None = None,
    sort: str | None = "recent_activity",
    area: str | None = "all",
    membership_status: str | None = "all",
) -> dict[str, Any]:
    base_query = db.query(Member)
    area_norm = _normalize_membership_area(area)
    area_clause = _membership_area_clause(area_norm)
    if area_clause is not None:
        base_query = base_query.filter(area_clause)

    status_norm = str(membership_status or "all").strip().lower()
    status_clause = _membership_status_clause(status_norm)
    if status_clause is not None:
        base_query = base_query.filter(status_clause)

    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        base_query = base_query.filter(
            or_(
                func.lower(Member.first_name).like(like),
                func.lower(Member.last_name).like(like),
                func.lower(Member.email).like(like),
                func.lower(Member.member_number).like(like),
                func.lower(Member.phone).like(like),
                func.lower(Member.handicap_number).like(like),
                func.lower(func.coalesce(Member.membership_category_raw, "")).like(like),
                func.lower(func.coalesce(Member.primary_operation, "")).like(like),
            )
        )

    total = base_query.count()

    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]
    stats = (
        db.query(
            Booking.member_id.label("member_id"),
            func.count(Booking.id).label("bookings_count"),
            func.coalesce(
                func.sum(case((Booking.status.in_(paid_statuses), Booking.price), else_=0.0)),
                0.0,
            ).label("total_spent"),
            func.max(TeeTime.tee_time).label("last_seen"),
        )
        .outerjoin(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(Booking.member_id.isnot(None))
        .group_by(Booking.member_id)
        .subquery()
    )

    query = (
        db.query(
            Member,
            func.coalesce(stats.c.bookings_count, 0).label("bookings_count"),
            func.coalesce(stats.c.total_spent, 0.0).label("total_spent"),
            stats.c.last_seen.label("last_seen"),
        )
        .options(
            load_only(
                Member.id,
                Member.member_number,
                Member.first_name,
                Member.last_name,
                Member.email,
                Member.phone,
                Member.handicap_number,
                Member.handicap_sa_id,
                Member.home_club,
                Member.player_category,
                Member.country_of_residence,
                Member.membership_category,
                Member.membership_category_raw,
                Member.primary_operation,
                Member.membership_status,
                Member.member_lifecycle_status,
                Member.pricing_mode,
                Member.pricing_note,
                Member.pricing_override_updated_at,
                Member.pricing_override_updated_by_user_id,
                Member.record_status,
                Member.person_type,
                Member.membership_date,
                Member.membership_expiration,
                Member.source_file,
                Member.source_row_number,
                Member.import_reference,
                Member.golf_access,
                Member.tennis_access,
                Member.bowls_access,
                Member.squash_access,
                Member.active,
            )
        )
        .outerjoin(stats, stats.c.member_id == Member.id)
    )
    if area_clause is not None:
        query = query.filter(area_clause)

    if status_clause is not None:
        query = query.filter(status_clause)

    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        query = query.filter(
            or_(
                func.lower(Member.first_name).like(like),
                func.lower(Member.last_name).like(like),
                func.lower(Member.email).like(like),
                func.lower(Member.member_number).like(like),
                func.lower(Member.phone).like(like),
                func.lower(Member.handicap_number).like(like),
                func.lower(func.coalesce(Member.membership_category_raw, "")).like(like),
                func.lower(func.coalesce(Member.primary_operation, "")).like(like),
            )
        )

    sort_key = str(sort or "recent_activity").strip().lower()
    bookings_col = func.coalesce(stats.c.bookings_count, 0)
    spent_col = func.coalesce(stats.c.total_spent, 0.0)
    last_seen_col = stats.c.last_seen

    if sort_key == "bookings_desc":
        order = [desc(bookings_col), desc(last_seen_col), Member.last_name, Member.first_name]
    elif sort_key == "spend_desc":
        order = [desc(spent_col), desc(last_seen_col), Member.last_name, Member.first_name]
    elif sort_key == "name_desc":
        order = [Member.last_name.desc(), Member.first_name.desc()]
    elif sort_key == "name_asc":
        order = [Member.last_name.asc(), Member.first_name.asc()]
    elif sort_key == "active":
        order = [desc(Member.active), Member.last_name.asc(), Member.first_name.asc()]
    else:
        order = [desc(last_seen_col), desc(bookings_col), Member.last_name.asc(), Member.first_name.asc()]

    rows = query.order_by(*order).offset(skip).limit(limit).all()

    return {
        "total": total,
        "members": [
            {
                "id": m.id,
                "member_number": m.member_number,
                "first_name": m.first_name,
                "last_name": m.last_name,
                "name": f"{m.first_name} {m.last_name}".strip(),
                "email": m.email,
                "phone": m.phone,
                "handicap_number": m.handicap_number,
                "home_club": m.home_club,
                "country_of_residence": getattr(m, "country_of_residence", None),
                "membership_category": getattr(m, "membership_category", None),
                "membership_category_raw": getattr(m, "membership_category_raw", None),
                "primary_operation": normalize_primary_operation(getattr(m, "primary_operation", None), getattr(m, "membership_category", None)),
                "membership_group": classify_membership_group(getattr(m, "membership_category", None)),
                "membership_status": getattr(m, "membership_status", None),
                "member_lifecycle_status": getattr(m, "member_lifecycle_status", None),
                **_member_pricing_payload(m),
                "record_status": getattr(m, "record_status", None),
                "person_type": getattr(m, "person_type", None) or "Member",
                "membership_date": getattr(m, "membership_date", None).isoformat() if getattr(m, "membership_date", None) else None,
                "membership_expiration": getattr(m, "membership_expiration", None).isoformat() if getattr(m, "membership_expiration", None) else None,
                "source_file": getattr(m, "source_file", None),
                "source_row_number": getattr(m, "source_row_number", None),
                "import_reference": getattr(m, "import_reference", None),
                "golf_access": getattr(m, "golf_access", None),
                "tennis_access": getattr(m, "tennis_access", None),
                "bowls_access": getattr(m, "bowls_access", None),
                "squash_access": getattr(m, "squash_access", None),
                "financial_flag": "defaulter" if str(getattr(m, "member_lifecycle_status", "") or "").strip().lower() == "defaulter" else None,
                "active": bool(m.active),
                "bookings_count": int(bookings_count or 0),
                "total_spent": float(total_spent or 0.0),
                "last_seen": last_seen.isoformat() if last_seen else None,
            }
            for (m, bookings_count, total_spent, last_seen) in rows
        ],
    }


def create_member_payload(
    db: Session,
    *,
    club_id: int,
    payload: MemberUpsertPayload,
    admin_user_id: int | None = None,
) -> dict[str, Any]:
    if int(club_id) <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

    first = (payload.first_name or "").strip()
    last = (payload.last_name or "").strip()
    if not first or not last:
        raise HTTPException(status_code=400, detail="first_name and last_name are required")

    email = (payload.email or "").strip().lower() or None
    phone = (payload.phone or "").strip() or None
    member_number = (payload.member_number or "").strip() or None
    handicap_number = (payload.handicap_number or "").strip() or None
    home_club = (payload.home_club or "").strip() or None
    gender = (payload.gender or "").strip() or None
    player_category = (payload.player_category or "").strip() or None
    handicap_sa_id = (payload.handicap_sa_id or "").strip() or None
    country_of_residence = (payload.country_of_residence or "").strip() or None
    membership_category = (payload.membership_category or "").strip() or None
    membership_category_raw = (payload.membership_category_raw or membership_category or "").strip() or membership_category
    primary_operation = normalize_primary_operation(payload.primary_operation, membership_category_raw)
    membership_status = normalize_membership_status(
        payload.member_lifecycle_status or payload.membership_status or ("active" if bool(payload.active) else "inactive")
    )
    pricing_mode = normalize_member_pricing_mode(payload.pricing_mode)
    pricing_note = (payload.pricing_note or "").strip() or None
    record_status = (payload.record_status or membership_status or "").strip() or membership_status
    person_type = (payload.person_type or "Member").strip() or "Member"
    has_pricing_override = pricing_mode != "membership_default" or bool(pricing_note)

    row = Member(
        club_id=int(club_id),
        member_number=member_number,
        first_name=first,
        last_name=last,
        email=email,
        phone=phone,
        handicap_number=handicap_number,
        home_club=home_club,
        country_of_residence=country_of_residence,
        membership_category=membership_category,
        membership_category_raw=membership_category_raw,
        primary_operation=primary_operation,
        membership_status=membership_status,
        member_lifecycle_status=membership_status,
        pricing_mode=pricing_mode,
        pricing_note=pricing_note,
        pricing_override_updated_at=datetime.utcnow() if has_pricing_override else None,
        pricing_override_updated_by_user_id=int(admin_user_id or 0) or None if has_pricing_override else None,
        record_status=record_status,
        person_type=person_type,
        membership_date=payload.membership_date,
        membership_expiration=payload.membership_expiration,
        source_file=(payload.source_file or "").strip() or None,
        source_row_number=payload.source_row_number,
        import_reference=(payload.import_reference or "").strip() or None,
        golf_access=payload.golf_access,
        tennis_access=payload.tennis_access,
        bowls_access=payload.bowls_access,
        squash_access=payload.squash_access,
        active=1 if bool(payload.active) else 0,
        gender=gender,
        player_category=player_category or classify_membership_group(primary_operation or membership_category),
        student=payload.student,
        handicap_index=float(payload.handicap_index) if payload.handicap_index is not None else None,
        handicap_sa_id=handicap_sa_id,
    )
    db.add(row)
    db.flush()
    sync_member_person(db, row, source_system="admin_member_upsert")
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        msg = str(getattr(exc, "orig", exc) or "")[:180]
        raise HTTPException(status_code=409, detail=f"Member create failed (duplicate?): {msg}")

    db.refresh(row)
    return {"status": "success", "member_id": row.id}


def update_member_payload(
    db: Session,
    *,
    member_id: int,
    payload: MemberUpsertPayload,
    admin_user_id: int | None = None,
) -> dict[str, Any]:
    row = db.query(Member).filter(Member.id == int(member_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Member not found")

    first = (payload.first_name or "").strip()
    last = (payload.last_name or "").strip()
    if not first or not last:
        raise HTTPException(status_code=400, detail="first_name and last_name are required")

    row.first_name = first
    row.last_name = last
    row.member_number = (payload.member_number or "").strip() or None
    row.email = (payload.email or "").strip().lower() or None
    row.phone = (payload.phone or "").strip() or None
    row.handicap_number = (payload.handicap_number or "").strip() or None
    row.home_club = (payload.home_club or "").strip() or None
    row.country_of_residence = (payload.country_of_residence or "").strip() or None
    row.membership_category = (payload.membership_category or "").strip() or row.membership_category
    row.membership_category_raw = (payload.membership_category_raw or payload.membership_category or "").strip() or row.membership_category_raw
    row.primary_operation = normalize_primary_operation(payload.primary_operation, row.membership_category_raw or row.membership_category)
    row.membership_status = normalize_membership_status(payload.member_lifecycle_status or payload.membership_status or row.membership_status)
    row.member_lifecycle_status = row.membership_status
    new_pricing_mode = normalize_member_pricing_mode(payload.pricing_mode or row.pricing_mode)
    new_pricing_note = (payload.pricing_note or "").strip() if payload.pricing_note is not None else (row.pricing_note or "")
    if new_pricing_mode != normalize_member_pricing_mode(row.pricing_mode) or new_pricing_note != str(row.pricing_note or ""):
        row.pricing_mode = new_pricing_mode
        row.pricing_note = new_pricing_note or None
        row.pricing_override_updated_at = datetime.utcnow()
        row.pricing_override_updated_by_user_id = int(admin_user_id or 0) or None
    row.record_status = (payload.record_status or "").strip() or row.record_status or row.membership_status
    row.person_type = (payload.person_type or "").strip() or row.person_type
    row.membership_date = payload.membership_date
    row.membership_expiration = payload.membership_expiration
    row.source_file = (payload.source_file or "").strip() or row.source_file
    row.source_row_number = payload.source_row_number if payload.source_row_number is not None else row.source_row_number
    row.import_reference = (payload.import_reference or "").strip() or row.import_reference
    row.golf_access = payload.golf_access if payload.golf_access is not None else row.golf_access
    row.tennis_access = payload.tennis_access if payload.tennis_access is not None else row.tennis_access
    row.bowls_access = payload.bowls_access if payload.bowls_access is not None else row.bowls_access
    row.squash_access = payload.squash_access if payload.squash_access is not None else row.squash_access
    row.gender = (payload.gender or "").strip() or None
    row.player_category = (payload.player_category or "").strip() or classify_membership_group(row.primary_operation or row.membership_category)
    row.student = payload.student
    row.handicap_index = float(payload.handicap_index) if payload.handicap_index is not None else None
    row.handicap_sa_id = (payload.handicap_sa_id or "").strip() or None
    if payload.active is not None:
        row.active = 1 if bool(payload.active) else 0
    sync_member_person(db, row, source_system="admin_member_upsert")

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        msg = str(getattr(exc, "orig", exc) or "")[:180]
        raise HTTPException(status_code=409, detail=f"Member update failed (duplicate?): {msg}")

    return {"status": "success"}


def get_member_detail_payload(db: Session, *, member_id: int) -> dict[str, Any]:
    member = db.query(Member).filter(Member.id == int(member_id)).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    linked_account = None
    email = (getattr(member, "email", None) or "").strip().lower()
    if email:
        acct = (
            db.query(User)
            .filter(func.lower(User.email) == email, User.role == UserRole.player)
            .first()
        )
        if acct:
            linked_account = {
                "id": acct.id,
                "name": acct.name,
                "email": acct.email,
                "handicap_sa_id": getattr(acct, "handicap_sa_id", None),
                "handicap_index": float(getattr(acct, "handicap_index", None)) if getattr(acct, "handicap_index", None) is not None else None,
            }

    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]
    stats = (
        db.query(
            func.count(Booking.id).label("bookings_count"),
            func.coalesce(
                func.sum(case((Booking.status.in_(paid_statuses), Booking.price), else_=0.0)),
                0.0,
            ).label("total_spent"),
            func.max(TeeTime.tee_time).label("last_seen"),
        )
        .outerjoin(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(Booking.member_id == member.id)
        .first()
    )

    bookings = (
        db.query(Booking)
        .options(selectinload(Booking.tee_time))
        .filter(Booking.member_id == member.id)
        .order_by(desc(Booking.created_at))
        .limit(15)
        .all()
    )

    return {
        "member": {
            "id": member.id,
            "member_number": member.member_number,
            "first_name": member.first_name,
            "last_name": member.last_name,
            "name": f"{member.first_name} {member.last_name}".strip(),
            "email": member.email,
            "phone": member.phone,
            "handicap_number": member.handicap_number,
            "handicap_sa_id": getattr(member, "handicap_sa_id", None),
            "handicap_index": float(getattr(member, "handicap_index", None)) if getattr(member, "handicap_index", None) is not None else None,
            "home_club": member.home_club,
            "country_of_residence": getattr(member, "country_of_residence", None),
            "membership_category": getattr(member, "membership_category", None),
            "membership_category_raw": getattr(member, "membership_category_raw", None),
            "primary_operation": normalize_primary_operation(getattr(member, "primary_operation", None), getattr(member, "membership_category", None)),
            "membership_group": classify_membership_group(getattr(member, "membership_category", None)),
            "membership_status": getattr(member, "membership_status", None),
            "member_lifecycle_status": getattr(member, "member_lifecycle_status", None),
            **_member_pricing_payload(member, db),
            "record_status": getattr(member, "record_status", None),
            "person_type": getattr(member, "person_type", None) or "Member",
            "membership_date": getattr(member, "membership_date", None).isoformat() if getattr(member, "membership_date", None) else None,
            "membership_expiration": getattr(member, "membership_expiration", None).isoformat() if getattr(member, "membership_expiration", None) else None,
            "gender": getattr(member, "gender", None),
            "player_category": getattr(member, "player_category", None),
            "student": bool(getattr(member, "student", False)) if getattr(member, "student", None) is not None else None,
            "source_file": getattr(member, "source_file", None),
            "source_row_number": getattr(member, "source_row_number", None),
            "import_reference": getattr(member, "import_reference", None),
            "golf_access": getattr(member, "golf_access", None),
            "tennis_access": getattr(member, "tennis_access", None),
            "bowls_access": getattr(member, "bowls_access", None),
            "squash_access": getattr(member, "squash_access", None),
            "active": bool(member.active),
        },
        "linked_account": linked_account,
        "stats": {
            "bookings_count": int(getattr(stats, "bookings_count", 0) or 0),
            "total_spent": float(getattr(stats, "total_spent", 0.0) or 0.0),
            "last_seen": getattr(stats, "last_seen", None).isoformat() if getattr(stats, "last_seen", None) else None,
        },
        "recent_bookings": [
            {
                "id": b.id,
                "tee_time": b.tee_time.tee_time.isoformat() if b.tee_time and b.tee_time.tee_time else None,
                "status": b.status,
                "holes": b.holes,
                "price": float(b.price or 0.0),
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in bookings
        ],
    }


def search_members_payload(db: Session, *, q: str, limit: int = 10) -> dict[str, Any]:
    needle = (q or "").strip().lower()
    if not needle:
        return {"members": []}

    like = f"%{needle}%"
    members = (
        db.query(Member)
        .filter(
            or_(
                func.lower(Member.first_name).like(like),
                func.lower(Member.last_name).like(like),
                func.lower(Member.email).like(like),
                func.lower(Member.member_number).like(like),
                func.lower(Member.phone).like(like),
                func.lower(Member.handicap_number).like(like),
            )
        )
        .order_by(desc(Member.active), Member.last_name, Member.first_name)
        .limit(max(1, min(limit, 25)))
        .all()
    )

    return {
        "members": [
            {
                "id": m.id,
                "member_number": m.member_number,
                "first_name": m.first_name,
                "last_name": m.last_name,
                "name": f"{m.first_name} {m.last_name}".strip(),
                "email": m.email,
                "phone": m.phone,
                "handicap_number": m.handicap_number,
                "home_club": m.home_club,
                "membership_category": getattr(m, "membership_category", None),
                "membership_status": getattr(m, "membership_status", None),
                "active": bool(m.active),
            }
            for m in members
        ]
    }
