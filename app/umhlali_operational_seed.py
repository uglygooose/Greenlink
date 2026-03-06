from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import openpyxl
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.people import (
    classify_membership_group,
    normalize_membership_status,
    parse_membership_date,
    parse_terms_days,
)


DEFAULT_SETUP_DIRS = (
    "UMHLALI_OPERATING_INPUT_DIR",
    r"c:\Users\athom\OneDrive\Pictures\Greenlink\Umhlali Setup",
    r".\umhlali_setup",
)


@dataclass(frozen=True)
class SetupFiles:
    setup_dir: Path
    member_list: Path | None
    account_customers: Path | None
    golf_day_bookings: Path | None
    staff_roles: Path | None


def _clean_text(value: Any, *, max_len: int = 255) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if len(text) > max_len:
        text = text[:max_len]
    return text


def _to_float(value: Any) -> float | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    raw = raw.replace("R", "").replace(",", "").strip()
    m = re.search(r"[-+]?\d+(?:\.\d+)?", raw)
    if not m:
        return None
    try:
        return float(m.group(0))
    except Exception:
        return None


def _to_date(value: Any) -> date | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except Exception:
            continue
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except Exception:
        return None


def _find_setup_files() -> SetupFiles | None:
    candidates: list[Path] = []

    import os

    env_value = _clean_text(os.getenv("UMHLALI_OPERATING_INPUT_DIR"))
    if env_value:
        candidates.append(Path(env_value))
    for item in DEFAULT_SETUP_DIRS[1:]:
        candidates.append(Path(item))

    setup_dir: Path | None = None
    for candidate in candidates:
        try:
            if candidate.exists() and candidate.is_dir():
                setup_dir = candidate
                break
        except Exception:
            continue

    if setup_dir is None:
        return None

    file_map = {p.name.lower(): p for p in setup_dir.glob("*.xlsx")}
    member = None
    account = None
    golf_day = None
    staff = None
    for lower_name, path in file_map.items():
        if "member list" in lower_name and "golf scape" in lower_name:
            member = path
        elif "account customers" in lower_name:
            account = path
        elif "golf day bookings" in lower_name:
            golf_day = path
        elif "staff user list" in lower_name:
            staff = path

    return SetupFiles(
        setup_dir=setup_dir,
        member_list=member,
        account_customers=account,
        golf_day_bookings=golf_day,
        staff_roles=staff,
    )


def find_umhlali_setup_files() -> SetupFiles | None:
    return _find_setup_files()


def _sheet_rows(path: Path) -> list[list[Any]]:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    return [list(row) for row in ws.iter_rows(values_only=True)]


def _header_index_map(header: list[Any]) -> dict[str, int]:
    out: dict[str, int] = {}
    for i, v in enumerate(header):
        key = str(v or "").strip().lower()
        if not key:
            continue
        out[key] = i
    return out


def _extract_cells(row: list[Any], header_map: dict[str, int], *keys: str) -> Any:
    for key in keys:
        idx = header_map.get(str(key).strip().lower())
        if idx is None:
            continue
        if idx >= len(row):
            continue
        value = row[idx]
        if str(value or "").strip() == "":
            continue
        return value
    return None


def _upsert_import_batch(db: Session, *, club_id: int, source: str, file_name: str | None) -> models.ImportBatch:
    batch = models.ImportBatch(
        club_id=int(club_id),
        kind="operational",
        source=source,
        file_name=file_name,
        imported_at=datetime.utcnow(),
    )
    db.add(batch)
    db.flush()
    return batch


def _upsert_account_customer(
    db: Session,
    *,
    club_id: int,
    name: str,
    account_code: str | None,
    billing_contact: str | None,
    terms_label: str | None,
) -> tuple[models.AccountCustomer, bool]:
    row = None
    if account_code:
        row = (
            db.query(models.AccountCustomer)
            .filter(
                models.AccountCustomer.club_id == int(club_id),
                func.lower(models.AccountCustomer.account_code) == account_code.lower(),
            )
            .first()
        )
    if row is None:
        row = (
            db.query(models.AccountCustomer)
            .filter(
                models.AccountCustomer.club_id == int(club_id),
                func.lower(models.AccountCustomer.name) == name.lower(),
            )
            .first()
        )

    created = False
    if row is None:
        row = models.AccountCustomer(
            club_id=int(club_id),
            name=name,
            account_code=account_code,
            billing_contact=billing_contact,
            terms_label=terms_label,
            terms_days=parse_terms_days(terms_label),
            active=1,
        )
        db.add(row)
        db.flush()
        created = True
    else:
        row.name = name
        row.account_code = account_code
        row.billing_contact = billing_contact
        row.terms_label = terms_label
        row.terms_days = parse_terms_days(terms_label)
        row.updated_at = datetime.utcnow()
    return row, created


