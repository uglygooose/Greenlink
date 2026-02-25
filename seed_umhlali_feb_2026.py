"""
Seed a robust February 2026 dataset for Umhlali Country Club (local/dev).

This script:
- Wipes all club-scoped data for the target club (members, tee times, bookings, ledger,
  rounds, imports, revenue, settings), but preserves users with role=admin/super_admin.
- Seeds a realistic February dataset (members, staff, tee sheet, bookings, payments).

Default DB matches `dev.ps1`: sqlite:///./greenlink.dev.v2.db
"""

from __future__ import annotations

import argparse
import os
import random
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Iterable


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _dt(d: date, hh: int, mm: int) -> datetime:
    return datetime.combine(d, time(hour=hh, minute=mm))


def _clamp_dt(value: datetime, lo: datetime, hi: datetime) -> datetime:
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


def _env_truthy(key: str) -> bool:
    return str(os.getenv(key, "")).strip().lower() in {"1", "true", "yes", "y", "on"}


def _configure_db(db_url: str) -> None:
    """
    Configure app.database selection for the given SQLAlchemy URL.

    - sqlite:///... uses the SQLite fallback URL (local/dev)
    - any other URL is treated as DATABASE_URL (Postgres/MySQL), with strict mode enabled
      so we never silently fall back to an unrelated local DB.
    """
    raw = str(db_url or "").strip()
    if raw.lower().startswith("sqlite"):
        os.environ.setdefault("PREFER_LOCAL_DB", "1")
        os.environ.setdefault("FORCE_SQLITE", "1")
        os.environ["SQLITE_FALLBACK_URL"] = raw
        return

    os.environ["DATABASE_URL"] = raw
    os.environ.setdefault("DATABASE_URL_STRICT", "1")
    os.environ["PREFER_LOCAL_DB"] = "0"
    os.environ["FORCE_SQLITE"] = "0"


@dataclass(frozen=True)
class DemoCredentials:
    email: str
    password: str
    role: str


def _sqlite_fix_bigint_autoinc_tables(engine) -> None:
    """
    Older local SQLite DBs were created with BIGINT primary keys on some tables.
    SQLite only auto-increments when the PK type is exactly INTEGER (rowid alias),
    so inserts into these tables fail with "NOT NULL constraint failed: <table>.id".

    This fix is safe for local/dev: it rebuilds the affected tables (they are seed/import
    tables and are wiped by this script anyway).
    """
    try:
        dialect = str(getattr(getattr(engine, "dialect", None), "name", "") or "").lower()
    except Exception:
        return
    if dialect != "sqlite":
        return

    def _id_type(conn, table: str) -> str | None:
        try:
            rows = conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
        except Exception:
            return None
        for _cid, name, col_type, _notnull, _dflt, _pk in rows:
            if str(name).lower() == "id":
                return str(col_type or "").strip().upper() or None
        return None

    with engine.begin() as conn:
        # If any of these tables uses BIGINT (or anything other than INTEGER) for the PK,
        # drop and let SQLAlchemy recreate them with the corrected SQLite type variant.
        to_check = ["kpi_targets", "import_batches", "revenue_transactions"]
        needs_rebuild = []
        for t in to_check:
            tpe = _id_type(conn, t)
            if tpe is None:
                continue
            if tpe != "INTEGER":
                needs_rebuild.append(t)

        if not needs_rebuild:
            return

        # Foreign keys can block DROP TABLE; disable within this transaction.
        try:
            conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        except Exception:
            pass

        # Drop in FK-safe order.
        for t in ["revenue_transactions", "import_batches", "kpi_targets"]:
            if t in needs_rebuild:
                conn.exec_driver_sql(f"DROP TABLE IF EXISTS {t}")

        try:
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        except Exception:
            pass

def _confirm_or_exit(message: str, *, assume_yes: bool) -> None:
    if assume_yes:
        return
    print(message)
    raw = input("Type YES to continue: ").strip()
    if raw != "YES":
        print("Aborted.")
        raise SystemExit(2)


def _print_counts(db, club_id: int, *, label: str) -> None:
    from sqlalchemy import text

    print(f"\n[{label}] club_id={club_id}")
    for key, sql in [
        ("users_in_club", "select count(*) from users where club_id = :cid"),
        ("members", "select count(*) from members where club_id = :cid"),
        ("tee_times", "select count(*) from tee_times where club_id = :cid"),
        ("bookings", "select count(*) from bookings where club_id = :cid"),
        ("ledger_entries", "select count(*) from ledger_entries where club_id = :cid"),
        ("rounds", "select count(*) from rounds where booking_id in (select id from bookings where club_id = :cid)"),
        ("day_closures", "select count(*) from day_closures where club_id = :cid"),
        ("import_batches", "select count(*) from import_batches where club_id = :cid"),
        ("revenue_transactions", "select count(*) from revenue_transactions where club_id = :cid"),
        ("fee_categories_club", "select count(*) from fee_categories where club_id = :cid"),
    ]:
        try:
            n = db.execute(text(sql), {"cid": int(club_id)}).scalar_one()
        except Exception:
            n = "n/a"
        print(f"  {key}: {n}")


