"""order finance posting foundation

Revision ID: 202603300003
Revises: 202603300002
Create Date: 2026-03-30 18:15:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "202603300003"
down_revision = "202603300002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE financetransactionsource ADD VALUE IF NOT EXISTS 'order'")

    op.add_column(
        "orders",
        sa.Column("finance_charge_transaction_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_orders_finance_charge_transaction_id",
        "orders",
        ["finance_charge_transaction_id"],
        unique=True,
    )
    op.create_foreign_key(
        "fk_orders_finance_charge_transaction_id",
        "orders",
        "finance_transactions",
        ["finance_charge_transaction_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_orders_finance_charge_transaction_id",
        "orders",
        type_="foreignkey",
    )
    op.drop_index("ix_orders_finance_charge_transaction_id", table_name="orders")
    op.drop_column("orders", "finance_charge_transaction_id")