def _ingest_account_customers(
    db: Session,
    *,
    club_id: int,
    path: Path,
) -> dict[str, int]:
    rows = _sheet_rows(path)
    if not rows:
        return {"rows": 0, "inserted": 0, "updated": 0}
    header = _header_index_map(rows[0])
    inserted = 0
    updated = 0
    for row in rows[1:]:
        name = _clean_text(_extract_cells(row, header, "name"), max_len=200)
        if not name:
            continue
        code = _clean_text(_extract_cells(row, header, "acc code", "account code", "code"), max_len=40)
        contact = _clean_text(_extract_cells(row, header, "billing contact", "contact"), max_len=160)
        terms = _clean_text(_extract_cells(row, header, "terms"), max_len=80)
        _row, created = _upsert_account_customer(
            db,
            club_id=int(club_id),
            name=name,
            account_code=code,
            billing_contact=contact,
            terms_label=terms,
        )
        if created:
            inserted += 1
        else:
            updated += 1
    return {"rows": max(0, len(rows) - 1), "inserted": inserted, "updated": updated}


def _find_member_row(
    db: Session,
    *,
    club_id: int,
    member_number: str | None,
    email: str | None,
    first_name: str,
    last_name: str,
) -> models.Member | None:
    if member_number:
        row = (
            db.query(models.Member)
            .filter(models.Member.club_id == int(club_id), models.Member.member_number == member_number)
            .first()
        )
        if row:
            return row
    if email:
        row = (
            db.query(models.Member)
            .filter(models.Member.club_id == int(club_id), func.lower(models.Member.email) == email.lower())
            .first()
        )
        if row:
            return row
    return (
        db.query(models.Member)
        .filter(
            models.Member.club_id == int(club_id),
            func.lower(models.Member.first_name) == first_name.lower(),
            func.lower(models.Member.last_name) == last_name.lower(),
        )
        .order_by(models.Member.id.asc())
        .first()
    )


def _ingest_members(
    db: Session,
    *,
    club_id: int,
    path: Path,
) -> dict[str, int]:
    rows = _sheet_rows(path)
    if not rows:
        return {"rows": 0, "inserted": 0, "updated": 0, "people_linked": 0}

    header = _header_index_map(rows[0])
    inserted = 0
    updated = 0
    existing_rows = db.query(models.Member).filter(models.Member.club_id == int(club_id)).all()
    by_member_number = {
        str(getattr(row, "member_number", "") or "").strip(): row
        for row in existing_rows
        if str(getattr(row, "member_number", "") or "").strip()
    }
    by_email = {
        str(getattr(row, "email", "") or "").strip().lower(): row
        for row in existing_rows
        if str(getattr(row, "email", "") or "").strip()
    }
    by_name = {}
    for row in existing_rows:
        first = str(getattr(row, "first_name", "") or "").strip().lower()
        last = str(getattr(row, "last_name", "") or "").strip().lower()
        if first and last:
            by_name[(first, last)] = row
    pending_by_member_number: dict[str, dict[str, Any]] = {}
    pending_by_email: dict[str, dict[str, Any]] = {}
    pending_by_name: dict[tuple[str, str], dict[str, Any]] = {}
    insert_payloads: list[dict[str, Any]] = []

    for row in rows[1:]:
        first = _clean_text(_extract_cells(row, header, "first name"), max_len=120)
        last = _clean_text(_extract_cells(row, header, "last name"), max_len=120)
        if not first or not last:
            continue

        member_number = _clean_text(_extract_cells(row, header, "#"), max_len=50)
        email = _clean_text(_extract_cells(row, header, "email"), max_len=200)
        if email:
            email = email.lower()
        country = _clean_text(_extract_cells(row, header, "country of residence"), max_len=120)
        membership = _clean_text(_extract_cells(row, header, "membership"), max_len=160) or "Unspecified"
        membership_date = parse_membership_date(_extract_cells(row, header, "membership date"))
        membership_exp = parse_membership_date(_extract_cells(row, header, "membership expiration"))
        status_raw = _clean_text(_extract_cells(row, header, "status"), max_len=40) or "Active"
        norm_status = normalize_membership_status(status_raw)
        active_flag = 1 if norm_status == "active" else 0
        gender = _clean_text(_extract_cells(row, header, "gender"), max_len=20)
        payload = {
            "club_id": int(club_id),
            "member_number": member_number,
            "first_name": first,
            "last_name": last,
            "email": email,
            "country_of_residence": country,
            "membership_category": membership,
            "membership_status": norm_status,
            "membership_date": membership_date,
            "membership_expiration": membership_exp,
            "active": active_flag,
            "gender": gender,
            "player_category": classify_membership_group(membership),
        }

        existing = None
        if member_number:
            existing = by_member_number.get(member_number)
        if existing is None and member_number:
            existing = pending_by_member_number.get(member_number)
        if existing is None and email:
            existing = by_email.get(email)
        if existing is None and email:
            existing = pending_by_email.get(email)
        if existing is None:
            existing = by_name.get((first.lower(), last.lower()))
        if existing is None:
            existing = pending_by_name.get((first.lower(), last.lower()))
        if existing is None:
            insert_payloads.append(payload)
            inserted += 1
        else:
            if isinstance(existing, dict):
                existing.update(payload)
            else:
                existing.member_number = member_number or existing.member_number
                existing.first_name = first
                existing.last_name = last
                existing.email = email or existing.email
                existing.country_of_residence = country
                existing.membership_category = membership
                existing.membership_status = norm_status
                existing.membership_date = membership_date
                existing.membership_expiration = membership_exp
                existing.active = active_flag
                existing.gender = gender or existing.gender
                existing.player_category = classify_membership_group(membership)
                updated += 1
        if member_number:
            if isinstance(existing, dict):
                pending_by_member_number[member_number] = existing
            else:
                by_member_number[member_number] = existing
        if email:
            if isinstance(existing, dict):
                pending_by_email[email] = existing
            else:
                by_email[email] = existing
        if isinstance(existing, dict):
            pending_by_name[(first.lower(), last.lower())] = existing
        else:
            by_name[(first.lower(), last.lower())] = existing

    if insert_payloads:
        chunk_size = 100
        for start in range(0, len(insert_payloads), chunk_size):
            db.bulk_insert_mappings(models.Member, insert_payloads[start : start + chunk_size])
            db.flush()
    return {"rows": max(0, len(rows) - 1), "inserted": inserted, "updated": updated, "people_linked": 0}


