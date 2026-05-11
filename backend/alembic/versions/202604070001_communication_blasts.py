"""communication blasts

Revision ID: 202604070001
Revises: 202604020006
Create Date: 2026-04-07 23:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "202604070001"
down_revision = "202604020006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum types explicitly via SQL before the table that references them.
    op.execute("CREATE TYPE blasttargetsegment AS ENUM ('all', 'members', 'staff', 'admin')")
    op.execute("CREATE TYPE blastchannel AS ENUM ('in_app', 'email')")
    op.execute("CREATE TYPE blaststatus AS ENUM ('draft', 'sent', 'failed')")

    # Reference the enums with create_type=False — they already exist above.
    blast_target_segment_enum = postgresql.ENUM(name="blasttargetsegment", create_type=False)
    blast_channel_enum = postgresql.ENUM(name="blastchannel", create_type=False)
    blast_status_enum = postgresql.ENUM(name="blaststatus", create_type=False)

    op.create_table(
        "communication_blasts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_person_id", sa.Uuid(), nullable=True),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("target_segment", blast_target_segment_enum, nullable=False),
        sa.Column("channel", blast_channel_enum, nullable=False),
        sa.Column("status", blast_status_enum, nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recipient_count", sa.Integer(), nullable=True),
        sa.Column("delivery_note", sa.String(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_person_id"], ["people.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_communication_blasts_club_id", "communication_blasts", ["club_id"])


def downgrade() -> None:
    op.drop_index("ix_communication_blasts_club_id", table_name="communication_blasts")
    op.drop_table("communication_blasts")
    op.execute("DROP TYPE IF EXISTS blaststatus")
    op.execute("DROP TYPE IF EXISTS blastchannel")
    op.execute("DROP TYPE IF EXISTS blasttargetsegment")
