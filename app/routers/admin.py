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
    ClubCommunication,
    GolfDayBooking,
)
from app.fee_models import FeeCategory
from app.auth import get_current_user, get_db
from app.observability import log_event
from app.people import (
    classify_membership_group,
    normalize_primary_operation,
    normalize_membership_status,
    sync_member_person,
)
from app.services.account_customers_service import (
    AccountCustomerUpsertPayload,
    create_account_customer_payload,
    list_account_customers_payload,
    resolve_account_customer,
    update_account_customer_payload,
)
from app.services.audit_logs_service import get_audit_logs_payload
from app.services.admin_targets_service import (
    update_target_assumptions_command,
    upsert_kpi_target_command,
    upsert_operational_target_settings_command,
)
from app.services.club_communications_service import (
    ClubCommunicationInput,
    create_club_communication as create_club_communication_record,
    list_club_communications_payload,
    update_club_communication as update_club_communication_record,
)
from app.services.club_settings_service import (
    BookingWindowSettings,
    ClubProfileSettings,
    get_booking_window_settings_payload,
    get_club_profile_settings_payload,
    update_booking_window_settings_payload,
    update_club_profile_settings_payload,
)
from app.services.club_staff_service import (
    StaffUpsertPayload,
    create_staff_user_for_club_payload,
    get_staff_role_context_payload,
    list_staff_users_payload,
    update_staff_user_for_club_payload,
)
from app.services.club_members_service import (
    MemberUpsertPayload,
    create_member_payload,
    get_member_detail_payload,
    list_members_payload,
    search_members_payload,
    update_member_payload,
)
from app.services.club_people_lookup_service import (
    get_player_detail_payload,
    list_guests_payload,
    list_players_payload,
)
from app.services.golf_day_bookings_service import (
    GolfDayBookingUpsertPayload,
    create_golf_day_booking_payload,
    list_golf_day_bookings_payload,
    update_golf_day_booking_payload,
)
from app.services.pro_shop_service import (
    ProShopProductUpdatePayload,
    ProShopProductUpsertPayload,
    ProShopSaleCreatePayload,
    ProShopStockAdjustPayload,
    adjust_pro_shop_stock_payload,
    create_pro_shop_product_payload,
    create_pro_shop_sale_payload,
    list_pro_shop_products_payload,
    list_pro_shop_sales_payload,
    update_pro_shop_product_payload,
)
from app.services.pricing_matrix_service import (
    PricingMatrixRowInput,
    PricingTemplateApplyRequest,
    apply_pricing_matrix_reference_payload,
    create_pricing_matrix_row_payload,
    delete_pricing_matrix_row_payload,
    get_fee_categories_payload,
    get_pricing_matrix_payload,
    update_pricing_matrix_row_payload,
)
from app.services.operational_targets_service import (
    OperationalTargetUpsertPayload,
    get_operational_target_settings_payload,
)
from app.services.kpi_targets_service import (
    KpiTargetUpsertPayload,
    TargetAssumptionsPayload,
    get_target_settings_payload,
)
from app.services.finance_reporting_service import (
    clear_admin_finance_reporting_caches,
    days_in_year as _days_in_year,
    derive_target as _derive_target,
    get_ledger_entries_payload,
    get_revenue_analytics_payload,
    native_pro_shop_revenue_clause as _native_pro_shop_revenue_clause,
    normalize_revenue_stream as _normalize_revenue_stream,
    period_window as _period_window,
    pro_shop_revenue_source_clause as _pro_shop_revenue_source_clause,
)
from app.services.finance_semantics_service import (
    build_booking_finance_state,
    build_finance_semantics_metadata,
    build_ledger_entry_finance_state,
    collect_booking_ledger_snapshot,
    get_export_mapping_status,
)
from app.services.operational_alerts_service import (
    clear_admin_operational_alerts_cache,
    get_operational_alerts_payload,
)
from app.services.dashboard_metrics_service import (
    clear_admin_dashboard_metrics_cache,
    get_dashboard_stats_payload,
)
from app.services.bookings_service import (
    clear_booking_ledger_entries,
    get_booking_or_404,
    normalize_booking_ids,
    set_booking_payment_method_meta,
)
from app.services.booking_pricing_service import repair_bookings_pricing
from app.services.payment_methods import (
    normalize_booking_payment_method,
)
from calendar import isleap
from app.club_config import invalidate_club_config_cache
from app.club_ops import (
    assert_club_module_enabled,
)
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

