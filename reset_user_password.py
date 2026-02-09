#!/usr/bin/env python3
"""
Reset (or create) a GreenLink user's password using the active configured DB.

Examples:
  python reset_user_password.py admin@greenlink.com
  python reset_user_password.py admin@greenlink.com --password "NewPass123!"
  python reset_user_password.py someone@example.com --create --role player
"""

from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError

from app import models
from app.auth import get_password_hash
from app.database import DB_INFO, DB_SOURCE, SessionLocal


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reset a user's password in the active GreenLink database.")
    parser.add_argument("email", help="User email address")
    parser.add_argument("--password", help="New password (omit to be prompted securely)")
    parser.add_argument("--create", action="store_true", help="Create the user if it does not exist")
    parser.add_argument("--name", help="Name to use when creating a user (defaults to email prefix)")
    parser.add_argument(
        "--role",
        choices=[r.value for r in models.UserRole],
        help="Optionally set the user's role (admin/club_staff/player)",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = _parse_args(argv)
    normalized_email = (args.email or "").strip().lower()
    if not normalized_email or "@" not in normalized_email:
        print("ERROR: Please provide a valid email address.")
        return 2

    if args.password:
        new_password = args.password
    else:
        new_password = getpass.getpass("New password: ")
        confirm = getpass.getpass("Confirm password: ")
        if new_password != confirm:
            print("ERROR: Passwords do not match.")
            return 2

    db = SessionLocal()
    try:
        user = db.query(models.User).filter(func.lower(models.User.email) == normalized_email).first()
        if not user:
            if not args.create:
                print(f"ERROR: User not found for email '{normalized_email}'. Re-run with --create to create it.")
                return 1
            name = (args.name or normalized_email.split("@", 1)[0]).strip() or "User"
            role = models.UserRole(args.role) if args.role else models.UserRole.player
            user = models.User(name=name, email=normalized_email, password=get_password_hash(new_password), role=role)
            db.add(user)
        else:
            user.password = get_password_hash(new_password)
            if args.role:
                user.role = models.UserRole(args.role)

        db.commit()
        print(f"OK: Password updated for {normalized_email}")
        print(f"DB: source={DB_SOURCE} driver={(DB_INFO or {}).get('driver')}")
        return 0
    except SQLAlchemyError as e:
        print(f"ERROR: Database error: {str(e)[:240]}")
        return 3
    except Exception as e:
        print(f"ERROR: Unexpected error: {str(e)[:240]}")
        return 4
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

