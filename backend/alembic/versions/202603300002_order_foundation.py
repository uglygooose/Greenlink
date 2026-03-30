"""order foundation

Revision ID: 202603300002
Revises: 202603300001
Create Date: 2026-03-30 15:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "202603300002"
down_revision = "202603300001"
branch_labels = None
depends_on = None

order_source_enum = postgresql.ENUM(
    "player_app",
    "staff",
    name="ordersource",
    create_type=False,
)
order_status_enum = postgresql.ENUM(
    "placed",
    "preparing",
    "ready",
    "collected",
    "cancelled",
    name="orderstatus",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    order_source_enum.create(bind, checkfirst=True)
    order_status_enum.create(bind, checkfirst=True)

    op.create_table(
        "orders",
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("booking_id", sa.Uuid(), nullable=True),
        sa.Column("source", order_source_enum, nullable=False),
        sa.Column("status", order_status_enum, nullable=False, server_default="placed"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_orders_booking_id", "orders", ["booking_id"], unique=False)
    op.create_index("ix_orders_club_id", "orders", ["club_id"], unique=False)
    op.create_index("ix_orders_person_id", "orders", ["person_id"], unique=False)
    op.create_index(
        "ix_orders_club_status_created_at",
        "orders",
        ["club_id", "status", "created_at"],
        unique=False,
    )

    op.create_table(
        "order_items",
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=True),
        sa.Column("item_name_snapshot", sa.String(length=255), nullable=False),
        sa.Column("unit_price_snapshot", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
        sa.CheckConstraint(
            "unit_price_snapshot >= 0",
            name="ck_order_items_unit_price_snapshot_non_negative",
        ),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_order_items_order_id", table_name="order_items")
    op.drop_table("order_items")

    op.drop_index("ix_orders_club_status_created_at", table_name="orders")
    op.drop_index("ix_orders_person_id", table_name="orders")
    op.drop_index("ix_orders_club_id", table_name="orders")
    op.drop_index("ix_orders_booking_id", table_name="orders")
    op.drop_table("orders")

    bind = op.get_bind()
    order_status_enum.drop(bind, checkfirst=True)
    order_source_enum.drop(bind, checkfirst=True)
