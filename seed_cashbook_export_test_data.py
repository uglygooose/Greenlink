"""
Seed Cashbook Export test data (local/dev).

Creates a mix of:
- historical, current, and future tee times / bookings
- paid bookings (checked_in/completed) with ledger entries dated to the *payment date*
- payment methods: CARD / CASH / EFT / ONLINE
- member + visitor / non_affiliated snapshots
- fee types (golf/cart/competition/other) when fee categories are available

This is intentionally a script (not an API) so it can be used safely on a local machine.
"""

from __future__ import annotations

import argparse
import random
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app import models

try:
    from app.fee_models import FeeCategory, FeeType
except Exception:  # pragma: no cover
    FeeCategory = None  # type: ignore
    FeeType = None  # type: ignore


PAYMENT_METHODS = ("CARD", "CASH", "EFT", "ONLINE")

def _utcnow_naive() -> datetime:
    # Store naive UTC timestamps (DB columns are TIMESTAMP WITHOUT TIME ZONE).
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _dt(d: date, hh: int, mm: int) -> datetime:
    return datetime.combine(d, time(hour=hh, minute=mm))


def _get_or_create_member(db: Session, member_number: str, first: str, last: str, email: str) -> models.Member:
    m = db.query(models.Member).filter(models.Member.member_number == member_number).first()
    if m:
        return m
    m = models.Member(
        member_number=member_number,
        first_name=first,
        last_name=last,
        email=email,
        active=1,
        handicap_number=None,
        home_club="Test Club",
    )
    db.add(m)
    db.flush()
    return m


def _get_or_create_fee_category(
    db: Session,
    code: int,
    description: str,
    price: float,
    fee_type: str,
    audience: str | None = None,
    holes: int | None = None,
) -> int | None:
    if FeeCategory is None:
        return None
    existing = db.query(FeeCategory).filter(FeeCategory.code == code).first()
    if existing:
        return int(existing.id)

    try:
        ft = FeeType(fee_type)  # type: ignore[misc]
    except Exception:
        ft = FeeType.GOLF  # type: ignore[assignment]

    fc = FeeCategory(  # type: ignore[misc]
        code=code,
        description=description,
        price=price,
        fee_type=ft,
        active=1,
        audience=audience,
        holes=holes,
        priority=0,
    )
    db.add(fc)
    db.flush()
    return int(fc.id)


def _get_or_create_tee_time(db: Session, when: datetime, hole: str) -> models.TeeTime:
    existing = (
        db.query(models.TeeTime)
        .filter(models.TeeTime.tee_time == when, models.TeeTime.hole == hole)
        .first()
    )
    if existing:
        return existing
    tt = models.TeeTime(tee_time=when, hole=hole, capacity=4, status="open")
    db.add(tt)
    db.flush()
    return tt


def _seed_booking_with_payment(
    db: Session,
    *,
    tee_time: models.TeeTime,
    player_name: str,
    player_email: str,
    member_id: int | None,
    player_type: str,
    fee_category_id: int | None,
    price: float,
    booking_status: models.BookingStatus,
    holes: int,
    payment_method: str,
    payment_dt: datetime,
    seed_key: str,
) -> tuple[models.Booking, models.LedgerEntry]:
    # Idempotency: use external_provider/id to avoid duplicates on re-run.
    existing = (
        db.query(models.Booking)
        .filter(
            models.Booking.external_provider == "seed",
            models.Booking.external_booking_id == seed_key,
        )
        .first()
    )
    if existing:
        le = db.query(models.LedgerEntry).filter(models.LedgerEntry.booking_id == existing.id).first()
        if not le:
            le = models.LedgerEntry(booking_id=existing.id, description="Seed payment", amount=price, created_at=payment_dt)
            db.add(le)
            db.flush()
        meta = db.query(models.LedgerEntryMeta).filter(models.LedgerEntryMeta.ledger_entry_id == le.id).first()
        if not meta:
            db.add(models.LedgerEntryMeta(ledger_entry_id=le.id, payment_method=payment_method, updated_at=payment_dt))
        else:
            if not (meta.payment_method or "").strip():
                meta.payment_method = payment_method
            meta.updated_at = _utcnow_naive()
        return existing, le

    b = models.Booking(
        tee_time_id=tee_time.id,
        member_id=member_id,
        created_by_user_id=None,
        player_name=player_name,
        player_email=player_email,
        club_card=None,
        handicap_number=None,
        greenlink_id=None,
        source=models.BookingSource.proshop if not member_id else models.BookingSource.member,
        external_provider="seed",
        external_booking_id=seed_key,
        party_size=1,
        fee_category_id=fee_category_id,
        price=float(price),
        status=booking_status,
        player_type=player_type,
        holes=holes,
        prepaid=True,
        gender=None,
        player_category=None,
        handicap_sa_id=None,
        home_club="Test Club",
        handicap_index_at_booking=None,
        handicap_index_at_play=None,
        cart=False,
        push_cart=False,
        caddy=False,
        notes=f"Seeded booking for export testing ({seed_key})",
        created_at=_utcnow_naive(),
    )
    db.add(b)
    db.flush()

    le = models.LedgerEntry(
        booking_id=b.id,
        description=f"Seed payment {player_name}",
        amount=float(price),
        pastel_synced=0,
        pastel_transaction_id=None,
        created_at=payment_dt,
    )
    db.add(le)
    db.flush()

    meta = models.LedgerEntryMeta(
        ledger_entry_id=le.id,
        payment_method=(payment_method or "").strip().upper() or None,
        updated_at=payment_dt,
    )
    db.add(meta)
    return b, le


