from __future__ import annotations

from datetime import date, datetime
from typing import Any, Callable

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import asc, desc, func, or_
from sqlalchemy.orm import Session

from app.models import AccountCustomer, GolfDayBooking
from app.services.account_customers_service import resolve_account_customer


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


def list_golf_day_bookings_payload(
    db: Session,
    *,
    q: str | None = None,
    status: str | None = "all",
    sort: str | None = "date_asc",
) -> dict[str, Any]:
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


def create_golf_day_booking_payload(
    db: Session,
    *,
    club_id: int,
    payload: GolfDayBookingUpsertPayload,
    audit_event: Callable[..., None] | None = None,
    audit_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    name = str(payload.event_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="event_name is required")
    if int(club_id) <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

    customer = resolve_account_customer(
        db,
        club_id=int(club_id),
        account_code=payload.account_code,
        account_customer_id=payload.account_customer_id,
    )
    if payload.account_customer_id and customer is None and not payload.account_code:
        raise HTTPException(status_code=404, detail="Account customer not found")

    row = GolfDayBooking(
        club_id=int(club_id),
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
    if audit_event is not None:
        audit_event(
            action="golf_day_booking.created",
            entity_type="golf_day_booking",
            entity_id=name,
            payload={"invoice_reference": row.invoice_reference, "amount": float(row.amount or 0.0)},
            **(audit_context or {}),
        )
    db.commit()
    db.refresh(row)
    return {"status": "success", "id": int(row.id)}


def update_golf_day_booking_payload(
    db: Session,
    *,
    golf_day_booking_id: int,
    payload: GolfDayBookingUpsertPayload,
    audit_event: Callable[..., None] | None = None,
    audit_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row = db.query(GolfDayBooking).filter(GolfDayBooking.id == int(golf_day_booking_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Golf day booking not found")

    customer = resolve_account_customer(
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

    if audit_event is not None:
        audit_event(
            action="golf_day_booking.updated",
            entity_type="golf_day_booking",
            entity_id=int(row.id),
            payload={"invoice_reference": row.invoice_reference, "payment_status": row.payment_status},
            **(audit_context or {}),
        )
    db.commit()
    return {"status": "success"}
