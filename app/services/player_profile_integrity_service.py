from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models
from app.services.operational_exceptions_service import resolve_operational_exception, upsert_operational_exception


def _clean_text(value: Any, *, max_len: int = 255) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if len(text) > max_len:
        text = text[:max_len]
    return text


def _relationship_state(db: Session, user: models.User) -> models.ClubRelationshipState | None:
    club_id = int(getattr(user, "club_id", 0) or 0)
    global_person_id = int(getattr(user, "global_person_id", 0) or 0)
    if club_id <= 0 or global_person_id <= 0:
        return None
    return (
        db.query(models.ClubRelationshipState)
        .filter(
            models.ClubRelationshipState.club_id == club_id,
            models.ClubRelationshipState.global_person_id == global_person_id,
        )
        .first()
    )


def _upcoming_booking_count(db: Session, user: models.User, member: models.Member | None) -> int:
    club_id = int(getattr(user, "club_id", 0) or 0)
    user_id = int(getattr(user, "id", 0) or 0)
    if club_id <= 0 or user_id <= 0:
        return 0
    email = str(getattr(user, "email", "") or "").strip().lower()
    filters = [models.Booking.created_by_user_id == user_id]
    if email:
        filters.append(func.lower(func.coalesce(models.Booking.player_email, "")) == email)
    member_id = int(getattr(member, "id", 0) or 0) if member is not None else 0
    if member_id > 0:
        filters.append(models.Booking.member_id == member_id)
    return int(
        db.query(func.count(models.Booking.id))
        .join(models.TeeTime, models.TeeTime.id == models.Booking.tee_time_id)
        .filter(
            models.Booking.club_id == club_id,
            models.TeeTime.club_id == club_id,
            models.TeeTime.tee_time >= datetime.utcnow(),
            or_(*filters),
        )
        .scalar()
        or 0
    )


def build_player_profile_readiness_payload(
    db: Session,
    user: models.User,
    *,
    member: models.Member | None = None,
) -> dict[str, Any]:
    relationship = _relationship_state(db, user)
    upcoming_booking_count = _upcoming_booking_count(db, user, member)
    account_type = str(getattr(user, "account_type", "") or "").strip().lower()
    relationship_booking = str(getattr(relationship, "booking_eligibility", "") or "").strip().lower()
    relationship_comms = str(getattr(relationship, "communication_eligibility", "") or "").strip().lower()
    relationship_revenue = str(getattr(relationship, "revenue_linkage_state", "") or "").strip().lower()

    items = [
        {
            "key": "phone",
            "label": "Phone number",
            "ok": bool(str(getattr(user, "phone", "") or "").strip()),
            "state": "ready" if bool(str(getattr(user, "phone", "") or "").strip()) else "missing",
            "reason": None if bool(str(getattr(user, "phone", "") or "").strip()) else "Needed for direct club follow-up.",
            "next_action": None if bool(str(getattr(user, "phone", "") or "").strip()) else "Add a direct phone number the club can trust for follow-up.",
        },
        {
            "key": "birth_date",
            "label": "Birth date",
            "ok": bool(getattr(user, "birth_date", None)),
            "state": "ready" if bool(getattr(user, "birth_date", None)) else "missing",
            "reason": None if bool(getattr(user, "birth_date", None)) else "Needed for age-based eligibility and pricing checks.",
            "next_action": None if bool(getattr(user, "birth_date", None)) else "Add your birth date so the club does not need to verify age-based rules manually.",
        },
        {
            "key": "home_course",
            "label": "Home club",
            "ok": bool(str(getattr(user, "home_course", "") or "").strip()),
            "state": "ready" if bool(str(getattr(user, "home_course", "") or "").strip()) else "missing",
            "reason": None if bool(str(getattr(user, "home_course", "") or "").strip()) else "Needed for affiliation and visitor context.",
            "next_action": None if bool(str(getattr(user, "home_course", "") or "").strip()) else "Add your home club so booking and affiliation context do not fall back to manual review.",
        },
        {
            "key": "member_linkage",
            "label": "Member linkage",
            "ok": account_type != "member" or (member is not None and bool(str(getattr(member, "member_number", "") or "").strip()) and relationship_revenue == "linked"),
            "state": "ready" if account_type != "member" or (member is not None and bool(str(getattr(member, "member_number", "") or "").strip()) and relationship_revenue == "linked") else "blocked",
            "reason": None if account_type != "member" or (member is not None and bool(str(getattr(member, "member_number", "") or "").strip()) and relationship_revenue == "linked") else "You selected member status but GreenLink still cannot trust your member linkage.",
            "next_action": None if account_type != "member" or (member is not None and bool(str(getattr(member, "member_number", "") or "").strip()) and relationship_revenue == "linked") else "Confirm your member number so the club can trust pricing, privileges, and revenue linkage.",
        },
        {
            "key": "contact_trust",
            "label": "Communication trust",
            "ok": relationship_comms == "allowed",
            "state": "ready" if relationship_comms == "allowed" else "blocked",
            "reason": None if relationship_comms == "allowed" else "Targeted notices will stay blocked until your contact path is trusted.",
            "next_action": None if relationship_comms == "allowed" else "Complete the missing profile details the club needs before action-required notices can be trusted.",
        },
        {
            "key": "booking_readiness",
            "label": "Booking readiness",
            "ok": upcoming_booking_count <= 0 or relationship_booking == "allowed",
            "state": "ready" if upcoming_booking_count <= 0 or relationship_booking == "allowed" else "blocked",
            "reason": None if upcoming_booking_count <= 0 or relationship_booking == "allowed" else "Upcoming bookings still depend on review-required identity or rule state.",
            "next_action": None if upcoming_booking_count <= 0 or relationship_booking == "allowed" else "Resolve the blocked identity or rule context before relying on self-service for upcoming play.",
        },
    ]
    ready = sum(1 for item in items if bool(item["ok"]))
    next_actions = [str(item["next_action"] or item["reason"] or "") for item in items if not bool(item["ok"]) and str(item.get("next_action") or item.get("reason") or "").strip()]
    return {
        "status": "ready" if ready == len(items) else "review_required",
        "complete": ready,
        "total": len(items),
        "completion_pct": int(round((ready / len(items)) * 100)) if items else 100,
        "upcoming_booking_count": int(upcoming_booking_count),
        "relationship_type": str(getattr(relationship, "relationship_type", "") or "").strip().lower() or None,
        "booking_eligibility": relationship_booking or None,
        "communication_eligibility": relationship_comms or None,
        "revenue_linkage_state": relationship_revenue or None,
        "items": items,
        "next_actions": next_actions[:3],
    }


