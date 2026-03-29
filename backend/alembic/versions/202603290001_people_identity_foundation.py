"""people identity foundation

Revision ID: 202603290001
Revises: 202603270001
Create Date: 2026-03-29 11:30:00.000000
"""

from __future__ import annotations

import json
import uuid

import sqlalchemy as sa

from alembic import op

revision = "202603290001"
down_revision = "202603270001"
branch_labels = None
depends_on = None


def _split_display_name(value: str | None, fallback_email: str | None) -> tuple[str, str]:
    cleaned = " ".join((value or "").strip().split())
    if cleaned:
        parts = cleaned.split(" ", 1)
        if len(parts) == 1:
            return parts[0], ""
        return parts[0], parts[1]
    if fallback_email:
        return fallback_email.split("@", 1)[0], ""
    return "Unknown", ""


def upgrade() -> None:
    op.create_table(
        "people",
        sa.Column("first_name", sa.String(length=120), nullable=False),
        sa.Column("last_name", sa.String(length=120), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("normalized_email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("normalized_phone", sa.String(length=64), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("gender", sa.String(length=64), nullable=True),
        sa.Column("external_ref", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("profile_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_people_full_name"), "people", ["full_name"], unique=False)
    op.create_index(op.f("ix_people_email"), "people", ["email"], unique=False)
    op.create_index(
        op.f("ix_people_normalized_email"), "people", ["normalized_email"], unique=False
    )
    op.create_index(op.f("ix_people_phone"), "people", ["phone"], unique=False)
    op.create_index(
        op.f("ix_people_normalized_phone"), "people", ["normalized_phone"], unique=False
    )
    op.create_index(op.f("ix_people_external_ref"), "people", ["external_ref"], unique=False)

    op.create_table(
        "account_customers",
        sa.Column("club_id", sa.Uuid(), nullable=False),
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("account_code", sa.String(length=64), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("billing_email", sa.String(length=255), nullable=True),
        sa.Column("billing_phone", sa.String(length=64), nullable=True),
        sa.Column("billing_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "club_id", "account_code", name="uq_account_customers_club_account_code"
        ),
        sa.UniqueConstraint("club_id", "person_id", name="uq_account_customers_club_person"),
    )

    op.add_column("users", sa.Column("person_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_users_person_id"), "users", ["person_id"], unique=True)
    op.create_foreign_key(
        "fk_users_person_id_people", "users", "people", ["person_id"], ["id"], ondelete="SET NULL"
    )

    op.add_column("club_memberships", sa.Column("person_id", sa.Uuid(), nullable=True))
    op.add_column(
        "club_memberships",
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()
        ),
    )
    op.add_column(
        "club_memberships", sa.Column("membership_number", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "club_memberships",
        sa.Column("membership_metadata", sa.JSON(), nullable=True, server_default=sa.text("'{}'")),
    )

    bind = op.get_bind()
    users = sa.table(
        "users",
        sa.column("id", sa.Uuid()),
        sa.column("email", sa.String()),
        sa.column("display_name", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    people = sa.table(
        "people",
        sa.column("id", sa.Uuid()),
        sa.column("first_name", sa.String()),
        sa.column("last_name", sa.String()),
        sa.column("full_name", sa.String()),
        sa.column("email", sa.String()),
        sa.column("normalized_email", sa.String()),
        sa.column("profile_metadata", sa.JSON()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    club_memberships = sa.table(
        "club_memberships",
        sa.column("id", sa.Uuid()),
        sa.column("user_id", sa.Uuid()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("person_id", sa.Uuid()),
        sa.column("joined_at", sa.DateTime(timezone=True)),
        sa.column("membership_metadata", sa.JSON()),
    )

    user_rows = bind.execute(sa.select(users)).mappings().all()
    person_map: dict[uuid.UUID, uuid.UUID] = {}
    for row in user_rows:
        person_id = uuid.uuid4()
        first_name, last_name = _split_display_name(row["display_name"], row["email"])
        bind.execute(
            people.insert().values(
                id=person_id,
                first_name=first_name,
                last_name=last_name,
                full_name=" ".join(part for part in [first_name, last_name] if part).strip(),
                email=(row["email"] or "").lower() or None,
                normalized_email=(row["email"] or "").lower() or None,
                profile_metadata={},
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
        )
        bind.execute(
            sa.text("UPDATE users SET person_id = :person_id WHERE id = :user_id"),
            {"person_id": person_id, "user_id": row["id"]},
        )
        person_map[row["id"]] = person_id

    membership_rows = bind.execute(sa.select(club_memberships)).mappings().all()
    for row in membership_rows:
        bind.execute(
            sa.text(
                """
                UPDATE club_memberships
                SET person_id = :person_id,
                    joined_at = COALESCE(joined_at, :joined_at),
                    membership_metadata = COALESCE(membership_metadata, :membership_metadata)
                WHERE id = :membership_id
                """
            ),
            {
                "person_id": person_map[row["user_id"]],
                "joined_at": row["created_at"],
                "membership_metadata": json.dumps({}),
                "membership_id": row["id"],
            },
        )

    op.drop_constraint("uq_club_memberships_user_club", "club_memberships", type_="unique")
    op.drop_constraint("club_memberships_user_id_fkey", "club_memberships", type_="foreignkey")
    op.alter_column("club_memberships", "person_id", existing_type=sa.Uuid(), nullable=False)
    op.alter_column("club_memberships", "joined_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column("club_memberships", "membership_metadata", existing_type=sa.JSON(), nullable=False)
    op.create_foreign_key(
        "fk_club_memberships_person_id_people",
        "club_memberships",
        "people",
        ["person_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint("uq_club_memberships_person_club", "club_memberships", ["person_id", "club_id"])
    op.create_unique_constraint(
        "uq_club_memberships_club_membership_number",
        "club_memberships",
        ["club_id", "membership_number"],
    )
    op.drop_column("club_memberships", "user_id")


def downgrade() -> None:
    op.add_column("club_memberships", sa.Column("user_id", sa.Uuid(), nullable=True))

    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE club_memberships
            SET user_id = users.id
            FROM users
            WHERE users.person_id = club_memberships.person_id
            """
        )
    )

    op.alter_column("club_memberships", "user_id", existing_type=sa.Uuid(), nullable=False)
    op.create_foreign_key(
        "club_memberships_user_id_fkey",
        "club_memberships",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint("uq_club_memberships_user_club", "club_memberships", ["user_id", "club_id"])
    op.drop_constraint("uq_club_memberships_club_membership_number", "club_memberships", type_="unique")
    op.drop_constraint("uq_club_memberships_person_club", "club_memberships", type_="unique")
    op.drop_constraint("fk_club_memberships_person_id_people", "club_memberships", type_="foreignkey")
    op.drop_column("club_memberships", "membership_metadata")
    op.drop_column("club_memberships", "membership_number")
    op.drop_column("club_memberships", "joined_at")
    op.drop_column("club_memberships", "person_id")

    op.drop_constraint("fk_users_person_id_people", "users", type_="foreignkey")
    op.drop_index(op.f("ix_users_person_id"), table_name="users")
    op.drop_column("users", "person_id")

    op.drop_table("account_customers")
    op.drop_index(op.f("ix_people_external_ref"), table_name="people")
    op.drop_index(op.f("ix_people_normalized_phone"), table_name="people")
    op.drop_index(op.f("ix_people_phone"), table_name="people")
    op.drop_index(op.f("ix_people_normalized_email"), table_name="people")
    op.drop_index(op.f("ix_people_email"), table_name="people")
    op.drop_index(op.f("ix_people_full_name"), table_name="people")
    op.drop_table("people")