def _upsert_staff_role_profile(
    db: Session,
    *,
    club_id: int,
    staff_name: str,
    role_label: str,
) -> tuple[models.StaffRoleProfile, bool]:
    row = (
        db.query(models.StaffRoleProfile)
        .filter(
            models.StaffRoleProfile.club_id == int(club_id),
            func.lower(models.StaffRoleProfile.staff_name) == staff_name.lower(),
            func.lower(models.StaffRoleProfile.role_label) == role_label.lower(),
        )
        .first()
    )
    linked_user = (
        db.query(models.User)
        .filter(
            models.User.club_id == int(club_id),
            models.User.role.in_([models.UserRole.admin, models.UserRole.club_staff]),
            func.lower(models.User.name) == staff_name.lower(),
        )
        .first()
    )
    linked_user_id = int(linked_user.id) if linked_user else None

    created = False
    if row is None:
        row = models.StaffRoleProfile(
            club_id=int(club_id),
            staff_name=staff_name,
            role_label=role_label,
            linked_user_id=linked_user_id,
            active=1,
        )
        db.add(row)
        db.flush()
        created = True
    else:
        row.linked_user_id = linked_user_id
        row.active = 1
        row.updated_at = datetime.utcnow()
    return row, created


def _ingest_staff_roles(
    db: Session,
    *,
    club_id: int,
    path: Path,
) -> dict[str, int]:
    rows = _sheet_rows(path)
    if not rows:
        return {"rows": 0, "inserted": 0, "updated": 0, "linked_users": 0}
    header = _header_index_map(rows[0])
    inserted = 0
    updated = 0
    linked_users = 0
    for row in rows[1:]:
        staff_name = _clean_text(_extract_cells(row, header, "name"), max_len=160)
        role_label = _clean_text(_extract_cells(row, header, "role"), max_len=120)
        if not staff_name or not role_label:
            continue
        saved, created = _upsert_staff_role_profile(
            db,
            club_id=int(club_id),
            staff_name=staff_name,
            role_label=role_label,
        )
        if created:
            inserted += 1
        else:
            updated += 1
        if getattr(saved, "linked_user_id", None):
            linked_users += 1
    return {"rows": max(0, len(rows) - 1), "inserted": inserted, "updated": updated, "linked_users": linked_users}


def _find_golf_day_header(rows: list[list[Any]]) -> tuple[int, dict[str, int]] | None:
    for idx, row in enumerate(rows):
        cells = [str(v or "").strip().lower() for v in row]
        if "name" in cells and ("date of golf day" in cells or "amount" in cells):
            return idx, _header_index_map(row)
    return None