def _wipe_club_data(db, club_id: int) -> None:
    """
    Remove all club-scoped data for the club, preserving admin/super_admin users.

    Tenant scoping only applies to SELECTs; these deletes must be explicit.
    """
    from sqlalchemy import text

    cid = int(club_id)

    # Dependent rows first (FK order).
    db.execute(
        text(
            """
            delete from ledger_entry_meta
            where ledger_entry_id in (
              select id from ledger_entries where club_id = :cid
            )
            """
        ),
        {"cid": cid},
    )
    db.execute(
        text(
            """
            delete from rounds
            where booking_id in (
              select id from bookings where club_id = :cid
            )
            """
        ),
        {"cid": cid},
    )
    db.execute(text("delete from ledger_entries where club_id = :cid"), {"cid": cid})

    # Bookings and tee sheet.
    db.execute(text("delete from bookings where club_id = :cid"), {"cid": cid})
    db.execute(text("delete from tee_times where club_id = :cid"), {"cid": cid})

    # Members.
    db.execute(text("delete from members where club_id = :cid"), {"cid": cid})

    # Ops/config tables.
    db.execute(text("delete from day_closures where club_id = :cid"), {"cid": cid})
    db.execute(text("delete from revenue_transactions where club_id = :cid"), {"cid": cid})
    db.execute(text("delete from import_batches where club_id = :cid"), {"cid": cid})
    db.execute(text("delete from accounting_settings where club_id = :cid"), {"cid": cid})
    db.execute(text("delete from kpi_targets where club_id = :cid"), {"cid": cid})
    db.execute(text("delete from club_settings where club_id = :cid"), {"cid": cid})

    # Remove club-specific fee overrides (keep global price list where club_id is NULL).
    try:
        db.execute(text("delete from fee_categories where club_id = :cid"), {"cid": cid})
    except Exception:
        pass

    # Preserve admin/super_admin accounts; wipe club staff + players.
    db.execute(text("delete from users where club_id = :cid and role in ('player','club_staff')"), {"cid": cid})


def _ensure_fee_categories(db) -> None:
    """
    Ensure fee categories exist (global price list + add-ons used by suggestion endpoints).
    """
    from sqlalchemy import func
    from app.fee_models import FeeCategory, FeeType

    existing = int(db.query(func.count(FeeCategory.id)).scalar() or 0)
    if existing == 0:
        # Reuse the repo's canonical Umhlali 2026 price list (global fees).
        import populate_fees  # type: ignore

        populate_fees.populate_fees()

    def _get_or_create(code: int, description: str, price: float, fee_type: FeeType) -> None:
        row = db.query(FeeCategory).filter(FeeCategory.code == int(code)).first()
        if row:
            row.description = description
            row.price = float(price)
            row.fee_type = fee_type
            row.active = 1
            return
        db.add(
            FeeCategory(
                club_id=None,
                code=int(code),
                description=description,
                price=float(price),
                fee_type=fee_type,
                active=1,
                audience=None,
                priority=0,
            )
        )

    # Add-ons required by /fees/suggest/push-cart and /fees/suggest/caddy.
    _get_or_create(9101, "PUSH CART (18 HOLES)", 50.0, FeeType.PUSH_CART)
    _get_or_create(9102, "CADDY (18 HOLES)", 200.0, FeeType.CADDY)
    db.commit()


def _get_or_create_club(db, *, club_name: str, club_slug: str) -> int:
    from sqlalchemy import func
    from app.models import Club

    slug = (club_slug or "").strip().lower()
    if not slug:
        raise ValueError("club_slug is required")

    club = db.query(Club).filter(func.lower(Club.slug) == slug.lower()).first()
    if club:
        return int(club.id)

    club = Club(name=(club_name or slug).strip() or slug, slug=slug, active=1)
    db.add(club)
    db.commit()
    db.refresh(club)
    return int(club.id)


def _ensure_admin_users(db, *, club_id: int) -> list[DemoCredentials]:
    """
    Ensure the canonical demo super admin + Umhlali club admin exist (do not reset if present).
    """
    from sqlalchemy import func
    from app.auth import get_password_hash
    from app.models import User, UserRole

    super_email = (os.getenv("GREENLINK_SUPER_ADMIN_EMAIL") or "greenlinkgolfsa@gmail.com").strip().lower()
    super_password = os.getenv("GREENLINK_SUPER_ADMIN_PASSWORD") or "GreenLink123!"
    admin_email = (os.getenv("GREENLINK_DEFAULT_CLUB_ADMIN_EMAIL") or "admin@umhlali.com").strip().lower()
    admin_password = os.getenv("GREENLINK_DEFAULT_CLUB_ADMIN_PASSWORD") or "Admin123!"

    creds: list[DemoCredentials] = []

    su = _find_user_by_email_global(db, super_email)
    if not su:
        db.add(
            User(
                name="Super Admin",
                email=super_email,
                password=get_password_hash(super_password),
                role=UserRole.super_admin,
                club_id=None,
            )
        )
        db.commit()
    creds.append(DemoCredentials(email=super_email, password=super_password, role="super_admin"))

    ca = _find_user_by_email_global(db, admin_email)
    if not ca:
        db.add(
            User(
                name="Club Admin",
                email=admin_email,
                password=get_password_hash(admin_password),
                role=UserRole.admin,
                club_id=int(club_id),
            )
        )
        db.commit()
    creds.append(DemoCredentials(email=admin_email, password=admin_password, role="admin"))

    return creds


def _find_user_by_email_global(db, email: str):
    """
    Lookup a user by email without tenant scoping.

    The app enforces tenant scoping on SELECTs when `db.info["club_id"]` is set.
    Email uniqueness is global, so seed/ensure logic must query globally.
    """
    from sqlalchemy import func
    from app.models import User

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


def _upsert_club_setting(db, *, club_id: int, key: str, value: str) -> None:
    from app.models import ClubSetting

    row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == key).first()
    if row:
        row.value = value
        row.updated_at = _utcnow_naive()
        return
    db.add(ClubSetting(club_id=int(club_id), key=key, value=value, updated_at=_utcnow_naive()))


