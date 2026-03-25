from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import AccountCustomer
from app.people import parse_terms_days


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


def resolve_account_customer(
    db: Session,
    *,
    club_id: int,
    account_code: str | None = None,
    account_customer_id: int | None = None,
) -> AccountCustomer | None:
    if account_customer_id is not None and int(account_customer_id) > 0:
        row = (
            db.query(AccountCustomer)
            .filter(AccountCustomer.club_id == int(club_id), AccountCustomer.id == int(account_customer_id))
            .first()
        )
        if row:
            return row

    code = str(account_code or "").strip()
    if not code:
        return None

    return (
        db.query(AccountCustomer)
        .filter(
            AccountCustomer.club_id == int(club_id),
            func.lower(AccountCustomer.account_code) == code.lower(),
        )
        .first()
    )


def serialize_account_customer(row: AccountCustomer) -> dict:
    return {
        "id": int(row.id),
        "name": str(row.name or ""),
        "account_code": str(row.account_code or "") or None,
        "billing_contact": str(row.billing_contact or "") or None,
        "terms": str(row.terms_label or "") or None,
        "terms_days": int(row.terms_days) if row.terms_days is not None else None,
        "customer_type": str(row.customer_type or "") or None,
        "operation_area": str(row.operation_area or "") or None,
        "source_file": str(row.source_file or "") or None,
        "import_reference": str(row.import_reference or "") or None,
        "active": bool(int(row.active or 0) == 1),
        "notes": str(row.notes or "") or None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def build_account_customers_query(
    db: Session,
    *,
    q: str | None = None,
    active_only: bool = False,
    sort: str | None = "name_asc",
):
    query = db.query(AccountCustomer)
    if active_only:
        query = query.filter(AccountCustomer.active == 1)
    if q:
        needle = str(q).strip().lower()
        if needle:
            like = f"%{needle}%"
            query = query.filter(
                (
                    func.lower(AccountCustomer.name).like(like)
                    | func.lower(func.coalesce(AccountCustomer.account_code, "")).like(like)
                    | func.lower(func.coalesce(AccountCustomer.billing_contact, "")).like(like)
                )
            )

    sort_key = str(sort or "name_asc").strip().lower()
    if sort_key == "name_desc":
        query = query.order_by(func.lower(AccountCustomer.name).desc(), AccountCustomer.id.desc())
    elif sort_key == "code_asc":
        query = query.order_by(
            func.lower(func.coalesce(AccountCustomer.account_code, "zzz")).asc(),
            AccountCustomer.name.asc(),
        )
    else:
        query = query.order_by(
            AccountCustomer.active.desc(),
            func.lower(AccountCustomer.name).asc(),
            AccountCustomer.id.asc(),
        )
    return query


def ensure_unique_account_code(
    db: Session,
    *,
    club_id: int,
    account_code: str | None,
    exclude_account_customer_id: int | None = None,
) -> bool:
    code = str(account_code or "").strip()
    if not code:
        return True
    query = db.query(AccountCustomer.id).filter(
        AccountCustomer.club_id == int(club_id),
        func.lower(AccountCustomer.account_code) == code.lower(),
    )
    if exclude_account_customer_id is not None and int(exclude_account_customer_id) > 0:
        query = query.filter(AccountCustomer.id != int(exclude_account_customer_id))
    return query.first() is None


def list_account_customers_payload(
    db: Session,
    *,
    q: str | None = None,
    active_only: bool = False,
    sort: str | None = "name_asc",
) -> dict[str, Any]:
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


def create_account_customer_payload(
    db: Session,
    *,
    club_id: int,
    payload: AccountCustomerUpsertPayload,
    audit_event: Callable[..., None] | None = None,
    audit_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    name = str(payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    if int(club_id) <= 0:
        raise HTTPException(status_code=400, detail="club_id is required")

    account_code = str(payload.account_code or "").strip() or None
    if not ensure_unique_account_code(db, club_id=int(club_id), account_code=account_code):
        raise HTTPException(status_code=409, detail="account_code already exists for this club")

    row = AccountCustomer(
        club_id=int(club_id),
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
    if audit_event is not None:
        audit_event(
            action="account_customer.created",
            entity_type="account_customer",
            entity_id=str(account_code or name),
            payload={"name": name, "account_code": account_code},
            **(audit_context or {}),
        )
    db.commit()
    db.refresh(row)
    created_payload = serialize_account_customer(row)
    created_payload.pop("updated_at", None)
    return {
        "status": "success",
        "account_customer": created_payload,
    }


def update_account_customer_payload(
    db: Session,
    *,
    account_customer_id: int,
    payload: AccountCustomerUpsertPayload,
    audit_event: Callable[..., None] | None = None,
    audit_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
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

    if audit_event is not None:
        audit_event(
            action="account_customer.updated",
            entity_type="account_customer",
            entity_id=int(row.id),
            payload={"name": row.name, "account_code": row.account_code},
            **(audit_context or {}),
        )
    db.commit()
    return {
        "status": "success",
        "account_customer": serialize_account_customer(row),
    }
