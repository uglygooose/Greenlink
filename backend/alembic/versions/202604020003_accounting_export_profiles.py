"""add accounting export profiles

Revision ID: 202604020003
Revises: 202604020002
Create Date: 2026-04-02 16:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "202604020003"
down_revision = "202604020002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "accounting_export_profiles",
        sa.Column("club_id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("target_system", sa.String(length=64), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("mapping_config_json", sa.JSON(), nullable=False),
        sa.Column("created_by_person_id", sa.UUID(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_person_id"], ["people.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("club_id", "code", name="uq_accounting_export_profiles_club_code"),
    )
    op.create_index(
        "ix_accounting_export_profiles_club_id",
        "accounting_export_profiles",
        ["club_id"],
        unique=False,
    )
    op.create_index(
        "ix_accounting_export_profiles_created_by_person_id",
        "accounting_export_profiles",
        ["created_by_person_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_accounting_export_profiles_created_by_person_id", table_name="accounting_export_profiles")
    op.drop_index("ix_accounting_export_profiles_club_id", table_name="accounting_export_profiles")
    op.drop_table("accounting_export_profiles")