def _seed_core_settings(db, *, club_id: int) -> None:
    from app.models import AccountingSetting, KpiTarget
    from app.tee_profile import DEFAULT_TEE_SHEET_PROFILE, normalize_tee_sheet_profile

    _upsert_club_setting(db, club_id=club_id, key="club_name", value="Umhlali Country Club")
    _upsert_club_setting(db, club_id=club_id, key="club_slug", value="umhlali")
    _upsert_club_setting(db, club_id=club_id, key="club_member_label", value="Member")
    _upsert_club_setting(db, club_id=club_id, key="club_visitor_label", value="Visitor")
    _upsert_club_setting(db, club_id=club_id, key="club_non_affiliated_label", value="Non-affiliated")
    _upsert_club_setting(db, club_id=club_id, key="target_member_round_share", value="0.55")
    _upsert_club_setting(db, club_id=club_id, key="target_member_revenue_share", value="0.35")
    _upsert_club_setting(db, club_id=club_id, key="booking_window_member_days", value="28")
    _upsert_club_setting(db, club_id=club_id, key="booking_window_affiliated_days", value="28")
    _upsert_club_setting(db, club_id=club_id, key="booking_window_non_affiliated_days", value="28")
    _upsert_club_setting(db, club_id=club_id, key="booking_window_group_cancel_days", value="10")
    _upsert_club_setting(
        db,
        club_id=club_id,
        key="tee_sheet_profile",
        value=json.dumps(normalize_tee_sheet_profile(DEFAULT_TEE_SHEET_PROFILE)),
    )

    settings = db.query(AccountingSetting).filter(AccountingSetting.club_id == int(club_id)).first()
    if not settings:
        db.add(AccountingSetting(club_id=int(club_id)))

    # KPI targets for 2026.
    for metric, annual in [("rounds", 36000.0), ("revenue", 14500000.0)]:
        row = db.query(KpiTarget).filter(KpiTarget.club_id == int(club_id), KpiTarget.year == 2026, KpiTarget.metric == metric).first()
        if row:
            row.annual_target = float(annual)
            row.updated_at = _utcnow_naive()
        else:
            db.add(KpiTarget(club_id=int(club_id), year=2026, metric=metric, annual_target=float(annual)))

    db.commit()


def _seed_staff_users(db, *, club_id: int) -> list[DemoCredentials]:
    from app.auth import get_password_hash
    from app.models import User, UserRole

    password = "Staff123!"
    staff = [
        ("Pro Shop", "proshop@umhlali.com"),
        ("Starter", "starter@umhlali.com"),
        ("Bookings Desk", "bookings@umhlali.com"),
        ("Finance", "finance@umhlali.com"),
        ("Events", "events@umhlali.com"),
        ("Course Ops", "ops@umhlali.com"),
    ]

    creds: list[DemoCredentials] = []
    for name, email in staff:
        existing = _find_user_by_email_global(db, email)
        if existing:
            if existing.role in {UserRole.super_admin, UserRole.admin}:
                # Never overwrite admin roles via a seed script.
                continue
            existing.name = name
            existing.role = UserRole.club_staff
            existing.club_id = int(club_id)
            if _env_truthy("GREENLINK_SEED_FORCE_RESET_PASSWORDS"):
                existing.password = get_password_hash(password)
        else:
            db.add(
                User(
                    name=name,
                    email=email.lower(),
                    password=get_password_hash(password),
                    role=UserRole.club_staff,
                    club_id=int(club_id),
                )
            )
        creds.append(DemoCredentials(email=email.lower(), password=password, role="club_staff"))

    db.commit()
    return creds


@dataclass(frozen=True)
class SeedMember:
    id: int
    first_name: str
    last_name: str
    email: str | None
    gender: str | None
    player_category: str | None
    student: bool | None
    handicap_index: float | None
    handicap_sa_id: str | None
    handicap_number: str | None


def _seed_members(db, *, club_id: int, count: int, rng: random.Random) -> list[SeedMember]:
    from app import models

    first_m = [
        "James",
        "Liam",
        "Noah",
        "Ethan",
        "Lucas",
        "Mason",
        "Daniel",
        "Michael",
        "Sipho",
        "Thabo",
        "Sibusiso",
        "Mandla",
        "Andile",
        "Kagiso",
        "Johan",
        "Pieter",
        "Andre",
        "Kyle",
    ]
    first_f = [
        "Olivia",
        "Emma",
        "Ava",
        "Sophia",
        "Mia",
        "Amelia",
        "Lily",
        "Chloe",
        "Nomsa",
        "Thandeka",
        "Ayanda",
        "Zanele",
        "Lerato",
        "Naledi",
        "Anika",
        "Marli",
        "Karen",
        "Tracey",
    ]
    last_names = [
        "Naidoo",
        "Pillay",
        "Dlamini",
        "Mthembu",
        "Ndlovu",
        "Botha",
        "Smith",
        "Van Wyk",
        "Mkhize",
        "Govender",
        "Khumalo",
        "Jacobs",
        "Williams",
        "Brown",
        "Jones",
        "Taylor",
        "Miller",
        "Wilson",
        "Anderson",
    ]

    def pick_gender() -> str:
        return "male" if rng.random() < 0.62 else "female"

    def pick_category() -> tuple[str, bool | None]:
        r = rng.random()
        if r < 0.72:
            return "adult", None
        if r < 0.84:
            return "pensioner", None
        if r < 0.94:
            return "student", True
        return "junior", True

    members: list[models.Member] = []
    for i in range(max(1, int(count))):
        gender = pick_gender()
        first = rng.choice(first_m if gender == "male" else first_f)
        last = rng.choice(last_names)
        cat, student = pick_category()

        member_number = f"UCC-{i+1:05d}"
        email = None
        if rng.random() < 0.92:
            email = f"{first}.{last}.{i+1}@umhlali.demo".lower()
        phone = None
        if rng.random() < 0.88:
            phone = f"0{rng.randint(60, 89)}{rng.randint(1000000, 9999999)}"

        handicap_index = round(rng.uniform(2.1, 28.9), 1)
        handicap_sa_id = f"HSA{rng.randint(1000000, 9999999)}"
        handicap_number = f"HCP{rng.randint(100000, 999999)}"

        active = 1 if rng.random() < 0.93 else 0

        members.append(
            models.Member(
                club_id=int(club_id),
                member_number=member_number,
                first_name=first,
                last_name=last,
                email=email,
                phone=phone,
                handicap_number=handicap_number,
                home_club="Umhlali Country Club",
                active=active,
                gender=gender,
                player_category=cat,
                student=student,
                handicap_index=handicap_index,
                handicap_sa_id=handicap_sa_id,
            )
        )

    db.add_all(members)
    db.commit()

    out: list[SeedMember] = []
    for m in members:
        out.append(
            SeedMember(
                id=int(m.id),
                first_name=m.first_name,
                last_name=m.last_name,
                email=m.email,
                gender=getattr(m, "gender", None),
                player_category=getattr(m, "player_category", None),
                student=getattr(m, "student", None),
                handicap_index=float(getattr(m, "handicap_index", None)) if getattr(m, "handicap_index", None) is not None else None,
                handicap_sa_id=getattr(m, "handicap_sa_id", None),
                handicap_number=getattr(m, "handicap_number", None),
            )
        )
    return out


