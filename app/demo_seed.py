from __future__ import annotations

import os
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app import models


def _env_true(key: str) -> bool:
    return str(os.getenv(key, "")).strip().lower() in {"1", "true", "yes", "y", "on"}


def _get_or_create_import_batch(db: Session, kind: str, source: str, imported_at: datetime) -> models.ImportBatch:
    row = (
        db.query(models.ImportBatch)
        .filter(models.ImportBatch.kind == kind, models.ImportBatch.source == source)
        .order_by(models.ImportBatch.imported_at.desc())
        .first()
    )
    if row:
        return row
    row = models.ImportBatch(kind=kind, source=source, imported_at=imported_at, rows_total=0, rows_inserted=0, rows_updated=0, rows_failed=0)
    db.add(row)
    db.flush()
    return row


def seed_imported_revenue_transactions(
    db: Session,
    days_back: int = 30,
    seed_golf: bool = True,
) -> dict:
    """
    Seed revenue_transactions for pub/bowls/other (+ optional golf) so the
    operational finance dashboards have meaningful data immediately.

    This is deterministic and safe to re-run due to (source, external_id) uniqueness.
    """
    today = date.today()
    start = today - timedelta(days=max(0, int(days_back)))

    streams = [
        ("pub", [("Bar sales", 450.0), ("Kitchen sales", 280.0), ("Functions", 900.0)]),
        ("bowls", [("Green fees", 120.0), ("Membership", 75.0), ("Competition", 200.0)]),
        ("other", [("Other income", 60.0)]),
    ]
    if seed_golf:
        streams.insert(0, ("golf", [("Green fees (imported)", 520.0), ("Cart hire (imported)", 120.0)]))

    now = datetime.utcnow()
    batch = _get_or_create_import_batch(db, kind="revenue", source="seed", imported_at=now - timedelta(minutes=15))

    inserted = 0
    updated = 0
    total = 0

    d = start
    while d <= today:
        day_key = d.strftime("%Y%m%d")
        for stream, items in streams:
            for i, (desc, base_amount) in enumerate(items, start=1):
                total += 1
                ext_id = f"DEMO-{stream.upper()}-{day_key}-{i:02d}"
                amount = float(base_amount)

                existing = (
                    db.query(models.RevenueTransaction)
                    .filter(models.RevenueTransaction.source == stream, models.RevenueTransaction.external_id == ext_id)
                    .first()
                )
                if existing:
                    existing.transaction_date = d
                    existing.amount = amount
                    existing.description = desc
                    existing.category = stream
                    existing.import_batch_id = batch.id
                    updated += 1
                else:
                    db.add(
                        models.RevenueTransaction(
                            source=stream,
                            transaction_date=d,
                            external_id=ext_id,
                            description=desc,
                            category=stream,
                            amount=amount,
                            import_batch_id=batch.id,
                            created_at=now,
                        )
                    )
                    inserted += 1
        d = d + timedelta(days=1)

    batch.rows_total = int(batch.rows_total or 0) + int(total)
    batch.rows_inserted = int(batch.rows_inserted or 0) + int(inserted)
    batch.rows_updated = int(batch.rows_updated or 0) + int(updated)
    batch.rows_failed = int(batch.rows_failed or 0)

    return {"rows_total": total, "inserted": inserted, "updated": updated, "batch_id": batch.id}


def seed_import_freshness_markers(db: Session) -> None:
    """
    Ensure the dashboard "Data Freshness" card isn't empty on fresh DBs.
    """
    now = datetime.utcnow()
    _get_or_create_import_batch(db, kind="bookings", source="seed", imported_at=now - timedelta(minutes=25))
    _get_or_create_import_batch(db, kind="members", source="seed", imported_at=now - timedelta(minutes=20))


def seed_demo_if_enabled() -> None:
    """
    Opt-in seeding for local demos.

    Env vars:
    - DEMO_SEED_DATA=1
    - DEMO_SEED_DATA_FORCE=1 (re-run even if data exists)
    """
    if not _env_true("DEMO_SEED_DATA"):
        return

    force = _env_true("DEMO_SEED_DATA_FORCE")

    from app.database import SessionLocal

    # Seed bookings/ledger via the existing script.
    try:
        with SessionLocal() as db:
            has_any_booking = bool(db.query(models.Booking.id).limit(1).first())
            has_any_revenue = bool(db.query(models.RevenueTransaction.id).limit(1).first())
            if (has_any_booking and has_any_revenue) and not force:
                return
    except Exception:
        # If DB isn't reachable, do nothing.
        return

    try:
        # NOTE: This script is part of the repo root (not app/), but it is importable when run via uvicorn.
        import seed_cashbook_export_test_data as cashbook_seed  # type: ignore

        today = date.today()
        seed_dates = ",".join(
            [
                (today - timedelta(days=2)).isoformat(),
                (today - timedelta(days=1)).isoformat(),
                today.isoformat(),
                (today + timedelta(days=1)).isoformat(),
                (today + timedelta(days=3)).isoformat(),
                (today + timedelta(days=7)).isoformat(),
            ]
        )
        argv = [
            "--include-historical-days",
            "7",
            "--include-future-tee-days",
            "14",
            "--seed-count",
            "18",
            "--seed-tee-dates",
            seed_dates,
            "--seed-tee-bookings-per-date",
            "10",
            "--backfill-missing-payment-methods",
            "--backfill-days",
            "120",
            "--backfill-default",
            "CARD",
        ]
        cashbook_seed.main(argv)
    except Exception as e:
        print(f"[DEMO_SEED] Booking/ledger seed skipped: {type(e).__name__}: {str(e)[:200]}")

    try:
        with SessionLocal() as db:
            seed_import_freshness_markers(db)
            seed_imported_revenue_transactions(db, days_back=30, seed_golf=True)
            db.commit()
    except Exception as e:
        print(f"[DEMO_SEED] Revenue/import seed failed: {type(e).__name__}: {str(e)[:200]}")

