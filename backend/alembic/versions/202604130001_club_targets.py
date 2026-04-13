"""club targets

Revision ID: 202604130001
Revises: 202604070001
Create Date: 2026-04-13 12:30:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "202604130001"
down_revision = "202604070001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "club_targets",
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("domain_key", sa.String(length=64), nullable=False),
        sa.Column("metric_key", sa.String(length=64), nullable=False),
        sa.Column("period_key", sa.String(length=32), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("target_value", sa.Numeric(12, 2), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_club_targets_club_id", "club_targets", ["club_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_club_targets_club_id", table_name="club_targets")
    op.drop_table("club_targets")