def _seed_member_player_accounts(db, *, club_id: int, members: list[SeedMember], rng: random.Random) -> list[DemoCredentials]:
    """
    Create a subset of "player" login accounts linked to seeded members (same email).
    """
    from app.auth import get_password_hash
    from app.models import User, UserRole

    password = "Player123!"
    candidates = [m for m in members if m.email]
    rng.shuffle(candidates)
    take = max(10, min(60, int(len(candidates) * 0.25)))

    creds: list[DemoCredentials] = []
    for m in candidates[:take]:
        assert m.email
        email = m.email.strip().lower()
        existing = _find_user_by_email_global(db, email)
        if existing:
            if existing.role in {UserRole.admin, UserRole.super_admin, UserRole.club_staff}:
                continue
            existing.name = f"{m.first_name} {m.last_name}".strip()
            existing.role = UserRole.player
            existing.club_id = int(club_id)
            if _env_truthy("GREENLINK_SEED_FORCE_RESET_PASSWORDS"):
                existing.password = get_password_hash(password)
        else:
            db.add(
                User(
                    name=f"{m.first_name} {m.last_name}".strip(),
                    email=email,
                    password=get_password_hash(password),
                    role=UserRole.player,
                    club_id=int(club_id),
                    phone=None,
                    account_type="member",
                    handicap_number=m.handicap_number,
                    handicap_sa_id=m.handicap_sa_id,
                    home_course="Umhlali Country Club",
                    gender=m.gender,
                    player_category=m.player_category,
                    student=m.student,
                    handicap_index=m.handicap_index,
                )
            )
            creds.append(DemoCredentials(email=email, password=password, role="player"))

    db.commit()
    return creds


def _iter_feb_2026_days() -> Iterable[date]:
    d = date(2026, 2, 1)
    end = date(2026, 2, 28)
    while d <= end:
        yield d
        d = d + timedelta(days=1)


def _seed_tee_times(db, *, club_id: int) -> int:
    from app.models import TeeTime

    tee_ids = ["1", "10"]
    created = 0
    rows: list[TeeTime] = []
    for d in _iter_feb_2026_days():
        t = _dt(d, 6, 0)
        end = _dt(d, 16, 0)
        while t <= end:
            for tee in tee_ids:
                rows.append(TeeTime(club_id=int(club_id), tee_time=t, hole=tee, capacity=4, status="open"))
                created += 1
            t = t + timedelta(minutes=10)

    db.add_all(rows)
    db.commit()
    return int(created)


def _choose_slots_per_time(rng: random.Random, *, is_weekend: bool, hour: int) -> int:
    if is_weekend:
        weights = [0.10, 0.16, 0.24, 0.26, 0.24]
    else:
        weights = [0.30, 0.30, 0.20, 0.15, 0.05]

    n = rng.choices([0, 1, 2, 3, 4], weights=weights, k=1)[0]
    if hour < 8:
        n = min(4, n + 1)
    if hour >= 15:
        n = max(0, n - 1)
    return int(n)


def _status_for_seed_date(rng: random.Random, *, tee_dt: datetime, anchor_today: date) -> str:
    d = tee_dt.date()
    if d < anchor_today:
        return rng.choices(
            ["completed", "checked_in", "no_show", "cancelled"],
            weights=[0.66, 0.22, 0.06, 0.06],
            k=1,
        )[0]

    if d > anchor_today:
        return rng.choices(["booked", "cancelled"], weights=[0.92, 0.08], k=1)[0]

    # Today: earlier slots more likely paid.
    if tee_dt.hour <= 9:
        weights = [0.25, 0.35, 0.30, 0.05, 0.05]
        choices = ["completed", "checked_in", "booked", "cancelled", "no_show"]
    elif tee_dt.hour <= 12:
        weights = [0.15, 0.35, 0.40, 0.05, 0.05]
        choices = ["completed", "checked_in", "booked", "cancelled", "no_show"]
    else:
        weights = [0.08, 0.22, 0.60, 0.05, 0.05]
        choices = ["completed", "checked_in", "booked", "cancelled", "no_show"]
    return rng.choices(choices, weights=weights, k=1)[0]


def _pick_holes(rng: random.Random, *, tee_dt: datetime) -> int:
    if tee_dt.hour >= 14:
        return 9 if rng.random() < 0.35 else 18
    return 9 if rng.random() < 0.10 else 18


