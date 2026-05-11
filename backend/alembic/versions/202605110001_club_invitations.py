"""club invitations

Revision ID: 202605110001
Revises: 202604150001
Create Date: 2026-05-11 16:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "202605110001"
down_revision = "202604150001"
branch_labels = None
depends_on = None


club_invitation_status_enum = postgresql.ENUM(
    "pending",
    "accepted",
    "revoked",
    "expired",
    name="clubinvitationstatus",
    create_type=False,
)
club_membership_role_enum = postgresql.ENUM(
    "club_admin",
    "club_staff",
    "member",
    name="clubmembershiprole",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    club_invitation_status_enum.create(bind, checkfirst=True)

    op.create_table(
        "club_invitations",
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("membership_id", sa.Uuid(), nullable=False),
        sa.Column("linked_user_id", sa.Uuid(), nullable=True),
        sa.Column("invited_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("accepted_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("normalized_email", sa.String(length=255), nullable=False),
        sa.Column("role", club_membership_role_enum, nullable=False),
        sa.Column("status", club_invitation_status_enum, nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
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
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["membership_id"], ["club_memberships.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["linked_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["accepted_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_club_invitations_club_id"), "club_invitations", ["club_id"], unique=False
    )
    op.create_index(
        op.f("ix_club_invitations_person_id"),
        "club_invitations",
        ["person_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_club_invitations_membership_id"),
        "club_invitations",
        ["membership_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_club_invitations_linked_user_id"),
        "club_invitations",
        ["linked_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_club_invitations_normalized_email"),
        "club_invitations",
        ["normalized_email"],
        unique=False,
    )
    op.create_index(
        op.f("ix_club_invitations_token_hash"),
        "club_invitations",
        ["token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_club_invitations_token_hash"), table_name="club_invitations")
    op.drop_index(op.f("ix_club_invitations_normalized_email"), table_name="club_invitations")
    op.drop_index(op.f("ix_club_invitations_linked_user_id"), table_name="club_invitations")
    op.drop_index(op.f("ix_club_invitations_membership_id"), table_name="club_invitations")
    op.drop_index(op.f("ix_club_invitations_person_id"), table_name="club_invitations")
    op.drop_index(op.f("ix_club_invitations_club_id"), table_name="club_invitations")
    op.drop_table("club_invitations")
    bind = op.get_bind()
    club_invitation_status_enum.drop(bind, checkfirst=True)