def _request_id(request: Request | None) -> str | None:
    if request is None:
        return None
    return str(getattr(getattr(request, "state", None), "request_id", "") or "").strip() or None


def _invalidate_admin_caches(club_id: int | None = None) -> None:
    if club_id is not None and int(club_id) > 0:
        clear_admin_dashboard_metrics_cache()
        clear_admin_operational_alerts_cache()
        clear_admin_finance_reporting_caches()
        log_event("info", "admin.cache_invalidated", cache="dashboard+alerts", club_id=int(club_id))
        return
    clear_admin_dashboard_metrics_cache()
    clear_admin_operational_alerts_cache()
    clear_admin_finance_reporting_caches()
    log_event("info", "admin.cache_invalidated", cache="dashboard+alerts", club_id=None)


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
    max_rows: int | None = None,
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
            .order_by(desc(TeeTime.tee_time), desc(Booking.id))
        )
        if end_dt_exclusive is not None:
            query = query.filter(TeeTime.tee_time < end_dt_exclusive)
        if max_rows is not None and int(max_rows) > 0:
            query = query.limit(int(max_rows))
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
    if current_user.role not in {UserRole.admin, UserRole.super_admin}:
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


def _int_setting(db: Session, key: str, default: int) -> int:
    try:
        return int(_float_setting(db, key, float(default)))
    except Exception:
        return int(default)


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




@router.get("/booking-window", response_model=BookingWindowSettings)
def get_booking_window_settings(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
    club_id: int = Depends(get_active_club_id),
):
    return get_booking_window_settings_payload(db, int(club_id))


@router.put("/booking-window", response_model=BookingWindowSettings)
def update_booking_window_settings(
    payload: BookingWindowSettings,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
    club_id: int = Depends(get_active_club_id),
):
    return update_booking_window_settings_payload(db, int(club_id), payload)


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


@router.get("/club-profile")
def get_club_profile_settings(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
    club_id: int = Depends(get_active_club_id),
):
    return get_club_profile_settings_payload(db, int(club_id))