def _pick_addons(rng: random.Random, *, player_type: str, is_weekend: bool) -> tuple[bool, bool, bool]:
    cart_p = 0.22 if player_type == "member" else 0.40
    if is_weekend:
        cart_p += 0.08
    cart = rng.random() < cart_p
    push_cart = (not cart) and (rng.random() < (0.10 if player_type == "member" else 0.06))
    caddy = rng.random() < (0.02 if is_weekend else 0.01)
    return bool(cart), bool(push_cart), bool(caddy)


def _pick_guest_type(rng: random.Random) -> str:
    return rng.choices(
        ["visitor", "non_affiliated", "reciprocity"],
        weights=[0.68, 0.22, 0.10],
        k=1,
    )[0]


def _pick_home_club(rng: random.Random, *, guest_type: str) -> str | None:
    if guest_type == "non_affiliated":
        return None
    if guest_type == "reciprocity":
        return rng.choice(["Selborne Golf Club", "Zimbali Country Club", "Prince's Grant", "Royal Durban"])
    return rng.choice(
        [
            "Durban Country Club",
            "Kloof Country Club",
            "Royal Durban",
            "Mount Edgecombe",
            "Zimbali Country Club",
            "Simbithi Country Club",
            "Cotswold Downs",
        ]
    )


def _pick_payment_method(rng: random.Random, *, source: str) -> str:
    if source == "external":
        return rng.choices(["ONLINE", "CARD", "EFT"], weights=[0.60, 0.25, 0.15], k=1)[0]
    return rng.choices(["CARD", "CASH", "EFT", "ONLINE"], weights=[0.45, 0.20, 0.20, 0.15], k=1)[0]


