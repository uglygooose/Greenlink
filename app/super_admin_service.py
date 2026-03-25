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
from app.fee_models import FeeCategory, FeeType
from app.models import (
    AccountCustomer,
    AccountingSetting,
    AuditLog,
    Booking,
    BookingSource,
    BookingStatus,
    Club,
    ClubCommunication,
    ClubModuleSetting,
    ClubOperationalTarget,
    ClubSetting,
    DayClose,
    GolfDayBooking,
    ImportBatch,
    KpiTarget,
    LedgerEntry,
    LedgerEntryMeta,
    Member,
    PlayerNotification,
    ProShopProduct,
    ProShopSale,
    ProShopSaleItem,
    Person,
    PersonMembership,
    RevenueTransaction,
    Round,
    StaffRoleProfile,
    TeeTime,
    User,
    UserClubAssignment,
    UserRole,
)
from app.people import sync_member_person, sync_user_person
from app.platform_bootstrap import get_reference_pricing_template


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
    "booking_window_member_days": "21",
    "booking_window_affiliated_days": "14",
    "booking_window_non_affiliated_days": "10",
}
DEMO_PERSONAS = {
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
LEGACY_DEMO_EMAILS = {
    "demo.super@greenlink.club",
    *(str(persona["email"]).strip().lower() for persona in DEMO_PERSONAS.values()),
}
DEMO_MEMBER_ROSTER = (
    {
        "first_name": "Jordan",
        "last_name": "Fairway",
        "email": "demo.member@harbourpoint.club",
        "member_number": "HP-1008",
        "membership_category": "Full Golf Member",
        "primary_operation": "golf",
        "golf_access": True,
        "tennis_access": True,
        "bowls_access": True,
    },
    {
        "first_name": "Ava",
        "last_name": "Marlowe",
        "email": "ava.marlowe@harbourpoint.demo",
        "member_number": "HP-1011",
        "membership_category": "Weekday Golf Member",
        "primary_operation": "golf",
        "golf_access": True,
        "tennis_access": False,
        "bowls_access": False,
    },
    {
        "first_name": "Noah",
        "last_name": "Stone",
        "email": "noah.stone@harbourpoint.demo",
        "member_number": "HP-1014",
        "membership_category": "Tennis Member",
        "primary_operation": "tennis",
        "golf_access": False,
        "tennis_access": True,
        "bowls_access": False,
    },
    {
        "first_name": "Lindi",
        "last_name": "Nkosi",
        "email": "lindi.nkosi@harbourpoint.demo",
        "member_number": "HP-1018",
        "membership_category": "Bowls Member",
        "primary_operation": "bowls",
        "golf_access": False,
        "tennis_access": False,
        "bowls_access": True,
    },
    {
        "first_name": "Mia",
        "last_name": "Paterson",
        "email": "mia.paterson@harbourpoint.demo",
        "member_number": "HP-1020",
        "membership_category": "Family Member",
        "primary_operation": "golf",
        "golf_access": True,
        "tennis_access": True,
        "bowls_access": False,
    },
    {
        "first_name": "Daniel",
        "last_name": "Hart",
        "email": "daniel.hart@harbourpoint.demo",
        "member_number": "HP-1022",
        "membership_category": "Corporate Golf Member",
        "primary_operation": "golf",
        "golf_access": True,
        "tennis_access": False,
        "bowls_access": True,
    },
)
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


def _month_start(month_offset: int = 0) -> date:
    today = date.today()
    month_index = (today.year * 12) + (today.month - 1) + int(month_offset)
    year = month_index // 12
    month = (month_index % 12) + 1
    return date(year, month, 1)


def _demo_month_windows() -> list[dict[str, date]]:
    windows: list[dict[str, date]] = []
    for offset in (-3, -2, -1, 0, 1):
        start = _month_start(offset)
        next_start = _month_start(offset + 1)
        windows.append({"offset": offset, "start": start, "end": next_start - timedelta(days=1)})
    return windows


def _demo_booking_stamp(month_offset: int, day: int, hour: int, minute: int = 0) -> datetime:
    start = _month_start(month_offset)
    if month_offset == 1:
        next_start = _month_start(2)
    else:
        next_start = _month_start(month_offset + 1)
    last_day = (next_start - timedelta(days=1)).day
    safe_day = max(1, min(int(day), int(last_day)))
    return datetime.combine(start.replace(day=safe_day), datetime.min.time()).replace(
        hour=int(hour),
        minute=int(minute),
    )


def _reset_demo_environment_scope(db: Session, club_id: int | None) -> None:
    normalized_emails = sorted({str(value).strip().lower() for value in LEGACY_DEMO_EMAILS if str(value).strip()})
    demo_user_ids = []
    if club_id is not None and int(club_id) > 0:
        demo_user_ids.extend(
            int(value or 0)
            for value, in (
                db.query(User.id)
                .filter(User.club_id == int(club_id))
                .all()
            )
        )
    if normalized_emails:
        demo_user_ids.extend(
            int(value or 0)
            for value, in (
                db.query(User.id)
                .filter(func.lower(User.email).in_(normalized_emails))
                .all()
            )
        )
    demo_user_ids = sorted({value for value in demo_user_ids if int(value) > 0})

    if club_id is not None and int(club_id) > 0:
        ledger_ids = [
            int(value or 0)
            for value, in (
                db.query(LedgerEntry.id)
                .filter(LedgerEntry.club_id == int(club_id))
                .all()
            )
        ]
        if ledger_ids:
            db.query(LedgerEntryMeta).filter(LedgerEntryMeta.ledger_entry_id.in_(ledger_ids)).delete(synchronize_session=False)
        scoped_filters = {
            PlayerNotification: PlayerNotification.club_id == int(club_id),
            AuditLog: AuditLog.club_id == int(club_id),
            ProShopSaleItem: ProShopSaleItem.club_id == int(club_id),
            ProShopSale: ProShopSale.club_id == int(club_id),
            ProShopProduct: ProShopProduct.club_id == int(club_id),
            DayClose: DayClose.club_id == int(club_id),
            LedgerEntry: LedgerEntry.club_id == int(club_id),
            Round: Round.club_id == int(club_id),
            Booking: Booking.club_id == int(club_id),
            TeeTime: TeeTime.club_id == int(club_id),
            RevenueTransaction: RevenueTransaction.club_id == int(club_id),
            ImportBatch: ImportBatch.club_id == int(club_id),
            GolfDayBooking: GolfDayBooking.club_id == int(club_id),
            AccountCustomer: AccountCustomer.club_id == int(club_id),
            AccountingSetting: AccountingSetting.club_id == int(club_id),
            KpiTarget: KpiTarget.club_id == int(club_id),
            ClubModuleSetting: ClubModuleSetting.club_id == int(club_id),
            ClubOperationalTarget: ClubOperationalTarget.club_id == int(club_id),
            ClubCommunication: ClubCommunication.club_id == int(club_id),
            Member: Member.club_id == int(club_id),
            PersonMembership: PersonMembership.club_id == int(club_id),
            StaffRoleProfile: StaffRoleProfile.club_id == int(club_id),
            ClubSetting: ClubSetting.club_id == int(club_id),
        }
        for model, predicate in scoped_filters.items():
            db.query(model).filter(predicate).delete(synchronize_session=False)
        db.query(UserClubAssignment).filter(UserClubAssignment.club_id == int(club_id)).delete(synchronize_session=False)

    if demo_user_ids:
        db.query(UserClubAssignment).filter(UserClubAssignment.user_id.in_(demo_user_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(demo_user_ids)).delete(synchronize_session=False)
    if club_id is not None and int(club_id) > 0:
        db.query(Person).filter(Person.club_id == int(club_id)).delete(synchronize_session=False)


def _ensure_demo_pricing_rows(db: Session, club_id: int) -> None:
    base_rows = []
    for row in get_reference_pricing_template("multi_club_demo"):
        cloned = dict(row)
        cloned["code"] = int(row["code"]) + 20000
        base_rows.append(cloned)
    rows = base_rows + [
        {"code": 29101, "description": "Tennis Court Hire Member", "price": 120.0, "fee_type": FeeType.OTHER, "audience": "member"},
        {"code": 29102, "description": "Tennis Court Hire Visitor", "price": 185.0, "fee_type": FeeType.OTHER, "audience": "visitor"},
        {"code": 29103, "description": "Bowls Rink Member", "price": 85.0, "fee_type": FeeType.OTHER, "audience": "member"},
        {"code": 29104, "description": "Bowls Rink Visitor", "price": 125.0, "fee_type": FeeType.OTHER, "audience": "visitor"},
        {"code": 29105, "description": "Golf Day Deposit", "price": 3500.0, "fee_type": FeeType.OTHER, "audience": "other"},
        {"code": 29106, "description": "Padel Court Hire Member", "price": 320.0, "fee_type": FeeType.OTHER, "audience": "member"},
        {"code": 29107, "description": "Padel Court Hire Visitor", "price": 400.0, "fee_type": FeeType.OTHER, "audience": "visitor"},
        {"code": 29108, "description": "Padel Racket Hire", "price": 50.0, "fee_type": FeeType.OTHER, "audience": "other"},
    ]
    for payload in rows:
        existing = (
            db.query(FeeCategory)
            .filter(FeeCategory.club_id == int(club_id), FeeCategory.code == int(payload["code"]))
            .first()
        )
        if existing is None:
            db.add(
                FeeCategory(
                    club_id=int(club_id),
                    code=int(payload["code"]),
                    description=str(payload["description"]),
                    price=float(payload["price"]),
                    fee_type=payload["fee_type"],
                    active=1,
                    audience=str(payload["audience"]),
                )
            )


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


def _ensure_demo_members(db: Session, club_id: int) -> None:
    for payload in DEMO_MEMBER_ROSTER:
        email = str(payload["email"]).strip().lower()
        member = (
            db.query(Member)
            .filter(Member.club_id == int(club_id), func.lower(Member.email) == email)
            .first()
        )
        if member is None:
            member = Member(
                club_id=int(club_id),
                first_name=str(payload["first_name"]),
                last_name=str(payload["last_name"]),
                email=email,
                member_number=str(payload["member_number"]),
                active=1,
            )
            db.add(member)
        member.membership_category = str(payload["membership_category"])
        member.membership_status = "active"
        member.primary_operation = str(payload["primary_operation"])
        member.home_club = "Harbour Point Country Club"
        member.golf_access = bool(payload["golf_access"])
        member.tennis_access = bool(payload["tennis_access"])
        member.bowls_access = bool(payload["bowls_access"])
        sync_member_person(db, member, source_system="demo_seed")


def _ensure_demo_bookings(db: Session, club_id: int, member: Member, player_user: User) -> None:
    booking_specs = [
        {"month_offset": -3, "day": 7, "hour": 7, "minute": 12, "player_name": "Jordan Fairway", "player_email": player_user.email, "member_id": int(member.id), "source": BookingSource.member, "status": BookingStatus.completed, "player_type": "member", "price": 455.0, "prepaid": True, "cart": True},
        {"month_offset": -3, "day": 18, "hour": 10, "minute": 24, "player_name": "Mia Paterson", "player_email": "mia.paterson@harbourpoint.demo", "member_id": None, "source": BookingSource.proshop, "status": BookingStatus.completed, "player_type": "visitor", "price": 620.0, "prepaid": True, "cart": False},
        {"month_offset": -2, "day": 9, "hour": 8, "minute": 36, "player_name": "Daniel Hart", "player_email": "daniel.hart@harbourpoint.demo", "member_id": None, "source": BookingSource.member, "status": BookingStatus.completed, "player_type": "member", "price": 480.0, "prepaid": True, "cart": True},
        {"month_offset": -2, "day": 22, "hour": 11, "minute": 0, "player_name": "Ava Marlowe", "player_email": "ava.marlowe@harbourpoint.demo", "member_id": None, "source": BookingSource.member, "status": BookingStatus.checked_in, "player_type": "member", "price": 430.0, "prepaid": True, "cart": False},
        {"month_offset": -1, "day": 5, "hour": 7, "minute": 48, "player_name": "Jordan Fairway", "player_email": player_user.email, "member_id": int(member.id), "source": BookingSource.member, "status": BookingStatus.completed, "player_type": "member", "price": 445.0, "prepaid": True, "cart": True},
        {"month_offset": -1, "day": 15, "hour": 9, "minute": 20, "player_name": "Harbour Point Visitor 1", "player_email": "visitor1@harbourpoint.demo", "member_id": None, "source": BookingSource.external, "status": BookingStatus.completed, "player_type": "visitor", "price": 690.0, "prepaid": True, "cart": True},
        {"month_offset": -1, "day": 26, "hour": 13, "minute": 5, "player_name": "Harbour Point Visitor 2", "player_email": "visitor2@harbourpoint.demo", "member_id": None, "source": BookingSource.proshop, "status": BookingStatus.no_show, "player_type": "visitor", "price": 575.0, "prepaid": False, "cart": False},
        {"month_offset": 0, "day": 3, "hour": 8, "minute": 10, "player_name": "Jordan Fairway", "player_email": player_user.email, "member_id": int(member.id), "source": BookingSource.member, "status": BookingStatus.completed, "player_type": "member", "price": 455.0, "prepaid": True, "cart": True},
        {"month_offset": 0, "day": 12, "hour": 9, "minute": 32, "player_name": "Noah Stone", "player_email": "noah.stone@harbourpoint.demo", "member_id": None, "source": BookingSource.member, "status": BookingStatus.checked_in, "player_type": "member", "price": 395.0, "prepaid": True, "cart": False},
        {"month_offset": 0, "day": 23, "hour": 10, "minute": 16, "player_name": "Jordan Fairway", "player_email": player_user.email, "member_id": int(member.id), "source": BookingSource.member, "status": BookingStatus.booked, "player_type": "member", "price": 470.0, "prepaid": False, "cart": False},
        {"month_offset": 0, "day": 28, "hour": 12, "minute": 40, "player_name": "Harbour Point Visitor 3", "player_email": "visitor3@harbourpoint.demo", "member_id": None, "source": BookingSource.external, "status": BookingStatus.booked, "player_type": "visitor", "price": 705.0, "prepaid": False, "cart": True},
        {"month_offset": 1, "day": 4, "hour": 8, "minute": 24, "player_name": "Jordan Fairway", "player_email": player_user.email, "member_id": int(member.id), "source": BookingSource.member, "status": BookingStatus.booked, "player_type": "member", "price": 460.0, "prepaid": False, "cart": True},
        {"month_offset": 1, "day": 16, "hour": 9, "minute": 56, "player_name": "Harbour Point Visitor 4", "player_email": "visitor4@harbourpoint.demo", "member_id": None, "source": BookingSource.proshop, "status": BookingStatus.booked, "player_type": "visitor", "price": 720.0, "prepaid": False, "cart": False},
        {"month_offset": 1, "day": 25, "hour": 11, "minute": 44, "player_name": "Harbour Point Visitor 5", "player_email": "visitor5@harbourpoint.demo", "member_id": None, "source": BookingSource.external, "status": BookingStatus.cancelled, "player_type": "visitor", "price": 580.0, "prepaid": False, "cart": True},
    ]
    for index, spec in enumerate(booking_specs, start=1):
        tee_dt = _demo_booking_stamp(spec["month_offset"], spec["day"], spec["hour"], spec["minute"])
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
            .filter(Booking.club_id == int(club_id), Booking.tee_time_id == int(tee.id), func.lower(Booking.player_email) == str(spec["player_email"]).lower())
            .first()
        )
        resolved_status = spec["status"]
        if booking is None:
            booking = Booking(
                club_id=int(club_id),
                tee_time_id=int(tee.id),
                member_id=spec["member_id"],
                created_by_user_id=int(player_user.id) if spec["player_email"] == player_user.email else None,
                player_name=str(spec["player_name"]),
                player_email=str(spec["player_email"]).lower(),
                handicap_number=str(player_user.handicap_number) if spec["player_email"] == player_user.email else None,
                greenlink_id=str(getattr(player_user, "greenlink_id", "") or "") or None if spec["player_email"] == player_user.email else None,
                source=spec["source"],
                party_size=1,
                price=float(spec["price"]),
                status=resolved_status,
                player_type=str(spec["player_type"]),
                holes=18,
                prepaid=bool(spec["prepaid"]),
                cart=bool(spec["cart"]),
                home_club="Harbour Point Country Club",
                handicap_sa_id=str(player_user.handicap_sa_id) if spec["player_email"] == player_user.email else None,
                handicap_index_at_booking=float(player_user.handicap_index or 12.4) if spec["player_email"] == player_user.email else None,
                notes=f"Demo booking seed #{index}.",
            )
            db.add(booking)
            db.flush()
        else:
            booking.status = resolved_status
            booking.member_id = spec["member_id"]
            booking.created_by_user_id = int(player_user.id) if spec["player_email"] == player_user.email else None
            booking.price = float(spec["price"])
            booking.prepaid = bool(spec["prepaid"])
            booking.cart = bool(spec["cart"])

        if resolved_status in {BookingStatus.checked_in, BookingStatus.completed}:
            ledger = db.query(LedgerEntry).filter(LedgerEntry.booking_id == int(booking.id)).first()
            if ledger is None:
                ledger = LedgerEntry(
                    club_id=int(club_id),
                    booking_id=int(booking.id),
                    description=f"Demo green fee - {booking.player_name}",
                    amount=float(booking.price or 0.0),
                )
                db.add(ledger)
                db.flush()
            if db.query(LedgerEntryMeta).filter(LedgerEntryMeta.ledger_entry_id == int(ledger.id)).first() is None:
                db.add(
                    LedgerEntryMeta(
                        ledger_entry_id=int(ledger.id),
                        payment_method="CARD" if index % 2 else "EFT",
                    )
                )


def _ensure_demo_ops_rows(db: Session, club_id: int) -> None:
    products = [
        {"sku": "HP-BALL-01", "name": "Titleist Tour Sleeve", "category": "Balls", "price": 210.0, "cost": 145.0, "stock": 32},
        {"sku": "HP-GLOVE-02", "name": "Cabretta Glove", "category": "Apparel", "price": 245.0, "cost": 138.0, "stock": 18},
        {"sku": "HP-CAP-03", "name": "Harbour Point Cap", "category": "Apparel", "price": 180.0, "cost": 92.0, "stock": 24},
        {"sku": "HP-TEE-04", "name": "Bamboo Tee Pack", "category": "Accessories", "price": 55.0, "cost": 18.0, "stock": 64},
    ]
    product_by_sku: dict[str, ProShopProduct] = {}
    for payload in products:
        row = (
            db.query(ProShopProduct)
            .filter(ProShopProduct.club_id == int(club_id), func.lower(ProShopProduct.sku) == str(payload["sku"]).lower())
            .first()
        )
        if row is None:
            row = ProShopProduct(
                club_id=int(club_id),
                sku=str(payload["sku"]),
                name=str(payload["name"]),
                category=str(payload["category"]),
                unit_price=float(payload["price"]),
                cost_price=float(payload["cost"]),
                stock_qty=int(payload["stock"]),
                reorder_level=8,
                active=1,
            )
            db.add(row)
            db.flush()
        product_by_sku[str(payload["sku"])] = row

    sale_specs = [
        {"month_offset": -2, "day": 10, "customer": "Jordan Fairway", "payment_method": "card", "sku": "HP-BALL-01", "qty": 1},
        {"month_offset": -1, "day": 14, "customer": "Mia Paterson", "payment_method": "eft", "sku": "HP-GLOVE-02", "qty": 1},
        {"month_offset": 0, "day": 6, "customer": "Noah Stone", "payment_method": "card", "sku": "HP-CAP-03", "qty": 1},
        {"month_offset": 0, "day": 19, "customer": "Visitor Walk-In", "payment_method": "cash", "sku": "HP-TEE-04", "qty": 2},
        {"month_offset": 1, "day": 8, "customer": "Jordan Fairway", "payment_method": "card", "sku": "HP-BALL-01", "qty": 2},
    ]
    for index, spec in enumerate(sale_specs, start=1):
        sold_at = _demo_booking_stamp(spec["month_offset"], spec["day"], 15, 10)
        sale = ProShopSale(
            club_id=int(club_id),
            customer_name=str(spec["customer"]),
            payment_method=str(spec["payment_method"]),
            subtotal=0.0,
            discount=0.0,
            tax=0.0,
            total=0.0,
            sold_at=sold_at,
        )
        db.add(sale)
        db.flush()
        product = product_by_sku[str(spec["sku"])]
        unit_price = float(getattr(product, "unit_price", 0.0) or 0.0)
        quantity = int(spec["qty"])
        line_total = unit_price * quantity
        sale.subtotal = line_total
        sale.tax = round(line_total * 0.15, 2)
        sale.total = line_total
        db.add(
            ProShopSaleItem(
                club_id=int(club_id),
                sale_id=int(sale.id),
                product_id=int(product.id),
                sku_snapshot=str(product.sku),
                name_snapshot=str(product.name),
                category_snapshot=str(product.category),
                quantity=quantity,
                unit_price=unit_price,
                line_total=line_total,
            )
        )

    for month in _demo_month_windows():
        month_start = month["start"]
        for stream, category, amount in (
            ("golf", "golf", 3250.0),
            ("pro_shop", "pro_shop", 1180.0),
            ("pub", "pub", 1460.0),
            ("bowls", "bowls", 840.0),
            ("other", "tennis", 910.0),
        ):
            db.add(
                RevenueTransaction(
                    club_id=int(club_id),
                    source=str(stream),
                    transaction_date=month_start + timedelta(days=6),
                    external_id=f"DEMO-{stream}-{month_start.isoformat()}",
                    description=f"{category.title()} operations batch",
                    category=str(category),
                    amount=float(amount + (month['offset'] + 3) * 140.0),
                )
            )

    golf_day_specs = [
        {"title": "Harbour Point Corporate Invitational", "offset": -1, "amount": 28500.0, "deposit": 12500.0, "status": "partial", "area": "golf_days"},
        {"title": "Autumn Pairs Challenge", "offset": 0, "amount": 18400.0, "deposit": 9200.0, "status": "partial", "area": "golf_days"},
        {"title": "Bowls Twilight League Booking", "offset": 0, "amount": 6200.0, "deposit": 3100.0, "status": "partial", "area": "bowls"},
        {"title": "Tennis Open Clinic Booking", "offset": 1, "amount": 7400.0, "deposit": 3700.0, "status": "partial", "area": "tennis"},
    ]
    for spec in golf_day_specs:
        event_date = _month_start(spec["offset"]) + timedelta(days=11)
        db.add(
            GolfDayBooking(
                club_id=int(club_id),
                event_name=str(spec["title"]),
                event_date=event_date,
                event_end_date=event_date,
                amount=float(spec["amount"]),
                deposit_amount=float(spec["deposit"]),
                payment_status=str(spec["status"]),
                contact_name="Alicia Morgan",
                operation_area=str(spec["area"]),
                notes="Demo pipeline event seeded for walkthroughs.",
            )
        )

    for month in _demo_month_windows():
        imported_at = datetime.combine(month["start"] + timedelta(days=4), datetime.min.time()).replace(hour=8, minute=15)
        db.add(
            ImportBatch(
                club_id=int(club_id),
                kind="bookings",
                source="demo_seed",
                file_name=f"demo-bookings-{month['start'].isoformat()}.csv",
                imported_at=imported_at,
                rows_total=12,
                rows_inserted=12,
                rows_updated=0,
                rows_failed=0,
            )
        )
        db.add(
            ImportBatch(
                club_id=int(club_id),
                kind="revenue",
                source="demo_seed",
                file_name=f"demo-revenue-{month['start'].isoformat()}.csv",
                imported_at=imported_at + timedelta(hours=2),
                rows_total=8,
                rows_inserted=8,
                rows_updated=0,
                rows_failed=0,
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


def _ensure_demo_audit_rows(db: Session, club_id: int) -> None:
    rows = [
        ("demo.seed.completed", "club", str(club_id), {"scope": "demo_rebuild"}),
        ("demo.pricing.ready", "pricing", "fee_categories", {"rows": 60}),
        ("demo.users.ready", "user", "demo_personas", {"count": len(DEMO_PERSONAS)}),
        ("demo.communications.ready", "communication", "demo_feed", {"count": 3}),
    ]
    for action, entity_type, entity_id, payload in rows:
        db.add(
            AuditLog(
                club_id=int(club_id),
                action=str(action),
                entity_type=str(entity_type),
                entity_id=str(entity_id),
                payload_json=json.dumps(payload, ensure_ascii=True),
            )
        )


def ensure_demo_environment(db: Session) -> dict[str, Any]:
    existing = db.query(Club).filter(func.lower(Club.slug) == DEMO_CLUB_SLUG.lower()).first()
    existing_club_id = int(existing.id) if existing is not None and getattr(existing, "id", None) else None
    _reset_demo_environment_scope(db, existing_club_id)

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
        ["golf", "tennis", "padel", "bowls", "pro_shop", "pub", "golf_days", "members", "communications"],
    )
    _ensure_demo_pricing_rows(db, club_id)
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
            {"operation_key": "pub", "metric_key": "revenue", "target_value": 980000, "unit": "currency"},
            {"operation_key": "bowls", "metric_key": "revenue", "target_value": 420000, "unit": "currency"},
            {"operation_key": "bowls", "metric_key": "usage", "target_value": 2100, "unit": "uses"},
            {"operation_key": "tennis", "metric_key": "revenue", "target_value": 510000, "unit": "currency"},
            {"operation_key": "tennis", "metric_key": "usage", "target_value": 1680, "unit": "uses"},
            {"operation_key": "padel", "metric_key": "revenue", "target_value": 620000, "unit": "currency"},
            {"operation_key": "padel", "metric_key": "usage", "target_value": 1900, "unit": "uses"},
            {"operation_key": "golf_days", "metric_key": "events", "target_value": 34, "unit": "events"},
            {"operation_key": "golf_days", "metric_key": "pipeline", "target_value": 385000, "unit": "currency"},
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
    _ensure_demo_members(db, club_id)
    player_user, member = _ensure_demo_player(db, club_id)
    _ensure_demo_bookings(db, club_id, member, player_user)
    _ensure_demo_ops_rows(db, club_id)
    _ensure_demo_notifications(db, club_id, player_user)
    _ensure_demo_audit_rows(db, club_id)
    _ensure_communication(
        db,
        club_id,
        kind="announcement",
        title="April showcase bookings are open",
        summary="Golf, bowls, tennis, and pro-shop promotions have been staged for the demo month.",
        body="Operations update: the demo club has seeded April golf bookings, bowls events, tennis clinic placeholders, and refreshed pro-shop stock so management walkthroughs land on live-looking data.",
        audience="members",
        pinned=True,
    )
    _ensure_communication(
        db,
        club_id,
        kind="news",
        title="Synthetic demo calendar refreshed",
        summary="Historical, current-month, and future-month data have been rebuilt for walkthroughs.",
        body="The demo calendar now includes three months of historical golf activity, a current-month member programme, and future-month cross-operation events for sales and admin testing.",
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
