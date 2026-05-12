"""legal foundations (POPIA + VAT + HNA Player ID)

Revision ID: 202605120001
Revises: 202605110002
Create Date: 2026-05-12 14:00:00.000000

Adds (Phase 9A):
- people.consent_captured_at / consent_version / consent_source (POPIA §11)
- people.hna_player_id + global partial unique index (PRODUCT.md §6.6)
- clubs.information_officer_person_id (FK to people, SET NULL)
- clubs.information_officer_designated_at (POPIA §55–58)
- order_items.vat_category (NOT NULL, server_default 'other')
- pos_transaction_items.vat_category (NOT NULL, server_default 'other')
- bookings.vat_category (NOT NULL, server_default 'green_fee')
- CHECK constraints validating the enum value sets on all of the above

Backfill: pre-9A rows on order_items / pos_transaction_items get 'other'
(an explicit "uncategorised" marker — these rows pre-date §10(1)(cO)
tagging and do not reflect real apportionment). Bookings backfill to
'green_fee' because every booking in v1 is a green-fee event by domain.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "202605120001"
down_revision = "202605110002"
branch_labels = None
depends_on = None

VAT_CATEGORY_VALUES = ("sub_fee", "green_fee", "fnb", "non_member_income", "pro_shop", "other")
CONSENT_SOURCE_VALUES = ("onboarding", "member_app", "admin_capture", "import")


def _vat_check_clause(column: str) -> str:
    quoted = ", ".join(f"'{value}'" for value in VAT_CATEGORY_VALUES)
    return f"{column} IN ({quoted})"


def _consent_source_check_clause(column: str) -> str:
    quoted = ", ".join(f"'{value}'" for value in CONSENT_SOURCE_VALUES)
    return f"{column} IS NULL OR {column} IN ({quoted})"


def upgrade() -> None:
    # --- people: POPIA consent + HNA Player ID ---------------------------
    op.add_column(
        "people", sa.Column("consent_captured_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("people", sa.Column("consent_version", sa.String(length=64), nullable=True))
    op.add_column("people", sa.Column("consent_source", sa.String(length=32), nullable=True))
    op.add_column("people", sa.Column("hna_player_id", sa.String(length=32), nullable=True))
    op.create_check_constraint(
        "ck_people_consent_source_valid",
        "people",
        _consent_source_check_clause("consent_source"),
    )
    # Partial unique index: HNA assigns one ID per SA golfer globally, so the
    # constraint is global (not tenant-scoped); NULL rows are excluded.
    op.execute(
        "CREATE UNIQUE INDEX ix_people_hna_player_id_unique "
        "ON people (hna_player_id) WHERE hna_player_id IS NOT NULL"
    )

    # --- clubs: POPIA Information Officer --------------------------------
    op.add_column(
        "clubs",
        sa.Column("information_officer_person_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "clubs",
        sa.Column(
            "information_officer_designated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_clubs_information_officer_person_id_people",
        "clubs",
        "people",
        ["information_officer_person_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # --- bookings: VAT category ------------------------------------------
    op.add_column(
        "bookings",
        sa.Column(
            "vat_category",
            sa.String(length=32),
            nullable=False,
            server_default="green_fee",
        ),
    )
    op.create_check_constraint(
        "ck_bookings_vat_category_valid",
        "bookings",
        _vat_check_clause("vat_category"),
    )

    # --- order_items: VAT category ---------------------------------------
    op.add_column(
        "order_items",
        sa.Column(
            "vat_category",
            sa.String(length=32),
            nullable=False,
            server_default="other",
        ),
    )
    op.create_check_constraint(
        "ck_order_items_vat_category_valid",
        "order_items",
        _vat_check_clause("vat_category"),
    )

    # --- pos_transaction_items: VAT category -----------------------------
    op.add_column(
        "pos_transaction_items",
        sa.Column(
            "vat_category",
            sa.String(length=32),
            nullable=False,
            server_default="other",
        ),
    )
    op.create_check_constraint(
        "ck_pos_transaction_items_vat_category_valid",
        "pos_transaction_items",
        _vat_check_clause("vat_category"),
    )


def downgrade() -> None:
    # pos_transaction_items
    op.drop_constraint(
        "ck_pos_transaction_items_vat_category_valid",
        "pos_transaction_items",
        type_="check",
    )
    op.drop_column("pos_transaction_items", "vat_category")

    # order_items
    op.drop_constraint(
        "ck_order_items_vat_category_valid",
        "order_items",
        type_="check",
    )
    op.drop_column("order_items", "vat_category")

    # bookings
    op.drop_constraint(
        "ck_bookings_vat_category_valid",
        "bookings",
        type_="check",
    )
    op.drop_column("bookings", "vat_category")

    # clubs
    op.drop_constraint(
        "fk_clubs_information_officer_person_id_people",
        "clubs",
        type_="foreignkey",
    )
    op.drop_column("clubs", "information_officer_designated_at")
    op.drop_column("clubs", "information_officer_person_id")

    # people
    op.execute("DROP INDEX IF EXISTS ix_people_hna_player_id_unique")
    op.drop_constraint(
        "ck_people_consent_source_valid",
        "people",
        type_="check",
    )
    op.drop_column("people", "hna_player_id")
    op.drop_column("people", "consent_source")
    op.drop_column("people", "consent_version")
    op.drop_column("people", "consent_captured_at")