def _seed_bookings_and_finance(
    db,
    *,
    club_id: int,
    members: list[SeedMember],
    staff_user_ids: list[int],
    rng: random.Random,
) -> dict:
    from sqlalchemy import and_, or_
    from app import models
    from app.fee_models import FeeCategory, FeeType
    from app.pricing import PricingContext, normalize_gender, normalize_player_type, select_best_fee_from_list

    anchor_today = date(2026, 2, 23)

    fees = (
        db.query(FeeCategory)
        .filter(
            FeeCategory.active == 1,
            or_(FeeCategory.club_id == int(club_id), FeeCategory.club_id.is_(None)),
        )
        .all()
    )
    fees_by_type: dict[FeeType, list[FeeCategory]] = {}
    for fee in fees:
        try:
            fees_by_type.setdefault(FeeType(fee.fee_type), []).append(fee)  # type: ignore[arg-type]
        except Exception:
            continue

    def best_fee(fee_type: FeeType, *, tee_time: datetime, player_type: str, gender: str | None, holes: int) -> FeeCategory | None:
        ctx = PricingContext(
            fee_type=fee_type,
            tee_time=tee_time,
            player_type=normalize_player_type(player_type),
            gender=normalize_gender(gender),
            holes=holes,
            age=None,
        )
        return select_best_fee_from_list(fees_by_type.get(fee_type, []), ctx)

    # Import batches for "data freshness" and parallel-run visibility.
    bookings_seed_batch = models.ImportBatch(
        club_id=int(club_id),
        kind="bookings",
        source="seed",
        file_name="umhlali_feb_2026_seed_bookings.csv",
        sha256=None,
        imported_at=_dt(anchor_today, 5, 10),
        rows_total=0,
        rows_inserted=0,
        rows_updated=0,
        rows_failed=0,
        notes="Local demo seed (February 2026).",
    )
    golfscape_batch = models.ImportBatch(
        club_id=int(club_id),
        kind="bookings",
        source="golfscape",
        file_name="golfscape_feb_2026_export.csv",
        sha256=None,
        imported_at=_dt(anchor_today, 5, 25),
        rows_total=0,
        rows_inserted=0,
        rows_updated=0,
        rows_failed=0,
        notes="Simulated external provider import for parallel run testing.",
    )
    members_batch = models.ImportBatch(
        club_id=int(club_id),
        kind="members",
        source="hna",
        file_name="hna_members_feb_2026.csv",
        sha256=None,
        imported_at=_dt(date(2026, 2, 1), 6, 30),
        rows_total=0,
        rows_inserted=0,
        rows_updated=0,
        rows_failed=0,
        notes="Simulated monthly member export.",
    )
    db.add_all([bookings_seed_batch, golfscape_batch, members_batch])
    db.commit()

    guest_first = [
        "Aiden",
        "Ben",
        "Chris",
        "Dylan",
        "Evan",
        "Franco",
        "Gareth",
        "Hugo",
        "Ian",
        "Jared",
        "Kurt",
        "Leon",
        "Megan",
        "Nina",
        "Olga",
        "Paula",
        "Quentin",
        "Ravi",
        "Sasha",
        "Tanya",
    ]
    guest_last = [
        "Ngcobo",
        "Khanyile",
        "Maharaj",
        "Singh",
        "Roberts",
        "Young",
        "Clark",
        "Wright",
        "Scott",
        "Baker",
        "Adams",
        "Nel",
        "De Kock",
        "Du Plessis",
        "Mokoena",
        "Zuma",
    ]

    def pick_member_booking_share(tee_dt: datetime) -> float:
        is_weekend = tee_dt.weekday() >= 5
        if tee_dt.hour < 9:
            return 0.76 if not is_weekend else 0.62
        if tee_dt.hour < 13:
            return 0.68 if not is_weekend else 0.55
        return 0.58 if not is_weekend else 0.48

    start = _dt(date(2026, 2, 1), 0, 0)
    end = _dt(date(2026, 3, 1), 0, 0)
    tee_times = (
        db.query(models.TeeTime)
        .filter(and_(models.TeeTime.club_id == int(club_id), models.TeeTime.tee_time >= start, models.TeeTime.tee_time < end))
        .order_by(models.TeeTime.tee_time.asc(), models.TeeTime.hole.asc())
        .all()
    )

    active_members = [m for m in members if True]

    created_bookings = 0
    created_paid = 0
    created_rounds = 0
    created_ledger = 0
    external_row_counter = 1

    day_start_idx = 0
    while day_start_idx < len(tee_times):
        day = tee_times[day_start_idx].tee_time.date()
        day_end_idx = day_start_idx
        while day_end_idx < len(tee_times) and tee_times[day_end_idx].tee_time.date() == day:
            day_end_idx += 1
        day_rows = tee_times[day_start_idx:day_end_idx]

        # Progress logging (important for hosted DB runs where this step can take several minutes).
        print(f"[SEED] bookings: {day.isoformat()} tee_times={len(day_rows)} ...")

        bookings_to_add: list[models.Booking] = []
        day_bookings = 0
        day_rounds = 0

        for tt in day_rows:
            tee_dt = tt.tee_time
            is_weekend = tee_dt.weekday() >= 5
            slots = _choose_slots_per_time(rng, is_weekend=is_weekend, hour=int(tee_dt.hour))
            if slots <= 0:
                continue

            for _slot in range(slots):
                is_member = rng.random() < pick_member_booking_share(tee_dt)
                status_str = _status_for_seed_date(rng, tee_dt=tee_dt, anchor_today=anchor_today)
                holes = _pick_holes(rng, tee_dt=tee_dt)

                source = rng.choices(["proshop", "member", "external"], weights=[0.58, 0.30, 0.12], k=1)[0]
                if is_member and source == "external":
                    source = "member" if rng.random() < 0.25 else "proshop"

                created_by_user_id = rng.choice(staff_user_ids) if staff_user_ids else None

                if is_member:
                    m = rng.choice(active_members)
                    player_name = f"{m.first_name} {m.last_name}".strip()
                    player_email = (m.email or "").strip().lower() or None
                    member_id = int(m.id)
                    player_type = "member"
                    gender = m.gender
                    category = m.player_category
                    student = m.student
                    handicap_index = m.handicap_index
                    handicap_sa_id = m.handicap_sa_id
                    handicap_number = m.handicap_number
                    home_club = "Umhlali Country Club"
                else:
                    guest_type = _pick_guest_type(rng)
                    player_type = guest_type
                    gender = "male" if rng.random() < 0.68 else "female"
                    category = rng.choices(["adult", "pensioner", "student"], weights=[0.78, 0.16, 0.06], k=1)[0]
                    student = True if category == "student" else None
                    handicap_index = round(rng.uniform(4.2, 30.5), 1) if rng.random() < 0.80 else None
                    handicap_sa_id = f"HSA{rng.randint(1000000, 9999999)}" if rng.random() < 0.65 else None
                    handicap_number = f"HCP{rng.randint(100000, 999999)}" if rng.random() < 0.55 else None
                    home_club = _pick_home_club(rng, guest_type=guest_type)
                    player_name = f"{rng.choice(guest_first)} {rng.choice(guest_last)}".strip()
                    player_email = None
                    if rng.random() < 0.72:
                        player_email = f"guest{rng.randint(1000, 999999)}@example.com"
                    member_id = None

                cart, push_cart, caddy = _pick_addons(rng, player_type=player_type, is_weekend=is_weekend)

                golf_fee = best_fee(FeeType.GOLF, tee_time=tee_dt, player_type=player_type, gender=gender, holes=holes)
                base_price = float(golf_fee.price) if golf_fee else (340.0 if player_type == "member" else 575.0)
                fee_category_id = int(golf_fee.id) if golf_fee else None

                total_price = base_price
                if cart:
                    cart_fee = best_fee(FeeType.CART, tee_time=tee_dt, player_type=player_type, gender=None, holes=holes)
                    if cart_fee:
                        total_price += float(cart_fee.price)
                if push_cart:
                    pc_fee = best_fee(FeeType.PUSH_CART, tee_time=tee_dt, player_type=player_type, gender=None, holes=holes)
                    if pc_fee:
                        total_price += float(pc_fee.price)
                if caddy:
                    c_fee = best_fee(FeeType.CADDY, tee_time=tee_dt, player_type=player_type, gender=None, holes=holes)
                    if c_fee:
                        total_price += float(c_fee.price)

                prepaid = True if source == "external" else (rng.random() < 0.25)

                notes = None
                if rng.random() < 0.12:
                    notes = rng.choice(
                        [
                            "Early tee preferred.",
                            "Walking.",
                            "Please add to Saturday comp list.",
                            "Member guest rate applied.",
                            "Needs rental clubs.",
                        ]
                    )

                created_at = tee_dt - timedelta(days=rng.randint(0, 10), hours=rng.randint(0, 6))
                created_at = _clamp_dt(created_at, _dt(date(2026, 2, 1), 0, 0), _dt(date(2026, 2, 28), 23, 59))

                external_provider = None
                external_booking_id = None
                external_group_id = None
                external_row_id = None
                mirrored_at = None
                import_batch_id = None
                if source == "external":
                    external_provider = "golfscape"
                    external_booking_id = f"GS-FEB26-{day.strftime('%Y%m%d')}-{rng.randint(100, 999)}"
                    external_group_id = external_booking_id
                    external_row_id = f"GSROW-{day.strftime('%Y%m%d')}-{external_row_counter:06d}"
                    external_row_counter += 1
                    mirrored_at = tee_dt - timedelta(days=rng.randint(0, 2))
                    import_batch_id = int(golfscape_batch.id)

                b = models.Booking(
                    club_id=int(club_id),
                    tee_time_id=int(tt.id),
                    member_id=member_id,
                    created_by_user_id=created_by_user_id,
                    player_name=player_name,
                    player_email=player_email,
                    club_card=None,
                    handicap_number=handicap_number,
                    greenlink_id=None,
                    source=getattr(models.BookingSource, source),
                    external_provider=external_provider,
                    external_booking_id=external_booking_id,
                    external_group_id=external_group_id,
                    external_row_id=external_row_id,
                    party_size=1,
                    fee_category_id=fee_category_id,
                    price=float(round(total_price, 2)),
                    status=getattr(models.BookingStatus, status_str),
                    player_type=player_type,
                    holes=holes,
                    prepaid=prepaid,
                    gender=gender,
                    player_category=category,
                    handicap_sa_id=handicap_sa_id,
                    home_club=home_club,
                    handicap_index_at_booking=handicap_index,
                    handicap_index_at_play=handicap_index if status_str in {"checked_in", "completed"} else None,
                    cart=cart,
                    push_cart=push_cart,
                    caddy=caddy,
                    notes=notes,
                    mirrored_at=mirrored_at,
                    capacity_conflict=False,
                    import_batch_id=import_batch_id,
                    created_at=created_at,
                )

                if status_str in {"checked_in", "completed"} and rng.random() < (0.65 if holes == 18 else 0.40):
                    scores = {
                        "holes": holes,
                        "gross": rng.randint(78, 116) if holes == 18 else rng.randint(36, 60),
                        "net": rng.randint(70, 104) if holes == 18 else rng.randint(32, 54),
                    }
                    b.round = models.Round(
                        scores_json=str(scores).replace("'", '"'),
                        handicap_sa_round_id=None,
                        handicap_synced=0,
                        closed=1 if status_str == "completed" else 0,
                        created_at=tee_dt + timedelta(hours=2),
                    )
                    created_rounds += 1
                    day_rounds += 1

                bookings_to_add.append(b)
                created_bookings += 1
                day_bookings += 1

        if bookings_to_add:
            db.add_all(bookings_to_add)
            db.flush()

            ledger_rows: list[models.LedgerEntry] = []
            day_paid = 0
            for b in bookings_to_add:
                raw_status = str(getattr(getattr(b, "status", None), "value", getattr(b, "status", None)) or "")
                if raw_status not in {"checked_in", "completed"}:
                    continue
                created_paid += 1
                day_paid += 1

                tee_dt = next((t.tee_time for t in day_rows if int(t.id) == int(b.tee_time_id)), _dt(day, 8, 0))
                pay_dt = tee_dt + timedelta(minutes=rng.randint(-20, 90))
                pay_dt = _clamp_dt(pay_dt, _dt(day, 5, 30), _dt(day, 19, 0))

                source_val = str(getattr(getattr(b, "source", None), "value", getattr(b, "source", None)) or "proshop")
                method = _pick_payment_method(rng, source=source_val)

                description = "Green fee"
                if b.fee_category_id:
                    fc = db.query(FeeCategory).filter(FeeCategory.id == int(b.fee_category_id)).first()
                    if fc and fc.description:
                        description = fc.description
                if bool(getattr(b, "cart", False)):
                    description = f"{description} + Cart"
                if bool(getattr(b, "push_cart", False)):
                    description = f"{description} + Push Cart"
                if bool(getattr(b, "caddy", False)):
                    description = f"{description} + Caddy"

                le = models.LedgerEntry(
                    club_id=int(club_id),
                    booking_id=int(b.id),
                    description=description,
                    amount=float(getattr(b, "price", 0.0) or 0.0),
                    pastel_synced=0,
                    pastel_transaction_id=None,
                    created_at=pay_dt,
                )
                le.meta = models.LedgerEntryMeta(payment_method=method, updated_at=pay_dt)
                ledger_rows.append(le)

            if ledger_rows:
                db.add_all(ledger_rows)
                created_ledger += len(ledger_rows)

            db.commit()
            print(
                f"[SEED] bookings: {day.isoformat()} created={day_bookings} paid={day_paid} "
                f"ledger={len(ledger_rows)} rounds={day_rounds}"
            )
        else:
            print(f"[SEED] bookings: {day.isoformat()} created=0 (no slots chosen)")

        day_start_idx = day_end_idx

    # Update batch counts (best-effort).
    try:
        bookings_seed_batch.rows_total = int(created_bookings)
        bookings_seed_batch.rows_inserted = int(created_bookings)
        golfscape_batch.rows_total = int(external_row_counter - 1)
        golfscape_batch.rows_inserted = int(external_row_counter - 1)
        members_batch.rows_total = int(len(members))
        members_batch.rows_inserted = int(len(members))
        db.commit()
    except Exception:
        pass

    return {
        "bookings": int(created_bookings),
        "paid_bookings": int(created_paid),
        "ledger_entries": int(created_ledger),
        "rounds": int(created_rounds),
        "import_batches": 3,
    }


