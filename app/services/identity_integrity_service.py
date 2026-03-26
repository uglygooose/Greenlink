from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models
from app.services.operational_exceptions_service import (
    resolve_operational_exception,
    upsert_operational_exception,
)


def _clean_text(value: Any, *, max_len: int = 255) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if len(text) > max_len:
        text = text[:max_len]
    return text


def _clean_email(value: Any) -> str | None:
    raw = _clean_text(value, max_len=200)
    if not raw:
        return None
    lowered = raw.lower()
    return lowered if "@" in lowered else None


def _person_name(first_name: Any, last_name: Any) -> str:
    left = _clean_text(first_name, max_len=120) or ""
    right = _clean_text(last_name, max_len=120) or ""
    combined = f"{left} {right}".strip()
    return combined or "Unknown Person"


def _split_name(name: Any) -> tuple[str, str]:
    raw = _clean_text(name, max_len=240) or "Unknown Person"
    if " " not in raw:
        return raw, "Person"
    first, last = raw.split(" ", 1)
    return first.strip() or "Unknown", last.strip() or "Person"


def _json_text(value: Any) -> str | None:
    if value in (None, "", [], {}):
        return None
    try:
        return json.dumps(value, ensure_ascii=True, separators=(",", ":"), default=str)
    except Exception:
        return None


def _find_global_person_by_name_phone(
    db: Session,
    *,
    canonical_name: str,
    phone: str | None,
) -> list[models.GlobalPersonRecord]:
    query = db.query(models.GlobalPersonRecord).filter(
        func.lower(models.GlobalPersonRecord.canonical_name) == canonical_name.lower()
    )
    if phone:
        query = query.filter(
            or_(
                models.GlobalPersonRecord.phone == phone,
                models.GlobalPersonRecord.phone.is_(None),
            )
        )
    return query.order_by(models.GlobalPersonRecord.id.asc()).all()


