"""add tee_sheet_locks table

Revision ID: 202605140001
Revises: 202605130001
Create Date: 2026-05-14 12:00:00.000000

Adds (Phase 10 / Slice 8.5):
- ``tee_sheet_locks`` table — slot-level optimistic locks for tee-sheet
  UI coordination. One lock per (course_id, slot_datetime) enforced by
  the unique constraint ``uq_tee_sheet_locks_course_slot``. TTL is
  60 seconds (TeeSheetLockService.TTL_SECONDS in the application layer).

The table uses the codebase mixin idiom: ``id`` UUID primary key plus
``created_at`` / ``updated_at`` from TimestampMixin (created_at carries
the acquire timestamp, exposed as ``acquired_at`` on the response
schema). ``expires_at`` is the explicit TTL boundary — reads filter
``expires_at > now()`` to ignore expired rows; on acquire a row with
``expires_at <= now()`` is deleted before the new INSERT (Approach A
per slice spec — clean audit trail).
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "202605140001"
down_revision = "202605130001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tee_sheet_locks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("course_id", sa.Uuid(), nullable=False),
        sa.Column("slot_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("holder_user_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["holder_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_id",
            "slot_datetime",
            name="uq_tee_sheet_locks_course_slot",
        ),
    )
    op.create_index(
        op.f("ix_tee_sheet_locks_club_id"),
        "tee_sheet_locks",
        ["club_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_tee_sheet_locks_course_id"),
        "tee_sheet_locks",
        ["course_id"],
        unique=False,
    )
    op.create_index(
        "ix_tee_sheet_locks_course_slot_expires",
        "tee_sheet_locks",
        ["course_id", "slot_datetime", "expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_tee_sheet_locks_course_slot_expires", table_name="tee_sheet_locks")
    op.drop_index(op.f("ix_tee_sheet_locks_course_id"), table_name="tee_sheet_locks")
    op.drop_index(op.f("ix_tee_sheet_locks_club_id"), table_name="tee_sheet_locks")
    op.drop_table("tee_sheet_locks")
