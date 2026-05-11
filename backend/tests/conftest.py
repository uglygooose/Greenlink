from __future__ import annotations

import os
import re
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from app.auth.dependencies import get_db
from app.db.base import Base
from app.main import app

# PostgreSQL ENUM types that SQLAlchemy creates but may not reliably drop via
# drop_all() when reusing the same test database across test functions.
# This list must be kept in sync with any sa.Enum / Mapped[StrEnum] columns.
_ENUM_TYPE_NAMES = [
    "usertype",
    "clubmembershiprole",
    "clubmembershipstatus",
    "clubinvitationstatus",
    "clubonboardingstate",
    "clubonboardingstep",
    "readinessstatus",
    "integrityissueseverity",
    "integrityissuescope",
    "bulkintakeaction",
    "bookingruleappliesto",
    "bookingrulescopetype",
    "bookingruleconflictstrategy",
    "bookingruletype",
    "pricingruleappliesto",
    "pricingplayertype",
    "pricingdaytype",
    "pricingseason",
    "pricingtimeband",
    "bookingstatus",
    "bookingparticipanttype",
    "bookingsource",
    "financeaccountstatus",
    "financetransactiontype",
    "financetransactionsource",
    "financeexportprofile",
    "financeexportbatchstatus",
    "ordersource",
    "orderstatus",
    "tendertype",
    "startlane",
    "bookingpaymentstatus",
    "newspostvisibility",
    "newspoststatus",
    "blasttargetsegment",
    "blastchannel",
    "blaststatus",
]


def _drop_all_enum_types(engine) -> None:
    """Explicitly drop all PostgreSQL ENUM types that may linger after drop_all()."""
    with engine.connect() as conn:
        for type_name in _ENUM_TYPE_NAMES:
            conn.execute(text(f'DROP TYPE IF EXISTS "{type_name}" CASCADE'))
        conn.commit()


DEFAULT_TEST_DATABASE_URL = "postgresql+psycopg://greenlink:greenlink@localhost:5432/greenlink_test"
DEFAULT_TEST_ADMIN_DATABASE_URL = "postgresql+psycopg://greenlink:greenlink@localhost:5432/postgres"
TEST_DB_PREFLIGHT_CONNECT_TIMEOUT_SECONDS = 5


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
    Base.metadata.drop_all(bind=engine)
    _drop_all_enum_types(engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        _drop_all_enum_types(engine)
        engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
