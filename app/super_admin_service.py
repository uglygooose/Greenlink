from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.auth import get_password_hash
from app.club_assignments import sync_user_club_assignment
from app.club_config import club_config_response, invalidate_club_config_cache
from app.club_ops import module_catalog, operational_targets_for_club, target_catalog, upsert_club_modules, upsert_operational_targets
from app.club_setup_service import apply_club_profile_settings, ensure_club, ensure_staff_user
from app.fee_models import FeeCategory
from app.models import (
    AccountingSetting,
    AuditLog,
    Booking,
    BookingSource,
    BookingStatus,
    Club,
    ClubCommunication,
    ClubOperationalTarget,
    ClubSetting,
    GolfDayBooking,
    ImportBatch,
    KpiTarget,
    LedgerEntry,
    Member,
    PlayerNotification,
    ProShopProduct,
    ProShopSale,
    ProShopSaleItem,
    RevenueTransaction,
    TeeTime,
    User,
    UserRole,
)
from app.people import sync_member_person, sync_user_person
from app.platform_bootstrap import apply_reference_pricing_template


CLUB_STATUS_VALUES = {"draft", "onboarding", "live", "inactive", "demo"}
DEMO_CLUB_NAME = "Harbour Point Demo Club"
DEMO_CLUB_SLUG = "harbour-point-demo"
DEMO_SETTINGS = {
    "club_status": "demo",
    "club_is_demo": "1",
    "club_name": DEMO_CLUB_NAME,
    "club_slug": DEMO_CLUB_SLUG,
    "club_display_name": "Harbour Point Country Club",
    "club_tagline": "Premium multi-sport operations demo powered by GreenLink.",
    "club_location": "Ballito, KwaZulu-Natal",
    "club_contact_email": "demo@harbourpoint.club",
    "club_contact_phone": "+27 32 555 0188",
    "club_website": "https://demo.harbourpoint.club",
    "club_brand_primary": "#0f4c3a",
    "club_brand_secondary": "#153a62",
    "club_brand_accent": "#d7a33d",
    "club_brand_surface": "#f6f3eb",
    "club_brand_text": "#13231a",
    "club_hero_image_url": "/frontend/assets/grass.jpg",
    "club_logo_url": "/frontend/assets/logo.png",
    "club_address_line_1": "18 Fairway Drive",
    "club_address_line_2": "Harbour Point Estate",
    "club_city": "Ballito",
    "club_region": "KwaZulu-Natal",
    "club_postal_code": "4420",
    "club_country": "South Africa",
}
DEMO_PERSONAS = {
    "super_admin": {
        "name": "GreenLink Demo Super Admin",
        "email": "demo.super@greenlink.club",
        "password": "DemoSuper123!",
        "role": UserRole.super_admin,
    },
    "club_admin": {
        "name": "Harbour Point Club Admin",
        "email": "demo.admin@harbourpoint.club",
        "password": "DemoAdmin123!",
        "role": UserRole.admin,
    },
    "staff_operator": {
        "name": "Harbour Point Duty Manager",
        "email": "demo.staff@harbourpoint.club",
        "password": "DemoStaff123!",
        "role": UserRole.club_staff,
    },
    "member_player": {
        "name": "Jordan Fairway",
        "email": "demo.member@harbourpoint.club",
        "password": "DemoMember123!",
        "role": UserRole.player,
    },
}
PRICING_TEMPLATE_CATALOG = [
    {
        "key": "country_club_standard",
        "label": "Country Club Standard",
        "description": "Balanced golf pricing defaults for a live country-club launch.",
    },
    {
        "key": "multi_club_demo",
        "label": "Multi-Club Demo",
        "description": "Demo-ready pricing defaults with broad multi-sport coverage.",
    },
]


def _json_loads(raw: str | None, default: Any) -> Any:
    text = str(raw or "").strip()
    if not text:
        return default
    try:
        return json.loads(text)
    except Exception:
        return default


def _settings_map(db: Session, club_id: int) -> dict[str, str]:
    rows = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id)).all()
    return {
        str(row.key or "").strip(): str(row.value or "").strip()
        for row in rows
        if str(row.key or "").strip()
    }


def _upsert_setting(db: Session, club_id: int, key: str, value: str | None) -> None:
    row = (
        db.query(ClubSetting)
        .filter(ClubSetting.club_id == int(club_id), ClubSetting.key == str(key))
        .first()
    )
    if row is None:
        db.add(ClubSetting(club_id=int(club_id), key=str(key), value=value))
        return
    row.value = value
    row.updated_at = datetime.utcnow()


