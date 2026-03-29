"""booking aggregate foundation

Revision ID: 202603290005
Revises: 202603290004
Create Date: 2026-03-29 23:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "202603290005"
down_revision = "202603290004"
branch_labels = None
depends_on = None

booking_status_enum = postgresql.ENUM(
    "reserved",
    "checked_in",
    "cancelled",
    "completed",
    "no_show",
    name="bookingstatus",
    create_type=False,
)
booking_participant_type_enum = postgresql.ENUM(
    "member", "guest", "staff", name="bookingparticipanttype", create_type=False
)
booking_source_enum = postgresql.ENUM(
    "admin", "member_portal", "staff", name="bookingsource", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    booking_status_enum.create(bind, checkfirst=True)
    booking_participant_type_enum.create(bind, checkfirst=True)
    booking_source_enum.create(bind, checkfirst=True)

    op.create_table(
        "bookings",
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("tee_id", sa.Uuid(), nullable=True),
        sa.Column("slot_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("slot_interval_minutes", sa.Integer(), nullable=False),
        sa.Column("status", booking_status_enum, nullable=False),
        sa.Column("source", booking_source_enum, nullable=False, server_default="admin"),
        sa.Column("party_size", sa.Integer(), nullable=False),
        sa.Column("primary_person_id", sa.Uuid(), nullable=True),
        sa.Column("primary_membership_id", sa.Uuid(), nullable=True),
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
        sa.ForeignKeyConstraint(["primary_person_id"], ["people.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["primary_membership_id"], ["club_memberships.id"], ondelete="SET NULL"),
        sa.CheckConstraint("party_size > 0", name="ck_bookings_party_size_positive"),
        sa.CheckConstraint("slot_interval_minutes > 0", name="ck_bookings_slot_interval_positive"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bookings_slot_datetime", "bookings", ["slot_datetime"], unique=False)

    op.create_table(
        "booking_participants",
        sa.Column("booking_id", sa.Uuid(), nullable=False),
        sa.Column("person_id", sa.Uuid(), nullable=True),
        sa.Column("club_membership_id", sa.Uuid(), nullable=True),
        sa.Column("participant_type", booking_participant_type_enum, nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("guest_name", sa.String(length=255), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["club_membership_id"], ["club_memberships.id"], ondelete="SET NULL"),
        sa.CheckConstraint("sort_order >= 0", name="ck_booking_participants_sort_order_non_negative"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("booking_participants")
    op.drop_index("ix_bookings_slot_datetime", table_name="bookings")
    op.drop_table("bookings")

    bind = op.get_bind()
    booking_source_enum.drop(bind, checkfirst=True)
    booking_participant_type_enum.drop(bind, checkfirst=True)
    booking_status_enum.drop(bind, checkfirst=True)
