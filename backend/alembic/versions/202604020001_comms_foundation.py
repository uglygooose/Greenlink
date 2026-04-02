"""comms foundation - news posts

Revision ID: 202604020001
Revises: 202603300005
Create Date: 2026-04-02
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "202604020001"
down_revision = "202603300005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "news_posts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("club_id", sa.Uuid(), sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_person_id", sa.Uuid(), sa.ForeignKey("people.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "visibility",
            sa.Enum("public", "members_only", "internal", name="newspostvisibility", create_type=True),
            nullable=False,
            server_default="members_only",
        ),
        sa.Column(
            "status",
            sa.Enum("draft", "published", name="newspoststatus", create_type=True),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_news_posts_club_id", "news_posts", ["club_id"])
    op.create_index("ix_news_posts_author_person_id", "news_posts", ["author_person_id"])
    op.create_index("ix_news_posts_status", "news_posts", ["status"])


def downgrade() -> None:
    op.drop_index("ix_news_posts_status", "news_posts")
    op.drop_index("ix_news_posts_author_person_id", "news_posts")
    op.drop_index("ix_news_posts_club_id", "news_posts")
    op.drop_table("news_posts")
    sa.Enum(name="newspostvisibility").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="newspoststatus").drop(op.get_bind(), checkfirst=True)