def _upsert_settings(db: Session, club_id: int, values: dict[str, Any]) -> None:
    for key, raw in values.items():
        value = None if raw is None else str(raw).strip() or None
        _upsert_setting(db, int(club_id), str(key), value)
    invalidate_club_config_cache(int(club_id))


def normalize_club_status(raw: str | None) -> str | None:
    value = str(raw or "").strip().lower()
    return value if value in CLUB_STATUS_VALUES else None


def demo_persona_metadata() -> list[dict[str, Any]]:
    return [
        {
            "role_type": key,
            "label": value["name"],
            "email": value["email"],
            "password": value["password"],
        }
        for key, value in DEMO_PERSONAS.items()
    ]


def club_status_for(club: Club, readiness: dict[str, Any] | None = None, settings: dict[str, str] | None = None) -> str:
    if int(getattr(club, "active", 0) or 0) != 1:
        return "inactive"
    settings = settings or {}
    explicit = normalize_club_status(settings.get("club_status"))
    if explicit == "inactive":
        return "inactive"
    is_demo = str(settings.get("club_is_demo", "")).strip().lower() in {"1", "true", "yes", "y", "on"}
    if explicit == "demo" or is_demo or "demo" in str(getattr(club, "slug", "") or "").lower():
        return "demo"
    if explicit in {"draft", "onboarding", "live"}:
        return explicit
    readiness = readiness or {}
    score = int(readiness.get("score") or 0)
    if score >= 100:
        return "live"
    if score <= 20:
        return "draft"
    return "onboarding"