def _parse_amount_and_date(value: Any) -> tuple[float | None, date | None, str | None]:
    raw = _clean_text(value, max_len=200)
    if not raw:
        return None, None, None
    amount = _to_float(raw)
    parsed_date = _to_date(raw)
    return amount, parsed_date, raw


def _resolve_account_customer(
    db: Session,
    *,
    club_id: int,
    account_code: str | None,
    event_name: str,
) -> models.AccountCustomer | None:
    if account_code:
        row = (
            db.query(models.AccountCustomer)
            .filter(
                models.AccountCustomer.club_id == int(club_id),
                func.lower(models.AccountCustomer.account_code) == account_code.lower(),
            )
            .first()
        )
        if row:
            return row
    token = event_name.strip().lower()
    if not token:
        return None
    exact = (
        db.query(models.AccountCustomer)
        .filter(
            models.AccountCustomer.club_id == int(club_id),
            func.lower(models.AccountCustomer.name) == token,
        )
        .first()
    )
    if exact:
        return exact

    candidates = (
        db.query(models.AccountCustomer)
        .filter(models.AccountCustomer.club_id == int(club_id))
        .order_by(models.AccountCustomer.id.asc())
        .all()
    )
    for row in candidates:
        name = str(getattr(row, "name", "") or "").strip().lower()
        if not name:
            continue
        if name in token or token in name:
            return row
    return None


def _normalize_payment_status(
    *,
    amount: float | None,
    balance_due: float | None,
    deposit_amount: float | None,
    full_payment_amount: float | None,
) -> str:
    full = float(full_payment_amount or 0.0)
    total = float(amount or 0.0)
    balance = float(balance_due or 0.0)
    deposit = float(deposit_amount or 0.0)
    if full > 0:
        return "paid"
    if total > 0 and balance <= 0:
        return "paid"
    if deposit > 0:
        return "partial"
    if total > 0 and 0 < balance < total:
        return "partial"
    return "pending"


def _ingest_golf_day_bookings(
    db: Session,
    *,
    club_id: int,
    path: Path,
) -> dict[str, int]:
    rows = _sheet_rows(path)
    if not rows:
        return {"rows": 0, "inserted": 0, "updated": 0}

    header_info = _find_golf_day_header(rows)
    if header_info is None:
        return {"rows": 0, "inserted": 0, "updated": 0}
    header_idx, header = header_info
    inserted = 0
    updated = 0

    for row in rows[header_idx + 1 :]:
        event_name = _clean_text(_extract_cells(row, header, "name"), max_len=220)
        if not event_name:
            continue
        event_date_raw = _clean_text(_extract_cells(row, header, "date of golf day"), max_len=120)
        event_date = _to_date(event_date_raw)
        amount = _to_float(_extract_cells(row, header, "amount"))
        invoice_reference = _clean_text(_extract_cells(row, header, "invoiced"), max_len=80)

        deposit_amount, deposit_date, deposit_note = _parse_amount_and_date(
            _extract_cells(row, header, "deposit received & date")
        )
        balance_due = _to_float(_extract_cells(row, header, "balance due"))
        full_payment_amount, full_payment_date, full_payment_note = _parse_amount_and_date(
            _extract_cells(row, header, "full payment received & date")
        )
        notes = _clean_text(_extract_cells(row, header, "notes"), max_len=2000)

        account_code_guess = None
        customer = _resolve_account_customer(
            db,
            club_id=int(club_id),
            account_code=account_code_guess,
            event_name=event_name,
        )
        account_customer_id = int(customer.id) if customer else None
        account_code_snapshot = str(getattr(customer, "account_code", "") or "").strip() or None
        contact_name = str(getattr(customer, "billing_contact", "") or "").strip() or None
        payment_status = _normalize_payment_status(
            amount=amount,
            balance_due=balance_due,
            deposit_amount=deposit_amount,
            full_payment_amount=full_payment_amount,
        )

        existing = (
            db.query(models.GolfDayBooking)
            .filter(
                models.GolfDayBooking.club_id == int(club_id),
                func.lower(models.GolfDayBooking.event_name) == event_name.lower(),
                models.GolfDayBooking.event_date_raw == event_date_raw,
                models.GolfDayBooking.invoice_reference == invoice_reference,
            )
            .first()
        )

        if existing is None:
            existing = models.GolfDayBooking(
                club_id=int(club_id),
                account_customer_id=account_customer_id,
                event_name=event_name,
                event_date=event_date,
                event_date_raw=event_date_raw,
                amount=float(amount or 0.0),
                invoice_reference=invoice_reference,
                deposit_amount=deposit_amount,
                deposit_received_date=deposit_date,
                deposit_received_note=deposit_note,
                balance_due=balance_due,
                full_payment_amount=full_payment_amount,
                full_payment_date=full_payment_date,
                full_payment_note=full_payment_note,
                payment_status=payment_status,
                contact_name=contact_name,
                account_code_snapshot=account_code_snapshot,
                notes=notes,
            )
            db.add(existing)
            db.flush()
            inserted += 1
        else:
            existing.account_customer_id = account_customer_id
            existing.event_date = event_date
            existing.amount = float(amount or 0.0)
            existing.deposit_amount = deposit_amount
            existing.deposit_received_date = deposit_date
            existing.deposit_received_note = deposit_note
            existing.balance_due = balance_due
            existing.full_payment_amount = full_payment_amount
            existing.full_payment_date = full_payment_date
            existing.full_payment_note = full_payment_note
            existing.payment_status = payment_status
            existing.contact_name = contact_name
            existing.account_code_snapshot = account_code_snapshot
            existing.notes = notes
            existing.updated_at = datetime.utcnow()
            updated += 1

    return {"rows": max(0, len(rows) - header_idx - 1), "inserted": inserted, "updated": updated}


