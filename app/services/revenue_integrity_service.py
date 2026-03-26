from __future__ import annotations

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.services.identity_integrity_service import sync_booking_integrity
from app.services.operational_exceptions_service import resolve_operational_exception, upsert_operational_exception

_OPEN_BOOKING_STATUSES = {
    models.BookingStatus.booked,
    models.BookingStatus.checked_in,
    models.BookingStatus.completed,
}


def _active_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def _clean_text(value: Any, *, max_len: int = 255) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if len(text) > max_len:
        text = text[:max_len]
    return text


def _golf_day_requires_revenue_link(row: models.GolfDayBooking) -> bool:
    payment_status = str(getattr(row, "payment_status", "") or "").strip().lower()
    if payment_status == "cancelled":
        return False
    amount = float(getattr(row, "amount", 0.0) or 0.0)
    balance_due = float(getattr(row, "balance_due", 0.0) or 0.0)
    deposit_amount = float(getattr(row, "deposit_amount", 0.0) or 0.0)
    full_payment_amount = float(getattr(row, "full_payment_amount", 0.0) or 0.0)
    if amount > 0 or balance_due > 0 or deposit_amount > 0 or full_payment_amount > 0:
        return True
    return bool(
        _clean_text(getattr(row, "invoice_reference", None), max_len=80)
        or _clean_text(getattr(row, "account_code_snapshot", None), max_len=40)
    )


def sync_golf_day_booking_integrity(
    db: Session,
    row: models.GolfDayBooking,
    *,
    source_system: str,
    source_ref: str | None = None,
) -> None:
    if row is None:
        return
    club_id = _active_int(getattr(row, "club_id", 0))
    golf_day_id = _active_int(getattr(row, "id", 0))
    if club_id <= 0:
        return

    account_customer_id = _active_int(getattr(row, "account_customer_id", 0))
    customer = None
    if account_customer_id > 0:
        customer = (
            db.query(models.AccountCustomer)
            .filter(
                models.AccountCustomer.club_id == club_id,
                models.AccountCustomer.id == account_customer_id,
            )
            .first()
        )

    dedupe_suffix = f"golf_day:{golf_day_id or source_ref or _clean_text(getattr(row, 'event_name', None), max_len=40) or 'unknown'}"
    requires_link = _golf_day_requires_revenue_link(row)
    active_customer = customer is not None and _active_int(getattr(customer, "active", 0)) == 1
    account_code = _clean_text(getattr(customer, "account_code", None), max_len=40)
    trusted_link = bool(active_customer and account_code)

    if requires_link and not trusted_link:
        upsert_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"revenue_link_missing:{dedupe_suffix}",
            exception_type="revenue_link_missing",
            severity="high",
            blocking_surface="revenue_integrity_close",
            source_domain="golf_day",
            owner_role="admin",
            summary=f"Golf day revenue linkage is untrusted for event {golf_day_id or 'draft'}.",
            next_required_action="Link this golf day to an active account customer with a trusted account code before close.",
            linked_record_refs=[
                {"entity_type": "golf_day_booking", "entity_id": golf_day_id or None},
                {"entity_type": "account_customer", "entity_id": account_customer_id or None},
            ],
            details={
                "golf_day_booking_id": golf_day_id or None,
                "event_name": _clean_text(getattr(row, "event_name", None), max_len=220),
                "payment_status": _clean_text(getattr(row, "payment_status", None), max_len=30),
                "account_customer_id": account_customer_id or None,
                "account_code_snapshot": _clean_text(getattr(row, "account_code_snapshot", None), max_len=40),
                "invoice_reference": _clean_text(getattr(row, "invoice_reference", None), max_len=80),
                "source_system": _clean_text(source_system, max_len=80),
            },
            ai_suggestion={
                "suggested_action": "Review golf day revenue linkage",
                "why": "This golf day has settlement state without a trusted linked account customer.",
                "evidence": [golf_day_id or None, account_customer_id or None],
                "confidence": 0.94,
            },
        )
    else:
        resolve_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"revenue_link_missing:{dedupe_suffix}",
            state="resolved",
        )


def sync_account_customer_integrity(
    db: Session,
    row: models.AccountCustomer,
    *,
    source_system: str,
) -> None:
    if row is None:
        return
    club_id = _active_int(getattr(row, "club_id", 0))
    account_customer_id = _active_int(getattr(row, "id", 0))
    if club_id <= 0 or account_customer_id <= 0:
        return

    linked_booking_count = int(
        db.query(func.count(models.Booking.id))
        .filter(
            models.Booking.club_id == club_id,
            models.Booking.account_customer_id == account_customer_id,
            models.Booking.status.in_(list(_OPEN_BOOKING_STATUSES)),
        )
        .scalar()
        or 0
    )
    linked_golf_day_count = int(
        db.query(func.count(models.GolfDayBooking.id))
        .filter(
            models.GolfDayBooking.club_id == club_id,
            models.GolfDayBooking.account_customer_id == account_customer_id,
            func.coalesce(models.GolfDayBooking.payment_status, "pending") != "cancelled",
        )
        .scalar()
        or 0
    )
    linked_count = linked_booking_count + linked_golf_day_count
    active_customer = _active_int(getattr(row, "active", 0)) == 1
    account_code = _clean_text(getattr(row, "account_code", None), max_len=40)

    if linked_count > 0 and (not active_customer or not account_code):
        upsert_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"account_customer_conflict:account_customer:{account_customer_id}",
            exception_type="account_customer_conflict",
            severity="high",
            blocking_surface="revenue_integrity_close",
            source_domain="account_customer",
            owner_role="admin",
            summary=f"Account customer {account_customer_id} cannot support linked revenue safely.",
            next_required_action="Restore an active account code or relink affected bookings and golf days before close.",
            linked_record_refs=[
                {"entity_type": "account_customer", "entity_id": account_customer_id},
            ],
            details={
                "account_customer_id": account_customer_id,
                "name": _clean_text(getattr(row, "name", None), max_len=200),
                "active": active_customer,
                "account_code": account_code,
                "linked_booking_count": linked_booking_count,
                "linked_golf_day_count": linked_golf_day_count,
                "source_system": _clean_text(source_system, max_len=80),
            },
            ai_suggestion={
                "suggested_action": "Repair account customer linkage",
                "why": "Linked revenue depends on an active account customer with a trusted account code.",
                "evidence": [account_customer_id, linked_count],
                "confidence": 0.95,
            },
        )
    else:
        resolve_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"account_customer_conflict:account_customer:{account_customer_id}",
            state="resolved",
        )