def club_readiness_payload(db: Session, club: Club) -> dict[str, Any]:
    club_id = int(getattr(club, "id", 0) or 0)
    settings = _settings_map(db, club_id)
    config = club_config_response(db, club_id=club_id)
    modules = list(config.get("modules") or [])
    enabled_modules = [row for row in modules if bool(row.get("enabled"))]
    logo_url = str(config.get("logo_url") or "").strip()
    branding = dict(config.get("branding") or {})
    details = dict(config.get("details") or {})

    admin_count = int(
        db.query(func.count(User.id))
        .filter(User.club_id == club_id, User.role == UserRole.admin)
        .scalar()
        or 0
    )
    staff_count = int(
        db.query(func.count(User.id))
        .filter(User.club_id == club_id, User.role == UserRole.club_staff)
        .scalar()
        or 0
    )
    member_count = int(
        db.query(func.count(Member.id))
        .filter(Member.club_id == club_id, Member.active == 1)
        .scalar()
        or 0
    )
    fee_count = int(
        db.query(func.count(FeeCategory.id))
        .filter(
            FeeCategory.active == 1,
            or_(FeeCategory.club_id == club_id, FeeCategory.club_id.is_(None)),
        )
        .scalar()
        or 0
    )
    annual_target_count = int(
        db.query(func.count(KpiTarget.id))
        .filter(KpiTarget.club_id == club_id)
        .scalar()
        or 0
    )
    operational_target_count = int(
        db.query(func.count(ClubOperationalTarget.id))
        .filter(ClubOperationalTarget.club_id == club_id)
        .scalar()
        or 0
    )
    communication_count = int(
        db.query(func.count(ClubCommunication.id))
        .filter(
            ClubCommunication.club_id == club_id,
            ClubCommunication.status == "published",
        )
        .scalar()
        or 0
    )
    import_count = int(
        db.query(func.count(ImportBatch.id))
        .filter(ImportBatch.club_id == club_id)
        .scalar()
        or 0
    )
    upcoming_bookings = int(
        db.query(func.count(Booking.id))
        .join(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(Booking.club_id == club_id, TeeTime.tee_time >= datetime.utcnow())
        .scalar()
        or 0
    )
    accounting = db.query(AccountingSetting).filter(AccountingSetting.club_id == club_id).first()
    finance_ready = bool(
        accounting
        and str(getattr(accounting, "green_fees_gl", "") or "").strip()
        and str(getattr(accounting, "cashbook_contra_gl", "") or "").strip()
    )
    branding_ready = bool(
        logo_url
        and branding.get("primary")
        and branding.get("secondary")
        and (details.get("location") or settings.get("club_address_line_1"))
    )
    checks = [
        {
            "key": "basics",
            "label": "Club Basics",
            "ready": bool(str(getattr(club, "name", "") or "").strip() and str(getattr(club, "slug", "") or "").strip()),
            "hint": "Complete club name, slug, and contact basics.",
        },
        {
            "key": "branding",
            "label": "Branding",
            "ready": branding_ready,
            "hint": "Add logo, display identity, and brand palette.",
        },
        {
            "key": "operations",
            "label": "Operations",
            "ready": bool(enabled_modules),
            "hint": "Enable at least one operating module and tee-sheet setup.",
        },
        {
            "key": "pricing",
            "label": "Pricing",
            "ready": fee_count > 0,
            "hint": "Load pricing rules for members and visitors.",
        },
        {
            "key": "targets",
            "label": "Pricing & Targets",
            "ready": annual_target_count > 0 or operational_target_count > 0,
            "hint": "Set annual and operation-specific targets.",
        },
        {
            "key": "access",
            "label": "Access & Roles",
            "ready": admin_count > 0,
            "hint": "Assign the first club admin and initial operators.",
        },
        {
            "key": "communications",
            "label": "Communications",
            "ready": communication_count > 0,
            "hint": "Publish at least one member-facing communication.",
        },
        {
            "key": "finance",
            "label": "Finance",
            "ready": finance_ready,
            "hint": "Complete finance mappings and export settings.",
        },
    ]
    completed = sum(1 for row in checks if bool(row["ready"]))
    total = len(checks)
    missing = [row["hint"] for row in checks if not bool(row["ready"])]
    score = int(round((completed / total) * 100)) if total else 0
    readiness_status = "ready" if completed == total else ("needs_attention" if completed >= 4 else "setup_required")
    status = club_status_for(club, {"score": score}, settings=settings)
    next_step = next((row["label"] for row in checks if not bool(row["ready"])), "Launch Checklist")

    return {
        "club_id": club_id,
        "club_name": str(getattr(club, "name", "") or "").strip() or f"Club {club_id}",
        "club_slug": str(getattr(club, "slug", "") or "").strip() or None,
        "status": status,
        "readiness_status": readiness_status,
        "score": score,
        "checks": {row["key"]: bool(row["ready"]) for row in checks},
        "checklist": checks,
        "next_step": next_step,
        "missing": missing[:5],
        "counts": {
            "admins": admin_count,
            "staff": staff_count,
            "members": member_count,
            "fees": fee_count,
            "annual_targets": annual_target_count,
            "operational_targets": operational_target_count,
            "communications": communication_count,
            "imports": import_count,
            "upcoming_bookings": upcoming_bookings,
            "enabled_modules": len(enabled_modules),
        },
        "modules": [
            {
                "key": str(row.get("key") or ""),
                "label": str(row.get("label") or ""),
                "enabled": bool(row.get("enabled")),
            }
            for row in modules
        ],
        "is_demo": status == "demo",
    }


def _staff_rows_for_club(db: Session, club_id: int) -> list[dict[str, Any]]:
    rows = (
        db.query(User)
        .filter(User.club_id == int(club_id), User.role.in_([UserRole.admin, UserRole.club_staff]))
        .order_by(User.role.asc(), func.lower(User.name).asc(), User.id.asc())
        .all()
    )
    return [
        {
            "id": int(row.id),
            "name": str(getattr(row, "name", "") or "").strip(),
            "email": str(getattr(row, "email", "") or "").strip().lower(),
            "role": str(getattr(getattr(row, "role", None), "value", getattr(row, "role", None)) or ""),
        }
        for row in rows
    ]


def _communication_rows_for_club(db: Session, club_id: int, limit: int = 8) -> list[dict[str, Any]]:
    rows = (
        db.query(ClubCommunication)
        .filter(ClubCommunication.club_id == int(club_id))
        .order_by(ClubCommunication.pinned.desc(), ClubCommunication.published_at.desc(), ClubCommunication.created_at.desc())
        .limit(int(limit))
        .all()
    )
    return [
        {
            "id": int(row.id),
            "kind": str(getattr(row, "kind", "") or ""),
            "audience": str(getattr(row, "audience", "") or ""),
            "status": str(getattr(row, "status", "") or ""),
            "title": str(getattr(row, "title", "") or ""),
            "summary": str(getattr(row, "summary", "") or ""),
            "pinned": bool(getattr(row, "pinned", False)),
            "published_at": getattr(row, "published_at", None).isoformat() if getattr(row, "published_at", None) else None,
            "cta_label": str(getattr(row, "cta_label", "") or "").strip() or None,
            "cta_url": str(getattr(row, "cta_url", "") or "").strip() or None,
        }
        for row in rows
    ]


def _activity_rows_for_club(db: Session, club_id: int, limit: int = 12) -> list[dict[str, Any]]:
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.club_id == int(club_id))
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(int(limit))
        .all()
    )
    return [
        {
            "id": int(row.id),
            "action": str(getattr(row, "action", "") or ""),
            "entity_type": str(getattr(row, "entity_type", "") or ""),
            "entity_id": str(getattr(row, "entity_id", "") or ""),
            "created_at": getattr(row, "created_at", None).isoformat() if getattr(row, "created_at", None) else None,
        }
        for row in rows
    ]


