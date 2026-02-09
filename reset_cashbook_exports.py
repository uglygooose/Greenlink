"""
Reset Pastel export flags for demo re-exports.

This clears:
- ledger_entries.pastel_synced
- ledger_entries.pastel_transaction_id

Optionally also reopens day closures (so you can demo "Close Day" again):
- day_closures.status -> "reopened"
- clears day_closures export batch/filename

Usage:
  python reset_cashbook_exports.py --date 2026-02-04 --date 2026-02-09
  python reset_cashbook_exports.py --from 2026-02-01 --to 2026-02-09
"""

from __future__ import annotations

import argparse
from datetime import date, datetime

from sqlalchemy import func

from app.database import SessionLocal
from app.models import DayClose, LedgerEntry


def _parse_ymd(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as e:
        raise SystemExit(f"Invalid date '{value}'. Use YYYY-MM-DD.") from e


def _unique_dates(dates: list[date]) -> list[date]:
    return sorted(set(dates))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--date", action="append", default=[], help="Payment date to reset (YYYY-MM-DD). Can be repeated.")
    p.add_argument("--from", dest="from_date", help="Start date (YYYY-MM-DD), inclusive.")
    p.add_argument("--to", dest="to_date", help="End date (YYYY-MM-DD), inclusive.")
    p.add_argument("--reopen-days", action="store_true", help="Also reopen day closures so Close Day can be demoed again.")
    p.add_argument("--dry-run", action="store_true", help="Show counts, but do not write changes.")
    args = p.parse_args()

    dates: list[date] = []
    if args.date:
        dates.extend([_parse_ymd(x) for x in args.date])

    if args.from_date or args.to_date:
        if not (args.from_date and args.to_date):
            raise SystemExit("When using --from/--to, provide both.")
        start = _parse_ymd(args.from_date)
        end = _parse_ymd(args.to_date)
        if end < start:
            raise SystemExit("--to must be >= --from")
        d = start
        while d <= end:
            dates.append(d)
            d = d.fromordinal(d.toordinal() + 1)

    dates = _unique_dates(dates)
    if not dates:
        raise SystemExit("Provide --date or --from/--to.")

    with SessionLocal() as db:
        total_reset = 0
        total_reopened = 0

        for d in dates:
            q = db.query(LedgerEntry).filter(func.date(LedgerEntry.created_at) == d)
            count = q.count()
            if count:
                q.update(
                    {
                        LedgerEntry.pastel_synced: 0,
                        LedgerEntry.pastel_transaction_id: None,
                    },
                    synchronize_session=False,
                )
            total_reset += count

            if args.reopen_days:
                close = db.query(DayClose).filter(DayClose.close_date == d).first()
                if close:
                    close.status = "reopened"
                    close.export_batch_id = None
                    close.export_filename = None
                    close.auto_push = 0
                    close.reopened_by_user_id = None
                    close.reopened_at = datetime.utcnow()
                    total_reopened += 1

            print(f"{d.isoformat()}: reset {count} ledger export flag(s)" + (" + reopened day" if args.reopen_days else ""))

        if args.dry_run:
            db.rollback()
            print(f"DRY RUN: would reset {total_reset} ledger entry flag(s). would reopen {total_reopened} day(s).")
            return 0

        db.commit()
        print(f"DONE: reset {total_reset} ledger entry export flag(s). reopened {total_reopened} day(s).")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())

