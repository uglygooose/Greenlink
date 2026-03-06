from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models import Booking, LedgerEntry, LedgerEntryMeta
from app.services.payment_methods import normalize_booking_payment_method


def get_booking_or_404(db: Session, booking_id: int) -> Booking:
    booking = db.query(Booking).filter(Booking.id == int(booking_id)).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


def set_booking_payment_method_meta(
    db: Session,
    *,
    booking_id: int,
    payment_method: str | None,
) -> tuple[int, str]:
    method = normalize_booking_payment_method(
        payment_method,
        allow_empty=False,
        field_name="payment method",
    )
    ledger_entry = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.booking_id == int(booking_id))
        .order_by(desc(LedgerEntry.id))
        .first()
    )
    if not ledger_entry:
        raise HTTPException(status_code=400, detail="Booking has no payment record yet")

    meta = db.query(LedgerEntryMeta).filter(LedgerEntryMeta.ledger_entry_id == ledger_entry.id).first()
    if meta:
        meta.payment_method = method
        meta.updated_at = datetime.utcnow()
    else:
        db.add(LedgerEntryMeta(ledger_entry_id=ledger_entry.id, payment_method=method))

    return int(ledger_entry.id), method


def set_booking_payment_method_if_exists(
    db: Session,
    *,
    booking_id: int,
    payment_method: str | None,
) -> tuple[bool, int | None, str | None]:
    """
    Update the payment method on the latest ledger entry when one exists.
    Returns (updated, ledger_entry_id, normalized_method).
    """
    method = normalize_booking_payment_method(
        payment_method,
        allow_empty=False,
        field_name="payment method",
    )
    ledger_entry = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.booking_id == int(booking_id))
        .order_by(desc(LedgerEntry.id))
        .first()
    )
    if not ledger_entry:
        return False, None, None

    meta = db.query(LedgerEntryMeta).filter(LedgerEntryMeta.ledger_entry_id == ledger_entry.id).first()
    if meta:
        meta.payment_method = method
        meta.updated_at = datetime.utcnow()
    else:
        db.add(LedgerEntryMeta(ledger_entry_id=ledger_entry.id, payment_method=method))
    return True, int(ledger_entry.id), method


def clear_booking_ledger_entries(db: Session, *, booking_id: int) -> None:
    ids = [row[0] for row in db.query(LedgerEntry.id).filter(LedgerEntry.booking_id == int(booking_id)).all()]
    if ids:
        db.query(LedgerEntryMeta).filter(LedgerEntryMeta.ledger_entry_id.in_(ids)).delete(synchronize_session=False)
    db.query(LedgerEntry).filter(LedgerEntry.booking_id == int(booking_id)).delete(synchronize_session=False)


def normalize_booking_ids(raw_ids: list[int] | None) -> list[int]:
    booking_ids: list[int] = []
    seen: set[int] = set()
    for raw in raw_ids or []:
        try:
            bid = int(raw)
        except Exception:
            continue
        if bid <= 0 or bid in seen:
            continue
        seen.add(bid)
        booking_ids.append(bid)
    return booking_ids