def sync_player_profile_exceptions(
    db: Session,
    user: models.User,
    *,
    member: models.Member | None = None,
    source_system: str,
) -> None:
    if user is None:
        return
    club_id = int(getattr(user, "club_id", 0) or 0)
    user_id = int(getattr(user, "id", 0) or 0)
    if club_id <= 0 or user_id <= 0:
        return

    relationship = _relationship_state(db, user)
    upcoming_booking_count = _upcoming_booking_count(db, user, member)
    account_type = str(getattr(user, "account_type", "") or "").strip().lower()
    relationship_booking = str(getattr(relationship, "booking_eligibility", "") or "").strip().lower()
    relationship_comms = str(getattr(relationship, "communication_eligibility", "") or "").strip().lower()
    relationship_revenue = str(getattr(relationship, "revenue_linkage_state", "") or "").strip().lower()

    if upcoming_booking_count > 0 and relationship_comms == "allowed":
        resolve_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"communication_target_untrusted:player_profile:{user_id}",
            state="resolved",
        )
    elif upcoming_booking_count > 0:
        upsert_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"communication_target_untrusted:player_profile:{user_id}",
            exception_type="communication_target_untrusted",
            severity="high",
            blocking_surface="communications_publish",
            source_domain="profile",
            owner_role="admin",
            summary=f"Player {user_id} cannot be trusted for targeted communications.",
            next_required_action="Capture or confirm trusted player contact details before sending action-required notices.",
            linked_record_refs=[
                {"entity_type": "user", "entity_id": user_id},
                {"entity_type": "member", "entity_id": int(getattr(member, 'id', 0) or 0) or None},
            ],
            details={
                "user_id": user_id,
                "account_type": account_type or None,
                "upcoming_booking_count": upcoming_booking_count,
                "communication_eligibility": relationship_comms or None,
                "source_system": _clean_text(source_system, max_len=80),
            },
            ai_suggestion={
                "suggested_action": "Repair player communication trust",
                "why": "Upcoming bookings depend on a trusted contact path.",
                "evidence": [user_id, upcoming_booking_count],
                "confidence": 0.92,
            },
        )

    readiness_reasons: list[str] = []
    if account_type == "member" and (member is None or not _clean_text(getattr(member, "member_number", None), max_len=60) or relationship_revenue != "linked"):
        readiness_reasons.append("member linkage is incomplete")
    if upcoming_booking_count > 0 and relationship_booking != "allowed":
        readiness_reasons.append("booking eligibility still requires review")
    if upcoming_booking_count > 0 and relationship_comms != "allowed":
        readiness_reasons.append("communication trust is unresolved")

    if readiness_reasons:
        upsert_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"profile_readiness_unresolved:user:{user_id}",
            exception_type="profile_readiness_unresolved",
            severity="high" if upcoming_booking_count > 0 else "medium",
            blocking_surface="player_profile_readiness",
            source_domain="profile",
            owner_role="admin",
            summary=f"Player profile readiness is incomplete for user {user_id}.",
            next_required_action="Repair player membership linkage or required profile fields before relying on self-service and operational messaging.",
            linked_record_refs=[
                {"entity_type": "user", "entity_id": user_id},
                {"entity_type": "member", "entity_id": int(getattr(member, 'id', 0) or 0) or None},
            ],
            details={
                "user_id": user_id,
                "member_id": int(getattr(member, "id", 0) or 0) or None,
                "account_type": account_type or None,
                "upcoming_booking_count": upcoming_booking_count,
                "booking_eligibility": relationship_booking or None,
                "communication_eligibility": relationship_comms or None,
                "revenue_linkage_state": relationship_revenue or None,
                "reasons": readiness_reasons,
                "source_system": _clean_text(source_system, max_len=80),
            },
            ai_suggestion={
                "suggested_action": "Repair player profile readiness",
                "why": "Upcoming operations or member-state assumptions still depend on unresolved identity data.",
                "evidence": readiness_reasons,
                "confidence": 0.94,
            },
        )
    else:
        resolve_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"profile_readiness_unresolved:user:{user_id}",
            state="resolved",
        )