def _seed_other_revenue(db, *, club_id: int, rng: random.Random) -> int:
    from app import models

    rev_batch = models.ImportBatch(
        club_id=int(club_id),
        kind="revenue",
        source="seed",
        file_name="umhlali_feb_2026_revenue.csv",
        sha256=None,
        imported_at=_dt(date(2026, 2, 28), 18, 15),
        rows_total=0,
        rows_inserted=0,
        rows_updated=0,
        rows_failed=0,
        notes="Seeded operational revenue streams (pub/bowls/other).",
    )
    db.add(rev_batch)
    db.commit()
    db.refresh(rev_batch)

    streams = [
        ("pub", [("Bar sales", 420.0), ("Kitchen sales", 260.0), ("Functions", 850.0)]),
        ("bowls", [("Green fees", 110.0), ("Competition", 180.0)]),
        ("other", [("Pro shop (non-golf)", 75.0), ("Other income", 55.0)]),
    ]

    rows: list[models.RevenueTransaction] = []
    total = 0
    for d in _iter_feb_2026_days():
        day_key = d.strftime("%Y%m%d")
        for source, items in streams:
            for i, (desc, base) in enumerate(items, start=1):
                jitter = rng.uniform(-0.12, 0.18)
                amount = round(float(base) * (1.0 + jitter), 2)
                ext_id = f"UMH-{source.upper()}-{day_key}-{i:02d}"
                rows.append(
                    models.RevenueTransaction(
                        club_id=int(club_id),
                        source=source,
                        transaction_date=d,
                        external_id=ext_id,
                        description=desc,
                        category=source,
                        amount=float(amount),
                        import_batch_id=int(rev_batch.id),
                        created_at=_dt(d, 18, 30),
                    )
                )
                total += 1

    db.add_all(rows)
    rev_batch.rows_total = int(total)
    rev_batch.rows_inserted = int(total)
    db.commit()
    return int(total)


