"""pos foundation

Revision ID: 202603300005
Revises: 202603300004
Create Date: 2026-03-30 21:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "202603300005"
down_revision = "202603300004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # products table
    op.create_table(
        "products",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("price >= 0", name="ck_products_price_non_negative"),
    )
    op.create_index("ix_products_club_id", "products", ["club_id"])

    # pos_transactions table
    tender_type_enum = postgresql.ENUM(
        "cash",
        "card",
        "member_account",
        name="tendertype",
        create_type=True,
    )
    op.create_table(
        "pos_transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("tender_type", tender_type_enum, nullable=False),
        sa.Column("finance_transaction_id", sa.Uuid(), nullable=True),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["finance_transaction_id"],
            ["finance_transactions.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("finance_transaction_id", name="uq_pos_transactions_finance_transaction_id"),
        sa.CheckConstraint(
            "total_amount >= 0",
            name="ck_pos_transactions_total_non_negative",
        ),
    )
    op.create_index("ix_pos_transactions_club_id", "pos_transactions", ["club_id"])
    op.create_index(
        "ix_pos_transactions_finance_transaction_id",
        "pos_transactions",
        ["finance_transaction_id"],
        unique=True,
    )
    op.create_index(
        "ix_pos_transactions_created_by_user_id",
        "pos_transactions",
        ["created_by_user_id"],
    )

    # pos_transaction_items table
    op.create_table(
        "pos_transaction_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("pos_transaction_id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=True),
        sa.Column("item_name_snapshot", sa.String(255), nullable=False),
        sa.Column("unit_price_snapshot", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["pos_transaction_id"],
            ["pos_transactions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "quantity > 0",
            name="ck_pos_transaction_items_quantity_positive",
        ),
        sa.CheckConstraint(
            "unit_price_snapshot >= 0",
            name="ck_pos_transaction_items_unit_price_non_negative",
        ),
    )
    op.create_index(
        "ix_pos_transaction_items_pos_transaction_id",
        "pos_transaction_items",
        ["pos_transaction_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_pos_transaction_items_pos_transaction_id", table_name="pos_transaction_items")
    op.drop_table("pos_transaction_items")

    op.drop_index("ix_pos_transactions_created_by_user_id", table_name="pos_transactions")
    op.drop_index("ix_pos_transactions_finance_transaction_id", table_name="pos_transactions")
    op.drop_index("ix_pos_transactions_club_id", table_name="pos_transactions")
    op.drop_table("pos_transactions")

    op.drop_index("ix_products_club_id", table_name="products")
    op.drop_table("products")
    postgresql.ENUM(name="tendertype").drop(op.get_bind(), checkfirst=True)
