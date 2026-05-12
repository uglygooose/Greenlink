"""fix pricing_rules enum drift

Revision ID: 202605110002
Revises: 202605110001
Create Date: 2026-05-11 22:00:00.000000

Converts pricing_rules.player_type and pricing_rules.season from VARCHAR
(introduced in 202604130003) to proper PostgreSQL enum types matching the
SQLAlchemy model declarations in app/models/pricing_rule.py. Resolves the
model/migration type drift originally surfaced in Phase 2 and logged in
docs/DRIFT_LOG.md.

Phase 5 census expansion: also closes Pattern C drift where three pre-existing
Postgres enum types declared in 202603290002 were missing values that the
Python StrEnums in app/models/enums.py already declared. ALTER TYPE ADD VALUE
IF NOT EXISTS is idempotent and safe; Postgres has no DROP VALUE, so downgrade
is necessarily a no-op for these three statements (documented inline).
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "202605110002"
down_revision = "202605110001"
branch_labels = None
depends_on = None


player_type_enum = postgresql.ENUM(
    "member_standard",
    "visitor_affiliated",
    "visitor_non_affiliated",
    "scholar",
    "student",
    "pensioner",
    "staff_courtesy",
    name="pricingplayertype",
    create_type=False,
)
season_enum = postgresql.ENUM(
    "any",
    "peak",
    "off_peak",
    name="pricingseason",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    player_type_enum.create(bind, checkfirst=True)
    season_enum.create(bind, checkfirst=True)

    # player_type: drop string default, convert column to enum, restore default
    # as an enum literal. The USING cast relies on every existing value matching
    # a defined enum value; an unknown value will fail the migration loudly,
    # which is the desired behaviour for a drift fix.
    op.alter_column("pricing_rules", "player_type", server_default=None)
    op.execute(
        "ALTER TABLE pricing_rules "
        "ALTER COLUMN player_type TYPE pricingplayertype "
        "USING player_type::pricingplayertype"
    )
    op.alter_column(
        "pricing_rules",
        "player_type",
        server_default=sa.text("'member_standard'::pricingplayertype"),
    )

    op.alter_column("pricing_rules", "season", server_default=None)
    op.execute(
        "ALTER TABLE pricing_rules "
        "ALTER COLUMN season TYPE pricingseason "
        "USING season::pricingseason"
    )
    op.alter_column(
        "pricing_rules",
        "season",
        server_default=sa.text("'any'::pricingseason"),
    )

    # Pattern C drift: add enum values that the Python StrEnums declare but
    # the Postgres enum types (created in 202603290002) were missing. Required
    # by the schema-consistency sentinel and by production code paths that
    # bind the "any"/"staff" wildcards. Idempotent via IF NOT EXISTS so the
    # migration is safe to re-run against a partially-migrated DB.
    op.execute("ALTER TYPE pricingdaytype ADD VALUE IF NOT EXISTS 'any'")
    op.execute("ALTER TYPE pricingtimeband ADD VALUE IF NOT EXISTS 'any'")
    op.execute("ALTER TYPE pricingruleappliesto ADD VALUE IF NOT EXISTS 'staff'")


def downgrade() -> None:
    # Pattern C ALTER TYPE ADD VALUE statements above are intentionally NOT
    # reversed here. Postgres provides no DROP VALUE for enum types, so the
    # only honest downgrade options are (a) leave the values in place (chosen),
    # or (b) recreate the enum types with the old value set and rewrite every
    # dependent column — far too invasive for a routine downgrade. Leaving the
    # extra enum values is benign: nothing in the older schema reads them.

    op.alter_column("pricing_rules", "season", server_default=None)
    op.execute("ALTER TABLE pricing_rules ALTER COLUMN season TYPE VARCHAR(32) USING season::text")
    op.alter_column(
        "pricing_rules",
        "season",
        server_default=sa.text("'any'::character varying"),
    )

    op.alter_column("pricing_rules", "player_type", server_default=None)
    op.execute(
        "ALTER TABLE pricing_rules "
        "ALTER COLUMN player_type TYPE VARCHAR(64) USING player_type::text"
    )
    op.alter_column(
        "pricing_rules",
        "player_type",
        server_default=sa.text("'member_standard'::character varying"),
    )

    bind = op.get_bind()
    season_enum.drop(bind, checkfirst=True)
    player_type_enum.drop(bind, checkfirst=True)
