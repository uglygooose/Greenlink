"""finance foundation

Revision ID: 202603300001
Revises: 202603290005
Create Date: 2026-03-30 12:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "202603300001"
down_revision = "202603290005"
branch_labels = None
depends_on = None

finance_account_status_enum = postgresql.ENUM(
    "active",
    "closed",
    name="financeaccountstatus",
    create_type=False,
)
finance_transaction_type_enum = postgresql.ENUM(
    "charge",
    "payment",
    "adjustment",
    name="financetransactiontype",
    create_type=False,
)
finance_transaction_source_enum = postgresql.ENUM(
    "booking",
    "pos",
    "manual",
    name="financetransactionsource",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    finance_account_status_enum.create(bind, checkfirst=True)
    finance_transaction_type_enum.create(bind, checkfirst=True)
    finance_transaction_source_enum.create(bind, checkfirst=True)

    op.create_table(
        "finance_accounts",
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("account_customer_id", sa.Uuid(), nullable=False),
        sa.Column("status", finance_account_status_enum, nullable=False, server_default="active"),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["account_customer_id"], ["account_customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "club_id",
            "account_customer_id",
            name="uq_finance_accounts_club_account_customer",
        ),
    )

    op.create_table(
        "finance_transactions",
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("type", finance_transaction_type_enum, nullable=False),
        sa.Column("source", finance_transaction_source_enum, nullable=False),
        sa.Column("reference_id", sa.Uuid(), nullable=True),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("amount <> 0", name="ck_finance_transactions_amount_non_zero"),
        sa.ForeignKeyConstraint(["account_id"], ["finance_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_finance_transactions_account_created_at",
        "finance_transactions",
        ["account_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_finance_transactions_account_created_at", table_name="finance_transactions")
    op.drop_table("finance_transactions")
    op.drop_table("finance_accounts")

    bind = op.get_bind()
    finance_transaction_source_enum.drop(bind, checkfirst=True)
    finance_transaction_type_enum.drop(bind, checkfirst=True)
    finance_account_status_enum.drop(bind, checkfirst=True)