def sync_account_customer_linkage(
    db: Session,
    *,
    club_id: int,
    account_customer_id: int,
    source_system: str,
) -> None:
    safe_club_id = _active_int(club_id)
    safe_account_customer_id = _active_int(account_customer_id)
    if safe_club_id <= 0 or safe_account_customer_id <= 0:
        return

    customer = (
        db.query(models.AccountCustomer)
        .filter(
            models.AccountCustomer.club_id == safe_club_id,
            models.AccountCustomer.id == safe_account_customer_id,
        )
        .first()
    )
    if customer is None:
        return

    sync_account_customer_integrity(db, customer, source_system=source_system)

    bookings = (
        db.query(models.Booking)
        .filter(
            models.Booking.club_id == safe_club_id,
            models.Booking.account_customer_id == safe_account_customer_id,
        )
        .all()
    )
    for booking in bookings:
        sync_booking_integrity(
            db,
            booking,
            source_system=source_system,
            source_ref=f"account_customer:{safe_account_customer_id}",
        )

    golf_day_rows = (
        db.query(models.GolfDayBooking)
        .filter(
            models.GolfDayBooking.club_id == safe_club_id,
            models.GolfDayBooking.account_customer_id == safe_account_customer_id,
        )
        .all()
    )
    for golf_day_row in golf_day_rows:
        sync_golf_day_booking_integrity(
            db,
            golf_day_row,
            source_system=source_system,
            source_ref=f"account_customer:{safe_account_customer_id}",
        )

    pro_shop_sales = (
        db.query(models.ProShopSale)
        .filter(
            models.ProShopSale.club_id == safe_club_id,
            func.lower(func.coalesce(models.ProShopSale.payment_method, "")) == "account",
            func.lower(func.coalesce(models.ProShopSale.customer_name, "")) == func.lower(getattr(customer, "name", "") or ""),
        )
        .all()
    )
    for sale in pro_shop_sales:
        sync_pro_shop_sale_integrity(
            db,
            sale,
            source_system=source_system,
            source_ref=f"account_customer:{safe_account_customer_id}",
        )


def sync_pro_shop_sale_integrity(
    db: Session,
    row: models.ProShopSale,
    *,
    source_system: str,
    source_ref: str | None = None,
) -> None:
    if row is None:
        return
    club_id = _active_int(getattr(row, "club_id", 0))
    sale_id = _active_int(getattr(row, "id", 0))
    if club_id <= 0:
        return

    payment_method = _clean_text(getattr(row, "payment_method", None), max_len=30)
    customer_name = _clean_text(getattr(row, "customer_name", None), max_len=200)
    dedupe_suffix = f"pro_shop_sale:{sale_id or source_ref or customer_name or 'unknown'}"
    if str(payment_method or "").lower() != "account":
        resolve_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"pro_shop_account_sale_unlinked:{dedupe_suffix}",
            state="resolved",
        )
        return

    matching_customers = []
    if customer_name:
        matching_customers = (
            db.query(models.AccountCustomer)
            .filter(
                models.AccountCustomer.club_id == club_id,
                models.AccountCustomer.active == 1,
                func.lower(models.AccountCustomer.name) == customer_name.lower(),
            )
            .all()
        )
    trusted_customer = matching_customers[0] if len(matching_customers) == 1 else None
    trusted_account_code = _clean_text(getattr(trusted_customer, "account_code", None), max_len=40)
    if trusted_customer is not None and trusted_account_code:
        resolve_operational_exception(
            db,
            club_id=club_id,
            dedupe_key=f"pro_shop_account_sale_unlinked:{dedupe_suffix}",
            state="resolved",
        )
        return

    upsert_operational_exception(
        db,
        club_id=club_id,
        dedupe_key=f"pro_shop_account_sale_unlinked:{dedupe_suffix}",
        exception_type="pro_shop_account_sale_unlinked",
        severity="high",
        blocking_surface="revenue_integrity_close",
        source_domain="pro_shop",
        owner_role="admin",
        summary=f"Pro shop account sale {sale_id or 'draft'} is not linked to a trusted account customer.",
        next_required_action="Link this account sale to exactly one active account customer with a valid account code before close.",
        linked_record_refs=[
            {"entity_type": "pro_shop_sale", "entity_id": sale_id or None},
            {"entity_type": "account_customer", "entity_id": int(getattr(trusted_customer, "id", 0) or 0) or None},
        ],
        details={
            "sale_id": sale_id or None,
            "customer_name": customer_name,
            "payment_method": payment_method,
            "matching_account_customer_ids": [int(getattr(customer, "id", 0) or 0) for customer in matching_customers],
            "source_system": _clean_text(source_system, max_len=80),
        },
        ai_suggestion={
            "suggested_action": "Resolve pro shop account sale linkage",
            "why": "An account sale cannot close cleanly until it maps to one trusted account customer.",
            "evidence": [sale_id or None, customer_name],
            "confidence": 0.93,
        },
    )
