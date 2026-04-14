"""persist booking fee snapshots

Revision ID: 202604130002
Revises: 202604130001
Create Date: 2026-04-13 20:30:00.000000

Adds:
- bookings.fee_amount - resolved booking fee snapshot (nullable numeric)
- bookings.fee_currency - resolved booking fee currency snapshot (nullable string)
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "202604130002"
down_revision = "202604130001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("fee_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("bookings", sa.Column("fee_currency", sa.String(length=3), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "fee_currency")
    op.drop_column("bookings", "fee_amount")
