# app/routers/admin.py
"""
Admin Dashboard API Routes
All endpoints require admin role
"""

from __future__ import annotations

import uuid
import json
import requests

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, load_only, selectinload
from sqlalchemy import String, and_, asc, cast, desc, func, or_, case
from datetime import date, datetime, timedelta, time as Time
from pydantic import BaseModel
from typing import Any, Optional
from app import crud
from app.audit import record_audit_event
from app.models import (
    AccountCustomer,
    User,
    Booking,
    TeeTime,
    Round,
    LedgerEntry,
    LedgerEntryMeta,
    DayClose,
    UserRole,
    BookingStatus,
    Member,
    ClubSetting,
    ImportBatch,
    RevenueTransaction,
    ProShopProduct,
    ProShopSale,
    ProShopSaleItem,
    PlayerNotification,
    GolfDayBooking,
    StaffRoleProfile,
    AuditLog,
)
from app.fee_models import FeeCategory, FeeType
from app.auth import get_current_user, get_db, get_password_hash
from app.club_assignments import sync_user_club_assignment
from app.observability import log_event
from app.people import (
    classify_membership_group,
    normalize_primary_operation,
    normalize_membership_status,
    parse_terms_days,
    sync_member_person,
    sync_user_person,
)
from app.password_policy import assert_password_policy
from app.platform_bootstrap import apply_reference_pricing_template
from app.pricing import normalize_member_pricing_mode, pricing_mode_to_player_type, resolve_booking_pricing_profile
from app.services.account_customers_service import (
    build_account_customers_query,
    ensure_unique_account_code,
    resolve_account_customer,
    serialize_account_customer,
)
from app.services.bookings_service import (
    clear_booking_ledger_entries,
    get_booking_or_404,
    normalize_booking_ids,
    set_booking_payment_method_if_exists,
    set_booking_payment_method_meta,
)
from app.services.booking_pricing_service import repair_bookings_pricing
from app.services.payment_methods import (
    normalize_booking_payment_method,
    normalize_pro_shop_payment_method,
)
from calendar import isleap
from app.club_config import club_config_response, invalidate_club_config_cache
from app.tee_profile import load_tee_sheet_profile, save_tee_sheet_profile, tee_sheet_plan_for_date
from app.tenancy import get_active_club_id
from app.ttl_cache import TTLCache
from app.weather_alerts import (
    build_weather_booking_candidates,
    build_weather_prompt_payload,
    serialize_notification_payload,
)

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(get_active_club_id)],
)

ADMIN_DASHBOARD_CACHE = TTLCache[str, dict[str, Any]](ttl_seconds=20, max_entries=64)
ADMIN_ALERTS_CACHE = TTLCache[str, dict[str, Any]](ttl_seconds=30, max_entries=96)

MEMBER_PRICING_MODE_LABELS = {
    "membership_default": "Default by membership type",
    "visitor_override": "Visitor rate override",
    "non_affiliated_override": "Non-affiliated visitor override",
    "reciprocity_override": "Reciprocity override",
}


def _request_id(request: Request | None) -> str | None:
    if request is None:
        return None
    return str(getattr(getattr(request, "state", None), "request_id", "") or "").strip() or None


def _invalidate_admin_caches(club_id: int | None = None) -> None:
    if club_id is not None and int(club_id) > 0:
        ADMIN_DASHBOARD_CACHE.delete(f"dashboard:{int(club_id)}")
        ADMIN_ALERTS_CACHE.clear()
        log_event("info", "admin.cache_invalidated", cache="dashboard+alerts", club_id=int(club_id))
        return
    ADMIN_DASHBOARD_CACHE.clear()
    ADMIN_ALERTS_CACHE.clear()
    log_event("info", "admin.cache_invalidated", cache="dashboard+alerts", club_id=None)


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


def _audit_event(
    db: Session,
    request: Request | None,
    actor: User | None,
    action: str,
    entity_type: str,
    *,
    entity_id: str | int | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    record_audit_event(
        db,
        action=action,
        entity_type=entity_type,
        actor_user_id=(int(actor.id) if actor and getattr(actor, "id", None) else None),
        entity_id=entity_id,
        payload=payload,
        request_id=_request_id(request),
        club_id=int(getattr(db, "info", {}).get("club_id") or 0) or None,
    )


def _safe_rollback(db: Session | None) -> None:
    if db is None:
        return
    try:
        db.rollback()
    except Exception:
        pass


def _repair_booking_pricing_window(
    db: Session,
    club_id: int,
    *,
    start_dt: datetime,
    end_dt_exclusive: datetime | None,
) -> tuple[int, ...]:
    try:
        query = (
            db.query(Booking)
            .join(TeeTime, Booking.tee_time_id == TeeTime.id)
            .options(
                load_only(
                    Booking.id,
                    Booking.tee_time_id,
                    Booking.member_id,
                    Booking.fee_category_id,
                    Booking.price,
                    Booking.status,
                    Booking.player_type,
                    Booking.gender,
                    Booking.player_category,
                    Booking.holes,
                    Booking.handicap_sa_id,
                    Booking.home_club,
                    Booking.source,
                ),
                selectinload(Booking.tee_time).load_only(TeeTime.id, TeeTime.tee_time),
            )
            .filter(
                Booking.club_id == club_id,
                TeeTime.club_id == club_id,
                TeeTime.tee_time >= start_dt,
                or_(Booking.price.is_(None), Booking.price <= 0),
            )
        )
        if end_dt_exclusive is not None:
            query = query.filter(TeeTime.tee_time < end_dt_exclusive)
        rows = query.all()
        if not rows:
            return ()
        result = repair_bookings_pricing(db, rows, persist=False)
        return result.updated_booking_ids
    except Exception:
        _safe_rollback(db)
        return ()


def verify_admin(current_user: User = Depends(get_current_user)) -> User:
    """Club admin access for day-to-day club operations."""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def verify_setup_admin(current_user: User = Depends(get_current_user)) -> User:
    """Allow super admins on onboarding/setup endpoints without exposing club ops."""
    if current_user.role not in {UserRole.super_admin, UserRole.admin}:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def verify_staff(current_user: User = Depends(get_current_user)) -> User:
    """
    Club operations staff access (admin + club_staff).

    Used for operational endpoints needed during the 30-day parallel (mirror) test.
    """
    if current_user.role not in {UserRole.admin, UserRole.club_staff}:
        raise HTTPException(status_code=403, detail="Staff access required")
    return current_user


def assert_day_open(db: Session, target_date):
    if not target_date:
        return
    closed = db.query(DayClose).filter(
        DayClose.close_date == target_date,
        DayClose.status == "closed"
    ).first()
    if closed:
        raise HTTPException(status_code=403, detail="Day is closed. Reopen to edit.")


def _days_in_year(year: int) -> int:
    return 366 if isleap(year) else 365


def _week_start(d: date) -> date:
    # Monday-start week (South Africa standard in most reporting contexts)
    return d - timedelta(days=d.weekday())


def _period_window(period: str, anchor: date) -> tuple[date, date, int]:
    """
    Returns (start_date, end_date_inclusive, days_elapsed) for a period ending at anchor.
    days_elapsed is used to derive targets from annual targets.
    """
    p = (period or "").lower().strip()
    if p in {"day", "today"}:
        return anchor, anchor, 1
    if p in {"week", "wtd"}:
        start = _week_start(anchor)
        return start, anchor, (anchor - start).days + 1
    if p in {"month", "mtd"}:
        start = anchor.replace(day=1)
        return start, anchor, anchor.day
    if p in {"ytd", "year", "year_to_date"}:
        start = date(anchor.year, 1, 1)
        return start, anchor, (anchor - start).days + 1
    # Default to day
    return anchor, anchor, 1


def _annual_target(db: Session, year: int, metric: str, default: float | None = None) -> float | None:
    try:
        from app.models import KpiTarget
        club_id = db.info.get("club_id")
        if not club_id:
            return default
        row = (
            db.query(KpiTarget)
            .filter(KpiTarget.club_id == int(club_id), KpiTarget.year == year, KpiTarget.metric == metric)
            .first()
        )
        if row and row.annual_target is not None:
            return float(row.annual_target)
    except Exception:
        # In offline/demo modes or before tables exist, fall back to defaults.
        _safe_rollback(db)
    return default


def _derive_target(annual: float | None, year: int, days_elapsed: int) -> float | None:
    if annual is None:
        return None
    denom = float(_days_in_year(year))
    if denom <= 0:
        return None
    d = max(0, int(days_elapsed or 0))
    return float(annual) * (float(d) / denom)


def _member_green_fee_18(db: Session) -> float:
    """
    Baseline member green fee used to derive revenue targets from rounds targets.

    We prefer a stable "member 18 holes" fee (code 1 in the default fee list).
    If fees aren't loaded, fall back to a sensible demo default.
    """
    try:
        club_id = db.info.get("club_id")
        fee_q = db.query(FeeCategory).filter(FeeCategory.code == 1)
        if club_id:
            fee_q = fee_q.filter(or_(FeeCategory.club_id == int(club_id), FeeCategory.club_id.is_(None)))
        fee = fee_q.first()
        if fee and getattr(fee, "price", None) is not None:
            return float(fee.price)

        # Otherwise: any member golf fee for 18 holes without a restricted day kind.
        q = db.query(FeeCategory).filter(
            FeeCategory.active == 1,
            FeeCategory.fee_type == FeeType.GOLF,
            FeeCategory.audience == "member",
            FeeCategory.holes == 18,
            FeeCategory.day_kind.is_(None),
        )
        if club_id:
            q = q.filter(or_(FeeCategory.club_id == int(club_id), FeeCategory.club_id.is_(None)))
        fee = q.order_by(FeeCategory.priority.desc(), FeeCategory.code.asc()).first()
        if fee and getattr(fee, "price", None) is not None:
            return float(fee.price)
    except Exception:
        _safe_rollback(db)

    # Default from the 2026 price list (member 18 holes).
    return 340.0


def _float_setting(db: Session, key: str, default: float) -> float:
    """Read a float club setting from DB; fall back to default on any error."""
    try:
        from app.models import ClubSetting

        club_id = db.info.get("club_id")
        if not club_id:
            return float(default)
        row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == key).first()
        if not row:
            return float(default)
        raw = (row.value or "").strip()
        if not raw:
            return float(default)
        return float(raw)
    except Exception:
        _safe_rollback(db)
        return float(default)


def _string_setting(db: Session, key: str, default: str) -> str:
    """Read a string club setting from DB; fall back to default on any error."""
    try:
        club_id = db.info.get("club_id")
        if not club_id:
            return str(default)
        row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == key).first()
        if not row:
            return str(default)
        raw = str(row.value or "").strip()
        return raw or str(default)
    except Exception:
        _safe_rollback(db)
        return str(default)


def _int_setting(db: Session, key: str, default: int) -> int:
    try:
        return int(_float_setting(db, key, float(default)))
    except Exception:
        return int(default)


def _upsert_setting(db: Session, key: str, value: int | float | str) -> None:
    club_id = db.info.get("club_id")
    if not club_id:
        raise HTTPException(status_code=400, detail="club_id is required")
    row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == key).first()
    if row:
        row.value = str(value)
        row.updated_at = datetime.utcnow()
    else:
        db.add(ClubSetting(club_id=int(club_id), key=key, value=str(value)))
    invalidate_club_config_cache(int(club_id))


def _normalize_revenue_stream(raw: str | None) -> str:
    source = (raw or "").strip().lower()
    if source in {"golf", "green_fee", "green_fees", "green fees"}:
        return "golf"
    if source in {"proshop", "pro_shop", "golf_shop", "golfshop", "shop", "retail", "merch", "merchandise"}:
        return "pro_shop"
    if source in {"pub", "bar", "fnb", "food", "restaurant"}:
        return "pub"
    if source in {"bowls", "lawn_bowls", "lawn-bowls"}:
        return "bowls"
    if source in {"", "other", "misc", "unknown"}:
        return "other"
    return source


def _pro_shop_revenue_source_clause():
    source_col = func.lower(func.coalesce(RevenueTransaction.source, ""))
    return source_col.in_(["proshop", "pro_shop", "golf_shop", "golfshop", "shop", "retail", "merch", "merchandise"])


def _native_pro_shop_revenue_clause():
    external_id_col = func.lower(func.coalesce(RevenueTransaction.external_id, ""))
    return and_(_pro_shop_revenue_source_clause(), external_id_col.like("proshop-sale-%"))


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
        category_col.like("%tennis%"),
        category_col.like("%squash%"),
        category_col.like("%home owner%"),
        category_col.like("%homeowner%"),
        category_col.like("%house%"),
        category_col.like("%social%"),
        category_col.like("%staff%"),
        player_col.in_(["bowls", "tennis", "squash", "homeowners", "house", "social", "staff", "other"]),
    )
    if area_norm == "all":
        return None
    if area_norm == "golf":
        return or_(primary_op == "golf", Member.golf_access.is_(True), player_col == "golf", ~explicit_non_golf)
    if area_norm == "bowls":
        return or_(primary_op == "bowls", Member.bowls_access.is_(True), player_col == "bowls", category_col.like("%bowls%"))
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


def _account_customer_from_input(
    db: Session,
    *,
    club_id: int,
    account_code: str | None = None,
    account_customer_id: int | None = None,
) -> AccountCustomer | None:
    return resolve_account_customer(
        db,
        club_id=int(club_id),
        account_code=account_code,
        account_customer_id=account_customer_id,
    )


def _derive_annual_revenue_target_from_mix(db: Session, year: int, annual_rounds_target: float | None) -> float | None:
    """
    Derive annual revenue target using a member/visitor mix model.

    Client assumption:
    - 50% of rounds are members (by volume)
    - 33% of revenue comes from members, 67% visitors

    If we assume "member revenue per round" ~ member 18-hole fee, then:
      total_revenue = member_rounds * member_fee / member_revenue_share
    """
    if annual_rounds_target is None:
        return None

    member_round_share = _float_setting(db, "target_member_round_share", 0.50)
    member_revenue_share = _float_setting(db, "target_member_revenue_share", 0.33)

    # Guard rails
    if member_round_share <= 0 or member_round_share >= 1:
        member_round_share = 0.50
    if member_revenue_share <= 0 or member_revenue_share >= 1:
        member_revenue_share = 0.33

    member_fee = float(_member_green_fee_18(db))
    member_rounds = float(annual_rounds_target) * float(member_round_share)
    return (member_rounds * member_fee) / float(member_revenue_share)


def _target_model_payload(db: Session, year: int) -> dict[str, Any]:
    annual_rounds_target = _annual_target(db, year, "rounds", default=35000.0)
    annual_revenue_override = _annual_target(db, year, "revenue", default=None)
    revenue_mode = _string_setting(db, "target_revenue_mode", "derived").strip().lower()
    if revenue_mode not in {"derived", "manual"}:
        revenue_mode = "derived"

    derived_revenue_target = _derive_annual_revenue_target_from_mix(
        db,
        year,
        float(annual_rounds_target) if annual_rounds_target is not None else None,
    )

    if revenue_mode == "manual" and annual_revenue_override is not None:
        active_revenue_target = float(annual_revenue_override)
        revenue_source = "manual_override"
    else:
        active_revenue_target = (
            float(derived_revenue_target)
            if derived_revenue_target is not None
            else (float(annual_revenue_override) if annual_revenue_override is not None else None)
        )
        revenue_source = "derived_from_mix" if derived_revenue_target is not None else (
            "manual_override" if annual_revenue_override is not None else "unconfigured"
        )

    return {
        "year": int(year),
        "rounds_target": float(annual_rounds_target) if annual_rounds_target is not None else None,
        "revenue_target": active_revenue_target,
        "revenue_mode": revenue_mode,
        "revenue_source": revenue_source,
        "revenue_override": float(annual_revenue_override) if annual_revenue_override is not None else None,
        "revenue_derived": float(derived_revenue_target) if derived_revenue_target is not None else None,
        "assumptions": {
            "member_round_share": float(_float_setting(db, "target_member_round_share", 0.50)),
            "member_revenue_share": float(_float_setting(db, "target_member_revenue_share", 0.33)),
            "member_fee_18": float(_member_green_fee_18(db)),
        },
    }


class BookingWindowSettings(BaseModel):
    member_days: int
    affiliated_days: int
    non_affiliated_days: int
    group_cancel_days: int = 10


@router.get("/booking-window", response_model=BookingWindowSettings)
def get_booking_window_settings(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
    club_id: int = Depends(get_active_club_id),
):
    return BookingWindowSettings(
        member_days=_int_setting(db, "booking_window_member_days", 28),
        affiliated_days=_int_setting(db, "booking_window_affiliated_days", 28),
        non_affiliated_days=_int_setting(db, "booking_window_non_affiliated_days", 28),
        group_cancel_days=_int_setting(db, "booking_window_group_cancel_days", 10),
    )


@router.put("/booking-window", response_model=BookingWindowSettings)
def update_booking_window_settings(
    payload: BookingWindowSettings,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
    club_id: int = Depends(get_active_club_id),
):
    # Guard rails
    member_days = max(0, min(365, int(payload.member_days)))
    affiliated_days = max(0, min(365, int(payload.affiliated_days)))
    non_affiliated_days = max(0, min(365, int(payload.non_affiliated_days)))
    group_cancel_days = max(0, min(365, int(getattr(payload, "group_cancel_days", 10))))

    _upsert_setting(db, "booking_window_member_days", member_days)
    _upsert_setting(db, "booking_window_affiliated_days", affiliated_days)
    _upsert_setting(db, "booking_window_non_affiliated_days", non_affiliated_days)
    _upsert_setting(db, "booking_window_group_cancel_days", group_cancel_days)
    db.commit()

    return BookingWindowSettings(
        member_days=member_days,
        affiliated_days=affiliated_days,
        non_affiliated_days=non_affiliated_days,
        group_cancel_days=group_cancel_days,
    )


class TeeSheetProfilePayload(BaseModel):
    profile: dict[str, Any]


@router.get("/tee-sheet-profile")
def get_tee_sheet_profile(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
    club_id: int = Depends(get_active_club_id),
):
    profile = load_tee_sheet_profile(db, club_id=club_id)
    today = date.today()
    return {
        "profile": profile,
        "today_plan_18": tee_sheet_plan_for_date(today, profile, holes=18),
        "today_plan_9": tee_sheet_plan_for_date(today, profile, holes=9),
    }


@router.put("/tee-sheet-profile")
def update_tee_sheet_profile(
    payload: TeeSheetProfilePayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
    club_id: int = Depends(get_active_club_id),
):
    if not isinstance(payload.profile, dict):
        raise HTTPException(status_code=400, detail="profile must be an object")
    normalized = save_tee_sheet_profile(db, club_id=club_id, profile=payload.profile)
    db.commit()
    return {"status": "success", "profile": normalized}


class ClubProfileSettings(BaseModel):
    club_name: str | None = None
    club_slug: str | None = None
    logo_url: str | None = None
    currency_symbol: str | None = None
    member_label: str | None = None
    visitor_label: str | None = None
    non_affiliated_label: str | None = None
    home_club_keywords: list[str] | None = None
    suggested_home_clubs: list[str] | None = None


@router.get("/club-profile")
def get_club_profile_settings(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
    club_id: int = Depends(get_active_club_id),
):
    # Admin-visible view of the current club config, sourced from club_settings/env/defaults.
    return club_config_response(db, club_id=club_id)


@router.put("/club-profile")
def update_club_profile_settings(
    payload: ClubProfileSettings,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
    club_id: int = Depends(get_active_club_id),
):
    """
    Update club profile settings used for branding + membership detection.

    Stored in `club_settings` so each club deployment can be configured without code changes.
    """
    if payload.club_name is not None:
        name = str(payload.club_name).strip()
        if not name:
            raise HTTPException(status_code=400, detail="club_name cannot be empty")
        _upsert_setting(db, "club_name", name)
    if payload.club_slug is not None:
        _upsert_setting(db, "club_slug", str(payload.club_slug).strip() or "")
    if payload.logo_url is not None:
        _upsert_setting(db, "club_logo_url", str(payload.logo_url).strip() or "")
    if payload.currency_symbol is not None:
        _upsert_setting(db, "club_currency_symbol", str(payload.currency_symbol).strip() or "")

    if payload.member_label is not None:
        _upsert_setting(db, "club_member_label", str(payload.member_label).strip() or "")
    if payload.visitor_label is not None:
        _upsert_setting(db, "club_visitor_label", str(payload.visitor_label).strip() or "")
    if payload.non_affiliated_label is not None:
        _upsert_setting(db, "club_non_affiliated_label", str(payload.non_affiliated_label).strip() or "")

    if payload.home_club_keywords is not None:
        keywords = [str(v or "").strip() for v in payload.home_club_keywords]
        keywords = [v for v in keywords if v]
        _upsert_setting(db, "club_home_club_keywords", json.dumps(keywords))

    if payload.suggested_home_clubs is not None:
        clubs = [str(v or "").strip() for v in payload.suggested_home_clubs]
        clubs = [v for v in clubs if v]
        _upsert_setting(db, "club_suggested_home_clubs", json.dumps(clubs))

    db.commit()
    return club_config_response(db, club_id=club_id)

def _parse_hhmm(value: str) -> Time:
    raw = (value or "").strip()
    parts = raw.split(":")
    if len(parts) != 2:
        raise ValueError("invalid time")
    hh = int(parts[0])
    mm = int(parts[1])
    if hh < 0 or hh > 23 or mm < 0 or mm > 59:
        raise ValueError("invalid time")
    return Time(hour=hh, minute=mm)


class BulkTeeBookingRequest(BaseModel):
    date: date
    tees: list[str] = ["1", "10"]
    start_time: str = "06:30"
    end_time: str = "16:30"
    holes: int = 18
    slots_per_time: int = 4
    group_name: str
    event_type: str = "group"
    account_code: str | None = None
    account_customer_id: int | None = None
    price: float = 0.0


def _bulk_event_type_value(raw: str | None, default: str = "group") -> str:
    value = str(raw or "").strip().lower()
    if value in {"group", "golf_day", "pmg", "event"}:
        return value
    return default


def _bulk_booking_event_type(booking: Booking) -> str:
    from_group_id = _bulk_event_type_value(getattr(booking, "external_group_id", None), default="")
    if from_group_id in {"group", "golf_day", "pmg"}:
        return from_group_id

    provider = str(getattr(booking, "external_provider", "") or "").strip().lower()
    if provider == "bulk_pmg":
        return "pmg"
    if provider == "bulk_golf_day":
        return "golf_day"

    marker = f"{getattr(booking, 'player_name', '')} {getattr(booking, 'notes', '')}".lower()
    if "pmg" in marker:
        return "pmg"
    if "golf day" in marker:
        return "golf_day"
    return "group" if provider == "bulk" else "event"


def _enforce_group_cancel_window(db: Session, booking: Booking, actor: User) -> None:
    if str(getattr(booking, "external_provider", "") or "").strip().lower() != "bulk":
        return
    if getattr(actor, "role", None) == UserRole.super_admin:
        return

    event_type = _bulk_booking_event_type(booking)
    if event_type not in {"group", "golf_day"}:
        return

    tee_dt = getattr(getattr(booking, "tee_time", None), "tee_time", None)
    if tee_dt is None:
        return
    min_days = max(0, _int_setting(db, "booking_window_group_cancel_days", 10))
    days_out = (tee_dt.date() - date.today()).days
    if days_out < min_days:
        label = "Golf day" if event_type == "golf_day" else "Group"
        raise HTTPException(
            status_code=409,
            detail=f"{label} cancellations require at least {min_days} days notice.",
        )


