"""operational rules foundation

Revision ID: 202603290002
Revises: 202603290001
Create Date: 2026-03-29 16:10:00.000000
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "202603290002"
down_revision = "202603290001"
branch_labels = None
depends_on = None


booking_rule_applies_to_enum = postgresql.ENUM(
    "member",
    "guest",
    "staff",
    name="bookingruleappliesto",
    create_type=False,
)
booking_rule_scope_type_enum = postgresql.ENUM(
    "club",
    "course",
    "tee",
    "membership_role",
    "applies_to_bucket",
    name="bookingrulescopetype",
    create_type=False,
)
booking_rule_conflict_strategy_enum = postgresql.ENUM(
    "first_match",
    "merge",
    "override",
    name="bookingruleconflictstrategy",
    create_type=False,
)
booking_rule_type_enum = postgresql.ENUM(
    "advance_window",
    "max_bookings_per_day",
    "max_future_bookings",
    "guest_limit",
    "time_restriction",
    name="bookingruletype",
    create_type=False,
)
pricing_rule_applies_to_enum = postgresql.ENUM(
    "member", "guest", name="pricingruleappliesto", create_type=False
)
pricing_day_type_enum = postgresql.ENUM(
    "weekday",
    "weekend",
    "public_holiday",
    name="pricingdaytype",
    create_type=False,
)
pricing_time_band_enum = postgresql.ENUM(
    "morning", "afternoon", "custom", name="pricingtimeband", create_type=False
)

DEFAULT_OPERATING_HOURS = {
    "monday": {"open": "06:00", "close": "18:00", "closed": False},
    "tuesday": {"open": "06:00", "close": "18:00", "closed": False},
    "wednesday": {"open": "06:00", "close": "18:00", "closed": False},
    "thursday": {"open": "06:00", "close": "18:00", "closed": False},
    "friday": {"open": "06:00", "close": "18:00", "closed": False},
    "saturday": {"open": "06:00", "close": "18:00", "closed": False},
    "sunday": {"open": "06:00", "close": "18:00", "closed": False},
}


def upgrade() -> None:
    bind = op.get_bind()
    booking_rule_applies_to_enum.create(bind, checkfirst=True)
    booking_rule_scope_type_enum.create(bind, checkfirst=True)
    booking_rule_conflict_strategy_enum.create(bind, checkfirst=True)
    booking_rule_type_enum.create(bind, checkfirst=True)
    pricing_rule_applies_to_enum.create(bind, checkfirst=True)
    pricing_day_type_enum.create(bind, checkfirst=True)
    pricing_time_band_enum.create(bind, checkfirst=True)

    op.create_table(
        "club_configs",
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("operating_hours", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("booking_window_days", sa.Integer(), nullable=False, server_default="14"),
        sa.Column("cancellation_policy_hours", sa.Integer(), nullable=False, server_default="24"),
        sa.Column("default_slot_interval_minutes", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("club_id", name="uq_club_configs_club"),
    )

    op.create_table(
        "courses",
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("holes", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("club_id", "name", name="uq_courses_club_name"),
    )

    op.create_table(
        "tees",
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("gender", sa.String(length=32), nullable=True),
        sa.Column("slope_rating", sa.Integer(), nullable=False),
        sa.Column("course_rating", sa.Numeric(5, 1), nullable=False),
        sa.Column("color_code", sa.String(length=32), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "booking_rule_sets",
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("applies_to", booking_rule_applies_to_enum, nullable=False),
        sa.Column("scope_type", booking_rule_scope_type_enum, nullable=False, server_default="club"),
        sa.Column("scope_ref_id", sa.String(length=120), nullable=True),
        sa.Column(
            "conflict_strategy",
            booking_rule_conflict_strategy_enum,
            nullable=False,
            server_default="first_match",
        ),
        sa.Column("applies_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applies_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "booking_rules",
        sa.Column("ruleset_id", sa.Uuid(), nullable=False),
        sa.Column("type", booking_rule_type_enum, nullable=False),
        sa.Column("evaluation_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("config", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["ruleset_id"], ["booking_rule_sets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "pricing_matrices",
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "pricing_rules",
        sa.Column("matrix_id", sa.Uuid(), nullable=False),
        sa.Column("applies_to", pricing_rule_applies_to_enum, nullable=False),
        sa.Column("day_type", pricing_day_type_enum, nullable=False),
        sa.Column("time_band", pricing_time_band_enum, nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["matrix_id"], ["pricing_matrices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    clubs = sa.table(
        "clubs",
        sa.column("id", sa.Uuid()),
        sa.column("timezone", sa.String()),
    )
    club_configs = sa.table(
        "club_configs",
        sa.column("id", sa.Uuid()),
        sa.column("club_id", sa.Uuid()),
        sa.column("timezone", sa.String()),
        sa.column("operating_hours", sa.JSON()),
        sa.column("booking_window_days", sa.Integer()),
        sa.column("cancellation_policy_hours", sa.Integer()),
        sa.column("default_slot_interval_minutes", sa.Integer()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    now = datetime.now(timezone.utc)
    existing_clubs = bind.execute(sa.select(clubs.c.id, clubs.c.timezone)).all()
    for club_id, timezone_value in existing_clubs:
        bind.execute(
            club_configs.insert().values(
                id=uuid.uuid4(),
                club_id=club_id,
                timezone=timezone_value or "Africa/Johannesburg",
                operating_hours=json.loads(json.dumps(DEFAULT_OPERATING_HOURS)),
                booking_window_days=14,
                cancellation_policy_hours=24,
                default_slot_interval_minutes=10,
                created_at=now,
                updated_at=now,
            )
        )


def downgrade() -> None:
    op.drop_table("pricing_rules")
    op.drop_table("pricing_matrices")
    op.drop_table("booking_rules")
    op.drop_table("booking_rule_sets")
    op.drop_table("tees")
    op.drop_table("courses")
    op.drop_table("club_configs")

    bind = op.get_bind()
    pricing_time_band_enum.drop(bind, checkfirst=True)
    pricing_day_type_enum.drop(bind, checkfirst=True)
    pricing_rule_applies_to_enum.drop(bind, checkfirst=True)
    booking_rule_type_enum.drop(bind, checkfirst=True)
    booking_rule_conflict_strategy_enum.drop(bind, checkfirst=True)
    booking_rule_scope_type_enum.drop(bind, checkfirst=True)
    booking_rule_applies_to_enum.drop(bind, checkfirst=True)
