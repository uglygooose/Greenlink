"""rule context and availability foundation

Revision ID: 202603290003
Revises: 202603290002
Create Date: 2026-03-29 19:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "202603290003"
down_revision = "202603290002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pricing_rules", sa.Column("time_band_ref", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("pricing_rules", "time_band_ref")