def _annual_targets_for_club(db: Session, club_id: int) -> list[dict[str, Any]]:
    rows = (
        db.query(KpiTarget)
        .filter(KpiTarget.club_id == int(club_id))
        .order_by(KpiTarget.year.desc(), KpiTarget.metric.asc())
        .all()
    )
    return [
        {
            "year": int(getattr(row, "year", 0) or 0),
            "metric": str(getattr(row, "metric", "") or ""),
            "annual_target": float(getattr(row, "annual_target", 0.0) or 0.0),
        }
        for row in rows
    ]


def build_club_workspace_payload(db: Session, club_id: int) -> dict[str, Any]:
    club = db.query(Club).filter(Club.id == int(club_id)).first()
    if club is None:
        raise ValueError("Club not found")
    config = club_config_response(db, club_id=int(club_id))
    readiness = club_readiness_payload(db, club)
    current_year = max(datetime.utcnow().year, 2026)

    return {
        "club": {
            "id": int(club.id),
            "name": str(getattr(club, "name", "") or "").strip(),
            "slug": str(getattr(club, "slug", "") or "").strip() or None,
            "active": bool(int(getattr(club, "active", 0) or 0) == 1),
            "status": readiness["status"],
            "is_demo": bool(readiness["is_demo"]),
            "created_at": getattr(club, "created_at", None).isoformat() if getattr(club, "created_at", None) else None,
        },
        "profile": config,
        "readiness": readiness,
        "staff": _staff_rows_for_club(db, int(club_id)),
        "communications": _communication_rows_for_club(db, int(club_id), limit=10),
        "activity": _activity_rows_for_club(db, int(club_id), limit=12),
        "annual_targets": _annual_targets_for_club(db, int(club_id)),
        "operational_targets": operational_targets_for_club(db, int(club_id), int(current_year)),
        "metrics": {
            "members": readiness["counts"]["members"],
            "bookings_upcoming": readiness["counts"]["upcoming_bookings"],
            "communications_published": readiness["counts"]["communications"],
            "enabled_modules": readiness["counts"]["enabled_modules"],
        },
    }


