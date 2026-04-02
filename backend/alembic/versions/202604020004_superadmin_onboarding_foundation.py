"""add superadmin onboarding foundation fields

Revision ID: 202604020004
Revises: 202604020003
Create Date: 2026-04-02 19:20:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "202604020004"
down_revision = "202604020003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clubs",
        sa.Column("location", sa.String(length=255), nullable=False, server_default=""),
    )
    op.add_column(
        "clubs",
        sa.Column(
            "onboarding_current_step",
            sa.String(length=32),
            nullable=False,
            server_default="basic_info",
        ),
    )
    op.execute(
        sa.text(
            "UPDATE clubs SET onboarding_state = 'live' WHERE onboarding_state = 'active'"
        )
    )
    op.alter_column(
        "clubs",
        "onboarding_state",
        existing_type=sa.String(length=32),
        server_default="onboarding_started",
    )
    op.add_column(
        "club_configs",
        sa.Column("preferred_accounting_profile_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_club_configs_preferred_accounting_profile_id",
        "club_configs",
        "accounting_export_profiles",
        ["preferred_accounting_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_club_configs_preferred_accounting_profile_id",
        "club_configs",
        ["preferred_accounting_profile_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_club_configs_preferred_accounting_profile_id",
        table_name="club_configs",
    )
    op.drop_constraint(
        "fk_club_configs_preferred_accounting_profile_id",
        "club_configs",
        type_="foreignkey",
    )
    op.drop_column("club_configs", "preferred_accounting_profile_id")
    op.alter_column(
        "clubs",
        "onboarding_state",
        existing_type=sa.String(length=32),
        server_default="active",
    )
    op.drop_column("clubs", "onboarding_current_step")
    op.drop_column("clubs", "location")
