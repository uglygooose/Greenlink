"""tee sheet lane identity and booking commercial hooks

Revision ID: 202604020005
Revises: 202604020004
Create Date: 2026-04-02 20:00:00.000000

Adds:
- StartLane enum (hole_1, hole_10)
- BookingPaymentStatus enum (pending, paid, complimentary, waived)
- bookings.start_lane — explicit start lane for the booking (nullable)
- bookings.cart_flag — whether a cart is included (boolean, default false)
- bookings.caddie_flag — whether a caddie is included (boolean, default false)
- bookings.fee_label — display label for the applicable rate (nullable string)
- bookings.payment_status — payment state display hook (nullable enum)
- tee_sheet_slot_states.start_lane — lane identity for the slot state (nullable)
- tee_sheet_slot_states unique constraint updated to include start_lane
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "202604020005"
down_revision = "202604020004"
branch_labels = None
depends_on = None

start_lane_enum = postgresql.ENUM(
    "hole_1",
    "hole_10",
    name="startlane",
    create_type=False,
)
booking_payment_status_enum = postgresql.ENUM(
    "pending",
    "paid",
    "complimentary",
    "waived",
    name="bookingpaymentstatus",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    start_lane_enum.create(bind, checkfirst=True)
    booking_payment_status_enum.create(bind, checkfirst=True)

    # bookings: lane identity and commercial hooks
    op.add_column("bookings", sa.Column("start_lane", start_lane_enum, nullable=True))
    op.add_column("bookings", sa.Column("cart_flag", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("bookings", sa.Column("caddie_flag", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("bookings", sa.Column("fee_label", sa.String(length=120), nullable=True))
    op.add_column("bookings", sa.Column("payment_status", booking_payment_status_enum, nullable=True))

    # tee_sheet_slot_states: drop old unique constraint, add start_lane, recreate constraint
    op.drop_constraint(
        "uq_tee_sheet_slot_states_scope_slot",
        "tee_sheet_slot_states",
        type_="unique",
    )
    op.add_column("tee_sheet_slot_states", sa.Column("start_lane", start_lane_enum, nullable=True))
    op.create_unique_constraint(
        "uq_tee_sheet_slot_states_scope_slot",
        "tee_sheet_slot_states",
        ["course_id", "tee_id", "start_lane", "slot_datetime"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_tee_sheet_slot_states_scope_slot",
        "tee_sheet_slot_states",
        type_="unique",
    )
    op.drop_column("tee_sheet_slot_states", "start_lane")
    op.create_unique_constraint(
        "uq_tee_sheet_slot_states_scope_slot",
        "tee_sheet_slot_states",
        ["course_id", "tee_id", "slot_datetime"],
    )

    op.drop_column("bookings", "payment_status")
    op.drop_column("bookings", "fee_label")
    op.drop_column("bookings", "caddie_flag")
    op.drop_column("bookings", "cart_flag")
    op.drop_column("bookings", "start_lane")

    bind = op.get_bind()
    booking_payment_status_enum.drop(bind, checkfirst=True)
    start_lane_enum.drop(bind, checkfirst=True)
