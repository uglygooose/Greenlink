"""add WALK_IN value to bookingsource enum

Revision ID: 202605130001
Revises: 202605120001
Create Date: 2026-05-13 12:00:00.000000

Adds (Phase 10 / Slice 7.5):
- New value 'walk_in' on the existing native Postgres ENUM type
  ``bookingsource`` (created in 202603290005_booking_aggregate_foundation).

The bookings.source column already uses a native Postgres ENUM (not a
String + CHECK), so this is a single ALTER TYPE statement against the
existing type. The Phase 9A String+CHECK convention applies to new
columns added under that phase (vat_category, consent_source); it does
not retroactively convert existing native enums.

IF NOT EXISTS makes the statement idempotent and retry-safe.
"""

from __future__ import annotations

from alembic import op

revision = "202605130001"
down_revision = "202605120001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE bookingsource ADD VALUE IF NOT EXISTS 'walk_in'")


def downgrade() -> None:
    """Postgres has no ALTER TYPE ... DROP VALUE. The 'walk_in' value
    remains in the bookingsource enum permanently after upgrade. Any rows
    written with source='walk_in' will block a re-upgrade only if a future
    migration tries to drop and recreate the type with stricter values.

    The downgrade body is intentionally empty: it completes cleanly so
    operators downgrading on a clean DB (no walk_in rows) see no false
    failure, and the contract is documented here for operators downgrading
    after data has been written under the new value.
    """