@router.put("/club-profile")
def update_club_profile_settings(
    payload: ClubProfileSettings,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
    club_id: int = Depends(get_active_club_id),
):
    try:
        return update_club_profile_settings_payload(
            db,
            int(club_id),
            payload,
            invalidate_admin_caches=_invalidate_admin_caches,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/communications")
def list_club_communications(
    kind: str = Query("all"),
    audience: str = Query("all"),
    status: str = Query("all"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    return list_club_communications_payload(
        db,
        club_id=int(club_id),
        kind=kind,
        audience=audience,
        status=status,
        limit=int(limit),
    )


@router.post("/communications")
def create_club_communication(
    payload: ClubCommunicationInput,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
    club_id: int = Depends(get_active_club_id),
):
    return create_club_communication_record(
        db,
        club_id=int(club_id),
        admin_user_id=int(getattr(admin, "id", 0) or 0) or None,
        payload=payload,
    )


@router.put("/communications/{communication_id}")
def update_club_communication(
    communication_id: int,
    payload: ClubCommunicationInput,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
    club_id: int = Depends(get_active_club_id),
):
    return update_club_communication_record(
        db,
        club_id=int(club_id),
        communication_id=int(communication_id),
        payload=payload,
    )

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
    view: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    return get_dashboard_stats_payload(
        db,
        club_id=int(club_id),
        view=view,
    )


@router.get("/operational-alerts")
async def get_operational_alerts(
    lookahead_days: int = Query(7, ge=1, le=14),
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    return get_operational_alerts_payload(
        db,
        club_id=int(club_id),
        lookahead_days=int(lookahead_days),
    )

@router.get("/targets")
async def get_target_settings(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    return get_target_settings_payload(db, year=int(year or datetime.utcnow().year))


@router.put("/targets")
async def upsert_kpi_target(
    payload: KpiTargetUpsertPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    return upsert_kpi_target_command(
        db,
        club_id=int(getattr(db, "info", {}).get("club_id") or 0),
        payload=payload,
        audit_event=lambda **kwargs: _audit_event(db, request, admin, **kwargs),
        invalidate_admin_caches=_invalidate_admin_caches,
    )


@router.put("/targets/assumptions")
async def update_target_assumptions(
    payload: TargetAssumptionsPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    return update_target_assumptions_command(
        db,
        club_id=int(getattr(db, "info", {}).get("club_id") or 0) or None,
        payload=payload,
        audit_event=lambda **kwargs: _audit_event(db, request, admin, **kwargs),
        invalidate_admin_caches=_invalidate_admin_caches,
    )


@router.get("/operation-targets")
async def get_operational_target_settings(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    return get_operational_target_settings_payload(
        db,
        club_id=int(getattr(db, "info", {}).get("club_id") or 0),
        year=int(year or datetime.utcnow().year),
    )


@router.put("/operation-targets")
async def upsert_operational_target_settings(
    payload: OperationalTargetUpsertPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    return upsert_operational_target_settings_command(
        db,
        club_id=int(getattr(db, "info", {}).get("club_id") or 0),
        payload=payload,
        audit_event=lambda **kwargs: _audit_event(db, request, admin, **kwargs),
        invalidate_admin_caches=_invalidate_admin_caches,
    )


@router.get("/bookings")
async def get_all_bookings(
    skip: int = 0,
    limit: int = 50,
    status: str = None,
    integrity: Optional[str] = None,
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

    integrity_mode = str(integrity or "").strip().lower()
    if integrity_mode not in {"", "missing_paid_ledger"}:
        raise HTTPException(status_code=400, detail="Invalid integrity filter")

    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]
    ledger_counts_sq = (
        db.query(
            LedgerEntry.booking_id.label("booking_id"),
            func.count(LedgerEntry.id).label("payment_count"),
        )
        .filter(
            LedgerEntry.club_id == club_id,
            LedgerEntry.booking_id.isnot(None),
        )
        .group_by(LedgerEntry.booking_id)
        .subquery()
    )

    query = (
        db.query(Booking)
        .options(selectinload(Booking.tee_time), selectinload(Booking.round))
        .outerjoin(TeeTime, Booking.tee_time_id == TeeTime.id)
    )

    if integrity_mode == "missing_paid_ledger":
        query = (
            query.outerjoin(ledger_counts_sq, ledger_counts_sq.c.booking_id == Booking.id)
            .filter(
                Booking.status.in_(paid_statuses),
                func.coalesce(ledger_counts_sq.c.payment_count, 0) == 0,
            )
        )
    elif status:
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

    ledger_entry_counts: dict[int, int] = {}
    ledger_exported_counts: dict[int, int] = {}
    booking_payment_methods: dict[int, str | None] = {}
    booking_ids = [int(getattr(b, "id", 0) or 0) for b in bookings if getattr(b, "id", None)]
    if booking_ids:
        ledger_snapshot = collect_booking_ledger_snapshot(db, booking_ids)
        ledger_entry_counts = {
            int(booking_id): int((snapshot or {}).get("ledger_entry_count") or 0)
            for booking_id, snapshot in ledger_snapshot.items()
        }
        ledger_exported_counts = {
            int(booking_id): int((snapshot or {}).get("exported_entry_count") or 0)
            for booking_id, snapshot in ledger_snapshot.items()
        }
        booking_payment_methods = {
            int(booking_id): (str((snapshot or {}).get("payment_method") or "").strip().upper() or None)
            for booking_id, snapshot in ledger_snapshot.items()
        }
    mapping_status = get_export_mapping_status(db, club_id=int(club_id))

    return {
        "total": total,
        "integrity_filter": integrity_mode or None,
        "finance_semantics": build_finance_semantics_metadata(mapping_status),
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
                "ledger_entry_count": int(ledger_entry_counts.get(int(getattr(b, "id", 0) or 0), 0)),
                "payment_method": booking_payment_methods.get(int(getattr(b, "id", 0) or 0)),
                "finance_state": build_booking_finance_state(
                    booking_status=getattr(b, "status", None),
                    ledger_entry_count=int(ledger_entry_counts.get(int(getattr(b, "id", 0) or 0), 0)),
                    exported_entry_count=int(ledger_exported_counts.get(int(getattr(b, "id", 0) or 0), 0)),
                    payment_method=booking_payment_methods.get(int(getattr(b, "id", 0) or 0)),
                    mapping_status=mapping_status,
                ),
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
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    mapping_status = get_export_mapping_status(
        db,
        club_id=int(club_id),
    ) if club_id > 0 else {"configured": False, "layout_configured": False, "mappings_configured": False}
    payment_method = next(
        (
            str(getattr(meta_by_entry_id.get(int(le.id)), "payment_method", "") or "").strip().upper()
            for le in sorted(ledger_entries, key=lambda row: int(getattr(row, "id", 0) or 0), reverse=True)
            if str(getattr(meta_by_entry_id.get(int(le.id)), "payment_method", "") or "").strip()
        ),
        None,
    ) or None
    exported_entry_count = sum(1 for le in ledger_entries if bool(getattr(le, "pastel_synced", False)))

    fee_category = None
    if booking.fee_category_id:
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
        "payment_method": payment_method,
        "finance_semantics": build_finance_semantics_metadata(mapping_status),
        "finance_state": build_booking_finance_state(
            booking_status=getattr(booking, "status", None),
            ledger_entry_count=len(ledger_entries),
            exported_entry_count=exported_entry_count,
            payment_method=payment_method,
            mapping_status=mapping_status,
        ),
        "round": round_info,
        "ledger_entries": [
            {
                "id": le.id,
                "description": le.description,
                "amount": float(le.amount),
                "pastel_synced": bool(le.pastel_synced),
                "payment_method": str(getattr(meta_by_entry_id.get(le.id), "payment_method", "") or "").strip().upper() or None,
                "finance_state": build_ledger_entry_finance_state(
                    pastel_synced=bool(le.pastel_synced),
                    payment_method=str(getattr(meta_by_entry_id.get(le.id), "payment_method", "") or "").strip().upper() or None,
                    mapping_status=mapping_status,
                ),
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
    admin: User = Depends(verify_admin),
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
    existing_ledger_rows = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.booking_id.in_(booking_ids))
        .order_by(LedgerEntry.id)
        .all()
    )
    latest_ledger_by_booking_id: dict[int, LedgerEntry] = {}
    for row in existing_ledger_rows:
        booking_id = int(getattr(row, "booking_id", 0) or 0)
        if booking_id > 0:
            latest_ledger_by_booking_id[booking_id] = row
    existing_ledger_ids = [
        int(getattr(row, "id", 0) or 0)
        for row in latest_ledger_by_booking_id.values()
        if int(getattr(row, "id", 0) or 0) > 0
    ]

    for booking in ordered_bookings:
        if booking.tee_time and booking.tee_time.tee_time:
            assert_day_open(db, booking.tee_time.tee_time.date())
        if requested_status == BookingStatus.cancelled:
            _enforce_group_cancel_window(db, booking, admin)

    updated_ids: list[int] = []
    ledger_updated = 0
    account_updated = 0

    if requested_status in paid_statuses:
        for booking in ordered_bookings:
            booking.status = requested_status
        crud.ensure_paid_ledger_entries(
            db,
            ordered_bookings,
            payment_method=payment_method or None,
        )
        ledger_updated = len(ordered_bookings)
    elif requested_status is not None:
        for booking in ordered_bookings:
            booking.status = requested_status
        if existing_ledger_ids:
            db.query(LedgerEntryMeta).filter(
                LedgerEntryMeta.ledger_entry_id.in_(existing_ledger_ids)
            ).delete(synchronize_session=False)
        if booking_ids:
            db.query(LedgerEntry).filter(
                LedgerEntry.booking_id.in_(booking_ids)
            ).delete(synchronize_session=False)
    elif payment_method:
        paid_bookings = [
            booking for booking in ordered_bookings
            if str(getattr(getattr(booking, "status", None), "value", booking.status) or "").strip().lower()
            in {"checked_in", "completed"}
        ]
        if paid_bookings:
            crud.ensure_paid_ledger_entries(
                db,
                paid_bookings,
                payment_method=payment_method,
            )
            ledger_updated += len(paid_bookings)

        meta_rows = (
            db.query(LedgerEntryMeta)
            .filter(LedgerEntryMeta.ledger_entry_id.in_(existing_ledger_ids))
            .all()
            if existing_ledger_ids else []
        )
        meta_by_ledger_id = {
            int(getattr(meta, "ledger_entry_id", 0) or 0): meta
            for meta in meta_rows
            if int(getattr(meta, "ledger_entry_id", 0) or 0) > 0
        }
        paid_booking_ids = {
            int(getattr(booking, "id", 0) or 0)
            for booking in paid_bookings
            if int(getattr(booking, "id", 0) or 0) > 0
        }
        for booking in ordered_bookings:
            booking_id = int(getattr(booking, "id", 0) or 0)
            if booking_id <= 0 or booking_id in paid_booking_ids:
                continue
            ledger_entry = latest_ledger_by_booking_id.get(booking_id)
            if ledger_entry is None or not getattr(ledger_entry, "id", None):
                continue
            ledger_entry_id = int(ledger_entry.id)
            meta = meta_by_ledger_id.get(ledger_entry_id)
            if meta is not None:
                meta.payment_method = payment_method
                meta.updated_at = datetime.utcnow()
            else:
                meta = LedgerEntryMeta(
                    ledger_entry_id=ledger_entry_id,
                    payment_method=payment_method,
                )
                db.add(meta)
                meta_by_ledger_id[ledger_entry_id] = meta
            ledger_updated += 1

    for booking in ordered_bookings:
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
        admin,
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


@router.get("/account-customers")
async def get_account_customers(
    q: Optional[str] = None,
    active_only: bool = False,
    sort: Optional[str] = "name_asc",
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    return list_account_customers_payload(
        db,
        q=q,
        active_only=bool(active_only),
        sort=sort,
    )


@router.post("/account-customers")
async def create_account_customer(
    payload: AccountCustomerUpsertPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    return create_account_customer_payload(
        db,
        club_id=int(getattr(db, "info", {}).get("club_id") or 0),
        payload=payload,
        audit_event=lambda **kwargs: _audit_event(db, request, admin, **kwargs),
    )


@router.put("/account-customers/{account_customer_id}")
async def update_account_customer(
    account_customer_id: int,
    payload: AccountCustomerUpsertPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    return update_account_customer_payload(
        db,
        account_customer_id=int(account_customer_id),
        payload=payload,
        audit_event=lambda **kwargs: _audit_event(db, request, admin, **kwargs),
    )


@router.get("/golf-day-bookings")
async def get_golf_day_bookings(
    q: Optional[str] = None,
    status: Optional[str] = "all",
    sort: Optional[str] = "date_asc",
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    return list_golf_day_bookings_payload(
        db,
        club_id=int(club_id),
        q=q,
        status=status,
        sort=sort,
    )


@router.post("/golf-day-bookings")
async def create_golf_day_booking(
    payload: GolfDayBookingUpsertPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    return create_golf_day_booking_payload(
        db,
        club_id=int(getattr(db, "info", {}).get("club_id") or 0),
        payload=payload,
        audit_event=lambda **kwargs: _audit_event(db, request, admin, **kwargs),
    )


@router.put("/golf-day-bookings/{golf_day_booking_id}")
async def update_golf_day_booking(
    golf_day_booking_id: int,
    payload: GolfDayBookingUpsertPayload,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    return update_golf_day_booking_payload(
        db,
        golf_day_booking_id=int(golf_day_booking_id),
        payload=payload,
        audit_event=lambda **kwargs: _audit_event(db, request, admin, **kwargs),
    )


@router.get("/staff-role-context")
async def get_staff_role_context(
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    return get_staff_role_context_payload(
        db,
        club_id=int(getattr(db, "info", {}).get("club_id") or 0),
        staff_user=staff,
    )


@router.get("/players")
async def get_all_players(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff)
):
    """Get all registered players"""
    return list_players_payload(
        db,
        skip=int(skip),
        limit=int(limit),
        q=q,
    )


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
    return list_members_payload(
        db,
        skip=int(skip),
        limit=int(limit),
        q=q,
        sort=sort,
        area=area,
        membership_status=membership_status,
    )


@router.post("/members")
async def create_member(
    payload: MemberUpsertPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    return create_member_payload(
        db,
        club_id=int(getattr(db, "info", {}).get("club_id") or 0),
        payload=payload,
        admin_user_id=int(getattr(admin, "id", 0) or 0) or None,
    )


@router.put("/members/{member_id}")
async def update_member(
    member_id: int,
    payload: MemberUpsertPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    return update_member_payload(
        db,
        member_id=int(member_id),
        payload=payload,
        admin_user_id=int(getattr(admin, "id", 0) or 0) or None,
    )


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
    return get_member_detail_payload(db, member_id=int(member_id))


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
    return list_guests_payload(
        db,
        skip=int(skip),
        limit=int(limit),
        q=q,
        guest_type=guest_type,
        sort=sort,
    )


@router.get("/players/{player_id}")
async def get_player_detail(
    player_id: int,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff)
):
    """Get detailed player information with booking history"""
    return get_player_detail_payload(db, player_id=int(player_id))

@router.get("/members/search")
async def search_members(
    q: str,
    limit: int = 10,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
):
    """Search members for quick booking (pro shop)."""
    return search_members_payload(db, q=q, limit=int(limit))


@router.get("/staff")
async def get_staff_users(
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    sort: Optional[str] = "name_asc",
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")
    return list_staff_users_payload(
        db,
        club_id=club_id,
        skip=int(skip),
        limit=int(limit),
        q=q,
        sort=sort,
    )


@router.post("/staff")
async def create_staff_user_for_club(
    payload: StaffUpsertPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    if club_id <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")
    return create_staff_user_for_club_payload(db, club_id=club_id, payload=payload)


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
    return update_staff_user_for_club_payload(
        db,
        club_id=club_id,
        user_id=int(user_id),
        payload=payload,
    )


@router.get("/pro-shop/products")
async def list_pro_shop_products(
    q: Optional[str] = None,
    active_only: bool = False,
    limit: int = 250,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    return list_pro_shop_products_payload(
        db,
        club_id=int(club_id),
        q=q,
        active_only=bool(active_only),
        limit=int(limit),
    )


@router.post("/pro-shop/products")
async def create_pro_shop_product(
    payload: ProShopProductUpsertPayload,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    return create_pro_shop_product_payload(
        db,
        club_id=int(club_id),
        payload=payload,
    )


@router.put("/pro-shop/products/{product_id}")
async def update_pro_shop_product(
    product_id: int,
    payload: ProShopProductUpdatePayload,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    return update_pro_shop_product_payload(
        db,
        club_id=int(club_id),
        product_id=int(product_id),
        payload=payload,
    )


@router.post("/pro-shop/products/{product_id}/adjust-stock")
async def adjust_pro_shop_stock(
    product_id: int,
    payload: ProShopStockAdjustPayload,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    return adjust_pro_shop_stock_payload(
        db,
        club_id=int(club_id),
        product_id=int(product_id),
        payload=payload,
    )


@router.get("/pro-shop/sales")
async def list_pro_shop_sales(
    limit: int = 25,
    days: int = 30,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    return list_pro_shop_sales_payload(
        db,
        club_id=int(club_id),
        limit=int(limit),
        days=int(days),
    )


@router.post("/pro-shop/sales")
async def create_pro_shop_sale(
    payload: ProShopSaleCreatePayload,
    request: Request,
    db: Session = Depends(get_db),
    staff: User = Depends(verify_staff),
    club_id: int = Depends(get_active_club_id),
):
    return create_pro_shop_sale_payload(
        db,
        club_id=int(club_id),
        staff_user_id=int(staff.id),
        payload=payload,
        audit_event=lambda **kwargs: _audit_event(db, request, staff, **kwargs),
        invalidate_cache=_invalidate_admin_caches,
    )


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
    return get_revenue_analytics_payload(
        db,
        club_id=int(club_id),
        days=int(days),
        period=period,
        anchor_date=anchor_date,
    )


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
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    """Get all ledger entries (transaction history)"""
    return get_ledger_entries_payload(
        db,
        club_id=int(club_id),
        skip=int(skip),
        limit=int(limit),
        start=start,
        end=end,
        q=q,
        exported=exported,
    )


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
    return get_audit_logs_payload(
        db,
        skip=int(skip),
        limit=int(limit),
        action=action,
        entity_type=entity_type,
        actor_user_id=actor_user_id,
        start=start,
        end=end,
        q=q,
    )


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


# ========================
# Price Management Endpoints
# ========================

@router.get("/fee-categories")
async def get_fee_categories(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_staff)
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    return get_fee_categories_payload(db, club_id=club_id)


@router.get("/pricing-matrix")
async def get_pricing_matrix(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    return get_pricing_matrix_payload(db, club_id=club_id)


@router.post("/pricing-matrix")
async def create_pricing_matrix_row(
    payload: PricingMatrixRowInput,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    return create_pricing_matrix_row_payload(
        db,
        club_id=club_id,
        payload=payload,
        invalidate_club_config_cache=invalidate_club_config_cache,
        invalidate_admin_caches=_invalidate_admin_caches,
    )


@router.put("/pricing-matrix/{fee_id}")
async def update_pricing_matrix_row(
    fee_id: int,
    payload: PricingMatrixRowInput,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    return update_pricing_matrix_row_payload(
        db,
        club_id=club_id,
        fee_id=int(fee_id),
        payload=payload,
        invalidate_club_config_cache=invalidate_club_config_cache,
        invalidate_admin_caches=_invalidate_admin_caches,
    )


@router.delete("/pricing-matrix/{fee_id}")
async def delete_pricing_matrix_row(
    fee_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    return delete_pricing_matrix_row_payload(
        db,
        club_id=club_id,
        fee_id=int(fee_id),
        invalidate_club_config_cache=invalidate_club_config_cache,
        invalidate_admin_caches=_invalidate_admin_caches,
    )


@router.post("/pricing-matrix/apply-reference")
async def apply_pricing_matrix_reference(
    payload: PricingTemplateApplyRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_setup_admin),
):
    club_id = int(getattr(db, "info", {}).get("club_id") or 0)
    return apply_pricing_matrix_reference_payload(
        db,
        club_id=club_id,
        payload=payload,
        invalidate_club_config_cache=invalidate_club_config_cache,
        invalidate_admin_caches=_invalidate_admin_caches,
    )


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