def _seed_day_closures(db, *, club_id: int, rng: random.Random) -> int:
    from sqlalchemy import func
    from app import models

    closer = (
        db.query(models.User)
        .filter(models.User.club_id == int(club_id), models.User.role == models.UserRole.club_staff)
        .order_by(func.random())
        .first()
    )
    closer_id = int(getattr(closer, "id", 0) or 0) or None

    rows: list[models.DayClose] = []
    closed = 0
    for d in _iter_feb_2026_days():
        if d >= date(2026, 2, 21):
            continue
        if rng.random() < 0.10:
            continue

        rows.append(
            models.DayClose(
                club_id=int(club_id),
                close_date=d,
                status="closed",
                closed_by_user_id=closer_id,
                closed_at=_dt(d, 18, rng.randint(0, 40)),
                reopened_by_user_id=None,
                reopened_at=None,
                export_method="cashbook",
                export_batch_id=f"BATCH-{d.strftime('%Y%m%d')}",
                export_filename=f"cashbook_{d.strftime('%Y%m%d')}.xlsx",
                auto_push=1 if rng.random() < 0.35 else 0,
            )
        )
        closed += 1

    if rows:
        db.add_all(rows)
        db.commit()
    return int(closed)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--db",
        default="sqlite:///./greenlink.dev.v2.db",
        help="SQLAlchemy DB URL. Default matches dev.ps1 (sqlite:///./greenlink.dev.v2.db).",
    )
    parser.add_argument("--club-slug", default="umhlali")
    parser.add_argument("--club-name", default="Umhlali Country Club")
    parser.add_argument("--members", type=int, default=240)
    parser.add_argument("--seed", type=int, default=20260223)
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt (destructive).")
    args = parser.parse_args(argv)

    # Ensure relative paths (like sqlite:///./...) resolve the same way as dev.ps1.
    os.chdir(Path(__file__).resolve().parent)
    _configure_db(str(args.db))

    from app.database import Base, SessionLocal, engine
    from app.models import User, UserRole

    # Ensure tables exist.
    _sqlite_fix_bigint_autoinc_tables(engine)
    Base.metadata.create_all(bind=engine)

    rng = random.Random(int(args.seed))

    with SessionLocal() as db:
        club_id = _get_or_create_club(db, club_name=str(args.club_name), club_slug=str(args.club_slug))
        db.info["club_id"] = int(club_id)

        _print_counts(db, club_id, label="BEFORE")
        _confirm_or_exit(
            f"\nThis will DELETE and recreate ALL club data for '{args.club_slug}' (club_id={club_id})\n"
            "for February 2026, keeping only users with role=admin/super_admin.\n",
            assume_yes=bool(args.yes),
        )

        _wipe_club_data(db, club_id)
        db.commit()

        _seed_core_settings(db, club_id=club_id)
        _ensure_fee_categories(db)

        admin_creds = _ensure_admin_users(db, club_id=club_id)
        staff_creds = _seed_staff_users(db, club_id=club_id)

        members = _seed_members(db, club_id=club_id, count=int(args.members), rng=rng)
        player_creds = _seed_member_player_accounts(db, club_id=club_id, members=members, rng=rng)

        tee_created = _seed_tee_times(db, club_id=club_id)

        staff_user_ids = [
            int(u_id)
            for (u_id,) in db.query(User.id)
            .filter(User.club_id == int(club_id), User.role == UserRole.club_staff)
            .all()
        ]

        booking_stats = _seed_bookings_and_finance(
            db,
            club_id=club_id,
            members=members,
            staff_user_ids=staff_user_ids,
            rng=rng,
        )

        other_rev = _seed_other_revenue(db, club_id=club_id, rng=rng)
        day_closures = _seed_day_closures(db, club_id=club_id, rng=rng)

        _print_counts(db, club_id, label="AFTER")

    print("\nDemo logins (local-dev defaults):")
    for c in admin_creds + staff_creds:
        print(f"  - {c.role}: {c.email}  /  {c.password}")
    if player_creds:
        print(f"  - player (example): {player_creds[0].email}  /  {player_creds[0].password}  (+{len(player_creds)-1} more)")

    print("\nSeed summary:")
    print(f"  - members: {len(members)}")
    print(f"  - tee_times (Feb 2026): {tee_created}")
    print(f"  - bookings: {booking_stats.get('bookings')}")
    print(f"  - paid bookings: {booking_stats.get('paid_bookings')}")
    print(f"  - ledger entries: {booking_stats.get('ledger_entries')}")
    print(f"  - rounds: {booking_stats.get('rounds')}")
    print(f"  - other revenue txns: {other_rev}")
    print(f"  - day closures: {day_closures}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
