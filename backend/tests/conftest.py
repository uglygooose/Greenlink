from __future__ import annotations

import os
import re
import uuid
from collections.abc import Generator
from pathlib import Path

# Tests always target the test database. Force GREENLINK_DATABASE_URL to the test
# URL BEFORE any app import triggers Settings() — so that both the FastAPI app's
# default engine and Alembic migrations (run via the Python API in fixtures below)
# hit the test database, never the user's configured runtime database.
os.environ["GREENLINK_DATABASE_URL"] = os.environ.get(
    "GREENLINK_TEST_DATABASE_URL",
    "postgresql+psycopg://greenlink:greenlink@localhost:5432/greenlink_test",
)

# Other secrets Settings() requires from env. Test-only values; setdefault leaves
# real shell env values untouched when present.
os.environ.setdefault("GREENLINK_SECRET_KEY", "pytest-only-secret-not-for-production")
os.environ.setdefault("GREENLINK_OBJECT_STORAGE_ACCESS_KEY", "pytest-only")
os.environ.setdefault("GREENLINK_OBJECT_STORAGE_SECRET_KEY", "pytest-only")

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from alembic import command
from app.auth.dependencies import get_db
from app.main import app
from app.models import DomainEventRecord

DEFAULT_TEST_DATABASE_URL = "postgresql+psycopg://greenlink:greenlink@localhost:5432/greenlink_test"
DEFAULT_TEST_ADMIN_DATABASE_URL = "postgresql+psycopg://greenlink:greenlink@localhost:5432/postgres"
TEST_DB_PREFLIGHT_CONNECT_TIMEOUT_SECONDS = 5
BACKEND_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_CONFIG_PATH = BACKEND_ROOT / "alembic.ini"


def _build_unreachable_postgres_message(
    *, test_database_url: str, admin_database_url: str, original_error: str
) -> str:
    return "\n".join(
        [
            "Backend tests require a reachable PostgreSQL server.",
            f"Expected test DB URL (default): {DEFAULT_TEST_DATABASE_URL}",
            f"Expected admin DB URL (default): {DEFAULT_TEST_ADMIN_DATABASE_URL}",
            f"Resolved GREENLINK_TEST_DATABASE_URL: {test_database_url}",
            f"Resolved GREENLINK_TEST_ADMIN_DATABASE_URL: {admin_database_url}",
            "Start the local Postgres service with:",
            "  docker compose up -d postgres",
            "Or override these env vars:",
            "  GREENLINK_TEST_DATABASE_URL",
            "  GREENLINK_TEST_ADMIN_DATABASE_URL",
            f"Original connection error: {original_error.splitlines()[0]}",
        ]
    )


def _ensure_postgres_test_database() -> None:
    test_database_url = os.getenv("GREENLINK_TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)
    admin_database_url = os.getenv(
        "GREENLINK_TEST_ADMIN_DATABASE_URL", DEFAULT_TEST_ADMIN_DATABASE_URL
    )
    database_name = make_url(test_database_url).database
    if database_name is None or not re.fullmatch(r"[A-Za-z0-9_]+", database_name):
        raise RuntimeError(
            "GREENLINK_TEST_DATABASE_URL must target a simple PostgreSQL database name"
        )

    admin_engine = create_engine(
        admin_database_url,
        future=True,
        isolation_level="AUTOCOMMIT",
        connect_args={"connect_timeout": TEST_DB_PREFLIGHT_CONNECT_TIMEOUT_SECONDS},
    )
    try:
        try:
            with admin_engine.connect() as connection:
                exists = connection.execute(
                    text("SELECT 1 FROM pg_database WHERE datname = :database_name"),
                    {"database_name": database_name},
                ).scalar()
                if not exists:
                    connection.execute(text(f'CREATE DATABASE "{database_name}"'))
        except OperationalError as exc:
            pytest.exit(
                _build_unreachable_postgres_message(
                    test_database_url=test_database_url,
                    admin_database_url=admin_database_url,
                    original_error=str(exc.orig),
                ),
                returncode=1,
            )
    finally:
        admin_engine.dispose()


def _reset_public_schema(engine: Engine) -> None:
    """Drop and recreate the public schema — wipes all tables, sequences, and enum types.

    A schema-level drop is what makes the migration-based fixture below cheap and
    reliable: it nukes the `alembic_version` tracker and every Postgres enum type
    in one statement, so the next `alembic upgrade head` starts from genuinely empty.
    """
    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.commit()


def _run_migrations(database_url: str) -> None:
    """Run `alembic upgrade head` against the given database URL via the Python API.

    env.py loads Settings() and writes settings.database_url onto the Alembic Config,
    overriding whatever this function sets via `set_main_option`. The module-level
    `os.environ["GREENLINK_DATABASE_URL"] = ...` assignment above pins
    Settings.database_url to the test database, so both pathways converge.
    """
    alembic_cfg = Config(str(ALEMBIC_CONFIG_PATH))
    alembic_cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(alembic_cfg, "head")


@pytest.fixture(scope="session", autouse=True)
def ensure_test_database() -> None:
    _ensure_postgres_test_database()


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    test_database_url = os.getenv("GREENLINK_TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)
    engine = create_engine(
        test_database_url,
        future=True,
        pool_pre_ping=True,
    )
    TestingSessionLocal = sessionmaker(
        bind=engine, autocommit=False, autoflush=False, expire_on_commit=False
    )
    _reset_public_schema(engine)
    _run_migrations(test_database_url)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        _reset_public_schema(engine)
        engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def assert_event_emitted(
    session: Session,
    *,
    entity_type: str,
    entity_id: str,
    action: str,
    actor_user_id: uuid.UUID | None = None,
    source_channel: str | None = None,
) -> DomainEventRecord:
    """Assert a DomainEventRecord matching the given coordinates was emitted.

    Maps the Phase 9B audit-log carrier names to the DomainEventRecord columns:
      entity_type → aggregate_type
      entity_id   → aggregate_id
      action      → event_type
    Source channel lives in payload['source_channel'] (publisher default 'system').
    Returns the matched event so the test can drill into snapshot contents.
    """
    stmt = select(DomainEventRecord).where(
        DomainEventRecord.aggregate_type == entity_type,
        DomainEventRecord.aggregate_id == entity_id,
        DomainEventRecord.event_type == action,
    )
    if actor_user_id is not None:
        stmt = stmt.where(DomainEventRecord.actor_user_id == actor_user_id)
    events = list(session.scalars(stmt).all())
    assert events, (
        f"No DomainEventRecord matched entity_type={entity_type!r}, "
        f"entity_id={entity_id!r}, action={action!r}"
    )
    if source_channel is not None:
        matches = [
            event
            for event in events
            if (event.payload or {}).get("source_channel") == source_channel
        ]
        assert matches, (
            f"No matching event had source_channel={source_channel!r}; "
            f"observed: {[(event.payload or {}).get('source_channel') for event in events]!r}"
        )
        return matches[0]
    return events[0]