def build_command_center_payload(db: Session) -> dict[str, Any]:
    clubs = db.query(Club).order_by(Club.active.desc(), Club.name.asc(), Club.id.asc()).all()
    club_rows: list[dict[str, Any]] = []
    for club in clubs:
        readiness = club_readiness_payload(db, club)
        club_rows.append(
            {
                "id": int(club.id),
                "name": str(getattr(club, "name", "") or "").strip(),
                "slug": str(getattr(club, "slug", "") or "").strip() or None,
                "active": bool(int(getattr(club, "active", 0) or 0) == 1),
                "status": readiness["status"],
                "readiness_status": readiness["readiness_status"],
                "score": int(readiness["score"]),
                "next_step": str(readiness["next_step"]),
                "missing": list(readiness["missing"]),
                "modules": [row["label"] for row in readiness["modules"] if bool(row.get("enabled"))],
                "counts": dict(readiness["counts"]),
                "is_demo": bool(readiness["is_demo"]),
            }
        )

    active = [row for row in club_rows if row["active"]]
    live = [row for row in club_rows if row["status"] == "live"]
    onboarding = [row for row in club_rows if row["status"] in {"draft", "onboarding"}]
    demo = next((row for row in club_rows if row["is_demo"]), None)
    inactive = [row for row in club_rows if row["status"] == "inactive"]
    needs_action = sorted(
        [row for row in club_rows if row["status"] != "inactive" and row["score"] < 100 and not row["is_demo"]],
        key=lambda row: (int(row["score"]), str(row["name"]).lower()),
    )
    setup_issues = []
    for row in needs_action[:8]:
        missing = list(row.get("missing") or [])
        issue = missing[0] if missing else row["next_step"]
        setup_issues.append(
            {
                "club_id": int(row["id"]),
                "club_name": str(row["name"]),
                "next_step": str(row["next_step"]),
                "issue": str(issue),
                "status": str(row["status"]),
            }
        )

    return {
        "summary": {
            "total_clubs": len(club_rows),
            "active_clubs": len(active),
            "live_clubs": len(live),
            "onboarding_clubs": len(onboarding),
            "inactive_clubs": len(inactive),
            "needs_action": len(needs_action),
        },
        "clubs": club_rows,
        "needs_action": setup_issues,
        "demo_environment": {
            "available": demo is not None,
            "club_id": int(demo["id"]) if demo else None,
            "club_name": str(demo["name"]) if demo else None,
            "club_slug": str(demo["slug"]) if demo else None,
            "status": str(demo["status"]) if demo else "missing",
            "personas": demo_persona_metadata(),
        },
        "catalog": {
            "modules": module_catalog(),
            "targets": target_catalog(),
            "pricing_templates": PRICING_TEMPLATE_CATALOG,
        },
    }


def _ensure_accounting(db: Session, club_id: int) -> None:
    row = db.query(AccountingSetting).filter(AccountingSetting.club_id == int(club_id)).first()
    if row is None:
        db.add(AccountingSetting(club_id=int(club_id)))


def _ensure_communication(
    db: Session,
    club_id: int,
    *,
    kind: str,
    title: str,
    summary: str,
    body: str,
    audience: str = "members",
    pinned: bool = False,
    cta_label: str | None = None,
    cta_url: str | None = None,
) -> None:
    existing = (
        db.query(ClubCommunication)
        .filter(ClubCommunication.club_id == int(club_id), func.lower(ClubCommunication.title) == title.strip().lower())
        .first()
    )
    now = datetime.utcnow()
    if existing is None:
        db.add(
            ClubCommunication(
                club_id=int(club_id),
                kind=str(kind),
                audience=str(audience),
                status="published",
                title=str(title),
                summary=str(summary),
                body=str(body),
                pinned=bool(pinned),
                cta_label=cta_label,
                cta_url=cta_url,
                published_at=now,
            )
        )
        return
    existing.kind = str(kind)
    existing.audience = str(audience)
    existing.status = "published"
    existing.summary = str(summary)
    existing.body = str(body)
    existing.pinned = bool(pinned)
    existing.cta_label = cta_label
    existing.cta_url = cta_url
    existing.published_at = existing.published_at or now
    existing.updated_at = now


def _ensure_demo_player(db: Session, club_id: int) -> tuple[User, Member]:
    persona = DEMO_PERSONAS["member_player"]
    email = persona["email"]
    user = db.query(User).filter(func.lower(User.email) == email.lower()).first()
    if user is None:
        user = User(
            name=str(persona["name"]),
            email=str(email),
            password=get_password_hash(str(persona["password"])),
            role=UserRole.player,
            club_id=int(club_id),
            account_type="member",
            home_course="Harbour Point Country Club",
            handicap_sa_id="HPC-44028",
            handicap_number="44028",
            handicap_index=12.4,
            phone="+27 82 555 0101",
        )
        db.add(user)
        db.flush()
    else:
        user.name = str(persona["name"])
        user.password = get_password_hash(str(persona["password"]))
        user.role = UserRole.player
        user.club_id = int(club_id)
        user.account_type = "member"
        user.home_course = "Harbour Point Country Club"
        user.handicap_sa_id = "HPC-44028"
        user.handicap_number = "44028"
        user.handicap_index = 12.4
        user.phone = "+27 82 555 0101"
    sync_user_club_assignment(db, user, club_id=int(club_id), role=UserRole.player, is_primary=True)
    sync_user_person(db, user, source_system="demo_seed")

    member = (
        db.query(Member)
        .filter(Member.club_id == int(club_id), func.lower(Member.email) == email.lower())
        .first()
    )
    if member is None:
        member = Member(
            club_id=int(club_id),
            first_name="Jordan",
            last_name="Fairway",
            email=str(email),
            member_number="HP-1008",
            active=1,
        )
        db.add(member)
    member.phone = user.phone
    member.handicap_number = user.handicap_number
    member.handicap_sa_id = user.handicap_sa_id
    member.handicap_index = user.handicap_index
    member.home_club = "Harbour Point Country Club"
    member.membership_status = "active"
    member.membership_category = "Full Golf Member"
    member.primary_operation = "golf"
    member.golf_access = True
    member.tennis_access = True
    member.bowls_access = True
    sync_member_person(db, member, source_system="demo_seed")
    db.flush()
    return user, member