def upsert_global_person(
    db: Session,
    *,
    first_name: Any,
    last_name: Any,
    email: Any = None,
    phone: Any = None,
    source_system: str | None = None,
    source_ref: str | None = None,
) -> tuple[models.GlobalPersonRecord, list[dict[str, Any]]]:
    canonical_name = _person_name(first_name, last_name)
    normalized_email = _clean_email(email)
    normalized_phone = _clean_text(phone, max_len=50)
    normalized_source = _clean_text(source_system, max_len=50)
    normalized_ref = _clean_text(source_ref, max_len=120)
    exceptions: list[dict[str, Any]] = []

    row = None
    if normalized_email:
        row = (
            db.query(models.GlobalPersonRecord)
            .filter(func.lower(models.GlobalPersonRecord.email) == normalized_email)
            .first()
        )
    candidate_rows: list[models.GlobalPersonRecord] = []
    if row is None:
        candidate_rows = _find_global_person_by_name_phone(
            db,
            canonical_name=canonical_name,
            phone=normalized_phone,
        )
        if len(candidate_rows) == 1:
            row = candidate_rows[0]
        elif len(candidate_rows) > 1:
            row = candidate_rows[0]
            exceptions.append(
                {
                    "exception_type": "duplicate_person_conflict",
                    "severity": "medium",
                    "blocking_surface": "identity_integrity",
                    "source_domain": "identity",
                    "summary": f"Multiple global person candidates match {canonical_name}.",
                    "next_required_action": "Review duplicate global person candidates before relying on identity automation.",
                    "details": {
                        "canonical_name": canonical_name,
                        "phone": normalized_phone,
                        "candidate_ids": [int(candidate.id) for candidate in candidate_rows],
                    },
                    "ai_suggestion": {
                        "suggested_action": "Review duplicate candidates",
                        "why": "Multiple global identities matched the same name/phone pattern.",
                        "evidence": [int(candidate.id) for candidate in candidate_rows],
                        "confidence": 0.62,
                    },
                }
            )

    if row is None:
        row = models.GlobalPersonRecord(
            canonical_name=canonical_name,
            first_name=_clean_text(first_name, max_len=120),
            last_name=_clean_text(last_name, max_len=120),
            email=normalized_email,
            phone=normalized_phone,
            provenance_json=_json_text({"source_system": normalized_source, "source_ref": normalized_ref}),
            dedupe_status="review" if exceptions else "trusted",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(row)
        db.flush()
        return row, exceptions

    row.canonical_name = canonical_name
    row.first_name = _clean_text(first_name, max_len=120) or row.first_name
    row.last_name = _clean_text(last_name, max_len=120) or row.last_name
    if normalized_email:
        row.email = normalized_email
    if normalized_phone:
        row.phone = normalized_phone
    row.dedupe_status = "review" if exceptions else "trusted"
    row.provenance_json = _json_text({"source_system": normalized_source, "source_ref": normalized_ref}) or row.provenance_json
    row.updated_at = datetime.utcnow()
    return row, exceptions


def upsert_club_relationship_state(
    db: Session,
    *,
    club_id: int,
    global_person_id: int,
    relationship_type: str,
    membership_type: str | None = None,
    pricing_group: str | None = None,
    status: str = "active",
    privileges: dict[str, Any] | None = None,
    booking_eligibility: str = "allowed",
    communication_eligibility: str = "allowed",
    revenue_linkage_state: str = "unlinked",
    source_system: str | None = None,
    source_ref: str | None = None,
) -> models.ClubRelationshipState:
    row = (
        db.query(models.ClubRelationshipState)
        .filter(
            models.ClubRelationshipState.club_id == int(club_id),
            models.ClubRelationshipState.global_person_id == int(global_person_id),
        )
        .first()
    )
    if row is None:
        row = models.ClubRelationshipState(
            club_id=int(club_id),
            global_person_id=int(global_person_id),
            relationship_type=_clean_text(relationship_type, max_len=40) or "visitor",
            membership_type=_clean_text(membership_type, max_len=160),
            pricing_group=_clean_text(pricing_group, max_len=80),
            status=_clean_text(status, max_len=40) or "active",
            privileges_json=_json_text(privileges),
            booking_eligibility=_clean_text(booking_eligibility, max_len=30) or "allowed",
            communication_eligibility=_clean_text(communication_eligibility, max_len=30) or "allowed",
            revenue_linkage_state=_clean_text(revenue_linkage_state, max_len=30) or "unlinked",
            source_system=_clean_text(source_system, max_len=50),
            source_ref=_clean_text(source_ref, max_len=120),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(row)
        db.flush()
        return row

    row.relationship_type = _clean_text(relationship_type, max_len=40) or row.relationship_type or "visitor"
    row.membership_type = _clean_text(membership_type, max_len=160) or row.membership_type
    row.pricing_group = _clean_text(pricing_group, max_len=80) or row.pricing_group
    row.status = _clean_text(status, max_len=40) or row.status or "active"
    row.privileges_json = _json_text(privileges) or row.privileges_json
    row.booking_eligibility = _clean_text(booking_eligibility, max_len=30) or row.booking_eligibility or "allowed"
    row.communication_eligibility = _clean_text(communication_eligibility, max_len=30) or row.communication_eligibility or "allowed"
    row.revenue_linkage_state = _clean_text(revenue_linkage_state, max_len=30) or row.revenue_linkage_state or "unlinked"
    row.source_system = _clean_text(source_system, max_len=50) or row.source_system
    row.source_ref = _clean_text(source_ref, max_len=120) or row.source_ref
    row.updated_at = datetime.utcnow()
    return row


def sync_member_identity(
    db: Session,
    member: models.Member,
    *,
    source_system: str,
) -> tuple[models.GlobalPersonRecord | None, models.ClubRelationshipState | None]:
    if member is None:
        return None, None
    club_id = int(getattr(member, "club_id", 0) or 0)
    if club_id <= 0:
        return None, None
    global_person, issues = upsert_global_person(
        db,
        first_name=getattr(member, "first_name", None),
        last_name=getattr(member, "last_name", None),
        email=getattr(member, "email", None),
        phone=getattr(member, "phone", None),
        source_system=source_system,
        source_ref=f"member:{int(getattr(member, 'id', 0) or 0)}" if getattr(member, "id", None) else None,
    )
    member.global_person_id = int(global_person.id)
    relationship = upsert_club_relationship_state(
        db,
        club_id=club_id,
        global_person_id=int(global_person.id),
        relationship_type="member",
        membership_type=_clean_text(getattr(member, "membership_category_raw", None) or getattr(member, "membership_category", None), max_len=160),
        pricing_group=_clean_text(getattr(member, "pricing_mode", None) or getattr(member, "player_category", None), max_len=80),
        status=_clean_text(getattr(member, "membership_status", None), max_len=40) or ("active" if int(getattr(member, "active", 0) or 0) == 1 else "inactive"),
        privileges={
            "golf_access": getattr(member, "golf_access", None),
            "tennis_access": getattr(member, "tennis_access", None),
            "bowls_access": getattr(member, "bowls_access", None),
            "squash_access": getattr(member, "squash_access", None),
        },
        booking_eligibility="allowed" if int(getattr(member, "active", 0) or 0) == 1 else "review_required",
        communication_eligibility="allowed" if _clean_email(getattr(member, "email", None)) or _clean_text(getattr(member, "phone", None), max_len=50) else "review_required",
        revenue_linkage_state="linked" if getattr(member, "member_number", None) else "review_required",
        source_system=source_system,
        source_ref=f"member:{int(getattr(member, 'id', 0) or 0)}" if getattr(member, "id", None) else None,
    )
    _sync_identity_issues(
        db,
        club_id=club_id,
        issues=issues,
        dedupe_prefix=f"member:{int(getattr(member, 'id', 0) or 0)}",
    )
    return global_person, relationship


def sync_user_identity(
    db: Session,
    user: models.User,
    *,
    source_system: str,
) -> tuple[models.GlobalPersonRecord | None, models.ClubRelationshipState | None]:
    if user is None:
        return None, None
    club_id = int(getattr(user, "club_id", 0) or 0)
    if club_id <= 0:
        return None, None
    first_name, last_name = _split_name(getattr(user, "name", None))
    global_person, issues = upsert_global_person(
        db,
        first_name=first_name,
        last_name=last_name,
        email=getattr(user, "email", None),
        phone=getattr(user, "phone", None),
        source_system=source_system,
        source_ref=f"user:{int(getattr(user, 'id', 0) or 0)}" if getattr(user, "id", None) else None,
    )
    user.global_person_id = int(global_person.id)
    role = str(getattr(getattr(user, "role", None), "value", getattr(user, "role", None)) or "").strip().lower()
    relationship_type = "staff-linked" if role in {"super_admin", "admin", "club_staff"} else ("member" if role == "player" and str(getattr(user, "account_type", "") or "").strip().lower() == "member" else "visitor")
    relationship = upsert_club_relationship_state(
        db,
        club_id=club_id,
        global_person_id=int(global_person.id),
        relationship_type=relationship_type,
        membership_type=_clean_text(getattr(user, "account_type", None), max_len=160),
        pricing_group=_clean_text(getattr(user, "player_category", None), max_len=80),
        status="active",
        privileges={"role": role},
        booking_eligibility="allowed",
        communication_eligibility="allowed" if _clean_email(getattr(user, "email", None)) else "review_required",
        revenue_linkage_state="review_required" if role == "player" else "linked",
        source_system=source_system,
        source_ref=f"user:{int(getattr(user, 'id', 0) or 0)}" if getattr(user, "id", None) else None,
    )
    _sync_identity_issues(
        db,
        club_id=club_id,
        issues=issues,
        dedupe_prefix=f"user:{int(getattr(user, 'id', 0) or 0)}",
    )
    return global_person, relationship


def resolve_booking_identity_context(
    db: Session,
    *,
    club_id: int,
    booking_id: int | None = None,
    player_name: str,
    player_email: str | None,
    member: models.Member | None,
    user: models.User | None,
    account_customer: models.AccountCustomer | None,
    player_type: str | None,
    source_system: str,
    source_ref: str | None = None,
) -> tuple[models.GlobalPersonRecord | None, models.ClubRelationshipState | None, list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    global_person = None
    relationship = None
    if member is not None:
        global_person, relationship = sync_member_identity(db, member, source_system=source_system)
    elif user is not None:
        global_person, relationship = sync_user_identity(db, user, source_system=source_system)
    else:
        first_name, last_name = _split_name(player_name)
        global_person, gp_issues = upsert_global_person(
            db,
            first_name=first_name,
            last_name=last_name,
            email=player_email,
            phone=None,
            source_system=source_system,
            source_ref=source_ref,
        )
        issues.extend(gp_issues)
        relationship_type = "affiliated" if str(player_type or "").strip().lower() in {"reciprocity", "visitor"} and player_email else "visitor"
        relationship = upsert_club_relationship_state(
            db,
            club_id=int(club_id),
            global_person_id=int(global_person.id),
            relationship_type=relationship_type,
            membership_type=None,
            pricing_group=_clean_text(player_type, max_len=80),
            status="active",
            privileges={},
            booking_eligibility="review_required" if not player_email and member is None else "allowed",
            communication_eligibility="allowed" if player_email else "review_required",
            revenue_linkage_state="linked" if account_customer is not None else "review_required",
            source_system=source_system,
            source_ref=source_ref,
        )
        if not player_email and member is None:
            issues.append(
                {
                    "exception_type": "identity_ambiguous_for_booking",
                    "severity": "medium",
                    "blocking_surface": "booking_commit",
                    "source_domain": "identity",
                    "summary": f"Booking for {player_name} has no trusted identity anchor.",
                    "next_required_action": "Add an email, member link, or confirmed relationship before relying on downstream automation.",
                    "details": {
                        "booking_id": int(booking_id or 0) or None,
                        "player_name": player_name,
                        "player_email": player_email,
                    },
                    "ai_suggestion": {
                        "suggested_action": "Capture a trusted identity anchor",
                        "why": "No member link or email was available for the booking.",
                        "evidence": [player_name],
                        "confidence": 0.88,
                    },
                }
            )
    _sync_identity_issues(
        db,
        club_id=int(club_id),
        issues=issues,
        dedupe_prefix=f"booking:{int(booking_id or 0) or source_ref or player_name}",
    )
    return global_person, relationship, issues


def emit_pricing_unresolved_exception(
    db: Session,
    *,
    club_id: int,
    dedupe_suffix: str,
    player_name: str,
    context: dict[str, Any],
) -> None:
    upsert_operational_exception(
        db,
        club_id=int(club_id),
        dedupe_key=f"pricing_context_unresolved:{dedupe_suffix}",
        exception_type="pricing_context_unresolved",
        severity="high",
        blocking_surface="revenue_integrity_close",
        source_domain="pricing",
        owner_role="admin",
        summary=f"Pricing context unresolved for {player_name}.",
        next_required_action="Review relationship, pricing group, or fee selection before relying on revenue integrity.",
        details=context,
        ai_suggestion={
            "suggested_action": "Review pricing context",
            "why": "GreenLink could not trust the pricing inputs for this booking.",
            "evidence": context,
            "confidence": 0.91,
        },
    )


def clear_pricing_unresolved_exception(db: Session, *, club_id: int, dedupe_suffix: str) -> None:
    resolve_operational_exception(
        db,
        club_id=int(club_id),
        dedupe_key=f"pricing_context_unresolved:{dedupe_suffix}",
        state="resolved",
    )


def clear_booking_integrity_exceptions(db: Session, *, club_id: int, booking_id: int) -> None:
    dedupe_suffix = f"booking:{int(booking_id)}"
    for prefix in (
        "pricing_context_unresolved",
        "communication_target_untrusted",
        "revenue_link_missing",
    ):
        resolve_operational_exception(
            db,
            club_id=int(club_id),
            dedupe_key=f"{prefix}:{dedupe_suffix}",
            state="resolved",
        )


def _booking_member(db: Session, booking: models.Booking) -> models.Member | None:
    member_id = int(getattr(booking, "member_id", 0) or 0)
    club_id = int(getattr(booking, "club_id", 0) or 0)
    if member_id > 0:
        return (
            db.query(models.Member)
            .filter(
                models.Member.id == member_id,
                models.Member.club_id == club_id,
            )
            .first()
        )
    email = _clean_email(getattr(booking, "player_email", None))
    if not email or club_id <= 0:
        return None
    return (
        db.query(models.Member)
        .filter(
            models.Member.club_id == club_id,
            models.Member.active == 1,
            func.lower(models.Member.email) == email,
        )
        .first()
    )


def _booking_user(db: Session, booking: models.Booking) -> models.User | None:
    email = _clean_email(getattr(booking, "player_email", None))
    club_id = int(getattr(booking, "club_id", 0) or 0)
    if not email or club_id <= 0:
        return None
    return (
        db.query(models.User)
        .filter(
            models.User.club_id == club_id,
            models.User.role == models.UserRole.player,
            func.lower(models.User.email) == email,
        )
        .first()
    )


def _booking_status_value(booking: models.Booking) -> str:
    raw = getattr(booking, "status", None)
    return str(getattr(raw, "value", raw) or "").strip().lower()


def sync_booking_integrity(
    db: Session,
    booking: models.Booking,
    *,
    source_system: str,
    source_ref: str | None = None,
) -> tuple[models.GlobalPersonRecord | None, models.ClubRelationshipState | None, list[dict[str, Any]]]:
    if booking is None:
        return None, None, []
    club_id = int(getattr(booking, "club_id", 0) or 0)
    if club_id <= 0:
        return None, None, []

    member = _booking_member(db, booking)
    user = None if member is not None else _booking_user(db, booking)
    account_customer_id = int(getattr(booking, "account_customer_id", 0) or 0)
    account_customer = None
    if account_customer_id > 0:
        account_customer = (
            db.query(models.AccountCustomer)
            .filter(
                models.AccountCustomer.id == account_customer_id,
                models.AccountCustomer.club_id == club_id,
            )
            .first()
        )

    dedupe_suffix = f"booking:{int(getattr(booking, 'id', 0) or 0) or source_ref or _clean_text(getattr(booking, 'player_name', None), max_len=40) or 'unknown'}"
    global_person, relationship, issues = resolve_booking_identity_context(
        db,
        club_id=club_id,
        booking_id=int(getattr(booking, "id", 0) or 0) or None,
        player_name=str(getattr(booking, "player_name", "") or "").strip() or "Unknown Player",
        player_email=_clean_email(getattr(booking, "player_email", None)),
        member=member,
        user=user,
        account_customer=account_customer,
        player_type=getattr(booking, "player_category", None),
        source_system=source_system,
        source_ref=source_ref or dedupe_suffix,
    )
    if global_person is not None:
        booking.global_person_id = int(global_person.id)
    if relationship is not None:
        booking.club_relationship_state_id = int(relationship.id)

    if relationship is not None and str(getattr(relationship, "communication_eligibility", "") or "").strip().lower() == "allowed":
        resolve_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"communication_target_untrusted:{dedupe_suffix}",
            state="resolved",
        )
    else:
        upsert_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"communication_target_untrusted:{dedupe_suffix}",
            exception_type="communication_target_untrusted",
            severity="medium",
            blocking_surface="communications_publish",
            source_domain="identity",
            owner_role="admin",
            summary=f"Communication target is untrusted for booking {int(getattr(booking, 'id', 0) or 0) or 'draft'}.",
            next_required_action="Capture or confirm a trusted player contact before sending targeted communications.",
            details={
                "booking_id": int(getattr(booking, "id", 0) or 0) or None,
                "player_name": str(getattr(booking, "player_name", "") or ""),
                "player_email": _clean_email(getattr(booking, "player_email", None)),
            },
            ai_suggestion={
                "suggested_action": "Review booking contact trust",
                "why": "GreenLink cannot trust the target contact for this player communication.",
                "evidence": [str(getattr(booking, "player_name", "") or "")],
                "confidence": 0.93,
            },
        )

    status_value = _booking_status_value(booking)
    if status_value in {"checked_in", "completed"} and (
        relationship is None or str(getattr(relationship, "revenue_linkage_state", "") or "").strip().lower() != "linked"
    ):
        upsert_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"revenue_link_missing:{dedupe_suffix}",
            exception_type="revenue_link_missing",
            severity="high",
            blocking_surface="revenue_integrity_close",
            source_domain="identity",
            owner_role="admin",
            summary=f"Revenue linkage is untrusted for booking {int(getattr(booking, 'id', 0) or 0) or 'draft'}.",
            next_required_action="Repair the member, relationship, or account linkage before close relies on this booking.",
            details={
                "booking_id": int(getattr(booking, "id", 0) or 0) or None,
                "status": status_value,
                "account_customer_id": account_customer_id or None,
                "global_person_id": int(getattr(global_person, "id", 0) or 0) or None,
            },
            ai_suggestion={
                "suggested_action": "Review revenue linkage",
                "why": "The booking reached a paid state without a trusted revenue linkage context.",
                "evidence": [int(getattr(booking, "id", 0) or 0) or None],
                "confidence": 0.92,
            },
        )
    else:
        resolve_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"revenue_link_missing:{dedupe_suffix}",
            state="resolved",
        )

    return global_person, relationship, issues


def _sync_identity_issues(
    db: Session,
    *,
    club_id: int,
    issues: list[dict[str, Any]],
    dedupe_prefix: str,
) -> None:
    for idx, issue in enumerate(issues):
        exception_type = _clean_text(issue.get("exception_type"), max_len=80) or "identity_issue"
        dedupe_key = f"{exception_type}:{dedupe_prefix}:{idx}"
        upsert_operational_exception(
            db,
            club_id=int(club_id),
            dedupe_key=dedupe_key,
            exception_type=exception_type,
            severity=str(issue.get("severity") or "medium"),
            blocking_surface=str(issue.get("blocking_surface") or "identity_integrity"),
            source_domain=str(issue.get("source_domain") or "identity"),
            owner_role="admin",
            summary=str(issue.get("summary") or "Identity integrity issue"),
            next_required_action=str(issue.get("next_required_action") or "Review identity integrity."),
            details=issue.get("details") or {},
            ai_suggestion=issue.get("ai_suggestion") or None,
        )
