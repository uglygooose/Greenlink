"""finance export batches foundation

Revision ID: 202604020002
Revises: 202604020001
Create Date: 2026-04-02
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "202604020002"
down_revision = "202604020001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "finance_export_batches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("club_id", sa.Uuid(), sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "export_profile",
            sa.Enum("journal_basic", name="financeexportprofile", create_type=True),
            nullable=False,
        ),
        sa.Column("date_from", sa.Date(), nullable=False),
        sa.Column("date_to", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "generated",
                "exported",
                "void",
                name="financeexportbatchstatus",
                create_type=True,
            ),
            nullable=False,
            server_default="generated",
        ),
        sa.Column(
            "created_by_person_id",
            sa.Uuid(),
            sa.ForeignKey("people.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("transaction_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_debits", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("total_credits", sa.Numeric(12, 2), nullable=False, server_default="0.00"),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_finance_export_batches_club_id", "finance_export_batches", ["club_id"])
    op.create_index(
        "ix_finance_export_batches_created_by_person_id",
        "finance_export_batches",
        ["created_by_person_id"],
    )
    op.create_index(
        "uq_finance_export_batches_active_range",
        "finance_export_batches",
        ["club_id", "export_profile", "date_from", "date_to"],
        unique=True,
        postgresql_where=sa.text("status <> CAST('void' AS financeexportbatchstatus)"),
        sqlite_where=sa.text("status <> 'void'"),
    )


def downgrade() -> None:
    op.drop_index("uq_finance_export_batches_active_range", "finance_export_batches")
    op.drop_index("ix_finance_export_batches_created_by_person_id", "finance_export_batches")
    op.drop_index("ix_finance_export_batches_club_id", "finance_export_batches")
    op.drop_table("finance_export_batches")
    sa.Enum(name="financeexportbatchstatus").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="financeexportprofile").drop(op.get_bind(), checkfirst=True)