def _ensure_demo_staff(db: Session, club_id: int) -> None:
    for key in ("club_admin", "staff_operator"):
        persona = DEMO_PERSONAS[key]
        ensure_staff_user(
            db,
            club_id=int(club_id),
            name=str(persona["name"]),
            email=str(persona["email"]),
            password=str(persona["password"]),
            role=persona["role"],
            force_reset=True,
        )

    persona = DEMO_PERSONAS["super_admin"]
    email = str(persona["email"]).strip().lower()
    existing = db.query(User).filter(func.lower(User.email) == email).first()
    if existing is None:
        existing = User(
            name=str(persona["name"]),
            email=email,
            password=get_password_hash(str(persona["password"])),
            role=UserRole.super_admin,
            club_id=None,
        )
        db.add(existing)
        db.flush()
    else:
        existing.name = str(persona["name"])
        existing.password = get_password_hash(str(persona["password"]))
        existing.role = UserRole.super_admin
        existing.club_id = None


def _ensure_demo_bookings(db: Session, club_id: int, member: Member, player_user: User) -> None:
    base_day = datetime.utcnow().replace(hour=7, minute=0, second=0, microsecond=0)
    tee_specs = [
        (-14, 7, "completed"),
        (-2, 8, "checked_in"),
        (0, 10, "booked"),
        (2, 9, "booked"),
        (7, 11, "booked"),
    ]
    for day_offset, hour, status_name in tee_specs:
        tee_dt = base_day + timedelta(days=day_offset)
        tee_dt = tee_dt.replace(hour=int(hour), minute=12 if hour % 2 else 36)
        tee = (
            db.query(TeeTime)
            .filter(TeeTime.club_id == int(club_id), TeeTime.tee_time == tee_dt)
            .first()
        )
        if tee is None:
            tee = TeeTime(
                club_id=int(club_id),
                tee_time=tee_dt,
                hole="1",
                capacity=4,
                status="open",
                available_from=tee_dt - timedelta(days=21),
                bookable_until=tee_dt - timedelta(hours=3),
            )
            db.add(tee)
            db.flush()

        booking = (
            db.query(Booking)
            .filter(Booking.club_id == int(club_id), Booking.tee_time_id == int(tee.id), func.lower(Booking.player_email) == str(player_user.email).lower())
            .first()
        )
        resolved_status = getattr(BookingStatus, str(status_name))
        if booking is None:
            booking = Booking(
                club_id=int(club_id),
                tee_time_id=int(tee.id),
                member_id=int(member.id),
                created_by_user_id=int(player_user.id),
                player_name=str(player_user.name),
                player_email=str(player_user.email).lower(),
                handicap_number=str(player_user.handicap_number),
                greenlink_id=str(getattr(player_user, "greenlink_id", "") or "") or None,
                source=BookingSource.member,
                party_size=1,
                price=440.0 if hour < 10 else 575.0,
                status=resolved_status,
                player_type="member" if day_offset != 7 else "visitor",
                holes=18,
                prepaid=day_offset < 1,
                home_club="Harbour Point Country Club",
                handicap_sa_id=str(player_user.handicap_sa_id),
                handicap_index_at_booking=float(player_user.handicap_index or 12.4),
                notes="Demo booking seeded for platform walkthrough.",
            )
            db.add(booking)
            db.flush()
        else:
            booking.status = resolved_status
            booking.member_id = int(member.id)
            booking.created_by_user_id = int(player_user.id)
            booking.price = booking.price or (440.0 if hour < 10 else 575.0)

        if status_name in {"checked_in", "completed"}:
            ledger = db.query(LedgerEntry).filter(LedgerEntry.booking_id == int(booking.id)).first()
            if ledger is None:
                db.add(
                    LedgerEntry(
                        club_id=int(club_id),
                        booking_id=int(booking.id),
                        description=f"Demo green fee - {booking.player_name}",
                        amount=float(booking.price or 0.0),
                    )
                )


