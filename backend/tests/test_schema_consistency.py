"""Schema-consistency sentinel: catches model/migration drift.

Asserts that key column types, enum values, constraints, indexes, and a
representative sample of server_defaults in the live test database match
their SQLAlchemy model declarations. The test database is built by running
real Alembic migrations (per backend/tests/conftest.py), so a mismatch here
indicates real drift between a model declaration and the migrations that
ship that table — exactly the class of bug Phase 2 caught by hand for
pricing_rules and Phase 5 caught by suite-run for the 8 enum columns across
booking_rule_sets, communication_blasts, and news_posts.

Sentinel scope, not exhaustive validator. Covers the 10 enum columns and
3 enum-value completeness checks (Pattern C), the finance_transactions
CHECK constraint declaration (Pattern E), the 6 indexes added in Phase 5
(Pattern E), a representative server_default subset (Pattern E sentinel),
plus a probe that proves the conftest fixture uses migrations
(not Base.metadata.create_all).
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

# Each entry: (table, column, expected Postgres udt_name).
# All listed columns should be USER-DEFINED Postgres enum types whose udt_name
# matches the lowercase StrEnum class name (the GreenLink naming convention).
ENUM_COLUMNS = [
    ("pricing_rules", "player_type", "pricingplayertype"),
    ("pricing_rules", "season", "pricingseason"),
    ("booking_rule_sets", "applies_to", "bookingruleappliesto"),
    ("booking_rule_sets", "scope_type", "bookingrulescopetype"),
    ("booking_rule_sets", "conflict_strategy", "bookingruleconflictstrategy"),
    ("communication_blasts", "target_segment", "blasttargetsegment"),
    ("communication_blasts", "channel", "blastchannel"),
    ("communication_blasts", "status", "blaststatus"),
    ("news_posts", "visibility", "newspostvisibility"),
    ("news_posts", "status", "newspoststatus"),
]

# Pattern C: enum types whose Python StrEnums were ahead of the Postgres enum
# value list. 202605110002 added these values via ALTER TYPE ADD VALUE IF NOT
# EXISTS; this test pins the post-fix state.
ENUM_VALUE_COMPLETENESS = [
    ("pricingdaytype", "any"),
    ("pricingtimeband", "any"),
    ("pricingruleappliesto", "staff"),
]

# Pattern E indexes added during Phase 5 to declare migration-created indexes
# that the models were missing. Each tuple is (table, expected_index_name).
PHASE5_INDEXES = [
    ("news_posts", "ix_news_posts_status"),
    ("finance_transactions", "ix_finance_transactions_account_created_at"),
    ("accounting_export_profiles", "ix_accounting_export_profiles_club_id"),
    ("accounting_export_profiles", "ix_accounting_export_profiles_created_by_person_id"),
    ("orders", "ix_orders_club_status_created_at"),
    ("club_configs", "ix_club_configs_preferred_accounting_profile_id"),
]

# Pattern E server_default sentinel: representative subset of the 46 columns
# whose model declarations were aligned with migration-set DB defaults in
# Phase 5. One-from-each-shape coverage (json, enum, bool, int, varchar).
# Not exhaustive — if you add a new column with a server_default in a future
# migration, declare it on the model too; alembic --autogenerate will surface
# any divergence.
SERVER_DEFAULT_SENTINEL = [
    ("club_memberships", "membership_metadata", "'{}'::json"),
    ("booking_rule_sets", "scope_type", "'club'::bookingrulescopetype"),
    ("tee_sheet_slot_states", "manually_blocked", "false"),
    ("club_configs", "booking_window_days", "14"),
    ("clubs", "onboarding_state", "'onboarding_started'::character varying"),
]


def test_alembic_version_table_is_populated(db_session: Session) -> None:
    """alembic_version exists and holds a head revision — proves conftest ran migrations."""
    head = db_session.execute(text("SELECT version_num FROM alembic_version")).scalar()
    assert head is not None, (
        "alembic_version table is empty — conftest did not run migrations. "
        "Did the migration-based fixture regress to Base.metadata.create_all()?"
    )


@pytest.mark.parametrize(("table_name", "column_name", "expected_udt"), ENUM_COLUMNS)
def test_enum_column_is_postgres_enum(
    db_session: Session, table_name: str, column_name: str, expected_udt: str
) -> None:
    """Each Phase-5-tracked enum column is a USER-DEFINED Postgres enum with the expected udt_name."""
    row = db_session.execute(
        text(
            """
            SELECT data_type, udt_name
            FROM information_schema.columns
            WHERE table_name = :table_name AND column_name = :column_name
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    ).one()
    assert row.data_type == "USER-DEFINED", (
        f"{table_name}.{column_name} data_type is {row.data_type!r}, expected USER-DEFINED. "
        "Model declares an Enum; migrations must create a Postgres enum type to match."
    )
    assert row.udt_name == expected_udt, (
        f"{table_name}.{column_name} udt_name is {row.udt_name!r}, expected {expected_udt!r}."
    )