@dataclass(frozen=True)
class SeedScenario:
    label: str
    method: str
    fee_type: str
    player_type: str
    is_member: bool
    holes: int
    status: models.BookingStatus
    price: float


def backfill_missing_payment_methods(
    db: Session,
    *,
    default_method: str,
    days_back: int,
) -> dict:
    default_method = (default_method or "").strip().upper() or "CARD"
    cutoff = _utcnow_naive() - timedelta(days=max(0, int(days_back)))

    rows = (
        db.query(models.LedgerEntry, models.LedgerEntryMeta)
        .outerjoin(models.LedgerEntryMeta, models.LedgerEntryMeta.ledger_entry_id == models.LedgerEntry.id)
        .filter(models.LedgerEntry.created_at >= cutoff, models.LedgerEntry.booking_id.isnot(None))
        .all()
    )

    fixed = 0
    touched_booking_ids: list[int] = []
    for le, meta in rows:
        # Guard against duplicate adds in the same session (autoflush is disabled in SessionLocal).
        if db.get(models.LedgerEntryMeta, le.id) is not None:
            meta = db.get(models.LedgerEntryMeta, le.id)
        if meta and (meta.payment_method or "").strip():
            continue
        if not meta:
            meta = models.LedgerEntryMeta(ledger_entry_id=le.id, payment_method=default_method, updated_at=_utcnow_naive())
            db.add(meta)
        else:
            meta.payment_method = default_method
            meta.updated_at = _utcnow_naive()
        fixed += 1
        if le.booking_id:
            touched_booking_ids.append(int(le.booking_id))

    return {"fixed": fixed, "booking_ids": sorted(set(touched_booking_ids))[:50]}


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--payment-date", help="Payment date to seed (YYYY-MM-DD). Default: today.")
    p.add_argument("--include-historical-days", type=int, default=3, help="Also seed payment dates N days back.")
    p.add_argument("--include-future-tee-days", type=int, default=14, help="Create some future tee times paid on the payment date.")
    p.add_argument("--seed-count", type=int, default=12, help="How many paid bookings to create for the main payment date.")
    p.add_argument("--backfill-missing-payment-methods", action="store_true", help="Backfill missing LedgerEntryMeta.payment_method for recent ledger entries.")
    p.add_argument("--backfill-days", type=int, default=60, help="How far back to backfill (days).")
    p.add_argument("--backfill-default", default="CARD", help="Default payment method used for backfill.")
    args = p.parse_args(argv)

    if args.payment_date:
        try:
            pay_date = datetime.strptime(args.payment_date, "%Y-%m-%d").date()
        except ValueError:
            print("Invalid --payment-date. Use YYYY-MM-DD.", file=sys.stderr)
            return 2
    else:
        pay_date = date.today()

    scenarios: list[SeedScenario] = [
        SeedScenario("member_golf_card", "CARD", "golf", "member", True, 18, models.BookingStatus.checked_in, 350.0),
        SeedScenario("visitor_golf_cash", "CASH", "golf", "visitor", False, 18, models.BookingStatus.checked_in, 450.0),
        SeedScenario("nonaff_golf_eft", "EFT", "golf", "non_affiliated", False, 18, models.BookingStatus.completed, 520.0),
        SeedScenario("visitor_comp_online", "ONLINE", "competition", "visitor", False, 18, models.BookingStatus.checked_in, 200.0),
        SeedScenario("member_cart_card", "CARD", "cart", "member", True, 18, models.BookingStatus.checked_in, 120.0),
        SeedScenario("visitor_other_eft", "EFT", "other", "visitor", False, 9, models.BookingStatus.checked_in, 80.0),
    ]

    random.shuffle(scenarios)

    created = 0
    created_keys: list[str] = []
    fee_ids: dict[str, int | None] = {}

    with SessionLocal() as db:
        # Ensure some fee categories exist for variety (only if fee table is present).
        fee_ids["golf"] = _get_or_create_fee_category(db, 9001, "Seed: Green Fee (Golf)", 350.0, "golf", audience="visitor", holes=18)
        fee_ids["cart"] = _get_or_create_fee_category(db, 9002, "Seed: Cart Hire", 120.0, "cart", audience="visitor", holes=18)
        fee_ids["competition"] = _get_or_create_fee_category(db, 9003, "Seed: Competition Fee", 200.0, "competition", audience="visitor", holes=18)
        fee_ids["other"] = _get_or_create_fee_category(db, 9004, "Seed: Other", 80.0, "other", audience="visitor", holes=9)

        # Seed some members.
        m1 = _get_or_create_member(db, "M-1001", "Alice", "Member", "alice.member@example.com")
        m2 = _get_or_create_member(db, "M-1002", "Bob", "Member", "bob.member@example.com")

        db.commit()

        def seed_for_payment_date(d: date, n: int) -> None:
            nonlocal created
            base_payment_dt = _dt(d, 12, 0)
            tee_day_today = d
            tee_day_future = d + timedelta(days=max(1, int(args.include_future_tee_days)))

            for i in range(n):
                sc = scenarios[i % len(scenarios)]
                method = sc.method

                # Alternate between Tee 1 and Tee 10 to cover both.
                hole = "1" if i % 2 == 0 else "10"
                tee_day = tee_day_today if i % 4 != 3 else tee_day_future  # every 4th booking: future tee-time paid today
                tee_when = _dt(tee_day, 8 + (i % 6), (i % 2) * 10)
                tt = _get_or_create_tee_time(db, tee_when, hole)

                is_member = sc.is_member
                member_id = (m1.id if i % 3 == 0 else m2.id) if is_member else None
                player_type = sc.player_type

                name = f"{player_type.title()} Player {i+1}"
                email = f"seed.{player_type}.{d.strftime('%Y%m%d')}.{i+1}@example.com"
                fee_category_id = fee_ids.get(sc.fee_type)
                payment_dt = base_payment_dt + timedelta(minutes=i)

                seed_key = f"CASHBOOK_EXPORT_{d.strftime('%Y%m%d')}_{i+1}_{sc.label}"
                b, le = _seed_booking_with_payment(
                    db,
                    tee_time=tt,
                    player_name=name,
                    player_email=email,
                    member_id=member_id,
                    player_type=player_type,
                    fee_category_id=fee_category_id,
                    price=sc.price,
                    booking_status=sc.status,
                    holes=sc.holes,
                    payment_method=method,
                    payment_dt=payment_dt,
                    seed_key=seed_key,
                )
                created += 1
                created_keys.append(seed_key)

                # Add a couple of non-paid bookings (should not export).
                if i == 0:
                    b2 = models.Booking(
                        tee_time_id=tt.id,
                        member_id=None,
                        created_by_user_id=None,
                        player_name="Booked Not Paid",
                        player_email=f"seed.unpaid.{d.strftime('%Y%m%d')}@example.com",
                        source=models.BookingSource.proshop,
                        external_provider="seed",
                        external_booking_id=f"CASHBOOK_UNPAID_{d.strftime('%Y%m%d')}",
                        party_size=1,
                        fee_category_id=fee_ids.get("golf"),
                        price=350.0,
                        status=models.BookingStatus.booked,
                        player_type="visitor",
                        holes=18,
                        prepaid=False,
                        notes="Seeded unpaid booking (should not export)",
                        created_at=_utcnow_naive(),
                    )
                    db.add(b2)

                if i == 1:
                    b3 = models.Booking(
                        tee_time_id=tt.id,
                        member_id=None,
                        created_by_user_id=None,
                        player_name="Cancelled",
                        player_email=f"seed.cancelled.{d.strftime('%Y%m%d')}@example.com",
                        source=models.BookingSource.proshop,
                        external_provider="seed",
                        external_booking_id=f"CASHBOOK_CANCELLED_{d.strftime('%Y%m%d')}",
                        party_size=1,
                        fee_category_id=fee_ids.get("golf"),
                        price=350.0,
                        status=models.BookingStatus.cancelled,
                        player_type="visitor",
                        holes=18,
                        prepaid=False,
                        notes="Seeded cancelled booking (should not export)",
                        created_at=_utcnow_naive(),
                    )
                    db.add(b3)

        # Main payment date (used by your export screen).
        seed_for_payment_date(pay_date, max(1, int(args.seed_count)))

        # A few historical payment dates so you can pick them in the UI and export.
        for j in range(max(0, int(args.include_historical_days))):
            d = pay_date - timedelta(days=j + 1)
            seed_for_payment_date(d, max(2, int(args.seed_count // 3)))

        # Commit seeding first so the backfill run works on a clean, consistent DB state.
        db.commit()

        backfill_result = None
        if args.backfill_missing_payment_methods:
            backfill_result = backfill_missing_payment_methods(
                db,
                default_method=str(args.backfill_default),
                days_back=int(args.backfill_days),
            )
            db.commit()

    print(f"Seed complete: created/updated {created} paid booking(s).")
    if created_keys:
        print(f"Example seed key: {created_keys[0]}")
    print(f"Try exporting payment date: {pay_date.strftime('%Y-%m-%d')}")
    if args.include_historical_days:
        print(f"Also seeded historical payment dates: {', '.join([(pay_date - timedelta(days=i+1)).strftime('%Y-%m-%d') for i in range(int(args.include_historical_days))])}")
    if backfill_result:
        print(f"Backfilled missing payment methods: {backfill_result.get('fixed', 0)} ledger entry meta row(s).")
        if backfill_result.get("booking_ids"):
            print(f"Sample affected booking IDs: {', '.join(str(x) for x in backfill_result['booking_ids'])}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
