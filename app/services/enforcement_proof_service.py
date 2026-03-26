from __future__ import annotations

from typing import Any

from sqlalchemy import func, inspect, or_
from sqlalchemy.orm import Session

from app import models
from app.people import sync_member_person, sync_user_person
from app.services.identity_integrity_service import sync_booking_integrity
from app.services.player_profile_integrity_service import sync_player_profile_exceptions
from app.services.revenue_integrity_service import (
    sync_account_customer_integrity,
    sync_account_customer_linkage,
    sync_golf_day_booking_integrity,
    sync_pro_shop_sale_integrity,
)

_REQUIRED_COLUMNS = {
    "users": {"global_person_id"},
    "members": {"global_person_id", "person_id"},
    "bookings": {"global_person_id", "club_relationship_state_id"},
    "club_relationship_states": {"global_person_id", "booking_eligibility", "communication_eligibility", "revenue_linkage_state"},
    "operational_exceptions": {"exception_type", "blocking_surface", "state", "dedupe_key"},
    "task_timing_events": {"task_key", "duration_ms"},
}


def _coverage_map() -> dict[str, Any]:
    return {
        "covered": [
            "booking_create",
            "booking_import",
            "booking_admin_mutations",
            "tee_move_revalidation",
            "cashbook_close_blocking",
            "weather_targeted_notifications",
            "club_communications_publish",
            "golf_day_revenue_linkage",
            "account_customer_linkage_propagation",
            "pro_shop_account_sale_linkage",
            "player_profile_readiness",
        ],
        "partial": [
            "member_edit_surfaces_without_owned_repair_queue",
            "pro_shop_blockers_without_fast_fix_surface",
            "player_readiness_blockers_without_action_first_checklist",
        ],
        "bypass_paths": [
            "club_members_repair_queue_missing",
            "pro_shop_repair_surface_missing",
            "player_admin_readiness_surface_missing",
        ],
    }


def _schema_status(db: Session) -> dict[str, Any]:
    inspector = inspect(db.bind)
    table_names = set(inspector.get_table_names())
    required_tables = sorted(_REQUIRED_COLUMNS.keys())
    missing_tables = [table for table in required_tables if table not in table_names]
    missing_columns: list[dict[str, Any]] = []
    for table_name, required_columns in _REQUIRED_COLUMNS.items():
        if table_name not in table_names:
            continue
        present = {str(col.get("name")) for col in inspector.get_columns(table_name)}
        missing = sorted(required_columns - present)
        if missing:
            missing_columns.append({"table": table_name, "columns": missing})
    return {
        "ready": not missing_tables and not missing_columns,
        "missing_tables": missing_tables,
        "missing_columns": missing_columns,
    }


def _backfill_counts(db: Session, *, club_id: int) -> dict[str, int]:
    return {
        "users_missing_global_person": int(
            db.query(func.count(models.User.id))
            .filter(models.User.club_id == int(club_id), models.User.global_person_id.is_(None))
            .scalar()
            or 0
        ),
        "members_missing_person": int(
            db.query(func.count(models.Member.id))
            .filter(models.Member.club_id == int(club_id), models.Member.person_id.is_(None))
            .scalar()
            or 0
        ),
        "members_missing_global_person": int(
            db.query(func.count(models.Member.id))
            .filter(models.Member.club_id == int(club_id), models.Member.global_person_id.is_(None))
            .scalar()
            or 0
        ),
        "bookings_missing_identity_links": int(
            db.query(func.count(models.Booking.id))
            .filter(
                models.Booking.club_id == int(club_id),
                or_(
                    models.Booking.global_person_id.is_(None),
                    models.Booking.club_relationship_state_id.is_(None),
                ),
            )
            .scalar()
            or 0
        ),
        "open_identity_or_profile_exceptions": int(
            db.query(func.count(models.OperationalException.id))
            .filter(
                models.OperationalException.club_id == int(club_id),
                models.OperationalException.state.in_(["open", "acknowledged", "in_progress", "blocked"]),
                models.OperationalException.source_domain.in_(["identity", "profile"]),
            )
            .scalar()
            or 0
        ),
        "open_revenue_integrity_exceptions": int(
            db.query(func.count(models.OperationalException.id))
            .filter(
                models.OperationalException.club_id == int(club_id),
                models.OperationalException.state.in_(["open", "acknowledged", "in_progress", "blocked"]),
                models.OperationalException.blocking_surface == "revenue_integrity_close",
            )
            .scalar()
            or 0
        ),
    }


