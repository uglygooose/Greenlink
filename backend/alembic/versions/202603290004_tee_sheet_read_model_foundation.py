"""tee sheet read model foundation

Revision ID: 202603290004
Revises: 202603290003
Create Date: 2026-03-29 21:10:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "202603290004"
down_revision = "202603290003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tee_sheet_slot_states",
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("tee_id", sa.Uuid(), nullable=True),
        sa.Column("slot_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("player_capacity", sa.Integer(), nullable=True),
        sa.Column("occupied_player_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reserved_player_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("confirmed_booking_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reserved_booking_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("member_count", sa.Integer(), nullable=True),
        sa.Column("guest_count", sa.Integer(), nullable=True),
        sa.Column("staff_count", sa.Integer(), nullable=True),
        sa.Column("manually_blocked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("reserved_state_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("competition_controlled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("event_controlled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("externally_unavailable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("blocked_reason", sa.String(length=255), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tee_id"], ["tees.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("course_id", "tee_id", "slot_datetime", name="uq_tee_sheet_slot_states_scope_slot"),
    )
    op.create_index(
        "ix_tee_sheet_slot_states_slot_datetime",
        "tee_sheet_slot_states",
        ["slot_datetime"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_tee_sheet_slot_states_slot_datetime", table_name="tee_sheet_slot_states")
    op.drop_table("tee_sheet_slot_states")
