"""extend pricing matrix dimensions and booking holes

Revision ID: 202604130003
Revises: 202604130002
Create Date: 2026-04-13 22:15:00.000000

Adds:
- bookings.holes
- pricing_rules.player_type
- pricing_rules.holes
- pricing_rules.season
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "202604130003"
down_revision = "202604130002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("holes", sa.Integer(), nullable=False, server_default="18"))
    op.execute(
        """
        UPDATE bookings
        SET holes = COALESCE(
            (SELECT courses.holes FROM courses WHERE courses.id = bookings.course_id),
            18
        )
        """
    )

    op.add_column(
        "pricing_rules",
        sa.Column(
            "player_type",
            sa.String(length=64),
            nullable=False,
            server_default="member_standard",
        ),
    )
    op.add_column(
        "pricing_rules", sa.Column("holes", sa.Integer(), nullable=False, server_default="18")
    )
    op.add_column(
        "pricing_rules",
        sa.Column(
            "season",
            sa.String(length=32),
            nullable=False,
            server_default="any",
        ),
    )
    op.execute(
        """
        UPDATE pricing_rules
        SET player_type = CASE applies_to::text
            WHEN 'guest' THEN 'visitor_non_affiliated'
            WHEN 'staff' THEN 'staff_courtesy'
            ELSE 'member_standard'
        END
        """
    )


def downgrade() -> None:
    op.drop_column("pricing_rules", "season")
    op.drop_column("pricing_rules", "holes")
    op.drop_column("pricing_rules", "player_type")
    op.drop_column("bookings", "holes")
