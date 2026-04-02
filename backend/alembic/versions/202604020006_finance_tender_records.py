"""finance tender records

Revision ID: 202604020006
Revises: 202604020005
Create Date: 2026-04-02 18:30:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "202604020006"
down_revision = "202604020005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tender_type_enum = postgresql.ENUM(name="tendertype", create_type=False)
    finance_transaction_source_enum = postgresql.ENUM(
        name="financetransactionsource",
        create_type=False,
    )

    op.create_table(
        "finance_tender_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("source", finance_transaction_source_enum, nullable=False),
        sa.Column("reference_id", sa.Uuid(), nullable=True),
        sa.Column("tender_type", tender_type_enum, nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("charge_transaction_id", sa.Uuid(), nullable=True),
        sa.Column("settlement_transaction_id", sa.Uuid(), nullable=True),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("amount > 0", name="ck_finance_tender_records_amount_positive"),
        sa.ForeignKeyConstraint(["account_id"], ["finance_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["charge_transaction_id"], ["finance_transactions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["settlement_transaction_id"],
            ["finance_transactions.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "charge_transaction_id",
            name="uq_finance_tender_records_charge_transaction_id",
        ),
        sa.UniqueConstraint(
            "settlement_transaction_id",
            name="uq_finance_tender_records_settlement_transaction_id",
        ),
    )
    op.create_index(
        "ix_finance_tender_records_account_id",
        "finance_tender_records",
        ["account_id"],
        unique=False,
    )
    op.create_index(
        "ix_finance_tender_records_reference_id",
        "finance_tender_records",
        ["reference_id"],
        unique=False,
    )
    op.create_index(
        "ix_finance_tender_records_charge_transaction_id",
        "finance_tender_records",
        ["charge_transaction_id"],
        unique=True,
    )
    op.create_index(
        "ix_finance_tender_records_settlement_transaction_id",
        "finance_tender_records",
        ["settlement_transaction_id"],
        unique=True,
    )

    op.add_column(
        "orders",
        sa.Column("finance_tender_record_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_orders_finance_tender_record_id",
        "orders",
        ["finance_tender_record_id"],
        unique=True,
    )
    op.create_foreign_key(
        "fk_orders_finance_tender_record_id",
        "orders",
        "finance_tender_records",
        ["finance_tender_record_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_orders_finance_tender_record_id",
        "orders",
        type_="foreignkey",
    )
    op.drop_index("ix_orders_finance_tender_record_id", table_name="orders")
    op.drop_column("orders", "finance_tender_record_id")

    op.drop_index(
        "ix_finance_tender_records_settlement_transaction_id",
        table_name="finance_tender_records",
    )
    op.drop_index(
        "ix_finance_tender_records_charge_transaction_id",
        table_name="finance_tender_records",
    )
    op.drop_index("ix_finance_tender_records_reference_id", table_name="finance_tender_records")
    op.drop_index("ix_finance_tender_records_account_id", table_name="finance_tender_records")
    op.drop_table("finance_tender_records")