def _ensure_demo_ops_rows(db: Session, club_id: int) -> None:
    product = (
        db.query(ProShopProduct)
        .filter(ProShopProduct.club_id == int(club_id), func.lower(ProShopProduct.sku) == "demo-001")
        .first()
    )
    if product is None:
        product = ProShopProduct(
            club_id=int(club_id),
            sku="DEMO-001",
            name="Titleist Tour Sleeve",
            category="Balls",
            unit_price=210.0,
            cost_price=145.0,
            stock_qty=32,
            reorder_level=10,
            active=1,
        )
        db.add(product)
        db.flush()

    sale = (
        db.query(ProShopSale)
        .filter(ProShopSale.club_id == int(club_id), ProShopSale.customer_name == "Jordan Fairway")
        .first()
    )
    if sale is None:
        sale = ProShopSale(
            club_id=int(club_id),
            customer_name="Jordan Fairway",
            payment_method="card",
            subtotal=210.0,
            discount=0.0,
            tax=27.39,
            total=210.0,
            sold_at=datetime.utcnow() - timedelta(days=1),
        )
        db.add(sale)
        db.flush()
        db.add(
            ProShopSaleItem(
                club_id=int(club_id),
                sale_id=int(sale.id),
                product_id=int(product.id),
                sku_snapshot=str(product.sku),
                name_snapshot=str(product.name),
                category_snapshot=str(product.category),
                quantity=1,
                unit_price=float(product.unit_price or 0.0),
                line_total=float(product.unit_price or 0.0),
            )
        )

    revenue_exists = db.query(RevenueTransaction.id).filter(RevenueTransaction.club_id == int(club_id)).first()
    if not revenue_exists:
        for idx, stream in enumerate(("golf", "pro_shop", "pub", "bowls"), start=1):
            db.add(
                RevenueTransaction(
                    club_id=int(club_id),
                    source=stream,
                    transaction_date=date.today() - timedelta(days=idx),
                    external_id=f"DEMO-{stream}-{idx}",
                    description=f"Demo {stream.replace('_', ' ')} revenue",
                    category=stream,
                    amount=1500.0 + (idx * 275.0),
                )
            )

    golf_day = (
        db.query(GolfDayBooking)
        .filter(GolfDayBooking.club_id == int(club_id), GolfDayBooking.event_name == "Harbour Point Corporate Invitational")
        .first()
    )
    if golf_day is None:
        db.add(
            GolfDayBooking(
                club_id=int(club_id),
                event_name="Harbour Point Corporate Invitational",
                event_date=date.today() + timedelta(days=18),
                event_end_date=date.today() + timedelta(days=18),
                amount=28500.0,
                deposit_amount=12500.0,
                payment_status="partial",
                contact_name="Alicia Morgan",
                operation_area="golf_days",
                notes="Demo pipeline event for sales walkthroughs.",
            )
        )