@router.post("/tee-sheet/bulk-book")
def bulk_book_tee_sheet(
    req: BulkTeeBookingRequest,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    """
    Create placeholder bookings across a date/time range.
    Useful for golf days / group blocks (without needing to click each slot).
    """
    assert_day_open(db, req.date)

    group_name = (req.group_name or "").strip()
    if not group_name:
        raise HTTPException(status_code=400, detail="group_name is required")

    tees = [str(t).strip() for t in (req.tees or []) if str(t).strip()]
    if not tees:
        tees = ["1", "10"]

    try:
        start_t = _parse_hhmm(req.start_time)
        end_t = _parse_hhmm(req.end_time)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start_time/end_time (expected HH:MM)")

    start_dt = datetime.combine(req.date, start_t)
    end_dt = datetime.combine(req.date, end_t)
    if start_dt > end_dt:
        raise HTTPException(status_code=400, detail="start_time must be <= end_time")

    holes = 9 if int(req.holes or 18) == 9 else 18
    slots_per_time = max(1, min(4, int(req.slots_per_time or 1)))
    price = float(req.price or 0.0)
    if price < 0:
        raise HTTPException(status_code=400, detail="price must be >= 0")

    group_id = uuid.uuid4().hex[:12]
    event_type = _bulk_event_type_value(req.event_type, default="group")
    account_code = str(req.account_code or "").strip() or None

    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")
    selected_account_customer = _account_customer_from_input(
        db,
        club_id=club_id,
        account_code=account_code,
        account_customer_id=req.account_customer_id,
    )
    if selected_account_customer is not None:
        account_code = str(getattr(selected_account_customer, "account_code", "") or "").strip() or account_code

    tee_times = (
        db.query(TeeTime)
        .filter(
            TeeTime.tee_time >= start_dt,
            TeeTime.tee_time <= end_dt,
            cast(TeeTime.hole, String).in_(tees),
        )
        .order_by(TeeTime.tee_time.asc(), cast(TeeTime.hole, String).asc())
        .all()
    )
    if not tee_times:
        raise HTTPException(status_code=404, detail="No tee times found in this range. Generate the tee sheet first.")

    tee_time_ids = [tt.id for tt in tee_times if tt.id]
    occupying_statuses = [BookingStatus.booked, BookingStatus.checked_in, BookingStatus.completed]
    counts = dict(
        db.query(Booking.tee_time_id, func.count(Booking.id))
        .filter(
            Booking.tee_time_id.in_(tee_time_ids),
            or_(
                Booking.status.is_(None),
                Booking.status.in_(occupying_statuses),
            ),
        )
        .group_by(Booking.tee_time_id)
        .all()
    )

    created = 0
    skipped_full = 0
    new_rows: list[Booking] = []
    for tt in tee_times:
        cap = int(getattr(tt, "capacity", None) or 4)
        cap = max(1, min(6, cap))
        existing = int(counts.get(tt.id, 0) or 0)
        available = max(0, cap - existing)
        if available <= 0:
            skipped_full += 1
            continue

        to_add = min(available, slots_per_time)
        for _ in range(to_add):
            created += 1
            new_rows.append(
                Booking(
                    club_id=club_id,
                    tee_time_id=tt.id,
                    created_by_user_id=getattr(staff, "id", None),
                    # Keep the tee sheet clean: show only the event/group name in the slot.
                    # Group/undo metadata lives on external_provider/external_booking_id.
                    player_name=group_name,
                    club_card=account_code,
                    account_customer_id=int(selected_account_customer.id) if selected_account_customer is not None else None,
                    party_size=1,
                    price=price,
                    status=BookingStatus.booked,
                    holes=holes,
                    prepaid=False,
                    external_provider="bulk",
                    external_booking_id=group_id,
                    external_group_id=event_type,
                    notes=f"Bulk booking ({event_type}): {group_name} (group {group_id})",
                )
            )

    if new_rows:
        db.add_all(new_rows)
        db.commit()

    return {
        "group_id": group_id,
        "created": created,
        "skipped_full": skipped_full,
        "tee_times": len(tee_times),
        "date": str(req.date),
        "start_time": req.start_time,
        "end_time": req.end_time,
        "tees": tees,
        "event_type": event_type,
        "account_code": account_code,
        "account_customer_id": int(selected_account_customer.id) if selected_account_customer is not None else None,
    }


@router.delete("/tee-sheet/bulk-book/{group_id}")
def undo_bulk_book_tee_sheet(
    group_id: str,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    gid = (group_id or "").strip()
    if not gid:
        raise HTTPException(status_code=400, detail="group_id is required")

    bookings = (
        db.query(Booking)
        .options(selectinload(Booking.tee_time))
        .filter(Booking.external_provider == "bulk", Booking.external_booking_id == gid)
        .all()
    )
    if not bookings:
        raise HTTPException(status_code=404, detail="Bulk booking group not found")

    first_booking = bookings[0]
    _enforce_group_cancel_window(db, first_booking, staff)

    paid_statuses = {BookingStatus.checked_in, BookingStatus.completed}
    if any(b.status in paid_statuses for b in bookings):
        raise HTTPException(status_code=409, detail="Cannot undo: some bookings are already checked-in/completed.")

    # Respect day close locks.
    for d in {b.tee_time.tee_time.date() for b in bookings if b.tee_time and b.tee_time.tee_time}:
        assert_day_open(db, d)

    ids = [b.id for b in bookings if b.id]
    if not ids:
        raise HTTPException(status_code=500, detail="Invalid bulk booking rows")

    le_ids = [row[0] for row in db.query(LedgerEntry.id).filter(LedgerEntry.booking_id.in_(ids)).all()]
    if le_ids:
        db.query(LedgerEntryMeta).filter(LedgerEntryMeta.ledger_entry_id.in_(le_ids)).delete(synchronize_session=False)
    db.query(LedgerEntry).filter(LedgerEntry.booking_id.in_(ids)).delete(synchronize_session=False)
    db.query(Round).filter(Round.booking_id.in_(ids)).delete(synchronize_session=False)
    db.query(Booking).filter(Booking.id.in_(ids)).delete(synchronize_session=False)
    db.commit()

    return {"status": "success", "group_id": gid, "deleted": len(ids)}


class WeatherReconfirmRequest(BaseModel):
    date: date
    min_precip_probability: int = 60
    min_precip_mm: float = 1.0


def _weather_fallback_payload(
    target_date: date,
    min_precip_probability: int,
    min_precip_mm: float,
    *,
    provider_note: str,
    auto_prompt_error: str | None = None,
) -> dict[str, Any]:
    return {
        "target_date": target_date.isoformat(),
        "forecast_timezone": "",
        "provider_unavailable": True,
        "provider_note": str(provider_note or "").strip() or "Weather service unavailable.",
        "provider_name": "fallback",
        "course_location": {
            "label": "",
            "source": "fallback",
            "latitude": 0.0,
            "longitude": 0.0,
        },
        "thresholds": {
            "min_precip_probability": int(min_precip_probability),
            "min_precip_mm": float(min_precip_mm),
        },
        "counts": {
            "bookings_considered": 0,
            "at_risk": 0,
            "messageable": 0,
        },
        "items": [],
        "auto_prompts": {"created": 0, "skipped_existing": 0, "skipped_unlinked": 0},
        "auto_prompt_error": auto_prompt_error,
    }


def _weather_topic_key(target_date: date, booking_id: int) -> str:
    return f"weather:{target_date.isoformat()}:{int(booking_id)}"


def _attach_weather_notification_state(
    db: Session,
    club_id: int,
    target_date: date,
    items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not items:
        return items

    topic_keys = [
        _weather_topic_key(target_date, int(item.get("booking_id") or 0))
        for item in items
        if int(item.get("booking_id") or 0) > 0
    ]
    if not topic_keys:
        return items

    try:
        existing_rows = (
            db.query(PlayerNotification)
            .filter(
                PlayerNotification.club_id == int(club_id),
                PlayerNotification.kind == "weather_reconfirm",
                PlayerNotification.topic_key.in_(topic_keys),
            )
            .order_by(desc(PlayerNotification.created_at))
            .all()
        )
    except Exception:
        _safe_rollback(db)
        for item in items:
            booking_id = int(item.get("booking_id") or 0)
            item["topic_key"] = _weather_topic_key(target_date, booking_id) if booking_id > 0 else None
            item["notification_id"] = None
            item["notification_status"] = None
            item["notification_response"] = None
            item["notification_sent"] = False
        return items

    latest_by_topic: dict[str, PlayerNotification] = {}
    for row in existing_rows:
        topic = str(getattr(row, "topic_key", "") or "").strip()
        if not topic or topic in latest_by_topic:
            continue
        latest_by_topic[topic] = row

    for item in items:
        booking_id = int(item.get("booking_id") or 0)
        topic = _weather_topic_key(target_date, booking_id) if booking_id > 0 else None
        row = latest_by_topic.get(topic or "")
        item["topic_key"] = topic
        if not row:
            item["notification_id"] = None
            item["notification_status"] = None
            item["notification_response"] = None
            item["notification_sent"] = False
            continue
        item["notification_id"] = int(getattr(row, "id", 0) or 0)
        item["notification_status"] = str(getattr(row, "status", "") or "")
        item["notification_response"] = str(getattr(row, "response", "") or "")
        item["notification_sent"] = True

    return items


def _create_weather_notifications(
    db: Session,
    club_id: int,
    target_date: date,
    staff: User,
    items: list[dict[str, Any]],
) -> dict[str, int]:
    created = 0
    skipped_existing = 0
    skipped_unlinked = 0
    now = datetime.utcnow()

    for item in items:
        if not bool(item.get("can_message")):
            skipped_unlinked += 1
            continue

        if bool(item.get("notification_sent")):
            skipped_existing += 1
            continue

        booking_id = int(item.get("booking_id") or 0)
        tee_time_id = int(item.get("tee_time_id") or 0)
        player_user_id = int(item.get("player_user_id") or 0)
        topic_key = _weather_topic_key(target_date, booking_id) if booking_id > 0 else None
        if player_user_id <= 0 or booking_id <= 0:
            skipped_unlinked += 1
            continue

        title, body, payload_json = build_weather_prompt_payload(item, sender_name=getattr(staff, "name", None))

        row = PlayerNotification(
            club_id=int(club_id),
            user_id=player_user_id,
            booking_id=booking_id,
            tee_time_id=tee_time_id if tee_time_id > 0 else None,
            kind="weather_reconfirm",
            topic_key=topic_key,
            title=title,
            body=body,
            payload_json=json.dumps(payload_json, separators=(",", ":")),
            status="unread",
            requires_action=True,
            created_by_user_id=getattr(staff, "id", None),
            created_at=now,
        )
        db.add(row)
        created += 1

    return {
        "created": created,
        "skipped_existing": skipped_existing,
        "skipped_unlinked": skipped_unlinked,
    }


@router.get("/tee-sheet/weather/preview")
def preview_tee_sheet_weather(
    date_value: date = Query(..., alias="date"),
    min_precip_probability: int = Query(60, ge=0, le=100),
    min_precip_mm: float = Query(1.0, ge=0.0, le=100.0),
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    try:
        payload = build_weather_booking_candidates(
            db=db,
            club_id=int(club_id),
            target_date=date_value,
            min_precip_probability=int(min_precip_probability),
            min_precip_mm=float(min_precip_mm),
        )
        items = payload.get("items") if isinstance(payload, dict) else []
        if isinstance(items, list):
            payload["items"] = _attach_weather_notification_state(db, int(club_id), date_value, items)
        return payload
    except RuntimeError as e:
        _safe_rollback(db)
        return _weather_fallback_payload(
            target_date=date_value,
            min_precip_probability=int(min_precip_probability),
            min_precip_mm=float(min_precip_mm),
            provider_note=str(e),
            auto_prompt_error=str(e),
        )
    except requests.RequestException as e:
        _safe_rollback(db)
        log_event(
            "warning",
            "weather.preview.request_failed",
            club_id=int(club_id),
            target_date=date_value.isoformat(),
            error_type=type(e).__name__,
            error=str(e)[:220],
        )
        return _weather_fallback_payload(
            target_date=date_value,
            min_precip_probability=int(min_precip_probability),
            min_precip_mm=float(min_precip_mm),
            provider_note="Live rain forecast temporarily unavailable.",
            auto_prompt_error="Weather provider request failed. Retry shortly.",
        )
    except HTTPException:
        raise
    except Exception as e:
        _safe_rollback(db)
        log_event(
            "warning",
            "weather.preview.failed",
            club_id=int(club_id),
            target_date=date_value.isoformat(),
            error_type=type(e).__name__,
            error=str(e)[:220],
        )
        return _weather_fallback_payload(
            target_date=date_value,
            min_precip_probability=int(min_precip_probability),
            min_precip_mm=float(min_precip_mm),
            provider_note="Weather preview is temporarily degraded.",
            auto_prompt_error=f"{type(e).__name__}: {str(e)[:120]}",
        )


@router.get("/tee-sheet/weather/auto-flags")
def auto_flag_tee_sheet_weather(
    date_value: date = Query(..., alias="date"),
    min_precip_probability: int = Query(60, ge=0, le=100),
    min_precip_mm: float = Query(1.0, ge=0.0, le=100.0),
    auto_send: int = Query(0, ge=0, le=1),
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    try:
        payload = build_weather_booking_candidates(
            db=db,
            club_id=int(club_id),
            target_date=date_value,
            min_precip_probability=int(min_precip_probability),
            min_precip_mm=float(min_precip_mm),
        )
        items = payload.get("items") if isinstance(payload, dict) else []
        if not isinstance(items, list):
            items = []

        items = _attach_weather_notification_state(db, int(club_id), date_value, items)
        auto_counts = {"created": 0, "skipped_existing": 0, "skipped_unlinked": 0}
        auto_prompt_error = None
        if int(auto_send or 0) == 1 and items:
            try:
                auto_counts = _create_weather_notifications(
                    db=db,
                    club_id=int(club_id),
                    target_date=date_value,
                    staff=staff,
                    items=items,
                )
                if int(auto_counts.get("created") or 0) > 0:
                    db.commit()
                    items = _attach_weather_notification_state(db, int(club_id), date_value, items)
                else:
                    db.rollback()
            except Exception as e:
                db.rollback()
                message = str(e).lower()
                if "player_notifications" in message and ("does not exist" in message or "no such table" in message):
                    auto_prompt_error = "Notification storage not initialized. Redeploy with AUTO_MIGRATE=1."
                else:
                    raise

        payload["items"] = items
        payload["auto_prompts"] = auto_counts
        payload["auto_prompt_error"] = auto_prompt_error
        return payload
    except RuntimeError as e:
        _safe_rollback(db)
        return _weather_fallback_payload(
            target_date=date_value,
            min_precip_probability=int(min_precip_probability),
            min_precip_mm=float(min_precip_mm),
            provider_note=str(e),
            auto_prompt_error=str(e),
        )
    except requests.RequestException as e:
        _safe_rollback(db)
        log_event(
            "warning",
            "weather.auto_flags.request_failed",
            club_id=int(club_id),
            target_date=date_value.isoformat(),
            error_type=type(e).__name__,
            error=str(e)[:220],
        )
        return _weather_fallback_payload(
            target_date=date_value,
            min_precip_probability=int(min_precip_probability),
            min_precip_mm=float(min_precip_mm),
            provider_note="Live rain forecast temporarily unavailable.",
            auto_prompt_error="Weather provider request failed. Retry shortly.",
        )
    except HTTPException:
        _safe_rollback(db)
        raise
    except Exception as e:
        _safe_rollback(db)
        message = str(e).lower()
        if "player_notifications" in message and ("does not exist" in message or "no such table" in message):
            raise HTTPException(status_code=503, detail="Notification storage not initialized. Redeploy with AUTO_MIGRATE=1.")
        log_event(
            "warning",
            "weather.auto_flags.failed",
            club_id=int(club_id),
            target_date=date_value.isoformat(),
            error_type=type(e).__name__,
            error=str(e)[:220],
        )
        return _weather_fallback_payload(
            target_date=date_value,
            min_precip_probability=int(min_precip_probability),
            min_precip_mm=float(min_precip_mm),
            provider_note="Weather auto-flag is temporarily degraded.",
            auto_prompt_error=f"{type(e).__name__}: {str(e)[:120]}",
        )


@router.post("/tee-sheet/weather/reconfirm")
def send_tee_sheet_weather_reconfirm(
    req: WeatherReconfirmRequest,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    try:
        payload = build_weather_booking_candidates(
            db=db,
            club_id=int(club_id),
            target_date=req.date,
            min_precip_probability=int(req.min_precip_probability),
            min_precip_mm=float(req.min_precip_mm),
        )
        items = payload.get("items") if isinstance(payload, dict) else []
        if not isinstance(items, list):
            items = []

        items = _attach_weather_notification_state(db, int(club_id), req.date, items)
        counts = _create_weather_notifications(
            db=db,
            club_id=int(club_id),
            target_date=req.date,
            staff=staff,
            items=items,
        )
        if int(counts.get("created") or 0) > 0:
            db.commit()
        else:
            db.rollback()
        return {
            "target_date": req.date.isoformat(),
            "created": int(counts.get("created") or 0),
            "skipped_existing": int(counts.get("skipped_existing") or 0),
            "skipped_unlinked": int(counts.get("skipped_unlinked") or 0),
            "at_risk": int(((payload.get("counts") or {}).get("at_risk") or 0)),
            "messageable": int(((payload.get("counts") or {}).get("messageable") or 0)),
        }
    except requests.RequestException:
        _safe_rollback(db)
        raise HTTPException(status_code=502, detail="Live rain forecast temporarily unavailable.")
    except RuntimeError as e:
        _safe_rollback(db)
        raise HTTPException(status_code=422, detail=str(e))
    except HTTPException:
        _safe_rollback(db)
        raise
    except Exception as e:
        _safe_rollback(db)
        message = str(e).lower()
        if "player_notifications" in message and ("does not exist" in message or "no such table" in message):
            raise HTTPException(status_code=503, detail="Notification storage not initialized. Redeploy with AUTO_MIGRATE=1.")
        print(f"[WEATHER_SEND] {type(e).__name__}: {str(e)[:220]}")
        raise HTTPException(status_code=500, detail="Failed to send weather reconfirm prompts.")


@router.get("/tee-sheet/weather/responses")
def list_tee_sheet_weather_responses(
    date_value: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    prefix = f"weather:{date_value.isoformat()}:"
    try:
        rows = (
            db.query(PlayerNotification)
            .filter(
                PlayerNotification.club_id == int(club_id),
                PlayerNotification.kind == "weather_reconfirm",
                PlayerNotification.topic_key.like(f"{prefix}%"),
            )
            .order_by(desc(PlayerNotification.created_at))
            .limit(300)
            .all()
        )
    except Exception:
        _safe_rollback(db)
        rows = []

    user_ids = {int(getattr(row, "user_id", 0) or 0) for row in rows if getattr(row, "user_id", None)}
    user_name_by_id: dict[int, str] = {}
    if user_ids:
        for user in db.query(User).filter(User.id.in_(list(user_ids))).all():
            user_name_by_id[int(user.id)] = str(getattr(user, "name", "") or "").strip() or str(getattr(user, "email", "") or "")

    response_counts: dict[str, int] = {}
    items: list[dict[str, Any]] = []
    for row in rows:
        response_key = str(getattr(row, "response", "") or "").strip().lower() or "pending"
        response_counts[response_key] = int(response_counts.get(response_key, 0) or 0) + 1
        payload = serialize_notification_payload(getattr(row, "payload_json", None))
        items.append(
            {
                "id": int(getattr(row, "id", 0) or 0),
                "user_id": int(getattr(row, "user_id", 0) or 0),
                "player_name": user_name_by_id.get(int(getattr(row, "user_id", 0) or 0), "Player"),
                "booking_id": int(getattr(row, "booking_id", 0) or 0) if getattr(row, "booking_id", None) else None,
                "tee_time_id": int(getattr(row, "tee_time_id", 0) or 0) if getattr(row, "tee_time_id", None) else None,
                "status": str(getattr(row, "status", "") or ""),
                "response": str(getattr(row, "response", "") or ""),
                "created_at": getattr(row, "created_at", None).isoformat() if getattr(row, "created_at", None) else None,
                "responded_at": getattr(row, "responded_at", None).isoformat() if getattr(row, "responded_at", None) else None,
                "risk_level": payload.get("risk_level"),
                "risk_reasons": payload.get("risk_reasons"),
                "tee_time": payload.get("tee_time"),
            }
        )

    return {
        "target_date": date_value.isoformat(),
        "count": len(items),
        "responses": response_counts,
        "items": items,
    }


@router.get("/dashboard")
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    """Get main dashboard statistics"""
    cache_key = f"dashboard:{int(club_id)}"
    cached = ADMIN_DASHBOARD_CACHE.get(cache_key)
    if cached is not None:
        return cached

    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]
    today_anchor = datetime.utcnow().date()
    _repair_booking_pricing_window(
        db,
        club_id,
        start_dt=datetime.combine(date(today_anchor.year, 1, 1), datetime.min.time()),
        end_dt_exclusive=datetime.combine(date(today_anchor.year + 1, 1, 1), datetime.min.time()),
    )

    # Total bookings
    total_bookings = db.query(func.count(Booking.id)).filter(Booking.club_id == club_id).scalar() or 0

    def _empty_status_counts() -> dict[str, int]:
        return {
            "booked": 0,
            "checked_in": 0,
            "completed": 0,
            "no_show": 0,
            "cancelled": 0,
        }

    def _booking_status_counts(start_d: date | None = None, end_d: date | None = None) -> dict[str, int]:
        counts = _empty_status_counts()
        try:
            q = db.query(Booking.status, func.count(Booking.id)).filter(Booking.club_id == club_id)
            if start_d is not None or end_d is not None:
                q = q.join(TeeTime, Booking.tee_time_id == TeeTime.id).filter(TeeTime.club_id == club_id)
                if start_d is not None:
                    q = q.filter(func.date(TeeTime.tee_time) >= start_d)
                if end_d is not None:
                    q = q.filter(func.date(TeeTime.tee_time) <= end_d)

            for status, count in q.group_by(Booking.status).all():
                if isinstance(status, BookingStatus):
                    key = str(status.value or "").strip().lower()
                else:
                    key = str(status or "").strip().lower().replace("bookingstatus.", "")
                if key in counts:
                    counts[key] = int(count or 0)
        except Exception:
            _safe_rollback(db)
            return counts
        return counts

    bookings_by_status = _booking_status_counts()
    booked_count = int(bookings_by_status.get("booked", 0))
    checked_in_count = int(bookings_by_status.get("checked_in", 0))
    completed_count = int(bookings_by_status.get("completed", 0))
    cancelled_count = int(bookings_by_status.get("cancelled", 0))
    no_show_count = int(bookings_by_status.get("no_show", 0))
    
    # Total golf revenue (cashbook basis = payment date / ledger entries)
    total_revenue = (
        db.query(func.sum(LedgerEntry.amount))
        .filter(LedgerEntry.club_id == club_id, LedgerEntry.booking_id.isnot(None))
        .scalar()
        or 0.0
    )

    # Total imported non-golf revenue excluding pro shop operational sales mirrored from POS.
    # Pro shop operational totals come from ProShopSale directly.
    try:
        other_total_revenue = (
            db.query(func.sum(RevenueTransaction.amount))
            .filter(
                RevenueTransaction.club_id == club_id,
                ~_pro_shop_revenue_source_clause(),
            )
            .scalar()
            or 0.0
        )
    except Exception:
        _safe_rollback(db)
        other_total_revenue = 0.0
    
    # Completed rounds (admin expectation = bookings marked completed)
    completed_rounds = completed_count
    
    # Registered players
    total_players = (
        db.query(func.count(User.id))
        .filter(User.role == UserRole.player, User.club_id == club_id)
        .scalar()
        or 0
    )

    # Members (imported club membership list)
    total_members = (
        db.query(func.count(Member.id))
        .filter(Member.club_id == club_id, Member.active == 1)
        .scalar()
        or 0
    )
    
    # Today's bookings
    now_utc = datetime.utcnow()
    today = now_utc.date()
    today_bookings = (
        db.query(func.count(Booking.id))
        .join(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(TeeTime.club_id == club_id, func.date(TeeTime.tee_time) == today)
        .scalar()
        or 0
    )
    
    def _other_revenue_by_stream(start_d: date | None = None, end_d: date | None = None) -> dict[str, float]:
        out: dict[str, float] = {}
        try:
            q = (
                db.query(
                    RevenueTransaction.source,
                    func.sum(RevenueTransaction.amount).label("amount"),
                )
                .filter(
                    RevenueTransaction.club_id == club_id,
                    ~_pro_shop_revenue_source_clause(),
                )
            )
            if start_d is not None:
                q = q.filter(RevenueTransaction.transaction_date >= start_d)
            if end_d is not None:
                q = q.filter(RevenueTransaction.transaction_date <= end_d)

            rows = q.group_by(RevenueTransaction.source).all()
            for source, amount in rows:
                key = _normalize_revenue_stream(source)
                out[key] = float(out.get(key, 0.0)) + float(amount or 0.0)
        except Exception:
            _safe_rollback(db)
            return {}
        return out

    other_total_by_stream = _other_revenue_by_stream()

    imported_golf_total = float(other_total_by_stream.get("golf", 0.0))
    golf_total_revenue = float(total_revenue) + imported_golf_total
    try:
        pro_shop_total_revenue = (
            db.query(func.sum(ProShopSale.total))
            .filter(ProShopSale.club_id == club_id)
            .scalar()
            or 0.0
        )
    except Exception:
        _safe_rollback(db)
        pro_shop_total_revenue = 0.0

    # Import freshness (best-effort; OK if tables not present on older DBs)
    imports = {}
    try:
        last_rev = db.query(ImportBatch).filter(ImportBatch.kind == "revenue").order_by(desc(ImportBatch.imported_at)).first()
        last_bookings = db.query(ImportBatch).filter(ImportBatch.kind == "bookings").order_by(desc(ImportBatch.imported_at)).first()
        imports = {
            "revenue": last_rev.imported_at.isoformat() if last_rev and last_rev.imported_at else None,
            "bookings": last_bookings.imported_at.isoformat() if last_bookings and last_bookings.imported_at else None,
        }
    except Exception:
        _safe_rollback(db)
        imports = {}

    def _stream_amounts_and_transactions(start_d: date, end_d: date) -> dict[str, dict[str, float | int]]:
        out: dict[str, dict[str, float | int]] = {}
        try:
            rows = (
                db.query(
                    RevenueTransaction.source,
                    func.sum(RevenueTransaction.amount).label("amount"),
                    func.count(RevenueTransaction.id).label("txns"),
                )
                .filter(
                    RevenueTransaction.club_id == club_id,
                    ~_pro_shop_revenue_source_clause(),
                    RevenueTransaction.transaction_date >= start_d,
                    RevenueTransaction.transaction_date <= end_d,
                )
                .group_by(RevenueTransaction.source)
                .all()
            )
            for source, amount, txns in rows:
                stream = _normalize_revenue_stream(source)
                cur = out.get(stream, {"amount": 0.0, "transactions": 0})
                cur["amount"] = float(cur["amount"]) + float(amount or 0.0)
                cur["transactions"] = int(cur["transactions"]) + int(txns or 0)
                out[stream] = cur
        except Exception:
            _safe_rollback(db)
            return {}
        return out

    def _golf_paid_amounts_and_rounds(start_d: date, end_d: date) -> tuple[float, int]:
        try:
            paid_revenue = (
                db.query(func.sum(LedgerEntry.amount))
                .filter(
                    LedgerEntry.club_id == club_id,
                    LedgerEntry.booking_id.isnot(None),
                    func.date(LedgerEntry.created_at) >= start_d,
                    func.date(LedgerEntry.created_at) <= end_d,
                )
                .scalar()
                or 0.0
            )
            paid_rounds = (
                db.query(func.count(LedgerEntry.id))
                .filter(
                    LedgerEntry.club_id == club_id,
                    LedgerEntry.booking_id.isnot(None),
                    func.date(LedgerEntry.created_at) >= start_d,
                    func.date(LedgerEntry.created_at) <= end_d,
                )
                .scalar()
                or 0
            )
            return float(paid_revenue), int(paid_rounds)
        except Exception:
            _safe_rollback(db)
            return 0.0, 0

    def _pro_shop_sales_amounts_and_transactions(start_d: date, end_d: date) -> tuple[float, int]:
        start_dt = datetime.combine(start_d, Time.min)
        end_dt = datetime.combine(end_d + timedelta(days=1), Time.min)
        try:
            gross = (
                db.query(func.sum(ProShopSale.total))
                .filter(
                    ProShopSale.club_id == club_id,
                    ProShopSale.sold_at >= start_dt,
                    ProShopSale.sold_at < end_dt,
                )
                .scalar()
                or 0.0
            )
            txns = (
                db.query(func.count(ProShopSale.id))
                .filter(
                    ProShopSale.club_id == club_id,
                    ProShopSale.sold_at >= start_dt,
                    ProShopSale.sold_at < end_dt,
                )
                .scalar()
                or 0
            )
            return float(gross), int(txns)
        except Exception:
            _safe_rollback(db)
            return 0.0, 0

    golf_today_paid_rounds = 0
    golf_today_no_shows = 0
    golf_today_slot_capacity = 0
    golf_today_slot_booked = 0
    try:
        golf_today_paid_rounds = (
            db.query(func.count(Booking.id))
            .join(TeeTime, Booking.tee_time_id == TeeTime.id)
            .filter(
                TeeTime.club_id == club_id,
                Booking.club_id == club_id,
                func.date(TeeTime.tee_time) == today,
                Booking.status.in_(paid_statuses),
            )
            .scalar()
            or 0
        )
        golf_today_no_shows = (
            db.query(func.count(Booking.id))
            .join(TeeTime, Booking.tee_time_id == TeeTime.id)
            .filter(
                TeeTime.club_id == club_id,
                Booking.club_id == club_id,
                func.date(TeeTime.tee_time) == today,
                Booking.status == BookingStatus.no_show,
            )
            .scalar()
            or 0
        )
        golf_today_slot_capacity = (
            db.query(func.sum(TeeTime.capacity))
            .filter(TeeTime.club_id == club_id, func.date(TeeTime.tee_time) == today)
            .scalar()
            or 0
        )
        golf_today_slot_booked = (
            db.query(func.count(Booking.id))
            .join(TeeTime, Booking.tee_time_id == TeeTime.id)
            .filter(
                TeeTime.club_id == club_id,
                Booking.club_id == club_id,
                func.date(TeeTime.tee_time) == today,
                Booking.status.in_([BookingStatus.booked, BookingStatus.checked_in, BookingStatus.completed]),
            )
            .scalar()
            or 0
        )
    except Exception:
        _safe_rollback(db)
        golf_today_paid_rounds = 0
        golf_today_no_shows = 0
        golf_today_slot_capacity = 0
        golf_today_slot_booked = 0

    pro_shop_txns_today = 0
    pro_shop_txns_7d = 0
    pro_shop_avg_basket_30d = 0.0
    pro_shop_units_sold_30d = 0
    pro_shop_days_of_cover: float | None = None
    pro_shop_active_products = 0
    pro_shop_low_stock_items = 0
    pro_shop_stock_units = 0
    pro_shop_stock_value = 0.0
    pro_shop_top_sellers: list[dict[str, float | int | str]] = []
    try:
        start_7 = datetime.combine(today - timedelta(days=6), Time.min)
        start_30 = datetime.combine(today - timedelta(days=29), Time.min)
        end_exclusive = datetime.combine(today + timedelta(days=1), Time.min)

        pro_shop_txns_today = (
            db.query(func.count(ProShopSale.id))
            .filter(
                ProShopSale.club_id == club_id,
                ProShopSale.sold_at >= datetime.combine(today, Time.min),
                ProShopSale.sold_at < end_exclusive,
            )
            .scalar()
            or 0
        )
        pro_shop_txns_7d = (
            db.query(func.count(ProShopSale.id))
            .filter(ProShopSale.club_id == club_id, ProShopSale.sold_at >= start_7, ProShopSale.sold_at < end_exclusive)
            .scalar()
            or 0
        )
        pro_shop_sales_30d = (
            db.query(func.sum(ProShopSale.total))
            .filter(ProShopSale.club_id == club_id, ProShopSale.sold_at >= start_30, ProShopSale.sold_at < end_exclusive)
            .scalar()
            or 0.0
        )
        pro_shop_txns_30d = (
            db.query(func.count(ProShopSale.id))
            .filter(ProShopSale.club_id == club_id, ProShopSale.sold_at >= start_30, ProShopSale.sold_at < end_exclusive)
            .scalar()
            or 0
        )
        pro_shop_avg_basket_30d = (
            float(pro_shop_sales_30d) / float(pro_shop_txns_30d)
            if int(pro_shop_txns_30d) > 0
            else 0.0
        )
        pro_shop_units_sold_30d = (
            db.query(func.sum(ProShopSaleItem.quantity))
            .join(ProShopSale, ProShopSaleItem.sale_id == ProShopSale.id)
            .filter(
                ProShopSaleItem.club_id == club_id,
                ProShopSale.sold_at >= start_30,
                ProShopSale.sold_at < end_exclusive,
            )
            .scalar()
            or 0
        )
        pro_shop_active_products = (
            db.query(func.count(ProShopProduct.id))
            .filter(ProShopProduct.club_id == club_id, ProShopProduct.active == 1)
            .scalar()
            or 0
        )
        pro_shop_low_stock_items = (
            db.query(func.count(ProShopProduct.id))
            .filter(
                ProShopProduct.club_id == club_id,
                ProShopProduct.active == 1,
                ProShopProduct.stock_qty <= func.coalesce(ProShopProduct.reorder_level, 0),
            )
            .scalar()
            or 0
        )
        pro_shop_stock_units = (
            db.query(func.sum(ProShopProduct.stock_qty))
            .filter(ProShopProduct.club_id == club_id, ProShopProduct.active == 1)
            .scalar()
            or 0
        )
        pro_shop_stock_value = (
            db.query(func.sum(ProShopProduct.stock_qty * func.coalesce(ProShopProduct.cost_price, ProShopProduct.unit_price)))
            .filter(ProShopProduct.club_id == club_id, ProShopProduct.active == 1)
            .scalar()
            or 0.0
        )
        if int(pro_shop_units_sold_30d) > 0:
            daily_velocity_30d = float(pro_shop_units_sold_30d) / 30.0
            pro_shop_days_of_cover = (
                float(pro_shop_stock_units) / daily_velocity_30d
                if daily_velocity_30d > 0
                else None
            )
        else:
            pro_shop_days_of_cover = None
        top_rows = (
            db.query(
                ProShopSaleItem.name_snapshot,
                func.sum(ProShopSaleItem.quantity).label("units"),
                func.sum(ProShopSaleItem.line_total).label("revenue"),
            )
            .join(ProShopSale, ProShopSaleItem.sale_id == ProShopSale.id)
            .filter(
                ProShopSaleItem.club_id == club_id,
                ProShopSale.sold_at >= start_30,
                ProShopSale.sold_at < end_exclusive,
            )
            .group_by(ProShopSaleItem.name_snapshot)
            .order_by(desc(func.sum(ProShopSaleItem.line_total)))
            .limit(5)
            .all()
        )
        pro_shop_top_sellers = [
            {
                "name": str(r[0] or "Item"),
                "units": int(r[1] or 0),
                "revenue": float(r[2] or 0.0),
            }
            for r in top_rows
        ]
    except Exception:
        _safe_rollback(db)
        pro_shop_txns_today = 0
        pro_shop_txns_7d = 0
        pro_shop_avg_basket_30d = 0.0
        pro_shop_units_sold_30d = 0
        pro_shop_days_of_cover = None
        pro_shop_active_products = 0
        pro_shop_low_stock_items = 0
        pro_shop_stock_units = 0
        pro_shop_stock_value = 0.0
        pro_shop_top_sellers = []

    today_stream_stats = _stream_amounts_and_transactions(today, today)
    week_stream_stats = _stream_amounts_and_transactions(today - timedelta(days=6), today)
    prior_week_stream_stats = _stream_amounts_and_transactions(today - timedelta(days=13), today - timedelta(days=7))
    stream_highlights: dict[str, list[dict[str, float | int | str]]] = {"pub": [], "bowls": [], "other": []}

    try:
        top_start = today - timedelta(days=29)
        top_rows = (
            db.query(
                RevenueTransaction.source,
                func.coalesce(RevenueTransaction.category, "Uncategorized").label("category"),
                func.sum(RevenueTransaction.amount).label("amount"),
                func.count(RevenueTransaction.id).label("txns"),
            )
            .filter(
                RevenueTransaction.club_id == club_id,
                RevenueTransaction.transaction_date >= top_start,
                RevenueTransaction.transaction_date <= today,
            )
            .group_by(RevenueTransaction.source, func.coalesce(RevenueTransaction.category, "Uncategorized"))
            .order_by(desc(func.sum(RevenueTransaction.amount)))
            .all()
        )
        grouped: dict[str, list[dict[str, float | int | str]]] = {}
        for source, category, amount, txns in top_rows:
            stream = _normalize_revenue_stream(source)
            if stream not in {"pub", "bowls", "other"}:
                continue
            rows = grouped.get(stream, [])
            if len(rows) >= 3:
                continue
            rows.append(
                {
                    "name": f"Top Category: {str(category or 'Uncategorized')}",
                    "current": float(amount or 0.0),
                    "format": "currency",
                    "context": f"{int(txns or 0)} transactions in last 30 days",
                }
            )
            grouped[stream] = rows
        for key in ("pub", "bowls", "other"):
            stream_highlights[key] = grouped.get(key, [])
    except Exception:
        _safe_rollback(db)
        stream_highlights = {"pub": [], "bowls": [], "other": []}

    def _stream_amount(stats: dict[str, dict[str, float | int]], stream: str) -> float:
        return float((stats.get(stream) or {}).get("amount", 0.0))

    def _stream_txns(stats: dict[str, dict[str, float | int]], stream: str) -> int:
        return int((stats.get(stream) or {}).get("transactions", 0))

    def _avg_ticket(amount: float, txns: int) -> float:
        return (float(amount) / float(txns)) if int(txns) > 0 else 0.0

    def _delta_ratio(current: float, previous: float) -> float | None:
        prev = float(previous or 0.0)
        cur = float(current or 0.0)
        if prev <= 0:
            return 1.0 if cur > 0 else None
        return (cur - prev) / prev

    yesterday = today - timedelta(days=1)
    month_start = today.replace(day=1)
    prior_month_end = month_start - timedelta(days=1)
    prior_month_start = prior_month_end.replace(day=1)
    ytd_start = date(today.year, 1, 1)
    ytd_days_elapsed = (today - ytd_start).days + 1
    prior_ytd_start = date(today.year - 1, 1, 1)
    prior_ytd_end = prior_ytd_start + timedelta(days=max(0, ytd_days_elapsed - 1))
    prior_ytd_year_end = date(today.year - 1, 12, 31)
    if prior_ytd_end > prior_ytd_year_end:
        prior_ytd_end = prior_ytd_year_end
    bookings_by_status_periods = {
        "day": _booking_status_counts(today, today),
        "week": _booking_status_counts(today - timedelta(days=6), today),
        "month": _booking_status_counts(month_start, today),
        "ytd": _booking_status_counts(ytd_start, today),
    }

    day_stream_stats = today_stream_stats
    prior_day_stream_stats = _stream_amounts_and_transactions(yesterday, yesterday)
    month_stream_stats = _stream_amounts_and_transactions(month_start, today)
    prior_month_stream_stats = _stream_amounts_and_transactions(prior_month_start, prior_month_end)
    ytd_stream_stats = _stream_amounts_and_transactions(ytd_start, today)
    prior_ytd_stream_stats = _stream_amounts_and_transactions(prior_ytd_start, prior_ytd_end)

    def _period_rollup(current_revenue: float, current_txns: int, prior_revenue: float) -> dict[str, float | int | None]:
        return {
            "revenue": float(current_revenue),
            "transactions": int(current_txns),
            "avg_ticket": float(_avg_ticket(current_revenue, current_txns)),
            "vs_prior": _delta_ratio(current_revenue, prior_revenue),
            "prior_revenue": float(prior_revenue),
        }

    golf_paid_day_revenue, golf_paid_day_rounds = _golf_paid_amounts_and_rounds(today, today)
    golf_paid_prior_day_revenue, golf_paid_prior_day_rounds = _golf_paid_amounts_and_rounds(yesterday, yesterday)
    golf_paid_week_revenue, golf_paid_week_rounds = _golf_paid_amounts_and_rounds(today - timedelta(days=6), today)
    golf_paid_prior_week_revenue, golf_paid_prior_week_rounds = _golf_paid_amounts_and_rounds(
        today - timedelta(days=13),
        today - timedelta(days=7),
    )
    golf_paid_month_revenue, golf_paid_month_rounds = _golf_paid_amounts_and_rounds(month_start, today)
    golf_paid_prior_month_revenue, golf_paid_prior_month_rounds = _golf_paid_amounts_and_rounds(
        prior_month_start,
        prior_month_end,
    )
    golf_paid_ytd_revenue, golf_paid_ytd_rounds = _golf_paid_amounts_and_rounds(ytd_start, today)
    golf_paid_prior_ytd_revenue, golf_paid_prior_ytd_rounds = _golf_paid_amounts_and_rounds(
        prior_ytd_start,
        prior_ytd_end,
    )
    pro_shop_day_revenue, pro_shop_day_txns = _pro_shop_sales_amounts_and_transactions(today, today)
    pro_shop_prior_day_revenue, pro_shop_prior_day_txns = _pro_shop_sales_amounts_and_transactions(yesterday, yesterday)
    pro_shop_week_revenue_native, pro_shop_week_txns_native = _pro_shop_sales_amounts_and_transactions(today - timedelta(days=6), today)
    pro_shop_prior_week_revenue, pro_shop_prior_week_txns = _pro_shop_sales_amounts_and_transactions(
        today - timedelta(days=13),
        today - timedelta(days=7),
    )
    pro_shop_month_revenue_native, pro_shop_month_txns_native = _pro_shop_sales_amounts_and_transactions(month_start, today)
    pro_shop_prior_month_revenue, pro_shop_prior_month_txns = _pro_shop_sales_amounts_and_transactions(
        prior_month_start,
        prior_month_end,
    )
    pro_shop_ytd_revenue_native, pro_shop_ytd_txns_native = _pro_shop_sales_amounts_and_transactions(ytd_start, today)
    pro_shop_prior_ytd_revenue, pro_shop_prior_ytd_txns = _pro_shop_sales_amounts_and_transactions(
        prior_ytd_start,
        prior_ytd_end,
    )

    golf_periods = {
        "day": _period_rollup(
            golf_paid_day_revenue + _stream_amount(day_stream_stats, "golf"),
            golf_paid_day_rounds + _stream_txns(day_stream_stats, "golf"),
            golf_paid_prior_day_revenue + _stream_amount(prior_day_stream_stats, "golf"),
        ),
        "week": _period_rollup(
            golf_paid_week_revenue + _stream_amount(week_stream_stats, "golf"),
            golf_paid_week_rounds + _stream_txns(week_stream_stats, "golf"),
            golf_paid_prior_week_revenue + _stream_amount(prior_week_stream_stats, "golf"),
        ),
        "month": _period_rollup(
            golf_paid_month_revenue + _stream_amount(month_stream_stats, "golf"),
            golf_paid_month_rounds + _stream_txns(month_stream_stats, "golf"),
            golf_paid_prior_month_revenue + _stream_amount(prior_month_stream_stats, "golf"),
        ),
        "ytd": _period_rollup(
            golf_paid_ytd_revenue + _stream_amount(ytd_stream_stats, "golf"),
            golf_paid_ytd_rounds + _stream_txns(ytd_stream_stats, "golf"),
            golf_paid_prior_ytd_revenue + _stream_amount(prior_ytd_stream_stats, "golf"),
        ),
    }

    pro_shop_periods = {
        "day": _period_rollup(
            pro_shop_day_revenue,
            pro_shop_day_txns,
            pro_shop_prior_day_revenue,
        ),
        "week": _period_rollup(
            pro_shop_week_revenue_native,
            pro_shop_week_txns_native,
            pro_shop_prior_week_revenue,
        ),
        "month": _period_rollup(
            pro_shop_month_revenue_native,
            pro_shop_month_txns_native,
            pro_shop_prior_month_revenue,
        ),
        "ytd": _period_rollup(
            pro_shop_ytd_revenue_native,
            pro_shop_ytd_txns_native,
            pro_shop_prior_ytd_revenue,
        ),
    }

    other_streams: list[tuple[str, str]] = [("pub", "Pub"), ("bowls", "Bowls"), ("other", "Other")]
    stream_rollups: dict[str, dict] = {
        "golf": {
            "label": "Golf",
            "total_revenue": float(golf_total_revenue),
            "periods": golf_periods,
        },
        "pro_shop": {
            "label": "Pro Shop",
            "total_revenue": float(pro_shop_total_revenue),
            "periods": pro_shop_periods,
        },
    }
    for stream_key, stream_label in other_streams:
        stream_rollups[stream_key] = {
            "label": stream_label,
            "total_revenue": float(other_total_by_stream.get(stream_key, 0.0)),
            "periods": {
                "day": _period_rollup(
                    _stream_amount(day_stream_stats, stream_key),
                    _stream_txns(day_stream_stats, stream_key),
                    _stream_amount(prior_day_stream_stats, stream_key),
                ),
                "week": _period_rollup(
                    _stream_amount(week_stream_stats, stream_key),
                    _stream_txns(week_stream_stats, stream_key),
                    _stream_amount(prior_week_stream_stats, stream_key),
                ),
                "month": _period_rollup(
                    _stream_amount(month_stream_stats, stream_key),
                    _stream_txns(month_stream_stats, stream_key),
                    _stream_amount(prior_month_stream_stats, stream_key),
                ),
                "ytd": _period_rollup(
                    _stream_amount(ytd_stream_stats, stream_key),
                    _stream_txns(ytd_stream_stats, stream_key),
                    _stream_amount(prior_ytd_stream_stats, stream_key),
                ),
            },
        }

    combined_total_revenue = float(sum(float(stream_rollups[k]["total_revenue"]) for k in ["golf", "pro_shop", "pub", "bowls", "other"]))
    combined_periods: dict[str, dict[str, float | int | None]] = {}
    for period_key in ("day", "week", "month", "ytd"):
        combined_revenue = float(sum(float(stream_rollups[k]["periods"][period_key]["revenue"]) for k in ["golf", "pro_shop", "pub", "bowls", "other"]))
        combined_txns = int(sum(int(stream_rollups[k]["periods"][period_key]["transactions"]) for k in ["golf", "pro_shop", "pub", "bowls", "other"]))
        combined_prior_revenue = float(
            sum(float(stream_rollups[k]["periods"][period_key]["prior_revenue"]) for k in ["golf", "pro_shop", "pub", "bowls", "other"])
        )
        combined_periods[period_key] = _period_rollup(combined_revenue, combined_txns, combined_prior_revenue)

    stream_rollups["all"] = {
        "label": "All Operations",
        "total_revenue": float(combined_total_revenue),
        "periods": combined_periods,
    }

    golf_today_revenue = float(stream_rollups["golf"]["periods"]["day"]["revenue"])
    golf_week_revenue = float(stream_rollups["golf"]["periods"]["week"]["revenue"])
    golf_today_transactions = int(stream_rollups["golf"]["periods"]["day"]["transactions"])
    golf_week_transactions = int(stream_rollups["golf"]["periods"]["week"]["transactions"])
    golf_week_vs_prior = stream_rollups["golf"]["periods"]["week"]["vs_prior"]
    golf_avg_ticket_7d = float(stream_rollups["golf"]["periods"]["week"]["avg_ticket"])

    pro_shop_today_revenue = float(stream_rollups["pro_shop"]["periods"]["day"]["revenue"])
    pro_shop_week_revenue = float(stream_rollups["pro_shop"]["periods"]["week"]["revenue"])
    pro_shop_today_transactions = int(stream_rollups["pro_shop"]["periods"]["day"]["transactions"])
    pro_shop_week_transactions = int(stream_rollups["pro_shop"]["periods"]["week"]["transactions"])
    pro_shop_week_vs_prior = stream_rollups["pro_shop"]["periods"]["week"]["vs_prior"]
    pro_shop_avg_ticket_7d = float(stream_rollups["pro_shop"]["periods"]["week"]["avg_ticket"])

    other_total_revenue = float(sum(float(stream_rollups[k]["total_revenue"]) for k, _ in other_streams))
    today_other_revenue = float(sum(float(stream_rollups[k]["periods"]["day"]["revenue"]) for k, _ in other_streams))
    week_other_revenue = float(sum(float(stream_rollups[k]["periods"]["week"]["revenue"]) for k, _ in other_streams))

    combined_today_revenue = float(stream_rollups["all"]["periods"]["day"]["revenue"])
    combined_week_revenue = float(stream_rollups["all"]["periods"]["week"]["revenue"])
    combined_today_transactions = int(stream_rollups["all"]["periods"]["day"]["transactions"])
    combined_week_transactions = int(stream_rollups["all"]["periods"]["week"]["transactions"])
    combined_week_vs_prior = stream_rollups["all"]["periods"]["week"]["vs_prior"]
    combined_avg_ticket_7d = float(stream_rollups["all"]["periods"]["week"]["avg_ticket"])

    golf_today_occupancy_rate = (
        float(golf_today_slot_booked) / float(golf_today_slot_capacity)
        if float(golf_today_slot_capacity) > 0
        else 0.0
    )
    golf_no_show_rate_today = (
        float(golf_today_no_shows) / float(golf_today_paid_rounds + golf_today_no_shows)
        if int(golf_today_paid_rounds + golf_today_no_shows) > 0
        else 0.0
    )
    golf_revenue_per_paid_round = (
        float(golf_today_revenue) / float(golf_today_paid_rounds)
        if int(golf_today_paid_rounds) > 0
        else 0.0
    )
    pro_shop_low_stock_rate = (
        float(pro_shop_low_stock_items) / float(pro_shop_active_products)
        if int(pro_shop_active_products) > 0
        else 0.0
    )

    revenue_streams: dict[str, dict] = {}
    for stream_key in ("all", "golf", "pro_shop", "pub", "bowls", "other"):
        stream_data = stream_rollups[stream_key]
        periods_payload: dict[str, dict[str, float | int | None]] = {}
        for period_key in ("day", "week", "month", "ytd"):
            period_data = stream_data["periods"][period_key]
            periods_payload[period_key] = {
                "revenue": float(period_data["revenue"]),
                "transactions": int(period_data["transactions"]),
                "avg_ticket": float(period_data["avg_ticket"]),
                "vs_prior": period_data["vs_prior"],
                "prior_revenue": float(period_data["prior_revenue"]),
            }

        revenue_streams[stream_key] = {
            "label": str(stream_data["label"]),
            "total_revenue": float(stream_data["total_revenue"]),
            "today_revenue": float(periods_payload["day"]["revenue"]),
            "week_revenue": float(periods_payload["week"]["revenue"]),
            "month_revenue": float(periods_payload["month"]["revenue"]),
            "ytd_revenue": float(periods_payload["ytd"]["revenue"]),
            "today_transactions": int(periods_payload["day"]["transactions"]),
            "week_transactions": int(periods_payload["week"]["transactions"]),
            "month_transactions": int(periods_payload["month"]["transactions"]),
            "ytd_transactions": int(periods_payload["ytd"]["transactions"]),
            "avg_ticket_week": float(periods_payload["week"]["avg_ticket"]),
            "avg_ticket_month": float(periods_payload["month"]["avg_ticket"]),
            "avg_ticket_ytd": float(periods_payload["ytd"]["avg_ticket"]),
            "day_vs_prior_day": periods_payload["day"]["vs_prior"],
            "week_vs_prior_week": periods_payload["week"]["vs_prior"],
            "month_vs_prior_month": periods_payload["month"]["vs_prior"],
            "ytd_vs_prior_ytd": periods_payload["ytd"]["vs_prior"],
            "periods": periods_payload,
        }

    def _stream_mix(amt: float) -> float:
        return (float(amt) / float(combined_today_revenue)) if float(combined_today_revenue) > 0 else 0.0

    all_highlights: list[dict[str, float | int | str | None]] = [
        {
            "name": "Golf Revenue Mix (Today)",
            "current": _stream_mix(golf_today_revenue),
            "format": "percent",
            "context": f"{golf_today_transactions} transactions | R{golf_today_revenue:.2f}",
        },
        {
            "name": "Pro Shop Revenue Mix (Today)",
            "current": _stream_mix(pro_shop_today_revenue),
            "format": "percent",
            "context": f"{pro_shop_today_transactions} transactions | R{pro_shop_today_revenue:.2f}",
        },
    ]
    for stream_key, stream_label in other_streams:
        stream_day = stream_rollups[stream_key]["periods"]["day"]
        all_highlights.append(
            {
                "name": f"{stream_label} Revenue Mix (Today)",
                "current": _stream_mix(float(stream_day["revenue"])),
                "format": "percent",
                "context": f"{int(stream_day['transactions'])} transactions | R{float(stream_day['revenue']):.2f}",
            }
        )

    pro_shop_highlights: list[dict[str, float | int | str | None]] = [
        {
            "name": "Avg Basket (30d)",
            "current": float(pro_shop_avg_basket_30d),
            "format": "currency",
            "context": f"{int(pro_shop_txns_7d)} POS transactions in last 7 days",
        },
        {
            "name": "Inventory Value",
            "current": float(pro_shop_stock_value),
            "format": "currency",
            "context": f"{int(pro_shop_stock_units)} units on hand",
        },
        {
            "name": "Days of Cover",
            "current": float(pro_shop_days_of_cover) if pro_shop_days_of_cover is not None else 0.0,
            "format": "number",
            "context": (
                "Based on 30-day unit velocity"
                if pro_shop_days_of_cover is not None
                else "Insufficient 30-day sales history"
            ),
        },
    ]
    for row in pro_shop_top_sellers[:3]:
        pro_shop_highlights.append(
            {
                "name": f"Top Seller: {str(row['name'])}",
                "current": float(row["revenue"]),
                "format": "currency",
                "context": f"{int(row['units'])} units in last 30 days",
            }
        )

    operation_insights = {
        "all": {
            "cards": [
                {"label": "Revenue Today", "value": float(combined_today_revenue), "format": "currency"},
                {"label": "Transactions Today", "value": int(combined_today_transactions), "format": "number"},
                {"label": "Avg Ticket (7d)", "value": float(combined_avg_ticket_7d), "format": "currency"},
                {"label": "7d vs Prior 7d", "value": combined_week_vs_prior, "format": "percent"},
            ],
            "note": "Executive view across golf, native pro shop POS sales, and imported non-pro-shop revenue. Switch streams above for operational detail.",
            "highlights": all_highlights,
        },
        "golf": {
            "cards": [
                {"label": "Tee Occupancy Today", "value": float(golf_today_occupancy_rate), "format": "percent"},
                {"label": "Paid Rounds Today", "value": int(golf_today_paid_rounds), "format": "number"},
                {"label": "Revenue / Paid Round", "value": float(golf_revenue_per_paid_round), "format": "currency"},
                {"label": "No-show Rate Today", "value": float(golf_no_show_rate_today), "format": "percent"},
            ],
            "note": "Golf dashboard tracks utilization, conversion to paid rounds, and no-show leakage.",
            "highlights": [
                {
                    "name": "Booked Slots Today",
                    "current": int(golf_today_slot_booked),
                    "format": "number",
                    "context": f"{int(golf_today_slot_capacity)} total slot capacity",
                },
                {
                    "name": "Revenue 7d",
                    "current": float(golf_week_revenue),
                    "format": "currency",
                    "context": (
                        f"{golf_week_transactions} transactions | trend {(golf_week_vs_prior or 0.0):+.0%}"
                        if golf_week_vs_prior is not None
                        else f"{golf_week_transactions} transactions | no prior-week baseline"
                    ),
                },
                {
                    "name": "No-shows Today",
                    "current": int(golf_today_no_shows),
                    "format": "number",
                    "context": f"{golf_today_paid_rounds + golf_today_no_shows} attended + no-show records",
                },
            ],
        },
        "pro_shop": {
            "cards": [
                {"label": "Sales Today", "value": float(pro_shop_today_revenue), "format": "currency"},
                {"label": "Transactions Today", "value": int(pro_shop_today_transactions), "format": "number"},
                {"label": "Avg Basket (7d)", "value": float(pro_shop_avg_ticket_7d), "format": "currency"},
                {"label": "Low-stock Rate", "value": float(pro_shop_low_stock_rate), "format": "percent"},
            ],
            "note": "Pro shop dashboard tracks POS throughput, basket value, and stock risk.",
            "highlights": pro_shop_highlights,
            "inventory": {
                "active_products": int(pro_shop_active_products),
                "stock_units": int(pro_shop_stock_units),
                "stock_value": float(pro_shop_stock_value),
                "low_stock_items": int(pro_shop_low_stock_items),
                "low_stock_rate": float(pro_shop_low_stock_rate),
                "transactions_7d": int(pro_shop_week_transactions),
                "transactions_7d_pos": int(pro_shop_txns_7d),
                "transactions_today_pos": int(pro_shop_txns_today),
                "avg_basket_30d": float(pro_shop_avg_basket_30d),
                "units_sold_30d": int(pro_shop_units_sold_30d),
                "days_of_cover": float(pro_shop_days_of_cover) if pro_shop_days_of_cover is not None else None,
                "week_vs_prior_week": pro_shop_week_vs_prior,
            },
        },
    }

    for stream_key, stream_label in other_streams:
        stream_day = stream_rollups[stream_key]["periods"]["day"]
        stream_week = stream_rollups[stream_key]["periods"]["week"]
        stream_today_amount = float(stream_day["revenue"])
        stream_week_amount = float(stream_week["revenue"])
        stream_today_txns = int(stream_day["transactions"])
        stream_week_txns = int(stream_week["transactions"])
        stream_avg_ticket_week = float(stream_week["avg_ticket"])
        stream_week_vs_prior = stream_week["vs_prior"]

        operation_insights[stream_key] = {
            "cards": [
                {"label": f"{stream_label} Revenue Today", "value": stream_today_amount, "format": "currency"},
                {"label": "Transactions Today", "value": stream_today_txns, "format": "number"},
                {"label": "Avg Ticket (7d)", "value": stream_avg_ticket_week, "format": "currency"},
                {"label": "7d vs Prior 7d", "value": stream_week_vs_prior, "format": "percent"},
            ],
            "note": f"{stream_label} dashboard tracks revenue pace, ticket quality, and 7-day trend versus prior week.",
            "highlights": (
                stream_highlights.get(stream_key, [])
                or [
                    {
                        "name": "Revenue 7d",
                        "current": stream_week_amount,
                        "format": "currency",
                        "context": f"{stream_week_txns} transactions",
                    }
                ]
            ),
        }

    ai_no_show: dict[str, Any] = {
        "window_days": 7,
        "upcoming_bookings": 0,
        "high_risk_next_72h": 0,
        "medium_risk_next_72h": 0,
        "predictions": [],
        "recommendations": [],
    }

    ai_revenue_integrity: dict[str, Any] = {
        "status": "healthy",
        "health_score": 100,
        "alerts": [],
        "period_alignment": [],
        "window_days": 30,
        "metrics": {},
        "recommendations": [],
    }

    ai_import_copilot: dict[str, Any] = {
        "summary": {
            "configured_streams": 0,
            "total_streams": 5,
            "stale_streams": 0,
            "high_failure_streams": 0,
        },
        "streams": [],
        "freshness": {},
        "recommendations": [],
    }

    # Lightweight no-show risk model (rule-based; no external AI/API costs).
    try:
        risk_window_days = 7
        risk_window_end = now_utc + timedelta(days=risk_window_days)
        high_risk_window_end = now_utc + timedelta(hours=72)
        upcoming_rows = (
            db.query(Booking, TeeTime)
            .join(TeeTime, Booking.tee_time_id == TeeTime.id)
            .filter(
                Booking.club_id == club_id,
                TeeTime.club_id == club_id,
                Booking.status == BookingStatus.booked,
                TeeTime.tee_time >= now_utc,
                TeeTime.tee_time <= risk_window_end,
            )
            .order_by(TeeTime.tee_time.asc(), Booking.id.asc())
            .limit(250)
            .all()
        )

        player_keys: set[str] = set()
        upcoming_entries: list[tuple[Booking, TeeTime, str]] = []
        for booking_row, tee_row in upcoming_rows:
            player_key = (
                str(getattr(booking_row, "player_email", "") or "").strip().lower()
                or str(getattr(booking_row, "player_name", "") or "").strip().lower()
            )
            if not player_key:
                continue
            player_keys.add(player_key)
            upcoming_entries.append((booking_row, tee_row, player_key))

        history_by_player: dict[str, dict[str, int]] = {}
        if player_keys:
            player_key_expr = func.coalesce(
                func.nullif(func.lower(Booking.player_email), ""),
                func.lower(cast(Booking.player_name, String)),
            )
            history_rows = (
                db.query(
                    player_key_expr.label("player_key"),
                    func.count(Booking.id).label("total_bookings"),
                    func.sum(case((Booking.status == BookingStatus.no_show, 1), else_=0)).label("no_show_count"),
                    func.sum(case((Booking.status == BookingStatus.cancelled, 1), else_=0)).label("cancelled_count"),
                )
                .join(TeeTime, Booking.tee_time_id == TeeTime.id)
                .filter(
                    Booking.club_id == club_id,
                    TeeTime.club_id == club_id,
                    TeeTime.tee_time < now_utc,
                    player_key_expr.in_(list(player_keys)),
                )
                .group_by(player_key_expr)
                .all()
            )
            for player_key, total_bookings_hist, no_show_hist, cancelled_hist in history_rows:
                key = str(player_key or "").strip().lower()
                if not key:
                    continue
                history_by_player[key] = {
                    "total_bookings": int(total_bookings_hist or 0),
                    "no_show_count": int(no_show_hist or 0),
                    "cancelled_count": int(cancelled_hist or 0),
                }

        predictions: list[dict[str, Any]] = []
        high_risk_72h = 0
        medium_risk_72h = 0
        for booking_row, tee_row, player_key in upcoming_entries:
            history = history_by_player.get(
                player_key,
                {"total_bookings": 0, "no_show_count": 0, "cancelled_count": 0},
            )
            history_total = int(history.get("total_bookings") or 0)
            history_no_show = int(history.get("no_show_count") or 0)
            history_cancelled = int(history.get("cancelled_count") or 0)
            no_show_rate = (float(history_no_show) / float(history_total)) if history_total > 0 else 0.0
            cancel_rate = (float(history_cancelled) / float(history_total)) if history_total > 0 else 0.0

            created_at = getattr(booking_row, "created_at", None) or now_utc
            tee_dt = getattr(tee_row, "tee_time", None) or now_utc
            lead_hours = max(0.0, (tee_dt - created_at).total_seconds() / 3600.0)

            score = 0.08
            reasons: list[str] = []
            if history_total < 3:
                score += 0.12
                reasons.append("Limited history")
            if no_show_rate > 0:
                score += min(0.45, no_show_rate * 0.70)
                reasons.append(f"Prior no-show rate {no_show_rate:.0%}")
            if cancel_rate >= 0.25:
                score += min(0.15, cancel_rate * 0.30)
                reasons.append(f"Cancellation rate {cancel_rate:.0%}")
            if lead_hours < 6:
                score += 0.22
                reasons.append("Short lead time (<6h)")
            elif lead_hours < 24:
                score += 0.12
                reasons.append("Short lead time (<24h)")
            elif lead_hours >= 24 * 14:
                score += 0.06
                reasons.append("Long lead time (>14d)")
            if getattr(booking_row, "member_id", None) is None:
                score += 0.08
                reasons.append("Guest booking")
            source_value = str(getattr(getattr(booking_row, "source", None), "value", getattr(booking_row, "source", "")) or "").strip().lower()
            if source_value == "external":
                score += 0.06
                reasons.append("External mirror booking")
            if int(getattr(booking_row, "party_size", 1) or 1) >= 3:
                score += 0.06
                reasons.append("Large party size")

            score = max(0.02, min(0.95, score))
            risk_level = "high" if score >= 0.65 else ("medium" if score >= 0.40 else "low")
            if tee_dt <= high_risk_window_end:
                if risk_level == "high":
                    high_risk_72h += 1
                elif risk_level == "medium":
                    medium_risk_72h += 1

            predictions.append(
                {
                    "booking_id": int(getattr(booking_row, "id", 0) or 0),
                    "player_name": str(getattr(booking_row, "player_name", "") or "Player"),
                    "player_email": str(getattr(booking_row, "player_email", "") or ""),
                    "tee_time": tee_dt.isoformat() if tee_dt else None,
                    "tee": str(getattr(tee_row, "hole", "") or "1"),
                    "risk_level": risk_level,
                    "risk_score": float(round(score, 4)),
                    "lead_hours": float(round(lead_hours, 1)),
                    "history": {
                        "total_bookings": history_total,
                        "no_show_count": history_no_show,
                        "cancelled_count": history_cancelled,
                        "no_show_rate": float(round(no_show_rate, 4)),
                    },
                    "reasons": reasons[:4],
                }
            )

        predictions.sort(key=lambda r: (-float(r.get("risk_score") or 0.0), str(r.get("tee_time") or "")))
        recommendations: list[str] = []
        if high_risk_72h > 0:
            recommendations.append(
                f"Send confirmation reminders and deposit prompts for {high_risk_72h} high-risk booking(s) in next 72h."
            )
        if medium_risk_72h >= 3:
            recommendations.append(
                "Queue medium-risk bookings for automated reconfirmation messages 24h before tee-off."
            )
        if not recommendations:
            recommendations.append("No immediate no-show intervention required in the next 72 hours.")

        ai_no_show = {
            "window_days": risk_window_days,
            "upcoming_bookings": int(len(upcoming_entries)),
            "high_risk_next_72h": int(high_risk_72h),
            "medium_risk_next_72h": int(medium_risk_72h),
            "predictions": predictions[:8],
            "recommendations": recommendations,
        }
    except Exception:
        _safe_rollback(db)

    # Revenue integrity monitor (ledger vs booking-status and settlement consistency).
    try:
        alignment_rows: list[dict[str, Any]] = []
        period_specs = [
            ("day", "Daily", int(golf_paid_day_rounds)),
            ("week", "Weekly", int(golf_paid_week_rounds)),
            ("month", "Monthly", int(golf_paid_month_rounds)),
            ("ytd", "YTD", int(golf_paid_ytd_rounds)),
        ]
        for period_key, period_label, ledger_paid_rounds in period_specs:
            status_row = bookings_by_status_periods.get(period_key, {}) or {}
            status_paid_rounds = int(status_row.get("checked_in", 0)) + int(status_row.get("completed", 0))
            delta = int(ledger_paid_rounds) - int(status_paid_rounds)
            delta_abs = abs(delta)
            delta_pct = (float(delta_abs) / float(max(1, status_paid_rounds)))
            if delta_abs >= 20 and delta_pct >= 0.20:
                severity = "high"
            elif delta_abs >= 8 and delta_pct >= 0.12:
                severity = "medium"
            elif delta_abs >= 3 and delta_pct >= 0.08:
                severity = "low"
            else:
                severity = "ok"
            note = (
                "Ledger paid rounds exceed tee-time status paid rounds (prepayments/timing shift likely)."
                if delta > 0
                else (
                    "Tee-time status paid rounds exceed ledger paid rounds (payment capture lag possible)."
                    if delta < 0
                    else "Ledger and tee-time status paid rounds are aligned."
                )
            )
            alignment_rows.append(
                {
                    "period_key": period_key,
                    "period_label": period_label,
                    "ledger_paid_rounds": int(ledger_paid_rounds),
                    "status_paid_rounds": int(status_paid_rounds),
                    "delta_rounds": int(delta),
                    "delta_pct": float(round(delta_pct, 4)),
                    "severity": severity,
                    "note": note,
                }
            )

        integrity_window_days = 30
        integrity_start = today - timedelta(days=integrity_window_days - 1)
        ledger_counts_sq = (
            db.query(
                LedgerEntry.booking_id.label("booking_id"),
                func.count(LedgerEntry.id).label("payment_count"),
                func.sum(LedgerEntry.amount).label("paid_amount"),
            )
            .filter(
                LedgerEntry.club_id == club_id,
                LedgerEntry.booking_id.isnot(None),
            )
            .group_by(LedgerEntry.booking_id)
            .subquery()
        )

        unpaid_attended_row = (
            db.query(
                func.count(Booking.id).label("count"),
                func.coalesce(func.sum(Booking.price), 0.0).label("amount"),
            )
            .join(TeeTime, Booking.tee_time_id == TeeTime.id)
            .outerjoin(ledger_counts_sq, ledger_counts_sq.c.booking_id == Booking.id)
            .filter(
                Booking.club_id == club_id,
                TeeTime.club_id == club_id,
                Booking.status.in_(paid_statuses),
                func.date(TeeTime.tee_time) >= integrity_start,
                func.coalesce(ledger_counts_sq.c.payment_count, 0) == 0,
            )
            .first()
        )
        unpaid_attended_count = int(getattr(unpaid_attended_row, "count", 0) or 0)
        unpaid_attended_amount = float(getattr(unpaid_attended_row, "amount", 0.0) or 0.0)

        paid_without_attendance_row = (
            db.query(
                func.count(LedgerEntry.id).label("count"),
                func.coalesce(func.sum(LedgerEntry.amount), 0.0).label("amount"),
            )
            .join(Booking, Booking.id == LedgerEntry.booking_id)
            .filter(
                LedgerEntry.club_id == club_id,
                Booking.club_id == club_id,
                func.date(LedgerEntry.created_at) >= integrity_start,
                ~Booking.status.in_(paid_statuses),
            )
            .first()
        )
        paid_without_attendance_count = int(getattr(paid_without_attendance_row, "count", 0) or 0)
        paid_without_attendance_amount = float(getattr(paid_without_attendance_row, "amount", 0.0) or 0.0)

        future_paid_row = (
            db.query(
                func.count(LedgerEntry.id).label("count"),
                func.coalesce(func.sum(LedgerEntry.amount), 0.0).label("amount"),
            )
            .join(Booking, Booking.id == LedgerEntry.booking_id)
            .join(TeeTime, TeeTime.id == Booking.tee_time_id)
            .filter(
                LedgerEntry.club_id == club_id,
                Booking.club_id == club_id,
                TeeTime.club_id == club_id,
                func.date(LedgerEntry.created_at) >= integrity_start,
                TeeTime.tee_time > (now_utc + timedelta(days=1)),
                Booking.status.in_([BookingStatus.booked, BookingStatus.checked_in, BookingStatus.completed]),
            )
            .first()
        )
        future_paid_count = int(getattr(future_paid_row, "count", 0) or 0)
        future_paid_amount = float(getattr(future_paid_row, "amount", 0.0) or 0.0)

        alerts: list[dict[str, Any]] = []
        for row in alignment_rows:
            severity = str(row.get("severity") or "ok")
            if severity == "ok":
                continue
            alerts.append(
                {
                    "scope": "period_alignment",
                    "severity": severity,
                    "title": f"{row.get('period_label')} paid-round variance",
                    "detail": (
                        f"Ledger {int(row.get('ledger_paid_rounds', 0))} vs "
                        f"status {int(row.get('status_paid_rounds', 0))} "
                        f"(delta {int(row.get('delta_rounds', 0)):+d})."
                    ),
                    "context": str(row.get("note") or ""),
                }
            )

        if unpaid_attended_count > 0:
            alerts.append(
                {
                    "scope": "settlement_gap",
                    "severity": "high" if unpaid_attended_count >= 8 else "medium",
                    "title": "Attended rounds without payment",
                    "detail": (
                        f"{unpaid_attended_count} checked-in/completed booking(s) in last {integrity_window_days} days "
                        f"have no linked ledger payment."
                    ),
                    "context": f"Approx value at risk: R{unpaid_attended_amount:.2f}",
                }
            )

        if paid_without_attendance_count > 0:
            alerts.append(
                {
                    "scope": "status_gap",
                    "severity": "medium",
                    "title": "Payments linked to non-paid statuses",
                    "detail": (
                        f"{paid_without_attendance_count} ledger payment(s) in last {integrity_window_days} days "
                        f"are linked to bookings not marked checked-in/completed."
                    ),
                    "context": f"Value to verify: R{paid_without_attendance_amount:.2f}",
                }
            )

        if future_paid_count >= 10:
            alerts.append(
                {
                    "scope": "prepayment_pipeline",
                    "severity": "low",
                    "title": "High future prepayment pipeline",
                    "detail": (
                        f"{future_paid_count} payment(s) are posted for tee times more than one day ahead."
                    ),
                    "context": f"Pipeline value: R{future_paid_amount:.2f}",
                }
            )

        severity_penalty = {"high": 24, "medium": 12, "low": 5}
        health_score = 100
        for alert in alerts:
            health_score -= int(severity_penalty.get(str(alert.get("severity") or "low"), 5))
        health_score = max(0, min(100, int(health_score)))

        status = "healthy"
        if any(str(a.get("severity")) == "high" for a in alerts) or health_score < 65:
            status = "critical"
        elif alerts or health_score < 82:
            status = "warning"

        recommendations: list[str] = []
        if unpaid_attended_count > 0:
            recommendations.append("Settle checked-in/completed bookings missing ledger payments.")
        if paid_without_attendance_count > 0:
            recommendations.append("Align booking statuses with posted payments before closeout.")
        if any(str(r.get("severity")) in {"high", "medium"} for r in alignment_rows):
            recommendations.append("Review prepayment timing so dashboard periods compare like-for-like.")
        if not recommendations:
            recommendations.append("Revenue integrity checks are stable for the current data window.")

        ai_revenue_integrity = {
            "status": status,
            "health_score": int(health_score),
            "alerts": alerts[:8],
            "period_alignment": alignment_rows,
            "window_days": integrity_window_days,
            "metrics": {
                "unpaid_attended_count": unpaid_attended_count,
                "unpaid_attended_amount": float(unpaid_attended_amount),
                "paid_without_attendance_count": paid_without_attendance_count,
                "paid_without_attendance_amount": float(paid_without_attendance_amount),
                "future_prepaid_count": future_paid_count,
                "future_prepaid_amount": float(future_paid_amount),
            },
            "recommendations": recommendations,
        }
    except Exception:
        _safe_rollback(db)

    # Import copilot (mapping + freshness + failure-rate guidance).
    try:
        stream_defs = [
            ("golf", "Golf"),
            ("pro_shop", "Pro Shop"),
            ("pub", "Pub"),
            ("bowls", "Bowls"),
            ("other", "Other"),
        ]

        settings_rows = (
            db.query(ClubSetting.key, ClubSetting.value)
            .filter(
                ClubSetting.club_id == club_id,
                ClubSetting.key.like("revenue_import_settings:%"),
            )
            .all()
        )
        settings_by_stream: dict[str, dict[str, Any]] = {}
        for key, value in settings_rows:
            raw_key = str(key or "")
            stream_key = raw_key.split(":", 1)[1].strip().lower() if ":" in raw_key else ""
            if not stream_key:
                continue
            parsed: dict[str, Any] = {}
            try:
                parsed = json.loads(value or "{}")
            except Exception:
                parsed = {}
            settings_by_stream[stream_key] = parsed

        imports_60d = (
            db.query(ImportBatch)
            .filter(
                ImportBatch.club_id == club_id,
                ImportBatch.imported_at >= (now_utc - timedelta(days=60)),
            )
            .order_by(desc(ImportBatch.imported_at))
            .all()
        )
        imports_30d_cutoff = now_utc - timedelta(days=30)
        stream_health: list[dict[str, Any]] = []
        recommendations: list[str] = []
        configured_streams = 0
        stale_streams = 0
        high_failure_streams = 0

        for stream_key, stream_label in stream_defs:
            settings = settings_by_stream.get(stream_key) or {}
            has_date = bool(str(settings.get("date_field") or "").strip())
            has_amount = bool(str(settings.get("amount_field") or "").strip())
            configured = has_date and has_amount
            if configured:
                configured_streams += 1

            stream_batches = [
                b
                for b in imports_60d
                if str(getattr(b, "kind", "") or "").strip().lower() == "revenue"
                and _normalize_revenue_stream(getattr(b, "source", None)) == stream_key
            ]
            last_import = next(
                (b.imported_at for b in stream_batches if getattr(b, "imported_at", None) is not None),
                None,
            )
            days_since = (today - last_import.date()).days if last_import else None

            rows_total_30d = 0
            rows_failed_30d = 0
            for batch in stream_batches:
                imported_at = getattr(batch, "imported_at", None)
                if imported_at is None or imported_at < imports_30d_cutoff:
                    continue
                rows_total_30d += int(getattr(batch, "rows_total", 0) or 0)
                rows_failed_30d += int(getattr(batch, "rows_failed", 0) or 0)
            failure_rate = (float(rows_failed_30d) / float(rows_total_30d)) if rows_total_30d > 0 else 0.0

            health = "healthy"
            recommendation = "No action needed."
            if not configured:
                health = "critical"
                recommendation = "Save date/amount mapping in Operations Config."
                recommendations.append(f"{stream_label}: save import settings before next file upload.")
            elif rows_total_30d >= 20 and failure_rate >= 0.08:
                health = "critical"
                recommendation = "High fail-rate; review column mapping and tax settings."
                high_failure_streams += 1
                recommendations.append(f"{stream_label}: review mapping (30d fail rate {failure_rate:.0%}).")
            elif rows_total_30d >= 10 and failure_rate >= 0.03:
                health = "warning"
                recommendation = "Moderate fail-rate; validate CSV schema before import."
            elif days_since is None:
                health = "warning"
                recommendation = "No recent imports detected."
                stale_streams += 1
                recommendations.append(f"{stream_label}: no imports found in last 60 days.")
            elif days_since > 14:
                health = "warning"
                recommendation = "Import is stale (>14 days)."
                stale_streams += 1
                recommendations.append(f"{stream_label}: import is stale ({days_since} days).")

            stream_health.append(
                {
                    "stream": stream_key,
                    "label": stream_label,
                    "configured": configured,
                    "health": health,
                    "last_import_at": last_import.isoformat() if last_import else None,
                    "days_since_import": int(days_since) if days_since is not None else None,
                    "rows_total_30d": int(rows_total_30d),
                    "rows_failed_30d": int(rows_failed_30d),
                    "failure_rate_30d": float(round(failure_rate, 4)),
                    "recommendation": recommendation,
                }
            )

        last_bookings_batch = (
            db.query(ImportBatch)
            .filter(ImportBatch.club_id == club_id, ImportBatch.kind == "bookings")
            .order_by(desc(ImportBatch.imported_at))
            .first()
        )
        last_members_batch = (
            db.query(ImportBatch)
            .filter(ImportBatch.club_id == club_id, ImportBatch.kind == "members")
            .order_by(desc(ImportBatch.imported_at))
            .first()
        )

        def _freshness_payload(batch: ImportBatch | None) -> dict[str, Any]:
            if not batch or not getattr(batch, "imported_at", None):
                return {"imported_at": None, "days_since": None}
            imported_at = batch.imported_at
            return {
                "imported_at": imported_at.isoformat(),
                "days_since": int((today - imported_at.date()).days),
            }

        freshness = {
            "bookings": _freshness_payload(last_bookings_batch),
            "members": _freshness_payload(last_members_batch),
        }
        if freshness["bookings"]["days_since"] is not None and int(freshness["bookings"]["days_since"]) > 2:
            recommendations.append(
                f"Bookings mirror import is {freshness['bookings']['days_since']} days old; run mirror sync."
            )

        if freshness["members"]["days_since"] is not None and int(freshness["members"]["days_since"]) > 30:
            recommendations.append(
                f"Members import is {freshness['members']['days_since']} days old; refresh directory."
            )

        deduped_recommendations: list[str] = []
        for rec in recommendations:
            if rec not in deduped_recommendations:
                deduped_recommendations.append(rec)

        ai_import_copilot = {
            "summary": {
                "configured_streams": int(configured_streams),
                "total_streams": int(len(stream_defs)),
                "stale_streams": int(stale_streams),
                "high_failure_streams": int(high_failure_streams),
            },
            "streams": stream_health,
            "freshness": freshness,
            "recommendations": (
                deduped_recommendations[:6]
                if deduped_recommendations
                else ["Import profiles are configured and recent files are healthy."]
            ),
        }
    except Exception:
        _safe_rollback(db)
    
    # KPI targets vs actuals (Day/WTD/MTD/YTD)
    anchor = datetime.utcnow().date()
    year = int(anchor.year)
    # NOTE: For accounting, the transaction date is when the booking is marked paid/checked-in
    # (ledger_entries.created_at), not the tee time date.

    # Default targets (can be overridden via kpi_targets table):
    # - Rounds: 35,000/year (client target)
    # - Revenue: derived from rounds target * member 18-hole rate unless explicitly set
    target_model = _target_model_payload(db, year)
    annual_rounds_target = target_model.get("rounds_target")
    annual_revenue_target = target_model.get("revenue_target")

    def _paid_window_actuals(start_d: date, end_d: date) -> tuple[float, int]:
        revenue = (
            db.query(func.sum(LedgerEntry.amount))
            .filter(
                LedgerEntry.booking_id.isnot(None),
                func.date(LedgerEntry.created_at) >= start_d,
                func.date(LedgerEntry.created_at) <= end_d,
            )
            .scalar()
            or 0.0
        )
        rounds = (
            db.query(func.count(LedgerEntry.id))
            .filter(
                LedgerEntry.booking_id.isnot(None),
                func.date(LedgerEntry.created_at) >= start_d,
                func.date(LedgerEntry.created_at) <= end_d,
            )
            .scalar()
            or 0
        )
        return float(revenue), int(rounds)

    kpis = {}
    for period_key in ["day", "wtd", "mtd", "ytd"]:
        start_d, end_d, elapsed_days = _period_window(period_key, anchor)
        actual_revenue, actual_rounds = _paid_window_actuals(start_d, end_d)
        kpis[period_key] = {
            "start_date": start_d.isoformat(),
            "end_date": end_d.isoformat(),
            "days": int(elapsed_days),
            "revenue_actual": float(actual_revenue),
            "revenue_target": _derive_target(annual_revenue_target, year, elapsed_days),
            "rounds_actual": int(actual_rounds),
            "rounds_target": _derive_target(annual_rounds_target, year, elapsed_days),
        }

    golf_day_total = (
        db.query(func.sum(GolfDayBooking.amount))
        .filter(GolfDayBooking.club_id == club_id)
        .scalar()
        or 0.0
    )
    golf_day_outstanding = (
        db.query(func.sum(GolfDayBooking.balance_due))
        .filter(
            GolfDayBooking.club_id == club_id,
            func.coalesce(GolfDayBooking.payment_status, "pending") != "paid",
        )
        .scalar()
        or 0.0
    )
    golf_day_open_count = (
        db.query(func.count(GolfDayBooking.id))
        .filter(
            GolfDayBooking.club_id == club_id,
            func.coalesce(GolfDayBooking.payment_status, "pending").in_(["pending", "partial"]),
        )
        .scalar()
        or 0
    )
    account_customer_count = (
        db.query(func.count(AccountCustomer.id))
        .filter(AccountCustomer.club_id == club_id, AccountCustomer.active == 1)
        .scalar()
        or 0
    )

    payload = {
        "total_bookings": total_bookings,
        "total_players": total_players,
        "total_members": total_members,
        "account_customers_active": int(account_customer_count),
        "golf_revenue_total": float(golf_total_revenue),
        "golf_revenue_today": float(golf_today_revenue),
        "golf_revenue_week": float(golf_week_revenue),
        "pro_shop_revenue_total": float(pro_shop_total_revenue),
        "pro_shop_revenue_today": float(pro_shop_today_revenue),
        "pro_shop_revenue_week": float(pro_shop_week_revenue),
        "other_revenue_total": float(other_total_revenue),
        "other_revenue_today": float(today_other_revenue),
        "other_revenue_week": float(week_other_revenue),
        "golf_day_pipeline_total": float(golf_day_total),
        "golf_day_outstanding_balance": float(golf_day_outstanding),
        "golf_day_open_count": int(golf_day_open_count),
        "total_revenue": float(combined_total_revenue),
        "today_revenue": float(combined_today_revenue),
        "week_revenue": float(combined_week_revenue),
        "revenue_streams": revenue_streams,
        "operation_insights": operation_insights,
        "revenue_boundary": {
            "golf_reporting_source": "ledger_entries_plus_imported_golf_adjustments",
            "pro_shop_reporting_source": "native_pro_shop_sales_only",
            "imported_pro_shop_handling": "excluded_from_dashboard_stream_rollups",
        },
        "imports": imports,
        "bookings_by_status": bookings_by_status,
        "bookings_by_status_periods": bookings_by_status_periods,
        "completed_rounds": completed_rounds,
        "today_bookings": today_bookings,
        "ai_assistant": {
            "no_show": ai_no_show,
            "revenue_integrity": ai_revenue_integrity,
            "import_copilot": ai_import_copilot,
        },
        "targets": {
            "year": year,
            "annual": {
                "revenue": annual_revenue_target,
                "rounds": annual_rounds_target,
                "revenue_mode": target_model.get("revenue_mode"),
                "revenue_source": target_model.get("revenue_source"),
                "revenue_override": target_model.get("revenue_override"),
                "revenue_derived": target_model.get("revenue_derived"),
                "assumptions": target_model.get("assumptions") or {},
            },
            "periods": kpis,
        },
    }
    ADMIN_DASHBOARD_CACHE.set(cache_key, payload)
    return payload


@router.get("/operational-alerts")
async def get_operational_alerts(
    lookahead_days: int = Query(7, ge=1, le=14),
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    safe_days = max(1, min(14, int(lookahead_days or 7)))
    cache_key = f"alerts:{int(club_id)}:{safe_days}"
    cached = ADMIN_ALERTS_CACHE.get(cache_key)
    if cached is not None:
        return cached

    now = datetime.utcnow()
    start_of_today = datetime.combine(now.date(), datetime.min.time())
    lookahead_end = now + timedelta(days=safe_days)
    severity_weight = {"high": 3, "medium": 2, "low": 1}
    alerts: list[dict[str, Any]] = []

    def _add_alert(
        *,
        severity: str,
        title: str,
        message: str,
        metric_key: str,
        metric_value: int | float,
        context: dict[str, Any] | None = None,
    ) -> None:
        level = str(severity or "").strip().lower()
        if level not in {"high", "medium", "low"}:
            level = "low"
        alerts.append(
            {
                "severity": level,
                "title": str(title or "").strip() or "Operational alert",
                "message": str(message or "").strip() or "Attention required",
                "metric_key": str(metric_key or "").strip() or "metric",
                "metric_value": metric_value,
                "context": context or {},
            }
        )

    def _hours_old(value: datetime | None) -> float | None:
        if not isinstance(value, datetime):
            return None
        return max(0.0, (now - value).total_seconds() / 3600.0)

    last_booking_import = (
        db.query(ImportBatch.imported_at)
        .filter(ImportBatch.club_id == club_id, ImportBatch.kind == "bookings")
        .order_by(desc(ImportBatch.imported_at))
        .first()
    )
    last_revenue_import = (
        db.query(ImportBatch.imported_at)
        .filter(ImportBatch.club_id == club_id, ImportBatch.kind == "revenue")
        .order_by(desc(ImportBatch.imported_at))
        .first()
    )

    booking_import_dt = last_booking_import[0] if last_booking_import else None
    revenue_import_dt = last_revenue_import[0] if last_revenue_import else None
    booking_import_hours = _hours_old(booking_import_dt)
    revenue_import_hours = _hours_old(revenue_import_dt)

    if booking_import_dt is None:
        _add_alert(
            severity="high",
            title="Bookings import missing",
            message="No bookings mirror import has been recorded for this club.",
            metric_key="bookings_import_hours",
            metric_value=-1,
        )
    elif booking_import_hours is not None and booking_import_hours > 24:
        _add_alert(
            severity="medium",
            title="Bookings import stale",
            message="Bookings import is older than 24 hours. Sync latest upstream sheet.",
            metric_key="bookings_import_hours",
            metric_value=round(float(booking_import_hours), 1),
        )

    if revenue_import_dt is None:
        _add_alert(
            severity="medium",
            title="Revenue import missing",
            message="No revenue import has been recorded for this club.",
            metric_key="revenue_import_hours",
            metric_value=-1,
        )
    elif revenue_import_hours is not None and revenue_import_hours > 24:
        _add_alert(
            severity="medium",
            title="Revenue import stale",
            message="Revenue import is older than 24 hours. Upload the latest operational revenues.",
            metric_key="revenue_import_hours",
            metric_value=round(float(revenue_import_hours), 1),
        )

    occupying_statuses = [BookingStatus.booked, BookingStatus.checked_in, BookingStatus.completed]
    capacity_conflicts = (
        db.query(func.count(Booking.id))
        .join(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(
            Booking.club_id == club_id,
            Booking.capacity_conflict == True,  # noqa: E712
            Booking.status.in_(occupying_statuses),
            TeeTime.tee_time >= now,
            TeeTime.tee_time < lookahead_end,
        )
        .scalar()
        or 0
    )
    if int(capacity_conflicts) > 0:
        _add_alert(
            severity="high",
            title="Capacity conflicts detected",
            message=f"{int(capacity_conflicts)} booking(s) exceed tee capacity in the next {safe_days} day(s).",
            metric_key="capacity_conflicts",
            metric_value=int(capacity_conflicts),
            context={"lookahead_days": safe_days},
        )

    stale_unexported_ledger = (
        db.query(func.count(LedgerEntry.id))
        .filter(
            LedgerEntry.club_id == club_id,
            LedgerEntry.booking_id.isnot(None),
            or_(LedgerEntry.pastel_synced == 0, LedgerEntry.pastel_synced.is_(None)),
            LedgerEntry.created_at < start_of_today,
        )
        .scalar()
        or 0
    )
    if int(stale_unexported_ledger) > 0:
        _add_alert(
            severity="medium",
            title="Cashbook export backlog",
            message=f"{int(stale_unexported_ledger)} paid ledger entries are still not exported.",
            metric_key="stale_unexported_ledger",
            metric_value=int(stale_unexported_ledger),
        )

    low_stock_count = (
        db.query(func.count(ProShopProduct.id))
        .filter(
            ProShopProduct.club_id == club_id,
            ProShopProduct.active == 1,
            ProShopProduct.reorder_level > 0,
            ProShopProduct.stock_qty <= ProShopProduct.reorder_level,
        )
        .scalar()
        or 0
    )
    out_of_stock_count = (
        db.query(func.count(ProShopProduct.id))
        .filter(
            ProShopProduct.club_id == club_id,
            ProShopProduct.active == 1,
            ProShopProduct.stock_qty <= 0,
        )
        .scalar()
        or 0
    )
    if int(low_stock_count) > 0:
        _add_alert(
            severity="high" if int(out_of_stock_count) > 0 else "low",
            title="Pro shop stock risk",
            message=(
                f"{int(low_stock_count)} product(s) are at or below reorder level, "
                f"including {int(out_of_stock_count)} out of stock."
            ),
            metric_key="low_stock_products",
            metric_value=int(low_stock_count),
            context={"out_of_stock": int(out_of_stock_count)},
        )

    alerts.sort(
        key=lambda row: (
            -int(severity_weight.get(str(row.get("severity", "low")), 1)),
            str(row.get("title", "")),
        )
    )

    summary = {
        "total": len(alerts),
        "high": sum(1 for row in alerts if str(row.get("severity")) == "high"),
        "medium": sum(1 for row in alerts if str(row.get("severity")) == "medium"),
        "low": sum(1 for row in alerts if str(row.get("severity")) == "low"),
    }
    payload = {
        "generated_at": now.isoformat(),
        "lookahead_days": int(safe_days),
        "summary": summary,
        "alerts": alerts,
    }
    ADMIN_ALERTS_CACHE.set(cache_key, payload)
    return payload


class KpiTargetUpsert(BaseModel):
    year: int
    metric: str
    annual_target: float


class TargetAssumptionsPayload(BaseModel):
    year: int
    member_round_share: float
    member_revenue_share: float
    revenue_mode: str = "derived"


@router.get("/targets")
async def get_target_settings(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    target_year = int(year or datetime.utcnow().year)
    if target_year < 2000 or target_year > 2100:
        raise HTTPException(status_code=400, detail="invalid year")
    return _target_model_payload(db, target_year)


@router.put("/targets")
async def upsert_kpi_target(
    payload: KpiTargetUpsert,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    metric = (payload.metric or "").strip().lower()
    if metric not in {"revenue", "rounds"}:
        raise HTTPException(status_code=400, detail="metric must be 'revenue' or 'rounds'")
    if payload.year < 2000 or payload.year > 2100:
        raise HTTPException(status_code=400, detail="invalid year")
    if payload.annual_target < 0:
        raise HTTPException(status_code=400, detail="annual_target must be >= 0")

    from app.models import KpiTarget

    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

    row = (
        db.query(KpiTarget)
        .filter(
            KpiTarget.club_id == club_id,
            KpiTarget.year == payload.year,
            KpiTarget.metric == metric,
        )
        .first()
    )
    if not row:
        row = KpiTarget(
            club_id=club_id,
            year=payload.year,
            metric=metric,
            annual_target=float(payload.annual_target),
        )
        db.add(row)
    else:
        row.annual_target = float(payload.annual_target)
        row.updated_at = datetime.utcnow()

    _audit_event(
        db,
        request,
        admin,
        action="kpi_target.upserted",
        entity_type="kpi_target",
        entity_id=f"{row.year}:{row.metric}",
        payload={"year": int(row.year), "metric": str(row.metric), "annual_target": float(row.annual_target)},
    )
    db.commit()
    db.refresh(row)
    _invalidate_admin_caches(club_id)

    return {"status": "ok", "year": row.year, "metric": row.metric, "annual_target": float(row.annual_target)}


@router.put("/targets/assumptions")
async def update_target_assumptions(
    payload: TargetAssumptionsPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    target_year = int(payload.year or datetime.utcnow().year)
    if target_year < 2000 or target_year > 2100:
        raise HTTPException(status_code=400, detail="invalid year")

    member_round_share = float(payload.member_round_share)
    member_revenue_share = float(payload.member_revenue_share)
    revenue_mode = str(payload.revenue_mode or "derived").strip().lower()

    if member_round_share <= 0 or member_round_share >= 1:
        raise HTTPException(status_code=400, detail="member_round_share must be between 0 and 1")
    if member_revenue_share <= 0 or member_revenue_share >= 1:
        raise HTTPException(status_code=400, detail="member_revenue_share must be between 0 and 1")
    if revenue_mode not in {"derived", "manual"}:
        raise HTTPException(status_code=400, detail="revenue_mode must be 'derived' or 'manual'")

    _upsert_setting(db, "target_member_round_share", round(member_round_share, 6))
    _upsert_setting(db, "target_member_revenue_share", round(member_revenue_share, 6))
    _upsert_setting(db, "target_revenue_mode", revenue_mode)

    _audit_event(
        db,
        request,
        admin,
        action="kpi_target.assumptions_updated",
        entity_type="kpi_target",
        entity_id=f"{target_year}:assumptions",
        payload={
            "year": target_year,
            "member_round_share": member_round_share,
            "member_revenue_share": member_revenue_share,
            "revenue_mode": revenue_mode,
        },
    )
    db.commit()
    _invalidate_admin_caches(int(getattr(db, "info", {}).get("club_id") or 0) or None)
    return _target_model_payload(db, target_year)


@router.get("/bookings")
async def get_all_bookings(
    skip: int = 0,
    limit: int = 50,
    status: str = None,
    q: Optional[str] = None,
    sort: Optional[str] = None,  # created_desc | created_asc | tee_asc | tee_desc
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    period: Optional[str] = None,  # day | week | month | ytd
    date_basis: Optional[str] = "tee_time",  # tee_time | created
    anchor_date: Optional[date] = None,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff)
):
    """Get all bookings with filters"""
    
    query = (
        db.query(Booking)
        .options(selectinload(Booking.tee_time), selectinload(Booking.round))
        .outerjoin(TeeTime, Booking.tee_time_id == TeeTime.id)
    )
    
    if status:
        query = query.filter(Booking.status == status)
    if q:
        needle = str(q).strip().lower()
        like = f"%{needle}%"
        filters = [
            func.lower(Booking.player_name).like(like),
            func.lower(Booking.player_email).like(like),
            func.lower(Booking.club_card).like(like),
            func.lower(Booking.external_provider).like(like),
            func.lower(Booking.external_booking_id).like(like),
            func.lower(Booking.external_row_id).like(like),
            func.lower(Booking.notes).like(like),
        ]
        if needle.isdigit():
            filters.append(cast(Booking.id, String).like(f"%{needle}%"))
        query = query.filter(or_(*filters))

    basis = str(date_basis or "tee_time").strip().lower()
    if basis not in {"tee_time", "created"}:
        raise HTTPException(status_code=400, detail="Invalid date_basis (use tee_time or created)")
    sort_key = str(sort or "").strip().lower()
    valid_sort = {"created_desc", "created_asc", "tee_asc", "tee_desc"}
    if sort_key and sort_key not in valid_sort:
        raise HTTPException(status_code=400, detail="Invalid sort (use created_desc, created_asc, tee_asc, or tee_desc)")

    # Filter by selected date basis range (inclusive start, exclusive end).
    # Used by admin UI day/week/month/ytd views.
    if start and end:
        if basis == "created":
            query = query.filter(Booking.created_at >= start, Booking.created_at < end)
        else:
            query = query.filter(TeeTime.tee_time >= start, TeeTime.tee_time < end)
    elif period and anchor_date:
        period = period.lower().strip()
        if period not in {"day", "week", "month", "ytd"}:
            raise HTTPException(status_code=400, detail="Invalid period (use day, week, month, or ytd)")

        if period == "day":
            range_start = datetime.combine(anchor_date, datetime.min.time())
            range_end = range_start + timedelta(days=1)
        elif period == "week":
            # Monday-start week
            monday = anchor_date - timedelta(days=anchor_date.weekday())
            range_start = datetime.combine(monday, datetime.min.time())
            range_end = range_start + timedelta(days=7)
        elif period == "month":
            month_start = anchor_date.replace(day=1)
            if month_start.month == 12:
                next_month = date(month_start.year + 1, 1, 1)
            else:
                next_month = date(month_start.year, month_start.month + 1, 1)
            range_start = datetime.combine(month_start, datetime.min.time())
            range_end = datetime.combine(next_month, datetime.min.time())
        else:  # ytd
            ytd_start = date(anchor_date.year, 1, 1)
            range_start = datetime.combine(ytd_start, datetime.min.time())
            range_end = datetime.combine(anchor_date + timedelta(days=1), datetime.min.time())

        if basis == "created":
            query = query.filter(Booking.created_at >= range_start, Booking.created_at < range_end)
        else:
            query = query.filter(TeeTime.tee_time >= range_start, TeeTime.tee_time < range_end)
    default_sort = "created_desc" if basis == "created" else "tee_asc"
    sort_key = sort_key or default_sort
    if sort_key == "created_asc":
        query = query.order_by(asc(Booking.created_at), asc(Booking.id))
    elif sort_key == "created_desc":
        query = query.order_by(desc(Booking.created_at), desc(Booking.id))
    elif sort_key == "tee_desc":
        query = query.order_by(desc(TeeTime.tee_time), desc(Booking.id))
    else:
        query = query.order_by(asc(TeeTime.tee_time), asc(Booking.id))
    
    total = query.count()
    
    bookings = query.offset(skip).limit(limit).all()
    resolved_prices: dict[int, float] = {}
    if bookings:
        pricing_result = repair_bookings_pricing(db, bookings, persist=False)
        resolved_prices = {
            booking_id: resolved.price
            for booking_id, resolved in pricing_result.resolved_by_booking_id.items()
        }
    
    return {
        "total": total,
        "bookings": [
            {
                "id": b.id,
                "player_name": b.player_name,
                "player_email": b.player_email,
                "club_card": getattr(b, "club_card", None),
                "price": float(resolved_prices.get(int(getattr(b, "id", 0) or 0), b.price)),
                "status": b.status,
                "player_type": getattr(b, "player_type", None),
                "tee_time": b.tee_time.tee_time.isoformat() if b.tee_time else None,
                "created_at": b.created_at.isoformat(),
                "has_round": bool(b.round),
                "round_completed": b.round.closed if b.round else False,
                "holes": b.holes,
                "prepaid": bool(b.prepaid) if b.prepaid is not None else None,
                "account_customer_id": int(getattr(b, "account_customer_id", 0) or 0) if getattr(b, "account_customer_id", None) else None,
                "handicap_sa_id": getattr(b, "handicap_sa_id", None),
                "home_club": getattr(b, "home_club", None),
                "gender": getattr(b, "gender", None),
                "player_category": getattr(b, "player_category", None),
                "handicap_index_at_booking": getattr(b, "handicap_index_at_booking", None),
                "cart": bool(b.cart) if b.cart is not None else None,
                "push_cart": bool(getattr(b, "push_cart", None)) if getattr(b, "push_cart", None) is not None else None,
                "caddy": bool(getattr(b, "caddy", None)) if getattr(b, "caddy", None) is not None else None,
            }
            for b in bookings
        ]
    }


@router.get("/bookings/{booking_id}")
async def get_booking_detail(
    booking_id: int,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff)
):
    """Get detailed booking information"""
    
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    resolved_price = float(booking.price or 0.0)
    pricing_result = repair_bookings_pricing(db, [booking], persist=False)
    resolved = pricing_result.resolved_by_booking_id.get(int(booking.id))
    if resolved is not None:
        resolved_price = float(resolved.price)

    round_info = None
    if booking.round:
        round_info = {
            "id": booking.round.id,
            "scores": booking.round.scores_json,
            "handicap_sa_round_id": booking.round.handicap_sa_round_id,
            "handicap_synced": bool(booking.round.handicap_synced),
            "closed": bool(booking.round.closed),
            "created_at": booking.round.created_at.isoformat()
        }
    
    ledger_entries = db.query(LedgerEntry).filter(LedgerEntry.booking_id == booking_id).all()
    entry_ids = [le.id for le in ledger_entries]
    meta_by_entry_id = {}
    if entry_ids:
        metas = db.query(LedgerEntryMeta).filter(LedgerEntryMeta.ledger_entry_id.in_(entry_ids)).all()
        meta_by_entry_id = {m.ledger_entry_id: m for m in metas}

    fee_category = None
    if booking.fee_category_id:
        club_id = int(getattr(db, "info", {}).get("club_id") or 0)
        fee_q = db.query(FeeCategory).filter(FeeCategory.id == booking.fee_category_id)
        if club_id > 0:
            fee_q = fee_q.filter(or_(FeeCategory.club_id == club_id, FeeCategory.club_id.is_(None)))
        fee_cat = fee_q.first()
        if fee_cat:
            fee_category = {
                "id": fee_cat.id,
                "code": fee_cat.code,
                "description": fee_cat.description,
                "price": float(fee_cat.price),
                "fee_type": fee_cat.fee_type,
            }

    account_customer = None
    if getattr(booking, "account_customer_id", None):
        acct = db.query(AccountCustomer).filter(AccountCustomer.id == int(booking.account_customer_id)).first()
        if acct:
            account_customer = {
                "id": int(acct.id),
                "name": str(acct.name or ""),
                "account_code": str(acct.account_code or "") or None,
                "billing_contact": str(acct.billing_contact or "") or None,
                "terms": str(acct.terms_label or "") or None,
            }
     
    return {
        "id": booking.id,
        "tee_time_id": booking.tee_time_id,
        "member_id": booking.member_id,
        "player_name": booking.player_name,
        "player_email": booking.player_email,
        "club_card": booking.club_card,
        "account_customer_id": int(getattr(booking, "account_customer_id", 0) or 0) if getattr(booking, "account_customer_id", None) else None,
        "account_customer": account_customer,
        "handicap_number": booking.handicap_number,
        "handicap_sa_id": getattr(booking, "handicap_sa_id", None),
        "home_club": getattr(booking, "home_club", None),
        "gender": getattr(booking, "gender", None),
        "player_category": getattr(booking, "player_category", None),
        "handicap_index_at_booking": getattr(booking, "handicap_index_at_booking", None),
        "handicap_index_at_play": getattr(booking, "handicap_index_at_play", None),
        "holes": booking.holes,
        "prepaid": bool(booking.prepaid) if booking.prepaid is not None else None,
        "requirements": {
            "cart": bool(getattr(booking, "cart", False)),
            "push_cart": bool(getattr(booking, "push_cart", False)),
            "caddy": bool(getattr(booking, "caddy", False)),
        },
        "fee_category_id": booking.fee_category_id,
        "fee_category": fee_category,
        "price": resolved_price,
        "status": booking.status,
        "player_type": getattr(booking, "player_type", None),
        "tee_time": booking.tee_time.tee_time.isoformat() if booking.tee_time else None,
        "created_at": booking.created_at.isoformat(),
        "round": round_info,
        "ledger_entries": [
            {
                "id": le.id,
                "description": le.description,
                "amount": float(le.amount),
                "pastel_synced": bool(le.pastel_synced),
                "payment_method": getattr(meta_by_entry_id.get(le.id), "payment_method", None),
                "created_at": le.created_at.isoformat()
            }
            for le in ledger_entries
        ]
    }


class BookingStatusUpdate(BaseModel):
    status: str
    payment_method: Optional[str] = None


class BookingPaymentMethodUpdate(BaseModel):
    payment_method: str


class BookingAccountCodeUpdate(BaseModel):
    account_code: Optional[str] = None
    account_customer_id: Optional[int] = None


class BookingBatchUpdate(BaseModel):
    booking_ids: list[int]
    status: Optional[str] = None
    payment_method: Optional[str] = None
    account_code: Optional[str] = None
    account_customer_id: Optional[int] = None


@router.put("/bookings/{booking_id}/status")
async def update_booking_status(
    booking_id: int,
    payload: BookingStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff)
):
    """Update booking status (admin quick actions)"""

    booking = get_booking_or_404(db, int(booking_id))

    if booking.tee_time:
        assert_day_open(db, booking.tee_time.tee_time.date())

    allowed = {s.value for s in BookingStatus}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status: {payload.status}")

    if payload.status == BookingStatus.cancelled.value:
        _enforce_group_cancel_window(db, booking, staff)

    normalized_payment_method = normalize_booking_payment_method(
        payload.payment_method,
        allow_empty=True,
        field_name="payment method",
    )
    previous_status = str(getattr(booking.status, "value", booking.status) or "")
    booking.status = BookingStatus(payload.status)
    paid_statuses = {BookingStatus.checked_in, BookingStatus.completed}

    if booking.status in paid_statuses:
        crud.ensure_paid_ledger_entry(db, booking, payment_method=normalized_payment_method)
    else:
        # If a booking is moved back to an unpaid state, remove its payment record.
        clear_booking_ledger_entries(db, booking_id=int(booking.id))

    _audit_event(
        db,
        request,
        staff,
        action="booking.status_updated",
        entity_type="booking",
        entity_id=booking.id,
        payload={
            "booking_id": int(booking.id),
            "from_status": previous_status,
            "to_status": str(payload.status),
            "payment_method": normalized_payment_method,
        },
    )
    db.commit()
    db.refresh(booking)
    _invalidate_admin_caches(int(getattr(db, "info", {}).get("club_id") or 0))

    return {
        "status": "success",
        "booking_id": booking.id,
        "new_status": booking.status
    }


@router.delete("/bookings/{booking_id}")
async def delete_booking(
    booking_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Delete a booking and related records (admin only)"""

    booking = get_booking_or_404(db, int(booking_id))

    _enforce_group_cancel_window(db, booking, admin)

    if booking.tee_time:
        assert_day_open(db, booking.tee_time.tee_time.date())

    # Remove related records
    clear_booking_ledger_entries(db, booking_id=int(booking_id))
    db.query(Round).filter(Round.booking_id == booking_id).delete()

    booking_snapshot = {
        "booking_id": int(booking.id),
        "player_name": str(getattr(booking, "player_name", "") or ""),
        "player_email": str(getattr(booking, "player_email", "") or ""),
        "status": str(getattr(getattr(booking, "status", None), "value", booking.status) or ""),
        "tee_time_id": int(getattr(booking, "tee_time_id", 0) or 0),
    }

    db.delete(booking)
    _audit_event(
        db,
        request,
        admin,
        action="booking.deleted",
        entity_type="booking",
        entity_id=booking_id,
        payload=booking_snapshot,
    )
    db.commit()
    _invalidate_admin_caches(int(getattr(db, "info", {}).get("club_id") or 0))

    return {"status": "success", "booking_id": booking_id}


@router.put("/bookings/{booking_id}/payment-method")
async def update_booking_payment_method(
    booking_id: int,
    payload: BookingPaymentMethodUpdate,
    request: Request,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    get_booking_or_404(db, int(booking_id))
    ledger_entry_id, method = set_booking_payment_method_meta(
        db,
        booking_id=int(booking_id),
        payment_method=payload.payment_method,
    )

    _audit_event(
        db,
        request,
        staff,
        action="booking.payment_method_updated",
        entity_type="booking",
        entity_id=booking_id,
        payload={"booking_id": int(booking_id), "ledger_entry_id": int(ledger_entry_id), "payment_method": method},
    )
    db.commit()
    _invalidate_admin_caches(int(getattr(db, "info", {}).get("club_id") or 0))
    return {"status": "success", "booking_id": booking_id, "ledger_entry_id": ledger_entry_id, "payment_method": method}


@router.put("/bookings/{booking_id}/account-code")
async def update_booking_account_code(
    booking_id: int,
    payload: BookingAccountCodeUpdate,
    request: Request,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    booking = get_booking_or_404(db, int(booking_id))

    if booking.tee_time:
        assert_day_open(db, booking.tee_time.tee_time.date())

    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

    code = str(payload.account_code or "").strip()
    matched = resolve_account_customer(
        db,
        club_id=int(club_id),
        account_code=code or None,
        account_customer_id=payload.account_customer_id,
    )
    if payload.account_customer_id and matched is None and not code:
        raise HTTPException(status_code=404, detail="Account customer not found")
    if matched is not None:
        booking.account_customer_id = int(matched.id)
        booking.club_card = str(getattr(matched, "account_code", "") or "").strip() or None
    else:
        booking.account_customer_id = None
        booking.club_card = code or None
    _audit_event(
        db,
        request,
        staff,
        action="booking.account_code_updated",
        entity_type="booking",
        entity_id=booking_id,
        payload={
            "booking_id": int(booking_id),
            "account_code": booking.club_card,
            "account_customer_id": int(getattr(booking, "account_customer_id", 0) or 0) or None,
        },
    )
    db.commit()
    _invalidate_admin_caches(int(getattr(db, "info", {}).get("club_id") or 0))
    return {
        "status": "success",
        "booking_id": booking_id,
        "account_code": booking.club_card,
        "account_customer_id": int(getattr(booking, "account_customer_id", 0) or 0) or None,
        "account_customer_name": str(getattr(matched, "name", "") or "") or None,
    }


@router.put("/bookings/batch-update")
async def batch_update_bookings(
    payload: BookingBatchUpdate,
    request: Request,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    booking_ids = normalize_booking_ids(payload.booking_ids if isinstance(payload.booking_ids, list) else [])

    if not booking_ids:
        raise HTTPException(status_code=400, detail="At least one valid booking_id is required")

    requested_status_raw = str(payload.status or "").strip().lower()
    requested_status: Optional[BookingStatus] = None
    if requested_status_raw:
        allowed = {s.value for s in BookingStatus}
        if requested_status_raw not in allowed:
            raise HTTPException(status_code=400, detail=f"Invalid status: {requested_status_raw}")
        requested_status = BookingStatus(requested_status_raw)

    payment_method = normalize_booking_payment_method(
        payload.payment_method,
        allow_empty=True,
        field_name="payment method",
    )

    account_code = str(payload.account_code or "").strip()
    selected_account_customer = resolve_account_customer(
        db,
        club_id=int(getattr(db, "info", {}).get("club_id") or 0),
        account_code=account_code or None,
        account_customer_id=payload.account_customer_id,
    )
    if payload.account_customer_id and selected_account_customer is None and not account_code:
        raise HTTPException(status_code=404, detail="Account customer not found")
    if selected_account_customer is not None:
        account_code = str(getattr(selected_account_customer, "account_code", "") or "").strip() or account_code
    apply_account_code = bool(account_code) or selected_account_customer is not None

    bookings = (
        db.query(Booking)
        .options(selectinload(Booking.tee_time))
        .filter(Booking.id.in_(booking_ids))
        .all()
    )
    by_id = {int(b.id): b for b in bookings if b and b.id is not None}
    missing = [bid for bid in booking_ids if bid not in by_id]
    if missing:
        missing_label = ", ".join(str(v) for v in missing[:5])
        if len(missing) > 5:
            missing_label = f"{missing_label}, ..."
        raise HTTPException(status_code=404, detail=f"Booking(s) not found: {missing_label}")

    ordered_bookings = [by_id[bid] for bid in booking_ids]
    paid_statuses = {BookingStatus.checked_in, BookingStatus.completed}

    for booking in ordered_bookings:
        if booking.tee_time and booking.tee_time.tee_time:
            assert_day_open(db, booking.tee_time.tee_time.date())
        if requested_status == BookingStatus.cancelled:
            _enforce_group_cancel_window(db, booking, staff)

    updated_ids: list[int] = []
    ledger_updated = 0
    account_updated = 0

    for booking in ordered_bookings:
        if requested_status is not None:
            booking.status = requested_status
            if booking.status in paid_statuses:
                crud.ensure_paid_ledger_entry(db, booking, payment_method=payment_method or None)
                ledger_updated += 1
            else:
                clear_booking_ledger_entries(db, booking_id=int(booking.id))
        elif payment_method:
            was_updated, _ledger_entry_id, _normalized = set_booking_payment_method_if_exists(
                db,
                booking_id=int(booking.id),
                payment_method=payment_method,
            )
            if was_updated:
                ledger_updated += 1

        if apply_account_code:
            booking.club_card = account_code
            booking.account_customer_id = int(selected_account_customer.id) if selected_account_customer is not None else None
            account_updated += 1

        updated_ids.append(int(booking.id))

    if not requested_status and not payment_method and not apply_account_code:
        raise HTTPException(status_code=400, detail="No updates requested. Set status, payment_method, or account_code.")

    _audit_event(
        db,
        request,
        staff,
        action="booking.batch_updated",
        entity_type="booking",
        payload={
            "booking_ids": updated_ids,
            "count": len(updated_ids),
            "status": requested_status.value if requested_status else None,
            "payment_method": payment_method or None,
            "account_code": account_code or None,
            "account_customer_id": int(selected_account_customer.id) if selected_account_customer is not None else None,
            "ledger_updates": int(ledger_updated),
            "account_updates": int(account_updated),
        },
    )
    db.commit()
    _invalidate_admin_caches(int(getattr(db, "info", {}).get("club_id") or 0))
    return {
        "status": "success",
        "updated": len(updated_ids),
        "booking_ids": updated_ids,
        "new_status": requested_status.value if requested_status else None,
        "ledger_updates": int(ledger_updated),
        "account_updates": int(account_updated),
        "account_customer_id": int(selected_account_customer.id) if selected_account_customer is not None else None,
    }


class AccountCustomerUpsertPayload(BaseModel):
    name: str
    account_code: str | None = None
    billing_contact: str | None = None
    terms: str | None = None
    customer_type: str | None = None
    operation_area: str | None = None
    source_file: str | None = None
    import_reference: str | None = None
    active: bool = True
    notes: str | None = None


@router.get("/account-customers")
async def get_account_customers(
    q: Optional[str] = None,
    active_only: bool = False,
    sort: Optional[str] = "name_asc",
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    rows = build_account_customers_query(
        db,
        q=q,
        active_only=bool(active_only),
        sort=sort,
    ).all()
    return {
        "total": len(rows),
        "account_customers": [serialize_account_customer(row) for row in rows],
    }


@router.post("/account-customers")
async def create_account_customer(
    payload: AccountCustomerUpsertPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    name = str(payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    account_code = str(payload.account_code or "").strip() or None
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if not ensure_unique_account_code(db, club_id=club_id, account_code=account_code):
        raise HTTPException(status_code=409, detail="account_code already exists for this club")

    row = AccountCustomer(
        club_id=club_id,
        name=name,
        account_code=account_code,
        billing_contact=str(payload.billing_contact or "").strip() or None,
        terms_label=str(payload.terms or "").strip() or None,
        terms_days=parse_terms_days(payload.terms),
        customer_type=str(payload.customer_type or "").strip() or None,
        operation_area=str(payload.operation_area or "").strip() or None,
        source_file=str(payload.source_file or "").strip() or None,
        import_reference=str(payload.import_reference or "").strip() or None,
        active=1 if payload.active else 0,
        notes=str(payload.notes or "").strip() or None,
    )
    db.add(row)
    _audit_event(
        db,
        request,
        admin,
        action="account_customer.created",
        entity_type="account_customer",
        entity_id=str(account_code or name),
        payload={"name": name, "account_code": account_code},
    )
    db.commit()
    db.refresh(row)
    created_payload = serialize_account_customer(row)
    created_payload.pop("updated_at", None)
    return {
        "status": "success",
        "account_customer": created_payload,
    }


@router.put("/account-customers/{account_customer_id}")
async def update_account_customer(
    account_customer_id: int,
    payload: AccountCustomerUpsertPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    row = db.query(AccountCustomer).filter(AccountCustomer.id == int(account_customer_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Account customer not found")

    name = str(payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    account_code = str(payload.account_code or "").strip() or None
    if not ensure_unique_account_code(
        db,
        club_id=int(getattr(row, "club_id", 0) or 0),
        account_code=account_code,
        exclude_account_customer_id=int(row.id),
    ):
        raise HTTPException(status_code=409, detail="account_code already exists for this club")

    row.name = name
    row.account_code = account_code
    row.billing_contact = str(payload.billing_contact or "").strip() or None
    row.terms_label = str(payload.terms or "").strip() or None
    row.terms_days = parse_terms_days(payload.terms)
    row.customer_type = str(payload.customer_type or "").strip() or None
    row.operation_area = str(payload.operation_area or "").strip() or None
    row.source_file = str(payload.source_file or "").strip() or None
    row.import_reference = str(payload.import_reference or "").strip() or None
    row.active = 1 if payload.active else 0
    row.notes = str(payload.notes or "").strip() or None
    row.updated_at = datetime.utcnow()

    _audit_event(
        db,
        request,
        admin,
        action="account_customer.updated",
        entity_type="account_customer",
        entity_id=int(row.id),
        payload={"name": row.name, "account_code": row.account_code},
    )
    db.commit()
    return {"status": "success"}


class GolfDayBookingUpsertPayload(BaseModel):
    event_name: str
    event_date: date | None = None
    event_end_date: date | None = None
    event_date_raw: str | None = None
    amount: float = 0.0
    invoice_reference: str | None = None
    account_customer_id: int | None = None
    account_code: str | None = None
    contact_name: str | None = None
    deposit_amount: float | None = None
    deposit_received_date: date | None = None
    deposit_received_note: str | None = None
    balance_due: float | None = None
    full_payment_amount: float | None = None
    full_payment_date: date | None = None
    full_payment_note: str | None = None
    payment_status: str | None = None
    operation_area: str | None = None
    source_file: str | None = None
    import_reference: str | None = None
    notes: str | None = None


def _golf_day_payment_status(payload: GolfDayBookingUpsertPayload) -> str:
    status_raw = str(payload.payment_status or "").strip().lower()
    if status_raw in {"pending", "partial", "paid", "cancelled"}:
        return status_raw
    amount = float(payload.amount or 0.0)
    balance = float(payload.balance_due or 0.0)
    deposit = float(payload.deposit_amount or 0.0)
    full_payment = float(payload.full_payment_amount or 0.0)
    if full_payment > 0 or (amount > 0 and balance <= 0):
        return "paid"
    if deposit > 0 or (amount > 0 and 0 < balance < amount):
        return "partial"
    return "pending"


@router.get("/golf-day-bookings")
async def get_golf_day_bookings(
    q: Optional[str] = None,
    status: Optional[str] = "all",
    sort: Optional[str] = "date_asc",
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    query = (
        db.query(
            GolfDayBooking,
            AccountCustomer.name.label("account_customer_name"),
        )
        .outerjoin(AccountCustomer, GolfDayBooking.account_customer_id == AccountCustomer.id)
    )
    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        query = query.filter(
            or_(
                func.lower(GolfDayBooking.event_name).like(like),
                func.lower(func.coalesce(GolfDayBooking.invoice_reference, "")).like(like),
                func.lower(func.coalesce(AccountCustomer.name, "")).like(like),
                func.lower(func.coalesce(GolfDayBooking.account_code_snapshot, "")).like(like),
            )
        )
    status_norm = str(status or "all").strip().lower()
    if status_norm not in {"all", "any", ""}:
        query = query.filter(func.lower(func.coalesce(GolfDayBooking.payment_status, "")) == status_norm)

    sort_key = str(sort or "date_asc").strip().lower()
    if sort_key == "date_desc":
        query = query.order_by(desc(GolfDayBooking.event_date), desc(GolfDayBooking.id))
    elif sort_key == "amount_desc":
        query = query.order_by(desc(GolfDayBooking.amount), desc(GolfDayBooking.event_date))
    elif sort_key == "balance_desc":
        query = query.order_by(desc(func.coalesce(GolfDayBooking.balance_due, 0.0)), desc(GolfDayBooking.event_date))
    else:
        query = query.order_by(asc(GolfDayBooking.event_date), asc(GolfDayBooking.id))

    rows = query.all()
    total_amount = sum(float(getattr(row, "amount", 0.0) or 0.0) for row, _account_name in rows)
    outstanding = sum(float(getattr(row, "balance_due", 0.0) or 0.0) for row, _account_name in rows)
    return {
        "total": len(rows),
        "total_amount": float(total_amount),
        "outstanding_balance": float(outstanding),
        "bookings": [
            {
                "id": int(row.id),
                "event_name": row.event_name,
                "event_date": row.event_date.isoformat() if row.event_date else None,
                "event_end_date": row.event_end_date.isoformat() if row.event_end_date else None,
                "event_date_raw": row.event_date_raw,
                "amount": float(row.amount or 0.0),
                "invoice_reference": row.invoice_reference,
                "account_customer_id": row.account_customer_id,
                "account_customer_name": str(account_customer_name or "") or None,
                "account_code": row.account_code_snapshot,
                "contact_name": row.contact_name,
                "deposit_amount": float(row.deposit_amount or 0.0) if row.deposit_amount is not None else None,
                "deposit_received_date": row.deposit_received_date.isoformat() if row.deposit_received_date else None,
                "deposit_received_note": row.deposit_received_note,
                "balance_due": float(row.balance_due or 0.0) if row.balance_due is not None else None,
                "full_payment_amount": float(row.full_payment_amount or 0.0) if row.full_payment_amount is not None else None,
                "full_payment_date": row.full_payment_date.isoformat() if row.full_payment_date else None,
                "full_payment_note": row.full_payment_note,
                "payment_status": row.payment_status,
                "operation_area": row.operation_area,
                "source_file": row.source_file,
                "import_reference": row.import_reference,
                "notes": row.notes,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row, account_customer_name in rows
        ],
    }


@router.post("/golf-day-bookings")
async def create_golf_day_booking(
    payload: GolfDayBookingUpsertPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    name = str(payload.event_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="event_name is required")
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

    customer = _account_customer_from_input(
        db,
        club_id=club_id,
        account_code=payload.account_code,
        account_customer_id=payload.account_customer_id,
    )
    if payload.account_customer_id and customer is None and not payload.account_code:
        raise HTTPException(status_code=404, detail="Account customer not found")
    row = GolfDayBooking(
        club_id=club_id,
        account_customer_id=int(customer.id) if customer else None,
        event_name=name,
        event_date=payload.event_date,
        event_end_date=payload.event_end_date,
        event_date_raw=str(payload.event_date_raw or "").strip() or None,
        amount=float(payload.amount or 0.0),
        invoice_reference=str(payload.invoice_reference or "").strip() or None,
        deposit_amount=(float(payload.deposit_amount) if payload.deposit_amount is not None else None),
        deposit_received_date=payload.deposit_received_date,
        deposit_received_note=str(payload.deposit_received_note or "").strip() or None,
        balance_due=(float(payload.balance_due) if payload.balance_due is not None else None),
        full_payment_amount=(float(payload.full_payment_amount) if payload.full_payment_amount is not None else None),
        full_payment_date=payload.full_payment_date,
        full_payment_note=str(payload.full_payment_note or "").strip() or None,
        payment_status=_golf_day_payment_status(payload),
        contact_name=str(payload.contact_name or "").strip() or (str(customer.billing_contact) if customer and customer.billing_contact else None),
        account_code_snapshot=str(payload.account_code or "").strip() or (str(customer.account_code) if customer and customer.account_code else None),
        operation_area=str(payload.operation_area or "").strip() or None,
        source_file=str(payload.source_file or "").strip() or None,
        import_reference=str(payload.import_reference or payload.invoice_reference or "").strip() or None,
        notes=str(payload.notes or "").strip() or None,
    )
    db.add(row)
    _audit_event(
        db,
        request,
        admin,
        action="golf_day_booking.created",
        entity_type="golf_day_booking",
        entity_id=name,
        payload={"invoice_reference": row.invoice_reference, "amount": float(row.amount or 0.0)},
    )
    db.commit()
    db.refresh(row)
    return {"status": "success", "id": int(row.id)}


@router.put("/golf-day-bookings/{golf_day_booking_id}")
async def update_golf_day_booking(
    golf_day_booking_id: int,
    payload: GolfDayBookingUpsertPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    row = db.query(GolfDayBooking).filter(GolfDayBooking.id == int(golf_day_booking_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Golf day booking not found")

    customer = _account_customer_from_input(
        db,
        club_id=int(getattr(row, "club_id", 0) or 0),
        account_code=payload.account_code,
        account_customer_id=payload.account_customer_id,
    )
    if payload.account_customer_id and customer is None and not payload.account_code:
        raise HTTPException(status_code=404, detail="Account customer not found")
    row.event_name = str(payload.event_name or row.event_name or "").strip() or row.event_name
    row.event_date = payload.event_date
    row.event_end_date = payload.event_end_date
    row.event_date_raw = str(payload.event_date_raw or "").strip() or None
    row.amount = float(payload.amount or 0.0)
    row.invoice_reference = str(payload.invoice_reference or "").strip() or None
    row.account_customer_id = int(customer.id) if customer else None
    row.account_code_snapshot = str(payload.account_code or "").strip() or (str(customer.account_code) if customer and customer.account_code else None)
    row.contact_name = str(payload.contact_name or "").strip() or (str(customer.billing_contact) if customer and customer.billing_contact else None)
    row.deposit_amount = float(payload.deposit_amount) if payload.deposit_amount is not None else None
    row.deposit_received_date = payload.deposit_received_date
    row.deposit_received_note = str(payload.deposit_received_note or "").strip() or None
    row.balance_due = float(payload.balance_due) if payload.balance_due is not None else None
    row.full_payment_amount = float(payload.full_payment_amount) if payload.full_payment_amount is not None else None
    row.full_payment_date = payload.full_payment_date
    row.full_payment_note = str(payload.full_payment_note or "").strip() or None
    row.payment_status = _golf_day_payment_status(payload)
    row.operation_area = str(payload.operation_area or "").strip() or row.operation_area
    row.source_file = str(payload.source_file or "").strip() or row.source_file
    row.import_reference = str(payload.import_reference or payload.invoice_reference or "").strip() or row.import_reference
    row.notes = str(payload.notes or "").strip() or None
    row.updated_at = datetime.utcnow()

    _audit_event(
        db,
        request,
        admin,
        action="golf_day_booking.updated",
        entity_type="golf_day_booking",
        entity_id=int(row.id),
        payload={"invoice_reference": row.invoice_reference, "payment_status": row.payment_status},
    )
    db.commit()
    return {"status": "success"}


@router.get("/staff-role-context")
async def get_staff_role_context(
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        return {"role_label": None, "default_page": "tee-times"}

    name = str(getattr(staff, "name", "") or "").strip().lower()
    profile = (
        db.query(StaffRoleProfile)
        .filter(
            StaffRoleProfile.club_id == club_id,
            or_(
                StaffRoleProfile.linked_user_id == int(getattr(staff, "id", 0) or 0),
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
    elif "retail" in role_key:
        default_page = "pro-shop"
    elif "green fees" in role_key:
        default_page = "tee-times"
    elif "pro shop manager" in role_key:
        default_page = "pro-shop"

    return {
        "role_label": role_label or None,
        "default_page": default_page,
        "matched_profile_id": int(profile.id) if profile else None,
    }


@router.get("/players")
async def get_all_players(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff)
):
    """Get all registered players"""

    base_query = db.query(User).filter(User.role == UserRole.player)
    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        base_query = base_query.filter(
            or_(
                func.lower(User.name).like(like),
                func.lower(User.email).like(like),
                func.lower(User.handicap_number).like(like),
                func.lower(User.greenlink_id).like(like),
            )
        )

    total = base_query.count()

    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]
    bookings_count_expr = func.count(Booking.id)
    total_spent_expr = func.coalesce(
        func.sum(case((Booking.status.in_(paid_statuses), Booking.price), else_=0.0)),
        0.0,
    )

    players = (
        db.query(
            User.id.label("id"),
            User.name.label("name"),
            User.email.label("email"),
            User.handicap_number.label("handicap_number"),
            User.greenlink_id.label("greenlink_id"),
            User.handicap_sa_id.label("handicap_sa_id"),
            User.home_course.label("home_course"),
            User.gender.label("gender"),
            User.player_category.label("player_category"),
            User.handicap_index.label("handicap_index"),
            bookings_count_expr.label("bookings_count"),
            total_spent_expr.label("total_spent"),
        )
        .outerjoin(Booking, Booking.player_email == User.email)
        .filter(User.role == UserRole.player)
    )
    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        players = players.filter(
            or_(
                func.lower(User.name).like(like),
                func.lower(User.email).like(like),
                func.lower(User.handicap_number).like(like),
                func.lower(User.greenlink_id).like(like),
            )
        )

    players = (
        players.group_by(
            User.id,
            User.name,
            User.email,
            User.handicap_number,
            User.greenlink_id,
            User.handicap_sa_id,
            User.home_course,
            User.gender,
            User.player_category,
            User.handicap_index,
        )
        .order_by(desc(User.id))
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "players": [
            {
                "id": p.id,
                "name": p.name,
                "email": p.email,
                "handicap_number": p.handicap_number,
                "greenlink_id": p.greenlink_id,
                "handicap_sa_id": getattr(p, "handicap_sa_id", None),
                "home_course": getattr(p, "home_course", None),
                "gender": getattr(p, "gender", None),
                "player_category": getattr(p, "player_category", None),
                "handicap_index": float(getattr(p, "handicap_index", None)) if getattr(p, "handicap_index", None) is not None else None,
                "bookings_count": int(p.bookings_count or 0),
                "total_spent": float(p.total_spent or 0.0),
            }
            for p in players
        ]
    }


@router.get("/members")
async def get_members(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    sort: Optional[str] = "recent_activity",
    area: Optional[str] = "all",  # all | general | golf | bowls | tennis | squash | homeowners | house | social | other | staff
    membership_status: Optional[str] = "all",  # all | active | hold | inactive | resigned | deceased | defaulter
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    """List member profiles (with basic booking stats)."""

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
        # Default = operational recency (who booked/played most recently).
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


@router.post("/members")
async def create_member(
    payload: MemberUpsertPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
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

    row = Member(
        club_id=club_id,
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
        pricing_override_updated_at=datetime.utcnow() if pricing_mode != "membership_default" or pricing_note else None,
        pricing_override_updated_by_user_id=(int(getattr(admin, "id", 0) or 0) or None) if pricing_mode != "membership_default" or pricing_note else None,
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
    except Exception as e:
        db.rollback()
        msg = str(getattr(e, "orig", e) or "")[:180]
        raise HTTPException(status_code=409, detail=f"Member create failed (duplicate?): {msg}")

    db.refresh(row)
    return {"status": "success", "member_id": row.id}


@router.put("/members/{member_id}")
async def update_member(
    member_id: int,
    payload: MemberUpsertPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
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
        row.pricing_override_updated_by_user_id = int(getattr(admin, "id", 0) or 0) or None
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
    except Exception as e:
        db.rollback()
        msg = str(getattr(e, "orig", e) or "")[:180]
        raise HTTPException(status_code=409, detail=f"Member update failed (duplicate?): {msg}")

    return {"status": "success"}


@router.get("/members/{member_id}")
async def get_member_detail(
    member_id: int,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    """
    Member profile view (the imported club membership list).

    This is distinct from "players" (registered user accounts).
    """
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


@router.get("/guests")
async def get_guest_players(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    guest_type: Optional[str] = None,  # all | affiliated | non_affiliated
    sort: Optional[str] = "recent_activity",
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    """Aggregate non-member bookings into guest profiles."""

    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]

    guest_key = func.lower(func.coalesce(Booking.player_email, cast(Booking.player_name, String)))
    last_seen_expr = func.max(TeeTime.tee_time)

    query = (
        db.query(
            guest_key.label("guest_key"),
            func.max(Booking.player_name).label("name"),
            func.max(Booking.player_email).label("email"),
            func.max(Booking.handicap_number).label("handicap_number"),
            func.count(Booking.id).label("bookings_count"),
            func.coalesce(
                func.sum(case((Booking.status.in_(paid_statuses), Booking.price), else_=0.0)),
                0.0,
            ).label("total_spent"),
            last_seen_expr.label("last_seen"),
        )
        .outerjoin(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(Booking.member_id.is_(None))
    )

    gt = (guest_type or "").strip().lower()
    if gt in {"affiliated", "affiliate", "visitor"}:
        # Treat NULL as "visitor" for legacy bookings.
        query = query.filter(or_(Booking.player_type.is_(None), Booking.player_type.in_(["visitor", "reciprocity"])))
    elif gt in {"non_affiliated", "non-affiliated", "nonaffiliated"}:
        query = query.filter(Booking.player_type == "non_affiliated")

    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        query = query.filter(
            or_(
                func.lower(Booking.player_name).like(like),
                func.lower(Booking.player_email).like(like),
                func.lower(Booking.handicap_number).like(like),
            )
        )

    query = query.group_by(guest_key)

    total = query.count()

    sort_key = str(sort or "recent_activity").strip().lower()
    if sort_key == "bookings_desc":
        order = [desc(func.count(Booking.id)), desc(last_seen_expr)]
    elif sort_key == "spend_desc":
        order = [desc(func.coalesce(func.sum(case((Booking.status.in_(paid_statuses), Booking.price), else_=0.0)), 0.0)), desc(last_seen_expr)]
    elif sort_key == "name_desc":
        order = [desc(func.max(Booking.player_name))]
    elif sort_key == "name_asc":
        order = [asc(func.max(Booking.player_name))]
    else:
        order = [desc(last_seen_expr)]

    rows = query.order_by(*order).offset(skip).limit(limit).all()

    return {
        "total": total,
        "guests": [
            {
                "key": guest_key_value,
                "name": name,
                "email": email,
                "handicap_number": handicap_number,
                "bookings_count": int(bookings_count or 0),
                "total_spent": float(total_spent or 0.0),
                "last_seen": last_seen.isoformat() if last_seen else None,
            }
            for (
                guest_key_value,
                name,
                email,
                handicap_number,
                bookings_count,
                total_spent,
                last_seen,
            ) in rows
        ],
    }


@router.get("/players/{player_id}")
async def get_player_detail(
    player_id: int,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff)
):
    """Get detailed player information with booking history"""
    
    player = db.query(User).filter(User.id == player_id, User.role == UserRole.player).first()
    
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    bookings = db.query(Booking).filter(Booking.player_email == player.email).order_by(desc(Booking.created_at)).all()
    
    total_spent = db.query(func.sum(Booking.price)).filter(Booking.player_email == player.email).scalar() or 0.0
    completed_rounds = db.query(func.count(Round.id)).join(Booking).filter(
        Booking.player_email == player.email,
        Round.closed == 1
    ).scalar() or 0
    
    return {
        "id": player.id,
        "name": player.name,
        "email": player.email,
        "handicap_number": player.handicap_number,
        "greenlink_id": player.greenlink_id,
        "handicap_sa_id": getattr(player, "handicap_sa_id", None),
        "home_course": getattr(player, "home_course", None),
        "gender": getattr(player, "gender", None),
        "player_category": getattr(player, "player_category", None),
        "handicap_index": float(getattr(player, "handicap_index", None)) if getattr(player, "handicap_index", None) is not None else None,
        "total_spent": float(total_spent),
        "bookings_count": len(bookings),
        "completed_rounds": completed_rounds,
        "recent_bookings": [
            {
                "id": b.id,
                "price": float(b.price),
                "status": b.status,
                "tee_time": b.tee_time.tee_time.isoformat() if b.tee_time else None,
                "created_at": b.created_at.isoformat()
            }
            for b in bookings[:10]
        ]
    }

@router.get("/members/search")
async def search_members(
    q: str,
    limit: int = 10,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    """Search members for quick booking (pro shop)."""

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


@router.get("/staff")
async def get_staff_users(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    sort: Optional[str] = "name_asc",
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    """
    List staff accounts for the current club (admins + club_staff).

    Note: "Super admin" users are global and are managed via /api/super.
    """
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

    query = (
        db.query(User)
        .filter(User.role.in_([UserRole.admin, UserRole.club_staff]))
        .filter(User.club_id == club_id)
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
    user_ids = [int(u.id) for u in rows if getattr(u, "id", None) is not None]
    profiles = []
    if user_ids:
        profiles = (
            db.query(StaffRoleProfile)
            .filter(
                StaffRoleProfile.club_id == club_id,
                StaffRoleProfile.linked_user_id.in_(user_ids),
            )
            .order_by(StaffRoleProfile.id.asc())
            .all()
        )
    profile_map = {
        int(p.linked_user_id): {
            "role_label": str(getattr(p, "role_label", "") or "").strip() or None,
            "operation_area": str(getattr(p, "operation_area", "") or "").strip() or None,
            "user_type": str(getattr(p, "user_type", "") or "").strip() or None,
            "source_file": str(getattr(p, "source_file", "") or "").strip() or None,
        }
        for p in profiles
        if getattr(p, "linked_user_id", None)
    }

    return {
        "total": total,
        "staff": [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "role": getattr(u.role, "value", u.role),
                "operational_role": (profile_map.get(int(u.id)) or {}).get("role_label"),
                "operation_area": (profile_map.get(int(u.id)) or {}).get("operation_area"),
                "user_type": (profile_map.get(int(u.id)) or {}).get("user_type"),
                "source_file": (profile_map.get(int(u.id)) or {}).get("source_file"),
            }
            for u in rows
        ],
    }


class StaffUpsertPayload(BaseModel):
    name: str
    email: str
    password: str | None = None
    role: str = "club_staff"  # club_staff only (admin managed by super admin)
    force_reset: bool | None = False


def _parse_staff_role_for_club_admin(raw: str | None) -> UserRole:
    r = (raw or "").strip().lower()
    if r in {"club_staff", "staff", "proshop"}:
        return UserRole.club_staff
    # Only super admins should create/promote admins.
    raise HTTPException(status_code=400, detail="role must be 'club_staff'")


def _find_user_by_email_global(db: Session, email: str) -> User | None:
    """
    Lookup a user by email without tenant scoping.

    The admin router sets `db.info["club_id"]`, and the tenant scoping hook applies
    `User.club_id == club_id` automatically on SELECTs. For uniqueness checks we must
    query globally (email is unique across all clubs).
    """
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


@router.post("/staff")
async def create_staff_user_for_club(
    payload: StaffUpsertPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

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

        # Legacy: player accounts created before multi-club may have no club_id.
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

    u = User(
        name=name,
        email=email,
        password=get_password_hash(payload.password),
        role=role,
        club_id=club_id,
    )
    db.add(u)
    db.flush()
    sync_user_club_assignment(
        db,
        u,
        club_id=int(club_id),
        role=role,
        is_primary=True,
    )
    sync_user_person(db, u, source_system="staff_upsert")
    db.commit()
    db.refresh(u)
    return {"status": "success", "user_id": u.id}


@router.put("/staff/{user_id}")
async def update_staff_user_for_club(
    user_id: int,
    payload: StaffUpsertPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

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
    # Do not allow role changes beyond club_staff here.
    user.role = _parse_staff_role_for_club_admin(payload.role)
    if payload.password:
        assert_password_policy(payload.password, field_name="password")
        user.password = get_password_hash(payload.password)

    # email changes are risky (linking + auth); disallow in club admin UI for now.
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


class ProShopProductUpsertPayload(BaseModel):
    sku: str
    name: str
    category: Optional[str] = None
    unit_price: float = 0.0
    cost_price: Optional[float] = None
    stock_qty: int = 0
    reorder_level: int = 0
    active: bool = True


class ProShopProductUpdatePayload(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    unit_price: Optional[float] = None
    cost_price: Optional[float] = None
    stock_qty: Optional[int] = None
    reorder_level: Optional[int] = None
    active: Optional[bool] = None


class ProShopStockAdjustPayload(BaseModel):
    delta: int
    reason: Optional[str] = None


class ProShopSaleItemPayload(BaseModel):
    product_id: int
    quantity: int
    unit_price: Optional[float] = None


class ProShopSaleCreatePayload(BaseModel):
    customer_name: Optional[str] = None
    payment_method: Optional[str] = "card"
    notes: Optional[str] = None
    discount: Optional[float] = 0.0
    tax: Optional[float] = 0.0
    items: list[ProShopSaleItemPayload]


def _serialize_pro_shop_product(product: ProShopProduct) -> dict:
    return {
        "id": int(product.id),
        "sku": str(product.sku or ""),
        "name": str(product.name or ""),
        "category": str(product.category or "") if product.category else None,
        "unit_price": float(product.unit_price or 0.0),
        "cost_price": float(product.cost_price) if product.cost_price is not None else None,
        "stock_qty": int(product.stock_qty or 0),
        "reorder_level": int(product.reorder_level or 0),
        "active": bool(int(product.active or 0) == 1),
        "updated_at": product.updated_at.isoformat() if product.updated_at else None,
    }


def _serialize_pro_shop_sale(sale: ProShopSale) -> dict:
    return {
        "id": int(sale.id),
        "sold_at": sale.sold_at.isoformat() if sale.sold_at else None,
        "customer_name": sale.customer_name,
        "payment_method": sale.payment_method,
        "subtotal": float(sale.subtotal or 0.0),
        "discount": float(sale.discount or 0.0),
        "tax": float(sale.tax or 0.0),
        "total": float(sale.total or 0.0),
        "items": [
            {
                "id": int(item.id),
                "product_id": int(item.product_id) if item.product_id is not None else None,
                "sku": item.sku_snapshot,
                "name": item.name_snapshot,
                "category": item.category_snapshot,
                "quantity": int(item.quantity or 0),
                "unit_price": float(item.unit_price or 0.0),
                "line_total": float(item.line_total or 0.0),
            }
            for item in sorted((sale.items or []), key=lambda row: int(row.id or 0))
        ],
    }


def _normalize_payment_method(raw: str | None) -> str:
    return normalize_pro_shop_payment_method(raw)


@router.get("/pro-shop/products")
async def list_pro_shop_products(
    q: Optional[str] = None,
    active_only: bool = False,
    limit: int = 250,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    q = (q or "").strip()
    safe_limit = max(1, min(int(limit or 250), 500))
    query = db.query(ProShopProduct).filter(ProShopProduct.club_id == club_id)
    if active_only:
        query = query.filter(ProShopProduct.active == 1)
    if q:
        q_like = f"%{q.lower()}%"
        query = query.filter(
            or_(
                func.lower(ProShopProduct.sku).like(q_like),
                func.lower(ProShopProduct.name).like(q_like),
                func.lower(func.coalesce(ProShopProduct.category, "")).like(q_like),
            )
        )

    rows = (
        query
        .order_by(ProShopProduct.active.desc(), ProShopProduct.name.asc(), ProShopProduct.id.asc())
        .limit(safe_limit)
        .all()
    )
    low_stock_count = (
        db.query(func.count(ProShopProduct.id))
        .filter(
            ProShopProduct.club_id == club_id,
            ProShopProduct.active == 1,
            ProShopProduct.stock_qty <= func.coalesce(ProShopProduct.reorder_level, 0),
        )
        .scalar()
        or 0
    )

    return {
        "products": [_serialize_pro_shop_product(row) for row in rows],
        "low_stock_count": int(low_stock_count or 0),
    }


@router.post("/pro-shop/products")
async def create_pro_shop_product(
    payload: ProShopProductUpsertPayload,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    sku = (payload.sku or "").strip()
    name = (payload.name or "").strip()
    if not sku:
        raise HTTPException(status_code=400, detail="sku is required")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    unit_price = float(payload.unit_price or 0.0)
    cost_price = payload.cost_price
    stock_qty = int(payload.stock_qty or 0)
    reorder_level = int(payload.reorder_level or 0)
    if unit_price < 0:
        raise HTTPException(status_code=400, detail="unit_price must be >= 0")
    if cost_price is not None and float(cost_price) < 0:
        raise HTTPException(status_code=400, detail="cost_price must be >= 0")
    if stock_qty < 0:
        raise HTTPException(status_code=400, detail="stock_qty must be >= 0")
    if reorder_level < 0:
        raise HTTPException(status_code=400, detail="reorder_level must be >= 0")

    exists = (
        db.query(ProShopProduct.id)
        .filter(ProShopProduct.club_id == club_id, func.lower(ProShopProduct.sku) == sku.lower())
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail=f"Product with sku '{sku}' already exists")

    now = datetime.utcnow()
    row = ProShopProduct(
        club_id=club_id,
        sku=sku,
        name=name,
        category=(payload.category or "").strip() or None,
        unit_price=unit_price,
        cost_price=(float(cost_price) if cost_price is not None else None),
        stock_qty=stock_qty,
        reorder_level=reorder_level,
        active=1 if payload.active else 0,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {"status": "success", "product": _serialize_pro_shop_product(row)}


@router.put("/pro-shop/products/{product_id}")
async def update_pro_shop_product(
    product_id: int,
    payload: ProShopProductUpdatePayload,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    row = db.query(ProShopProduct).filter(ProShopProduct.club_id == club_id, ProShopProduct.id == int(product_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")

    if payload.sku is not None:
        sku = (payload.sku or "").strip()
        if not sku:
            raise HTTPException(status_code=400, detail="sku cannot be empty")
        dup = (
            db.query(ProShopProduct.id)
            .filter(
                ProShopProduct.club_id == club_id,
                func.lower(ProShopProduct.sku) == sku.lower(),
                ProShopProduct.id != row.id,
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail=f"Product with sku '{sku}' already exists")
        row.sku = sku

    if payload.name is not None:
        name = (payload.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        row.name = name

    if payload.category is not None:
        row.category = (payload.category or "").strip() or None

    if payload.unit_price is not None:
        unit_price = float(payload.unit_price)
        if unit_price < 0:
            raise HTTPException(status_code=400, detail="unit_price must be >= 0")
        row.unit_price = unit_price

    if payload.cost_price is not None:
        cost_price = float(payload.cost_price)
        if cost_price < 0:
            raise HTTPException(status_code=400, detail="cost_price must be >= 0")
        row.cost_price = cost_price

    if payload.stock_qty is not None:
        stock_qty = int(payload.stock_qty)
        if stock_qty < 0:
            raise HTTPException(status_code=400, detail="stock_qty must be >= 0")
        row.stock_qty = stock_qty

    if payload.reorder_level is not None:
        reorder_level = int(payload.reorder_level)
        if reorder_level < 0:
            raise HTTPException(status_code=400, detail="reorder_level must be >= 0")
        row.reorder_level = reorder_level

    if payload.active is not None:
        row.active = 1 if payload.active else 0

    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return {"status": "success", "product": _serialize_pro_shop_product(row)}


@router.post("/pro-shop/products/{product_id}/adjust-stock")
async def adjust_pro_shop_stock(
    product_id: int,
    payload: ProShopStockAdjustPayload,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    row = db.query(ProShopProduct).filter(ProShopProduct.club_id == club_id, ProShopProduct.id == int(product_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")

    delta = int(payload.delta or 0)
    if delta == 0:
        raise HTTPException(status_code=400, detail="delta must be non-zero")

    next_qty = int(row.stock_qty or 0) + delta
    if next_qty < 0:
        raise HTTPException(status_code=409, detail="Stock cannot be negative")

    row.stock_qty = next_qty
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return {
        "status": "success",
        "reason": (payload.reason or "").strip() or None,
        "product": _serialize_pro_shop_product(row),
    }


@router.get("/pro-shop/sales")
async def list_pro_shop_sales(
    limit: int = 25,
    days: int = 30,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    safe_limit = max(1, min(int(limit or 25), 200))
    safe_days = max(1, min(int(days or 30), 365))
    start_dt = datetime.utcnow() - timedelta(days=safe_days)
    today = datetime.utcnow().date()

    query = (
        db.query(ProShopSale)
        .options(selectinload(ProShopSale.items))
        .filter(ProShopSale.club_id == club_id, ProShopSale.sold_at >= start_dt)
    )
    rows = query.order_by(desc(ProShopSale.sold_at), desc(ProShopSale.id)).limit(safe_limit).all()

    period_total = (
        db.query(func.sum(ProShopSale.total))
        .filter(ProShopSale.club_id == club_id, ProShopSale.sold_at >= start_dt)
        .scalar()
        or 0.0
    )
    period_transactions = (
        db.query(func.count(ProShopSale.id))
        .filter(ProShopSale.club_id == club_id, ProShopSale.sold_at >= start_dt)
        .scalar()
        or 0
    )
    today_total = (
        db.query(func.sum(ProShopSale.total))
        .filter(ProShopSale.club_id == club_id, func.date(ProShopSale.sold_at) == today)
        .scalar()
        or 0.0
    )
    today_transactions = (
        db.query(func.count(ProShopSale.id))
        .filter(ProShopSale.club_id == club_id, func.date(ProShopSale.sold_at) == today)
        .scalar()
        or 0
    )

    return {
        "sales": [_serialize_pro_shop_sale(row) for row in rows],
        "summary": {
            "today_total": float(today_total or 0.0),
            "today_transactions": int(today_transactions or 0),
            "period_total": float(period_total or 0.0),
            "period_transactions": int(period_transactions or 0),
            "period_days": int(safe_days),
        },
    }


@router.post("/pro-shop/sales")
async def create_pro_shop_sale(
    payload: ProShopSaleCreatePayload,
    request: Request,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    items = payload.items or []
    if not items:
        raise HTTPException(status_code=400, detail="At least one sale item is required")

    discount = max(0.0, float(payload.discount or 0.0))
    tax = max(0.0, float(payload.tax or 0.0))
    payment_method = _normalize_payment_method(payload.payment_method)
    sold_at = datetime.utcnow()

    try:
        line_items: list[dict] = []
        for raw_item in items:
            product = (
                db.query(ProShopProduct)
                .filter(ProShopProduct.club_id == club_id, ProShopProduct.id == int(raw_item.product_id))
                .first()
            )
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {raw_item.product_id} not found")

            quantity = int(raw_item.quantity or 0)
            if quantity <= 0:
                raise HTTPException(status_code=400, detail="quantity must be >= 1")

            stock_qty = int(product.stock_qty or 0)
            if stock_qty < quantity:
                raise HTTPException(
                    status_code=409,
                    detail=f"Insufficient stock for '{product.name}' (available {stock_qty}, requested {quantity})",
                )

            unit_price = float(raw_item.unit_price) if raw_item.unit_price is not None else float(product.unit_price or 0.0)
            if unit_price < 0:
                raise HTTPException(status_code=400, detail="unit_price must be >= 0")

            line_total = round(unit_price * float(quantity), 2)
            line_items.append(
                {
                    "product": product,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "line_total": line_total,
                }
            )

        subtotal = round(sum(float(item["line_total"]) for item in line_items), 2)
        total = round(subtotal - discount + tax, 2)
        if total < 0:
            raise HTTPException(status_code=400, detail="Total cannot be negative")

        sale = ProShopSale(
            club_id=club_id,
            sold_by_user_id=int(staff.id),
            customer_name=(payload.customer_name or "").strip() or None,
            notes=(payload.notes or "").strip() or None,
            payment_method=payment_method,
            subtotal=subtotal,
            discount=discount,
            tax=tax,
            total=total,
            sold_at=sold_at,
            created_at=sold_at,
        )
        db.add(sale)
        db.flush()

        for line in line_items:
            product = line["product"]
            quantity = int(line["quantity"])
            unit_price = float(line["unit_price"])
            line_total = float(line["line_total"])

            db.add(
                ProShopSaleItem(
                    club_id=club_id,
                    sale_id=int(sale.id),
                    product_id=int(product.id),
                    sku_snapshot=str(product.sku or ""),
                    name_snapshot=str(product.name or ""),
                    category_snapshot=str(product.category or "") if product.category else None,
                    quantity=quantity,
                    unit_price=unit_price,
                    line_total=line_total,
                    created_at=sold_at,
                )
            )

            product.stock_qty = int(product.stock_qty or 0) - quantity
            product.updated_at = sold_at

        db.add(
            RevenueTransaction(
                club_id=club_id,
                source="pro_shop",
                transaction_date=sold_at.date(),
                external_id=f"proshop-sale-{int(sale.id)}",
                description=f"Pro shop sale #{int(sale.id)}",
                category=payment_method,
                amount=total,
                created_at=sold_at,
            )
        )

        _audit_event(
            db,
            request,
            staff,
            action="pro_shop.sale_created",
            entity_type="pro_shop_sale",
            entity_id=int(sale.id),
            payload={
                "sale_id": int(sale.id),
                "club_id": int(club_id),
                "item_count": len(line_items),
                "payment_method": payment_method,
                "subtotal": float(subtotal),
                "discount": float(discount),
                "tax": float(tax),
                "total": float(total),
            },
        )
        db.commit()
        _invalidate_admin_caches(int(club_id))
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    saved = (
        db.query(ProShopSale)
        .options(selectinload(ProShopSale.items))
        .filter(ProShopSale.club_id == club_id, ProShopSale.id == int(sale.id))
        .first()
    )
    if not saved:
        raise HTTPException(status_code=500, detail="Sale created but could not be reloaded")

    return {"status": "success", "sale": _serialize_pro_shop_sale(saved)}


@router.get("/revenue")
async def get_revenue_analytics(
    days: int = 30,
    period: Optional[str] = None,  # day | wtd | mtd | ytd
    anchor_date: Optional[date] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    """Get revenue analytics for last N days or a named period ending at anchor_date."""

    anchor = anchor_date or datetime.utcnow().date()
    if period:
        start_d, end_d, elapsed_days = _period_window(period, anchor)
        start_date = datetime.combine(start_d, datetime.min.time())
        end_date_exclusive = datetime.combine(end_d + timedelta(days=1), datetime.min.time())
        period_days = (end_d - start_d).days + 1
    else:
        # "Last N days" mode (use tee-time date for bookings, payment date for ledger).
        start_date = datetime.utcnow() - timedelta(days=days)
        end_date_exclusive = None
        elapsed_days = None
        period_days = days

    _repair_booking_pricing_window(
        db,
        club_id,
        start_dt=start_date,
        end_dt_exclusive=end_date_exclusive,
    )
    
    # Daily booked revenue (tee-time date)
    daily_revenue_query = db.query(
        func.date(TeeTime.tee_time).label("date"),
        func.sum(Booking.price).label("amount"),
        func.count(Booking.id).label("bookings")
    ).join(TeeTime, Booking.tee_time_id == TeeTime.id).filter(
        TeeTime.club_id == club_id,
        Booking.club_id == club_id,
        TeeTime.tee_time >= start_date,
    )

    if end_date_exclusive is not None:
        daily_revenue_query = daily_revenue_query.filter(TeeTime.tee_time < end_date_exclusive)

    daily_revenue = (
        daily_revenue_query.group_by(func.date(TeeTime.tee_time))
        .order_by(func.date(TeeTime.tee_time))
        .all()
    )

    # Daily paid revenue (payment date / ledger entry date)
    daily_paid_revenue_query = db.query(
        func.date(LedgerEntry.created_at).label("date"),
        func.sum(LedgerEntry.amount).label("amount"),
        func.count(LedgerEntry.id).label("bookings")
    ).filter(
        LedgerEntry.club_id == club_id,
        LedgerEntry.booking_id.isnot(None),
        LedgerEntry.created_at >= start_date,
    )

    if end_date_exclusive is not None:
        daily_paid_revenue_query = daily_paid_revenue_query.filter(LedgerEntry.created_at < end_date_exclusive)

    daily_paid_revenue = (
        daily_paid_revenue_query.group_by(func.date(LedgerEntry.created_at))
        .order_by(func.date(LedgerEntry.created_at))
        .all()
    )

    # Daily other revenue (mirrored CSV; transaction_date). Keep non-blocking for older DBs.
    other_daily_revenue = []
    try:
        other_daily_query = db.query(
            RevenueTransaction.transaction_date.label("date"),
            func.sum(RevenueTransaction.amount).label("amount"),
            func.count(RevenueTransaction.id).label("transactions"),
        ).filter(
            RevenueTransaction.club_id == club_id,
            ~_native_pro_shop_revenue_clause(),
            RevenueTransaction.transaction_date >= start_date.date(),
        )

        if end_date_exclusive is not None:
            other_daily_query = other_daily_query.filter(RevenueTransaction.transaction_date < end_date_exclusive.date())

        other_daily_revenue = (
            other_daily_query.group_by(RevenueTransaction.transaction_date)
            .order_by(RevenueTransaction.transaction_date)
            .all()
        )
    except Exception:
        _safe_rollback(db)
        other_daily_revenue = []
    
    # Revenue by booking status
    status_revenue_query = db.query(
        Booking.status,
        func.sum(Booking.price).label("amount"),
        func.count(Booking.id).label("count")
    ).join(TeeTime, Booking.tee_time_id == TeeTime.id).filter(TeeTime.tee_time >= start_date)

    if end_date_exclusive is not None:
        status_revenue_query = status_revenue_query.filter(TeeTime.tee_time < end_date_exclusive)

    status_revenue = status_revenue_query.group_by(Booking.status).all()

    year = int(anchor.year)
    target_model = _target_model_payload(db, year)
    annual_revenue_target = target_model.get("revenue_target")

    derived_target = _derive_target(annual_revenue_target, year, elapsed_days) if elapsed_days is not None else None
    daily_required = (float(annual_revenue_target) / float(_days_in_year(year))) if annual_revenue_target is not None else None

    other_by_stream = []
    try:
        other_stream_query = db.query(
            RevenueTransaction.source,
            func.sum(RevenueTransaction.amount).label("amount"),
            func.count(RevenueTransaction.id).label("transactions"),
        ).filter(
            RevenueTransaction.club_id == club_id,
            ~_native_pro_shop_revenue_clause(),
            RevenueTransaction.transaction_date >= start_date.date(),
        )

        if end_date_exclusive is not None:
            other_stream_query = other_stream_query.filter(RevenueTransaction.transaction_date < end_date_exclusive.date())

        raw_by_stream = (
            other_stream_query.group_by(RevenueTransaction.source)
            .order_by(desc(func.sum(RevenueTransaction.amount)))
            .all()
        )

        by_stream: dict[str, dict[str, float | int]] = {}
        for source, amount, transactions in raw_by_stream:
            stream = _normalize_revenue_stream(source)
            current = by_stream.get(stream, {"amount": 0.0, "transactions": 0})
            current["amount"] = float(current["amount"]) + float(amount or 0.0)
            current["transactions"] = int(current["transactions"]) + int(transactions or 0)
            by_stream[stream] = current
        other_by_stream = sorted(
            [
                {
                    "stream": stream,
                    "amount": float(stats.get("amount", 0.0)),
                    "transactions": int(stats.get("transactions", 0)),
                }
                for stream, stats in by_stream.items()
            ],
            key=lambda row: float(row["amount"]),
            reverse=True,
        )
    except Exception:
        _safe_rollback(db)
        other_by_stream = []
	    
    return {
        "period_days": int(period_days or days),
        "period": (period or "").lower().strip() or None,
        "anchor_date": anchor.isoformat(),
        "target_revenue": derived_target,
        "annual_revenue_target": annual_revenue_target,
        "target_context": target_model,
        "revenue_boundary": {
            "golf_paid_source": "ledger_entries",
            "imported_non_booking_source": "revenue_transactions_excluding_native_pro_shop_pos",
            "pro_shop_native_reporting_source": "pro_shop_sales",
            "pro_shop_imported_reporting_source": "revenue_transactions_import_only",
        },
        "daily_revenue_required": daily_required,
        "daily_revenue": [
            {
                "date": str(dr[0]),
                "amount": float(dr[1]) if dr[1] else 0.0,
                "bookings": dr[2]
            }
            for dr in daily_revenue
        ],
        "daily_paid_revenue": [
            {
                "date": str(dr[0]),
                "amount": float(dr[1]) if dr[1] else 0.0,
                "bookings": dr[2]
            }
            for dr in daily_paid_revenue
        ],
        "daily_other_revenue": [
            {
                "date": str(dr[0]),
                "amount": float(dr[1]) if dr[1] else 0.0,
                "transactions": int(dr[2] or 0),
            }
            for dr in other_daily_revenue
        ],
        "other_revenue_by_stream": other_by_stream,
        "revenue_by_status": [
            {
                "status": sr[0],
                "amount": float(sr[1]) if sr[1] else 0.0,
                "count": sr[2]
            }
            for sr in status_revenue
        ]
    }


@router.get("/tee-times")
async def get_tee_times(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get all tee times with booking info"""
    
    tee_times = db.query(TeeTime).order_by(desc(TeeTime.tee_time)).offset(skip).limit(limit).all()
    total = db.query(func.count(TeeTime.id)).scalar()
    
    return {
        "total": total,
        "tee_times": [
            {
                "id": tt.id,
                "tee_time": tt.tee_time.isoformat(),
                "hole": tt.hole,
                "bookings": [
                    {
                        "id": b.id,
                        "player_name": b.player_name,
                        "status": b.status,
                        "price": float(b.price)
                    }
                    for b in tt.bookings
                ],
                "total_bookings": len(tt.bookings),
                "total_revenue": sum(b.price for b in tt.bookings)
            }
            for tt in tee_times
        ]
    }


@router.get("/ledger")
async def get_ledger_entries(
    skip: int = 0,
    limit: int = 50,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    q: Optional[str] = None,
    exported: Optional[bool] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get all ledger entries (transaction history)"""
    
    query = db.query(LedgerEntry)

    if start and end:
        query = query.filter(LedgerEntry.created_at >= start, LedgerEntry.created_at < end)

    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        query = query.filter(
            or_(
                func.lower(LedgerEntry.description).like(like),
                func.lower(cast(LedgerEntry.booking_id, String)).like(like),
            )
        )

    if exported is True:
        query = query.filter(LedgerEntry.pastel_synced == 1)
    elif exported is False:
        query = query.filter(or_(LedgerEntry.pastel_synced == 0, LedgerEntry.pastel_synced.is_(None)))

    total = query.count()
    total_amount = query.with_entities(func.sum(LedgerEntry.amount)).scalar() or 0.0

    entries = query.order_by(desc(LedgerEntry.created_at)).offset(skip).limit(limit).all()
    
    return {
        "total": total,
        "total_amount": float(total_amount),
        "ledger_entries": [
            {
                "id": le.id,
                "booking_id": le.booking_id,
                "description": le.description,
                "amount": float(le.amount),
                "pastel_synced": bool(le.pastel_synced),
                "pastel_transaction_id": le.pastel_transaction_id,
                "created_at": le.created_at.isoformat()
            }
            for le in entries
        ]
    }


@router.get("/audit-logs")
async def get_audit_logs(
    skip: int = 0,
    limit: int = 100,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    query = db.query(AuditLog)
    if action:
        query = query.filter(func.lower(AuditLog.action) == str(action).strip().lower())
    if entity_type:
        query = query.filter(func.lower(AuditLog.entity_type) == str(entity_type).strip().lower())
    if actor_user_id is not None and int(actor_user_id) > 0:
        query = query.filter(AuditLog.actor_user_id == int(actor_user_id))
    if start is not None:
        query = query.filter(AuditLog.created_at >= start)
    if end is not None:
        query = query.filter(AuditLog.created_at < end)
    if q:
        needle = str(q).strip().lower()
        like = f"%{needle}%"
        query = query.filter(
            or_(
                func.lower(AuditLog.entity_id).like(like),
                func.lower(AuditLog.request_id).like(like),
                func.lower(AuditLog.payload_json).like(like),
            )
        )

    total = query.count()
    rows = query.order_by(desc(AuditLog.created_at), desc(AuditLog.id)).offset(skip).limit(limit).all()

    actor_ids = {
        int(getattr(row, "actor_user_id", 0) or 0)
        for row in rows
        if getattr(row, "actor_user_id", None) is not None
    }
    actor_names: dict[int, str] = {}
    if actor_ids:
        for user in db.query(User).filter(User.id.in_(list(actor_ids))).all():
            actor_names[int(user.id)] = str(getattr(user, "name", "") or "").strip() or str(getattr(user, "email", "") or "")

    items = []
    for row in rows:
        actor_id_raw = getattr(row, "actor_user_id", None)
        actor_id = int(actor_id_raw) if actor_id_raw is not None else None
        items.append(
            {
                "id": int(getattr(row, "id", 0) or 0),
                "club_id": int(getattr(row, "club_id", 0) or 0) if getattr(row, "club_id", None) is not None else None,
                "actor_user_id": actor_id,
                "actor_name": actor_names.get(actor_id or 0) if actor_id is not None else None,
                "action": str(getattr(row, "action", "") or ""),
                "entity_type": str(getattr(row, "entity_type", "") or ""),
                "entity_id": str(getattr(row, "entity_id", "") or "") or None,
                "request_id": str(getattr(row, "request_id", "") or "") or None,
                "payload_json": str(getattr(row, "payload_json", "") or "") or None,
                "created_at": getattr(row, "created_at", None).isoformat() if getattr(row, "created_at", None) else None,
            }
        )

    return {"total": int(total or 0), "items": items}


@router.get("/summary")
async def get_admin_summary(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Get comprehensive summary for admin"""
    
    # Basic stats
    total_players = db.query(func.count(User.id)).filter(User.role == UserRole.player).scalar() or 0
    total_bookings = db.query(func.count(Booking.id)).scalar() or 0
    total_revenue = (
        db.query(func.sum(LedgerEntry.amount))
        .filter(LedgerEntry.booking_id.isnot(None))
        .scalar()
        or 0.0
    )
    completed_rounds = db.query(func.count(Round.id)).filter(Round.closed == 1).scalar() or 0
    
    # This month
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_bookings = db.query(func.count(Booking.id)).filter(Booking.created_at >= month_start).scalar() or 0
    month_revenue = (
        db.query(func.sum(LedgerEntry.amount))
        .filter(LedgerEntry.booking_id.isnot(None), LedgerEntry.created_at >= month_start)
        .scalar()
        or 0.0
    )
    
    # Top players by spending
    top_players = db.query(
        User.name,
        User.email,
        func.count(LedgerEntry.id).label("bookings"),
        func.sum(LedgerEntry.amount).label("total_spent")
    ).join(
        Booking, User.email == Booking.player_email
    ).join(
        LedgerEntry, LedgerEntry.booking_id == Booking.id
    ).group_by(
        User.email
    ).order_by(
        desc("total_spent")
    ).limit(10).all()
    
    # Recent bookings
    recent_bookings = db.query(Booking).order_by(desc(Booking.created_at)).limit(10).all()
    
    return {
        "total_players": total_players,
        "total_bookings": total_bookings,
        "total_revenue": float(total_revenue),
        "completed_rounds": completed_rounds,
        "this_month": {
            "bookings": month_bookings,
            "revenue": float(month_revenue)
        },
        "top_players": [
            {
                "name": tp[0],
                "email": tp[1],
                "bookings": tp[2],
                "total_spent": float(tp[3]) if tp[3] else 0.0
            }
            for tp in top_players
        ],
        "recent_bookings": [
            {
                "id": b.id,
                "player_name": b.player_name,
                "player_email": b.player_email,
                "price": float(b.price),
                "status": b.status,
                "created_at": b.created_at.isoformat()
            }
            for b in recent_bookings
        ]
    }


# ========================
# Price Management Models
# ========================

class PlayerPriceUpdate(BaseModel):
    """Update player's fee/price"""
    fee_category_id: Optional[int] = None  # Fee category to apply
    custom_price: Optional[float] = None   # Or set custom price directly


class PricingMatrixRowInput(BaseModel):
    code: Optional[int] = None
    description: str
    price: float
    fee_type: str
    active: bool = True
    audience: Optional[str] = None
    gender: Optional[str] = None
    day_kind: Optional[str] = None
    weekday: Optional[int] = None
    holes: Optional[int] = None
    min_age: Optional[int] = None
    max_age: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    start_time: Optional[Time] = None
    end_time: Optional[Time] = None
    priority: int = 0


class PricingTemplateApplyRequest(BaseModel):
    template: str = "umhlali"


def _fee_type_value(value: Any) -> str:
    return str(getattr(value, "value", value) or "").strip().lower()


def _serialize_fee_category(cat: FeeCategory) -> dict[str, Any]:
    return {
        "id": int(getattr(cat, "id", 0) or 0),
        "code": int(getattr(cat, "code", 0) or 0),
        "description": str(getattr(cat, "description", "") or "").strip(),
        "price": float(getattr(cat, "price", 0.0) or 0.0),
        "fee_type": _fee_type_value(getattr(cat, "fee_type", None)),
        "active": bool(int(getattr(cat, "active", 0) or 0)),
        "audience": getattr(cat, "audience", None),
        "gender": getattr(cat, "gender", None),
        "day_kind": getattr(cat, "day_kind", None),
        "weekday": getattr(cat, "weekday", None),
        "holes": getattr(cat, "holes", None),
        "min_age": getattr(cat, "min_age", None),
        "max_age": getattr(cat, "max_age", None),
        "start_date": cat.start_date.isoformat() if getattr(cat, "start_date", None) else None,
        "end_date": cat.end_date.isoformat() if getattr(cat, "end_date", None) else None,
        "start_time": getattr(cat, "start_time", None).strftime("%H:%M") if getattr(cat, "start_time", None) else None,
        "end_time": getattr(cat, "end_time", None).strftime("%H:%M") if getattr(cat, "end_time", None) else None,
        "priority": int(getattr(cat, "priority", 0) or 0),
    }


def _normalize_fee_filter_value(value: Any) -> str | None:
    raw = str(value or "").strip().lower()
    return raw or None


def _next_club_fee_code(db: Session, club_id: int) -> int:
    current = int(
        db.query(func.coalesce(func.max(FeeCategory.code), 1000))
        .filter(FeeCategory.club_id == int(club_id))
        .scalar()
        or 1000
    )
    return current + 1


def _resolve_fee_type(raw: str) -> FeeType:
    try:
        return FeeType(str(raw or "").strip().lower())
    except Exception:
        allowed = ", ".join(sorted({member.value for member in FeeType}))
        raise HTTPException(status_code=400, detail=f"Invalid fee_type. Expected one of: {allowed}")


def _upsert_pricing_matrix_row(
    db: Session,
    *,
    club_id: int,
    payload: PricingMatrixRowInput,
    existing: FeeCategory | None = None,
) -> FeeCategory:
    description = str(payload.description or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="description is required")
    if float(payload.price) < 0:
        raise HTTPException(status_code=400, detail="price cannot be negative")

    code = int(payload.code or getattr(existing, "code", 0) or 0)
    if code <= 0:
        code = _next_club_fee_code(db, club_id)

    if payload.holes not in {None, 9, 18}:
        raise HTTPException(status_code=400, detail="holes must be 9, 18, or empty")
    if payload.weekday is not None and int(payload.weekday) not in {0, 1, 2, 3, 4, 5, 6}:
        raise HTTPException(status_code=400, detail="weekday must be between 0 and 6")
    day_kind = _normalize_fee_filter_value(payload.day_kind)
    if day_kind not in {None, "weekday", "weekend"}:
        raise HTTPException(status_code=400, detail="day_kind must be weekday, weekend, or empty")
    if payload.start_date and payload.end_date and payload.start_date > payload.end_date:
        raise HTTPException(status_code=400, detail="start_date must be before or equal to end_date")
    if payload.min_age is not None and int(payload.min_age) < 0:
        raise HTTPException(status_code=400, detail="min_age cannot be negative")
    if payload.max_age is not None and int(payload.max_age) < 0:
        raise HTTPException(status_code=400, detail="max_age cannot be negative")
    if payload.min_age is not None and payload.max_age is not None and int(payload.min_age) > int(payload.max_age):
        raise HTTPException(status_code=400, detail="min_age must be less than or equal to max_age")

    duplicate_q = db.query(FeeCategory).filter(
        FeeCategory.club_id == int(club_id),
        FeeCategory.code == int(code),
    )
    if existing is not None and getattr(existing, "id", None):
        duplicate_q = duplicate_q.filter(FeeCategory.id != int(existing.id))
    if duplicate_q.first():
        raise HTTPException(status_code=409, detail=f"Fee code {code} already exists for this club")

    row = existing or FeeCategory(club_id=int(club_id))
    if existing is None:
        db.add(row)

    row.code = int(code)
    row.description = description
    row.price = float(payload.price)
    row.fee_type = _resolve_fee_type(payload.fee_type)
    row.active = 1 if payload.active else 0
    row.audience = _normalize_fee_filter_value(payload.audience)
    row.gender = _normalize_fee_filter_value(payload.gender)
    row.day_kind = day_kind
    row.weekday = int(payload.weekday) if payload.weekday is not None else None
    row.holes = int(payload.holes) if payload.holes is not None else None
    row.min_age = int(payload.min_age) if payload.min_age is not None else None
    row.max_age = int(payload.max_age) if payload.max_age is not None else None
    row.start_date = payload.start_date
    row.end_date = payload.end_date
    row.start_time = payload.start_time
    row.end_time = payload.end_time
    row.priority = int(payload.priority or 0)
    return row

# ========================
# Price Management Endpoints
# ========================

@router.get("/fee-categories")
async def get_fee_categories(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_staff)
):
    """Get all available fee categories for pricing players"""
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    q = db.query(FeeCategory).filter(FeeCategory.active == 1)
    if club_id > 0:
        q = q.filter(or_(FeeCategory.club_id == club_id, FeeCategory.club_id.is_(None)))

    categories = q.order_by(FeeCategory.fee_type.asc(), FeeCategory.code.asc()).all()
    return [_serialize_fee_category(cat) for cat in categories]


@router.get("/pricing-matrix")
async def get_pricing_matrix(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    rows = (
        db.query(FeeCategory)
        .filter(FeeCategory.club_id == club_id)
        .order_by(FeeCategory.fee_type.asc(), FeeCategory.code.asc(), FeeCategory.id.asc())
        .all()
    )
    return {
        "rows": [_serialize_fee_category(row) for row in rows],
        "club_id": club_id,
        "reference_templates": ["umhlali"],
    }


@router.post("/pricing-matrix")
async def create_pricing_matrix_row(
    payload: PricingMatrixRowInput,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    row = _upsert_pricing_matrix_row(db, club_id=club_id, payload=payload, existing=None)
    db.commit()
    db.refresh(row)
    invalidate_club_config_cache(int(club_id))
    _invalidate_admin_caches(int(club_id))
    return {"status": "success", "row": _serialize_fee_category(row)}


@router.put("/pricing-matrix/{fee_id}")
async def update_pricing_matrix_row(
    fee_id: int,
    payload: PricingMatrixRowInput,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    row = db.query(FeeCategory).filter(FeeCategory.id == int(fee_id), FeeCategory.club_id == club_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Pricing row not found")
    _upsert_pricing_matrix_row(db, club_id=club_id, payload=payload, existing=row)
    db.commit()
    db.refresh(row)
    invalidate_club_config_cache(int(club_id))
    _invalidate_admin_caches(int(club_id))
    return {"status": "success", "row": _serialize_fee_category(row)}


@router.delete("/pricing-matrix/{fee_id}")
async def delete_pricing_matrix_row(
    fee_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    row = db.query(FeeCategory).filter(FeeCategory.id == int(fee_id), FeeCategory.club_id == club_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Pricing row not found")

    booking_exists = db.query(Booking.id).filter(Booking.fee_category_id == int(fee_id)).first() is not None
    action = "deleted"
    if booking_exists:
        row.active = 0
        action = "deactivated"
    else:
        db.delete(row)
    db.commit()
    invalidate_club_config_cache(int(club_id))
    _invalidate_admin_caches(int(club_id))
    return {"status": "success", "action": action, "fee_id": int(fee_id)}


@router.post("/pricing-matrix/apply-reference")
async def apply_pricing_matrix_reference(
    payload: PricingTemplateApplyRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    result = apply_reference_pricing_template(
        db,
        club_id=club_id,
        template_key=str(payload.template or "umhlali").strip().lower(),
        overwrite_existing=True,
    )
    db.commit()
    invalidate_club_config_cache(int(club_id))
    _invalidate_admin_caches(int(club_id))
    return {"status": "success", **result}


@router.put("/players/{player_id}/price")
async def update_player_price(
    player_id: int,
    price_update: PlayerPriceUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Legacy bulk override. Prefer the club pricing matrix for ongoing pricing changes."""

    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    
    player = db.query(User).filter(User.id == player_id, User.role == UserRole.player).first()
    
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    # Validate input
    if price_update.fee_category_id is None and price_update.custom_price is None:
        raise HTTPException(status_code=400, detail="Either fee_category_id or custom_price must be provided")
    
    # Update based on input
    if price_update.fee_category_id:
        fee_q = db.query(FeeCategory).filter(FeeCategory.id == price_update.fee_category_id)
        if club_id > 0:
            fee_q = fee_q.filter(or_(FeeCategory.club_id == club_id, FeeCategory.club_id.is_(None)))
        fee_category = fee_q.first()
        if not fee_category:
            raise HTTPException(status_code=404, detail="Fee category not found")
        
        # Get all bookings for this player and update their fee_category_id
        bookings = db.query(Booking).filter(
            Booking.player_email == player.email,
            Booking.status.in_([BookingStatus.booked, BookingStatus.checked_in])
        ).all()
        
        for booking in bookings:
            booking.fee_category_id = fee_category.id
            booking.price = fee_category.price
            if booking.status in {BookingStatus.checked_in, BookingStatus.completed}:
                crud.ensure_paid_ledger_entry(db, booking)
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Updated {len(bookings)} bookings with fee category: {fee_category.description}",
            "player_id": player_id,
            "fee_category": {
                "id": fee_category.id,
                "code": fee_category.code,
                "description": fee_category.description,
                "price": float(fee_category.price)
            }
        }
    
    elif price_update.custom_price is not None:
        if price_update.custom_price < 0:
            raise HTTPException(status_code=400, detail="Price cannot be negative")
        
        # Update all active bookings for this player with custom price
        bookings = db.query(Booking).filter(
            Booking.player_email == player.email,
            Booking.status.in_([BookingStatus.booked, BookingStatus.checked_in])
        ).all()
        
        for booking in bookings:
            booking.price = price_update.custom_price
            booking.fee_category_id = None  # Clear fee category when using custom price
            if booking.status in {BookingStatus.checked_in, BookingStatus.completed}:
                crud.ensure_paid_ledger_entry(db, booking)
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"Updated {len(bookings)} bookings with custom price: R{price_update.custom_price:.2f}",
            "player_id": player_id,
            "custom_price": price_update.custom_price
        }


@router.get("/players/{player_id}/price-info")
async def get_player_price_info(
    player_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """Legacy pricing summary kept for compatibility with older tooling."""

    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    
    player = db.query(User).filter(User.id == player_id, User.role == UserRole.player).first()
    
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    # Get recent bookings to see current pricing
    recent_bookings = db.query(Booking).filter(
        Booking.player_email == player.email
    ).order_by(desc(Booking.created_at)).limit(5).all()
    
    # Get current pricing info from most recent booking
    current_price = None
    current_fee_category = None
    
    if recent_bookings:
        latest = recent_bookings[0]
        current_price = latest.price
        
        if latest.fee_category_id:
            fee_q = db.query(FeeCategory).filter(FeeCategory.id == latest.fee_category_id)
            if club_id > 0:
                fee_q = fee_q.filter(or_(FeeCategory.club_id == club_id, FeeCategory.club_id.is_(None)))
            fee_cat = fee_q.first()
            if fee_cat:
                current_fee_category = {
                    "id": fee_cat.id,
                    "code": fee_cat.code,
                    "description": fee_cat.description,
                    "price": float(fee_cat.price)
                }
    
    return {
        "player_id": player_id,
        "player_name": player.name,
        "player_email": player.email,
        "current_price": current_price,
        "current_fee_category": current_fee_category,
        "recent_bookings": [
            {
                "id": b.id,
                "price": float(b.price),
                "status": b.status,
                "created_at": b.created_at.isoformat()
            }
            for b in recent_bookings
        ]
    }


@router.put("/bookings/{booking_id}/price")
async def update_booking_price(
    booking_id: int,
    price_update: PlayerPriceUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    """One-off booking override. Prefer canonical pricing where possible."""

    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.tee_time:
        assert_day_open(db, booking.tee_time.tee_time.date())
    
    # Validate input
    if price_update.fee_category_id is None and price_update.custom_price is None:
        raise HTTPException(status_code=400, detail="Either fee_category_id or custom_price must be provided")
    
    # Update based on input
    if price_update.fee_category_id:
        fee_q = db.query(FeeCategory).filter(FeeCategory.id == price_update.fee_category_id)
        if club_id > 0:
            fee_q = fee_q.filter(or_(FeeCategory.club_id == club_id, FeeCategory.club_id.is_(None)))
        fee_category = fee_q.first()
        if not fee_category:
            raise HTTPException(status_code=404, detail="Fee category not found")
        
        booking.fee_category_id = fee_category.id
        booking.price = fee_category.price
        if booking.status in {BookingStatus.checked_in, BookingStatus.completed}:
            crud.ensure_paid_ledger_entry(db, booking)
        
        db.commit()
        db.refresh(booking)
        
        return {
            "status": "success",
            "message": f"Booking #{booking.id} price updated to {fee_category.description}",
            "booking_id": booking_id,
            "new_price": float(booking.price),
            "fee_category": {
                "id": fee_category.id,
                "code": fee_category.code,
                "description": fee_category.description,
                "price": float(fee_category.price)
            }
        }
    
    elif price_update.custom_price is not None:
        if price_update.custom_price < 0:
            raise HTTPException(status_code=400, detail="Price cannot be negative")
        
        booking.price = price_update.custom_price
        booking.fee_category_id = None  # Clear fee category when using custom price
        if booking.status in {BookingStatus.checked_in, BookingStatus.completed}:
            crud.ensure_paid_ledger_entry(db, booking)
        
        db.commit()
        db.refresh(booking)
        
        return {
            "status": "success",
            "message": f"Booking #{booking.id} price updated to R{price_update.custom_price:.2f}",
            "booking_id": booking_id,
            "new_price": float(booking.price)
        }
