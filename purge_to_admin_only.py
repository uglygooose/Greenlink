"""
Purge GreenLink data so only admin identities remain.

What this script keeps:
- `users` rows with role in {super_admin, admin}
- `clubs` table (so preserved admin users keep valid club links)
- schema metadata table(s), where present

What this script removes:
- all rows from every other application table
- all `users` rows for non-admin roles

Usage:
  python purge_to_admin_only.py --dry-run
  python purge_to_admin_only.py --yes
"""

from __future__ import annotations

import argparse
from typing import Iterable

from sqlalchemy import inspect, text, func

from app.database import DB_INFO, DB_SOURCE, SessionLocal
from app.models import User, UserRole


KEEP_TABLES = {"users", "clubs", "alembic_version"}


def _quote_table(table_name: str, dialect: str) -> str:
    if dialect == "mysql":
        safe = table_name.replace("`", "``")
        return f"`{safe}`"
    safe = table_name.replace('"', '""')
    return f'"{safe}"'


def _table_count(db, table_name: str, dialect: str) -> int:
    try:
        quoted = _quote_table(table_name, dialect)
        return int(db.execute(text(f"SELECT COUNT(*) FROM {quoted}")).scalar() or 0)
    except Exception:
        return -1


def _role_counts(db) -> dict[str, int]:
    rows = db.query(User.role, func.count(User.id)).group_by(User.role).all()
    out: dict[str, int] = {}
    for role, count in rows:
        key = str(getattr(role, "value", role))
        out[key] = int(count or 0)
    return out


def _print_snapshot(db, tables: Iterable[str], label: str, dialect: str) -> None:
    print(f"\n[{label}]")
    print(f"DB source: {DB_SOURCE} | driver={DB_INFO.get('driver')} | host={DB_INFO.get('host')} | db={DB_INFO.get('database')}")
    role_counts = _role_counts(db)
    if role_counts:
        print("users by role:")
        for key in sorted(role_counts.keys()):
            print(f"  - {key}: {role_counts[key]}")
    else:
        print("users by role: (none)")
    print("table rows:")
    for table_name in sorted(tables):
        n = _table_count(db, table_name, dialect)
        if n >= 0:
            print(f"  - {table_name}: {n}")
        else:
            print(f"  - {table_name}: n/a")


def _confirm(assume_yes: bool) -> None:
    if assume_yes:
        return
    print("\nThis will permanently delete operational data and non-admin users.")
    raw = input("Type YES to continue: ").strip()
    if raw != "YES":
        print("Aborted.")
        raise SystemExit(2)


def main() -> int:
    parser = argparse.ArgumentParser(description="Purge GreenLink data and keep only super_admin/admin users.")
    parser.add_argument("--yes", action="store_true", help="Run without interactive confirmation.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be purged but do not change data.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        inspector = inspect(db.bind)
        dialect = db.bind.dialect.name if db.bind is not None else ""
        all_tables = sorted([t for t in inspector.get_table_names() if not str(t).startswith("sqlite_")])
        purge_tables = sorted([t for t in all_tables if t not in KEEP_TABLES])

        _print_snapshot(db, all_tables, "BEFORE", dialect)

        admin_count = (
            db.query(func.count(User.id))
            .filter(User.role.in_([UserRole.super_admin, UserRole.admin]))
            .scalar()
            or 0
        )
        if int(admin_count) <= 0:
            raise RuntimeError("No super_admin/admin users found. Refusing to purge to avoid lockout.")

        if args.dry_run:
            print("\n[DRY RUN] Would purge tables:")
            for t in purge_tables:
                print(f"  - {t}")
            non_admin_count = (
                db.query(func.count(User.id))
                .filter(~User.role.in_([UserRole.super_admin, UserRole.admin]))
                .scalar()
                or 0
            )
            print(f"Would delete non-admin users: {int(non_admin_count)}")
            return 0

        _confirm(args.yes)

        if purge_tables:
            if dialect == "postgresql":
                table_sql = ", ".join([f'"{t}"' for t in purge_tables])
                db.execute(text(f"TRUNCATE TABLE {table_sql} RESTART IDENTITY CASCADE"))
            elif dialect == "mysql":
                db.execute(text("SET FOREIGN_KEY_CHECKS=0"))
                for t in purge_tables:
                    db.execute(text(f"DELETE FROM {_quote_table(t, dialect)}"))
                db.execute(text("SET FOREIGN_KEY_CHECKS=1"))
            else:
                if dialect == "sqlite":
                    db.execute(text("PRAGMA foreign_keys=OFF"))
                for t in purge_tables:
                    db.execute(text(f"DELETE FROM {_quote_table(t, dialect)}"))
                if dialect == "sqlite":
                    db.execute(text("PRAGMA foreign_keys=ON"))

        db.query(User).filter(~User.role.in_([UserRole.super_admin, UserRole.admin])).delete(
            synchronize_session=False
        )
        db.commit()

        _print_snapshot(db, all_tables, "AFTER", dialect)
        print("\nDONE: only super_admin/admin users were kept; operational tables were purged.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