def _ensure_demo_notifications(db: Session, club_id: int, player_user: User) -> None:
    booking = (
        db.query(Booking)
        .join(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(Booking.club_id == int(club_id), func.lower(Booking.player_email) == str(player_user.email).lower(), TeeTime.tee_time >= datetime.utcnow())
        .order_by(TeeTime.tee_time.asc())
        .first()
    )
    if booking is None:
        return

    topic_key = f"demo-weather-{int(booking.id)}"
    existing = (
        db.query(PlayerNotification)
        .filter(PlayerNotification.club_id == int(club_id), PlayerNotification.user_id == int(player_user.id), PlayerNotification.topic_key == topic_key)
        .first()
    )
    if existing is not None:
        return
    db.add(
        PlayerNotification(
            club_id=int(club_id),
            user_id=int(player_user.id),
            booking_id=int(booking.id),
            tee_time_id=int(booking.tee_time_id),
            kind="weather_reconfirm",
            topic_key=topic_key,
            title="Weather reconfirmation",
            body="Wind is forecast for your next tee time. Confirm play, request cancellation, or ask for a callback.",
            payload_json=json.dumps({"severity": "medium"}, ensure_ascii=True),
            status="unread",
            requires_action=True,
        )
    )


def ensure_demo_environment(db: Session) -> dict[str, Any]:
    club, _created = ensure_club(
        db,
        name=DEMO_CLUB_NAME,
        slug=DEMO_CLUB_SLUG,
        active=True,
    )
    club_id = int(club.id)
    apply_club_profile_settings(
        db,
        club_id,
        {
            "club_name": DEMO_SETTINGS["club_name"],
            "club_slug": DEMO_SETTINGS["club_slug"],
            "logo_url": DEMO_SETTINGS["club_logo_url"],
            "brand_primary": DEMO_SETTINGS["club_brand_primary"],
            "brand_secondary": DEMO_SETTINGS["club_brand_secondary"],
            "brand_accent": DEMO_SETTINGS["club_brand_accent"],
            "brand_surface": DEMO_SETTINGS["club_brand_surface"],
            "brand_text": DEMO_SETTINGS["club_brand_text"],
            "tagline": DEMO_SETTINGS["club_tagline"],
            "location": DEMO_SETTINGS["club_location"],
            "website": DEMO_SETTINGS["club_website"],
            "contact_email": DEMO_SETTINGS["club_contact_email"],
            "contact_phone": DEMO_SETTINGS["club_contact_phone"],
        },
    )
    db.flush()
    _upsert_settings(db, club_id, DEMO_SETTINGS)
    upsert_club_modules(
        db,
        club_id,
        ["golf", "tennis", "bowls", "pro_shop", "pub", "golf_days", "members", "communications"],
    )
    apply_reference_pricing_template(db, club_id=club_id, template_key="multi_club_demo", overwrite_existing=False)
    _ensure_accounting(db, club_id)

    year = max(datetime.utcnow().year, 2026)
    upsert_operational_targets(
        db,
        club_id=club_id,
        year=year,
        rows=[
            {"operation_key": "golf", "metric_key": "rounds", "target_value": 22000, "unit": "rounds"},
            {"operation_key": "golf", "metric_key": "revenue", "target_value": 8900000, "unit": "currency"},
            {"operation_key": "pro_shop", "metric_key": "revenue", "target_value": 1450000, "unit": "currency"},
            {"operation_key": "golf_days", "metric_key": "events", "target_value": 34, "unit": "events"},
            {"operation_key": "members", "metric_key": "active_members", "target_value": 780, "unit": "members"},
        ],
    )
    for metric, value in (("rounds", 22000.0), ("revenue", 10450000.0)):
        row = (
            db.query(KpiTarget)
            .filter(KpiTarget.club_id == club_id, KpiTarget.year == year, KpiTarget.metric == metric)
            .first()
        )
        if row is None:
            db.add(KpiTarget(club_id=club_id, year=year, metric=metric, annual_target=float(value)))
        else:
            row.annual_target = float(value)
            row.updated_at = datetime.utcnow()

    _ensure_demo_staff(db, club_id)
    player_user, member = _ensure_demo_player(db, club_id)
    _ensure_demo_bookings(db, club_id, member, player_user)
    _ensure_demo_ops_rows(db, club_id)
    _ensure_demo_notifications(db, club_id, player_user)
    _ensure_communication(
        db,
        club_id,
        kind="announcement",
        title="Course prep for windy week",
        summary="Operations teams have moved the maintenance window and reopened the front-nine booking sheet.",
        body="Operations update: front-nine maintenance now starts after 12:30. Morning member play remains open, and the pro shop team has stocked weather-ready rental gear.",
        audience="members",
        pinned=True,
    )
    _ensure_communication(
        db,
        club_id,
        kind="news",
        title="Demo league finals locked in",
        summary="Harbour Point has confirmed the April multi-format finals calendar.",
        body="The club calendar now includes mixed pairs golf, bowls semi-finals, and a twilight tennis social. Use this news item to demonstrate cross-operation programming.",
        audience="all",
        pinned=False,
        cta_label="View Club News",
    )
    _ensure_communication(
        db,
        club_id,
        kind="message",
        title="Member app onboarding",
        summary="Welcome message for first-time member logins.",
        body="Welcome to Harbour Point. Your member app now includes bookings, round actions, announcements, and direct club messages in one branded experience.",
        audience="members",
        pinned=False,
    )

    _upsert_setting(db, club_id, "club_status", "demo")
    _upsert_setting(db, club_id, "club_is_demo", "1")
    db.flush()
    invalidate_club_config_cache(club_id)

    return {
        "workspace": build_club_workspace_payload(db, club_id),
        "credentials": demo_persona_metadata(),
    }