@pytest.mark.parametrize(("enum_name", "expected_value"), ENUM_VALUE_COMPLETENESS)
def test_pattern_c_enum_value_present(
    db_session: Session, enum_name: str, expected_value: str
) -> None:
    """Each Postgres enum that Python StrEnum 'any'/'staff' values bind to includes that value.

    Regression guard for the Phase 5 Pattern C drift: enum types created in
    202603290002 missed values that Python's enums declared. 202605110002
    closes the gap via ALTER TYPE ADD VALUE; this test pins the post-fix state.
    """
    values = (
        db_session.execute(
            text(
                """
            SELECT enumlabel FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = :enum_name
            """
            ),
            {"enum_name": enum_name},
        )
        .scalars()
        .all()
    )
    assert expected_value in values, (
        f"Postgres enum {enum_name!r} is missing value {expected_value!r}. "
        f"Present values: {values}. Did a migration drop or recreate the type?"
    )


def test_finance_transactions_amount_check_declared(db_session: Session) -> None:
    """The migration-created CHECK on finance_transactions.amount is present in DB.

    Phase 5 found that the model omitted this CHECK declaration even though
    the migration created it. The model now declares it via __table_args__;
    this test ensures the DB-side constraint still exists (it's now load-bearing
    documentation: the model says 'amount != 0', so the DB had better enforce it).
    """
    row = db_session.execute(
        text(
            """
            SELECT pg_get_constraintdef(oid) AS cdef
            FROM pg_constraint
            WHERE conname = 'ck_finance_transactions_amount_non_zero'
              AND connamespace = 'public'::regnamespace
            """
        )
    ).one_or_none()
    assert row is not None, (
        "CHECK constraint ck_finance_transactions_amount_non_zero is missing from DB. "
        "Migration 202603300001 or its successors should create it."
    )
    assert "amount" in row.cdef and "<>" in row.cdef, (
        f"CHECK constraint definition unexpected: {row.cdef!r}"
    )


@pytest.mark.parametrize(("table_name", "index_name"), PHASE5_INDEXES)
def test_phase5_index_exists(db_session: Session, table_name: str, index_name: str) -> None:
    """Each migration-created index that Phase 5 declared on its model still exists in DB.

    Pattern E sentinel — if a future model edit accidentally removes the
    Index/index=True declaration without a paired migration, this test stays
    green (the DB still has it) but autogenerate would propose adding it back.
    The point of this assertion is to prevent the inverse: dropping the
    DB-side index without also clearing the model declaration.
    """
    exists = db_session.execute(
        text(
            """
            SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = :table_name
              AND indexname = :index_name
            """
        ),
        {"table_name": table_name, "index_name": index_name},
    ).scalar()
    assert exists, (
        f"Index {index_name!r} on table {table_name!r} is missing. "
        "Either a migration dropped it without updating the model, or a "
        "renamed index has broken naming convention alignment."
    )


@pytest.mark.parametrize(("table_name", "column_name", "expected_default"), SERVER_DEFAULT_SENTINEL)
def test_phase5_server_default_mirrored(
    db_session: Session, table_name: str, column_name: str, expected_default: str
) -> None:
    """Representative server_default values match what the migration set.

    Pattern E sentinel — this isn't exhaustive (Phase 5 declared 46
    server_defaults on models). It picks one entry per default-shape (json,
    enum, bool, int, varchar) so a regression in default handling fails
    here before slipping past autogenerate.
    """
    actual = db_session.execute(
        text(
            """
            SELECT column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = :table_name
              AND column_name = :column_name
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    ).scalar()
    assert actual == expected_default, (
        f"{table_name}.{column_name} column_default is {actual!r}, expected {expected_default!r}."
    )
