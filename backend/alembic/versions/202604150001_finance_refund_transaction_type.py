"""add refund to finance transaction type enum

Revision ID: 202604150001
Revises: 202604130003
Create Date: 2026-04-15 00:00:00.000000

Adds:
- 'refund' value to the financetransactiontype PostgreSQL enum

This is a non-destructive additive change. The existing enum values and any
rows that reference them are unaffected. No data migration is required.
"""

from __future__ import annotations

from alembic import op

revision = "202604150001"
down_revision = "202604130003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL ALTER TYPE ... ADD VALUE is transactional only in PG 12+.
    # IF NOT EXISTS guard makes this idempotent on re-run.
    op.execute("ALTER TYPE financetransactiontype ADD VALUE IF NOT EXISTS 'refund'")


def downgrade() -> None:
    # PostgreSQL does not support removing a value from an existing enum without
    # recreating it. Downgrade is intentionally left as a no-op: the value
    # simply becomes unused if this migration is rolled back. A full enum
    # recreation downgrade is not worth the risk on a live system.
    pass