def seed_umhlali_operational_inputs(
    db: Session,
    *,
    club_id: int,
    force: bool = False,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "status": "skipped",
        "setup_dir": None,
        "missing_files": [],
        "errors": [],
        "members": {},
        "accounts": {},
        "golf_day": {},
        "staff_roles": {},
    }

    setup = _find_setup_files()
    if setup is None:
        out["status"] = "missing_inputs"
        out["missing_files"] = [
            "Member List -Golf Scape ...xlsx",
            "Account Customers.xlsx",
            "Golf Day Bookings.xlsx",
            "Staff User List.xlsx",
        ]
        return out

    out["setup_dir"] = str(setup.setup_dir)

    if not force:
        has_members = bool(
            db.query(models.Member.id).filter(models.Member.club_id == int(club_id)).first()
        )
        has_accounts = bool(
            db.query(models.AccountCustomer.id).filter(models.AccountCustomer.club_id == int(club_id)).first()
        )
        has_golf_day = bool(
            db.query(models.GolfDayBooking.id).filter(models.GolfDayBooking.club_id == int(club_id)).first()
        )
        has_staff_roles = bool(
            db.query(models.StaffRoleProfile.id).filter(models.StaffRoleProfile.club_id == int(club_id)).first()
        )
        if has_members and has_accounts and has_golf_day and has_staff_roles:
            out["status"] = "already_seeded"
            return out

    sources_loaded = 0

    def _load_source(
        *,
        output_key: str,
        source_name: str,
        missing_label: str,
        path: Path | None,
        loader,
    ) -> None:
        nonlocal sources_loaded
        if path is None or not path.exists():
            out["missing_files"].append(missing_label)
            return
        try:
            with db.begin_nested():
                batch = _upsert_import_batch(
                    db,
                    club_id=int(club_id),
                    source=source_name,
                    file_name=path.name,
                )
                stats = loader(db, club_id=int(club_id), path=path)
                batch.rows_total = int(stats.get("rows", 0))
                batch.rows_inserted = int(stats.get("inserted", 0))
                batch.rows_updated = int(stats.get("updated", 0))
                batch.rows_failed = 0
                out[output_key] = stats
            sources_loaded += 1
        except Exception as exc:
            out["errors"].append(f"{source_name}: {type(exc).__name__}: {str(exc)[:180]}")
            out[output_key] = {"status": "failed"}

    _load_source(
        output_key="members",
        source_name="umhlali_members_xlsx",
        missing_label="Member List -Golf Scape ...xlsx",
        path=setup.member_list,
        loader=_ingest_members,
    )
    _load_source(
        output_key="staff_roles",
        source_name="umhlali_staff_roles_xlsx",
        missing_label="Staff User List.xlsx",
        path=setup.staff_roles,
        loader=_ingest_staff_roles,
    )
    _load_source(
        output_key="golf_day",
        source_name="umhlali_golf_day_bookings_xlsx",
        missing_label="Golf Day Bookings.xlsx",
        path=setup.golf_day_bookings,
        loader=_ingest_golf_day_bookings,
    )
    _load_source(
        output_key="accounts",
        source_name="umhlali_account_customers_xlsx",
        missing_label="Account Customers.xlsx",
        path=setup.account_customers,
        loader=_ingest_account_customers,
    )

    out["status"] = "seeded" if sources_loaded > 0 else "missing_inputs"
    return out
