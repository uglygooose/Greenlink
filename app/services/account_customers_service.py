from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import AccountCustomer


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
