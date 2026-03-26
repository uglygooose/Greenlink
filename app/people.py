from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models
from app.services.identity_integrity_service import sync_member_identity, sync_user_identity


def _clean_text(value: Any, *, max_len: int = 255) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if len(text) > max_len:
        text = text[:max_len]
    return text


def _clean_email(value: Any) -> str | None:
    raw = _clean_text(value, max_len=200)
    if not raw:
        return None
    email = raw.lower()
    if "@" not in email:
        return None
    return email


def _clean_name(value: Any, *, fallback: str) -> str:
    text = _clean_text(value, max_len=120)
    return text or fallback


def normalize_membership_status(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return "active"
    if raw in {"active", "current"}:
        return "active"
    if raw in {"suspended", "suspend", "hold", "on hold"}:
        return "hold"
    if raw in {"inactive", "lapsed", "expired", "absentee"}:
        return "inactive"
    if raw in {"resigned", "deceased", "defaulter"}:
        return raw
    return raw[:40]


def classify_membership_group(membership_name: Any) -> str:
    value = str(membership_name or "").strip().lower()
    if not value:
        return "other"
    if "golf" in value or "academy" in value or "junior" in value or "weekday" in value:
        return "golf"
    if "padel" in value:
        return "padel"
    if "bowls" in value:
        return "bowls"
    if "tennis" in value:
        return "tennis"
    if "squash" in value:
        return "squash"
    if "home owner" in value or "homeowner" in value:
        return "homeowners"
    if "house" in value:
        return "house"
    if "social" in value:
        return "social"
    if "staff" in value:
        return "staff"
    return "other"


def normalize_primary_operation(value: Any, membership_name: Any = None) -> str:
    raw = str(value or membership_name or "").strip().lower()
    if not raw:
        return "General"
    if "pro shop" in raw or "pro_shop" in raw or "retail" in raw or "shop" in raw:
        return "Pro Shop"
    if "golf" in raw or "academy" in raw or "weekday" in raw or "u35" in raw:
        return "Golf"
    if "padel" in raw:
        return "Padel"
    if "tennis" in raw:
        return "Tennis"
    if "bowls" in raw:
        return "Bowls"
    if "squash" in raw:
        return "Squash"
    if raw in {"general", "all", "house", "social", "homeowners", "homeowner", "staff"}:
        return "General"
    group = classify_membership_group(raw)
    if group == "golf":
        return "Golf"
    if group == "padel":
        return "Padel"
    if group == "tennis":
        return "Tennis"
    if group == "bowls":
        return "Bowls"
    if group == "squash":
        return "Squash"
    return "General"


def parse_yes_no_flag(value: Any) -> bool | None:
    raw = str(value or "").strip().lower()
    if not raw:
        return None
    if raw in {"yes", "y", "true", "1"}:
        return True
    if raw in {"no", "n", "false", "0"}:
        return False
    return None


def parse_membership_date(value: Any) -> date | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except Exception:
            continue
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except Exception:
        return None


def _person_lookup_by_email(db: Session, club_id: int, email: str | None):
    if not email:
        return None
    return (
        db.query(models.Person)
        .filter(
            models.Person.club_id == int(club_id),
            func.lower(models.Person.email) == str(email).lower(),
        )
        .first()
    )


def _person_lookup_by_name_phone(
    db: Session,
    club_id: int,
    first_name: str,
    last_name: str,
    phone: str | None,
):
    q = db.query(models.Person).filter(
        models.Person.club_id == int(club_id),
        func.lower(models.Person.first_name) == str(first_name).lower(),
        func.lower(models.Person.last_name) == str(last_name).lower(),
    )
    if phone:
        q = q.filter(
            or_(
                models.Person.phone == phone,
                models.Person.phone.is_(None),
            )
        )
    return q.order_by(models.Person.id.asc()).first()


def upsert_person(
    db: Session,
    *,
    club_id: int,
    first_name: Any,
    last_name: Any,
    email: Any = None,
    phone: Any = None,
    country_of_residence: Any = None,
    gender: Any = None,
    status: Any = None,
    source_system: Any = None,
    source_ref: Any = None,
) -> models.Person:
    first = _clean_name(first_name, fallback="Unknown")
    last = _clean_name(last_name, fallback="Unknown")
    normalized_email = _clean_email(email)
    normalized_phone = _clean_text(phone, max_len=50)
    normalized_country = _clean_text(country_of_residence, max_len=120)
    normalized_gender = _clean_text(gender, max_len=20)
    normalized_status = normalize_membership_status(status)
    normalized_source = _clean_text(source_system, max_len=50)
    normalized_ref = _clean_text(source_ref, max_len=120)

    person = _person_lookup_by_email(db, int(club_id), normalized_email)
    if person is None:
        person = _person_lookup_by_name_phone(
            db,
            int(club_id),
            first,
            last,
            normalized_phone,
        )

    if person is None:
        person = models.Person(
            club_id=int(club_id),
            first_name=first,
            last_name=last,
            email=normalized_email,
            phone=normalized_phone,
            country_of_residence=normalized_country,
            gender=normalized_gender,
            status=normalized_status,
            source_system=normalized_source,
            source_ref=normalized_ref,
        )
        db.add(person)
        db.flush()
        return person

    person.first_name = first
    person.last_name = last
    if normalized_email:
        person.email = normalized_email
    if normalized_phone:
        person.phone = normalized_phone
    if normalized_country:
        person.country_of_residence = normalized_country
    if normalized_gender:
        person.gender = normalized_gender
    if normalized_status:
        person.status = normalized_status
    if normalized_source:
        person.source_system = normalized_source
    if normalized_ref:
        person.source_ref = normalized_ref
    person.updated_at = datetime.utcnow()
    return person


def upsert_person_membership(
    db: Session,
    *,
    club_id: int,
    person_id: int,
    membership_name: Any,
    status: Any = None,
    start_date: date | None = None,
    end_date: date | None = None,
    is_primary: bool = False,
) -> models.PersonMembership:
    membership_text = _clean_text(membership_name, max_len=160) or "Unspecified"
    group = classify_membership_group(membership_text)
    norm_status = normalize_membership_status(status)

    row = (
        db.query(models.PersonMembership)
        .filter(
            models.PersonMembership.club_id == int(club_id),
            models.PersonMembership.person_id == int(person_id),
            func.lower(models.PersonMembership.membership_name) == membership_text.lower(),
        )
        .first()
    )
    if row is None:
        row = models.PersonMembership(
            club_id=int(club_id),
            person_id=int(person_id),
            membership_name=membership_text,
            membership_group=group,
            status=norm_status,
            start_date=start_date,
            end_date=end_date,
            is_primary=bool(is_primary),
        )
        db.add(row)
        db.flush()
    else:
        row.membership_group = group
        row.status = norm_status
        row.start_date = start_date
        row.end_date = end_date
        if is_primary:
            row.is_primary = True
        row.updated_at = datetime.utcnow()

    if is_primary:
        (
            db.query(models.PersonMembership)
            .filter(
                models.PersonMembership.club_id == int(club_id),
                models.PersonMembership.person_id == int(person_id),
                models.PersonMembership.id != int(row.id),
                models.PersonMembership.is_primary.is_(True),
            )
            .update({models.PersonMembership.is_primary: False}, synchronize_session=False)
        )
        row.is_primary = True

    return row


def sync_member_person(
    db: Session,
    member: models.Member,
    *,
    source_system: str = "members",
) -> models.Person | None:
    if member is None:
        return None
    club_id = int(getattr(member, "club_id", 0) or 0)
    if club_id <= 0:
        return None

    person = upsert_person(
        db,
        club_id=club_id,
        first_name=getattr(member, "first_name", None),
        last_name=getattr(member, "last_name", None),
        email=getattr(member, "email", None),
        phone=getattr(member, "phone", None),
        country_of_residence=getattr(member, "country_of_residence", None),
        gender=getattr(member, "gender", None),
        status=getattr(member, "membership_status", None) or ("active" if int(getattr(member, "active", 0) or 0) == 1 else "inactive"),
        source_system=source_system,
        source_ref=f"member:{int(getattr(member, 'id', 0) or 0)}" if getattr(member, "id", None) else None,
    )

    member.person_id = int(person.id)
    membership_name = getattr(member, "membership_category", None) or "Unspecified"
    upsert_person_membership(
        db,
        club_id=club_id,
        person_id=int(person.id),
        membership_name=membership_name,
        status=getattr(member, "membership_status", None),
        start_date=getattr(member, "membership_date", None),
        end_date=getattr(member, "membership_expiration", None),
        is_primary=True,
    )
    sync_member_identity(db, member, source_system=source_system)
    return person


def sync_user_person(
    db: Session,
    user: models.User,
    *,
    source_system: str = "user",
) -> models.Person | None:
    if user is None:
        return None
    club_id = int(getattr(user, "club_id", 0) or 0)
    if club_id <= 0:
        return None

    name = str(getattr(user, "name", "") or "").strip()
    if not name:
        first_name, last_name = "Unknown", "User"
    elif " " in name:
        first_name, last_name = name.split(" ", 1)
    else:
        first_name, last_name = name, "User"

    person = upsert_person(
        db,
        club_id=club_id,
        first_name=first_name,
        last_name=last_name,
        email=getattr(user, "email", None),
        phone=getattr(user, "phone", None),
        country_of_residence=None,
        gender=getattr(user, "gender", None),
        status="active",
        source_system=source_system,
        source_ref=f"user:{int(getattr(user, 'id', 0) or 0)}" if getattr(user, "id", None) else None,
    )
    user.person_id = int(person.id)
    sync_user_identity(db, user, source_system=source_system)
    return person


def parse_terms_days(value: Any) -> int | None:
    text = str(value or "").strip().lower()
    if not text:
        return None
    m = re.search(r"(\d{1,3})", text)
    if not m:
        return None
    try:
        out = int(m.group(1))
    except Exception:
        return None
    return out if out >= 0 else None


def member_identity_key(
    *,
    first_name: Any,
    last_name: Any,
    membership_category: Any,
    membership_status: Any = None,
    membership_date: Any = None,
    membership_expiration: Any = None,
) -> tuple[str, str, str, str, str, str]:
    first = str(first_name or "").strip().lower()
    last = str(last_name or "").strip().lower()
    category = str(membership_category or "").strip().lower()
    status = normalize_membership_status(membership_status)
    start = membership_date.isoformat() if isinstance(membership_date, date) else str(membership_date or "").strip().lower()
    end = (
        membership_expiration.isoformat()
        if isinstance(membership_expiration, date)
        else str(membership_expiration or "").strip().lower()
    )
    return (first, last, category, status, start, end)
