from __future__ import annotations

import os
from sqlalchemy import text


def run_auto_migrations(engine) -> None:
    """
    Minimal, idempotent schema migrations for demos.

    Why:
    - SQLAlchemy `create_all()` will not add/alter columns on existing tables.
    - For Render + Supabase demos we want "push code, redeploy, it works".

    This is gated behind `AUTO_MIGRATE=1` so production can later move to a
    proper migration tool (alembic/supabase migrations).
    """

    if str(os.getenv("AUTO_MIGRATE", "")).strip() not in {"1", "true", "TRUE", "yes", "YES"}:
        return

    dialect = getattr(getattr(engine, "dialect", None), "name", "") or ""
    if dialect not in {"postgresql", "postgres"}:
        return

    statements: list[str] = [
        # ----------------------------
        # Enum extensions (fee_type)
        # ----------------------------
        # Adding enum values is not covered by `create_all()` and would otherwise break
        # when the Python enum is extended.
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fee_type') THEN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'fee_type' AND e.enumlabel = 'push_cart'
            ) THEN
              ALTER TYPE fee_type ADD VALUE 'push_cart';
            END IF;

            IF NOT EXISTS (
              SELECT 1
              FROM pg_enum e
              JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'fee_type' AND e.enumlabel = 'caddy'
            ) THEN
              ALTER TYPE fee_type ADD VALUE 'caddy';
            END IF;
          END IF;
        END $$;
        """,
        # ----------------------------
        # Targets + settings tables
        # ----------------------------
        """
        CREATE TABLE IF NOT EXISTS kpi_targets (
          id bigserial PRIMARY KEY,
          year integer NOT NULL,
          metric text NOT NULL,
          annual_target double precision NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (year, metric)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS club_settings (
          key text PRIMARY KEY,
          value text NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        """,
        # ----------------------------
        # Users additions
        # ----------------------------
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text NULL;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type text NULL;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS handicap_sa_id text NULL;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS home_course text NULL;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS handicap_number text NULL;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS greenlink_id text NULL;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date timestamptz NULL;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text NULL;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS player_category text NULL;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS handicap_index double precision NULL;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS student boolean NULL;",
        # ----------------------------
        # Members additions
        # ----------------------------
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS member_number text NULL;",
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS email text NULL;",
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS phone text NULL;",
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS handicap_number text NULL;",
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS home_club text NULL;",
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS gender text NULL;",
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS player_category text NULL;",
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS handicap_index double precision NULL;",
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS handicap_sa_id text NULL;",
        "ALTER TABLE members ADD COLUMN IF NOT EXISTS student boolean NULL;",
        # ----------------------------
        # Bookings additions (snapshot + requirements)
        # ----------------------------
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS player_type text NULL;",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS holes integer NULL;",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS prepaid boolean NULL;",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gender text NULL;",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS player_category text NULL;",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS handicap_sa_id text NULL;",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS home_club text NULL;",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS handicap_index_at_booking double precision NULL;",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS handicap_index_at_play double precision NULL;",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cart boolean NULL;",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS push_cart boolean NULL;",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS caddy boolean NULL;",
        # ----------------------------
        # Tee times additions
        # ----------------------------
        "ALTER TABLE tee_times ADD COLUMN IF NOT EXISTS available_from timestamptz NULL;",
        "ALTER TABLE tee_times ADD COLUMN IF NOT EXISTS bookable_until timestamptz NULL;",
        # ----------------------------
        # Supabase hardening (PostgREST exposure)
        # ----------------------------
        # Supabase's Security Advisor flags tables in the `public` schema without RLS enabled.
        # Our app uses a server-side DB connection (not the Supabase client SDK), so it's safe
        # to enable RLS without policies: PostgREST access is denied by default.
        "ALTER TABLE IF EXISTS public.fee_categories ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE IF EXISTS public.accounting_settings ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE IF EXISTS public.day_closures ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE IF EXISTS public.rounds ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE IF EXISTS public.ledger_entries ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE IF EXISTS public.ledger_entry_meta ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE IF EXISTS public.members ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE IF EXISTS public.tee_times ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE IF EXISTS public.bookings ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE IF EXISTS public.kpi_targets ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE IF EXISTS public.club_settings ENABLE ROW LEVEL SECURITY;",
    ]

    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