def build_enforcement_proof_payload(db: Session, *, club_id: int) -> dict[str, Any]:
    schema = _schema_status(db)
    backfill = _backfill_counts(db, club_id=int(club_id))
    ready = schema["ready"] and all(int(value or 0) == 0 for value in backfill.values())
    return {
        "club_id": int(club_id),
        "ready": bool(ready),
        "schema": schema,
        "backfill": backfill,
        "coverage_map": _coverage_map(),
    }


def run_enforcement_backfill(db: Session, *, club_id: int) -> dict[str, Any]:
    safe_club_id = int(club_id)
    before = _backfill_counts(db, club_id=safe_club_id)

    users = db.query(models.User).filter(models.User.club_id == safe_club_id).all()
    members = db.query(models.Member).filter(models.Member.club_id == safe_club_id).all()
    bookings = db.query(models.Booking).filter(models.Booking.club_id == safe_club_id).all()
    account_customers = db.query(models.AccountCustomer).filter(models.AccountCustomer.club_id == safe_club_id).all()
    golf_day_rows = db.query(models.GolfDayBooking).filter(models.GolfDayBooking.club_id == safe_club_id).all()
    pro_shop_sales = db.query(models.ProShopSale).filter(models.ProShopSale.club_id == safe_club_id).all()

    for user in users:
        sync_user_person(db, user, source_system="enforcement_backfill")
    for member in members:
        sync_member_person(db, member, source_system="enforcement_backfill")
    for booking in bookings:
        sync_booking_integrity(
            db,
            booking,
            source_system="enforcement_backfill",
            source_ref=f"booking:{int(getattr(booking, 'id', 0) or 0)}",
        )
    for account_customer in account_customers:
        sync_account_customer_integrity(db, account_customer, source_system="enforcement_backfill")
        sync_account_customer_linkage(
            db,
            club_id=safe_club_id,
            account_customer_id=int(getattr(account_customer, "id", 0) or 0),
            source_system="enforcement_backfill",
        )
    for golf_day_row in golf_day_rows:
        sync_golf_day_booking_integrity(
            db,
            golf_day_row,
            source_system="enforcement_backfill",
            source_ref=f"golf_day:{int(getattr(golf_day_row, 'id', 0) or 0)}",
        )
    for sale in pro_shop_sales:
        sync_pro_shop_sale_integrity(
            db,
            sale,
            source_system="enforcement_backfill",
            source_ref=f"pro_shop_sale:{int(getattr(sale, 'id', 0) or 0)}",
        )
    player_users = [user for user in users if str(getattr(getattr(user, "role", None), "value", getattr(user, "role", None)) or "") == "player"]
    member_by_global_person = {
        int(getattr(member, "global_person_id", 0) or 0): member
        for member in members
        if int(getattr(member, "global_person_id", 0) or 0) > 0
    }
    for user in player_users:
        sync_player_profile_exceptions(
            db,
            user,
            member=member_by_global_person.get(int(getattr(user, "global_person_id", 0) or 0)),
            source_system="enforcement_backfill",
        )
    db.commit()
    after = _backfill_counts(db, club_id=safe_club_id)
    return {
        "club_id": safe_club_id,
        "before": before,
        "after": after,
        "ready": all(int(value or 0) == 0 for value in after.values()),
    }
