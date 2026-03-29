from __future__ import annotations

from collections.abc import Generator
import os
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.auth.dependencies import get_db
from app.db.base import Base
from app.main import app

DEFAULT_TEST_DATABASE_URL = "postgresql+psycopg://greenlink:greenlink@localhost:5432/greenlink_test"
DEFAULT_TEST_ADMIN_DATABASE_URL = "postgresql+psycopg://greenlink:greenlink@localhost:5432/postgres"


def _ensure_postgres_test_database() -> None:
    test_database_url = os.getenv("GREENLINK_TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)
    admin_database_url = os.getenv("GREENLINK_TEST_ADMIN_DATABASE_URL", DEFAULT_TEST_ADMIN_DATABASE_URL)
    database_name = make_url(test_database_url).database
    if database_name is None or not re.fullmatch(r"[A-Za-z0-9_]+", database_name):
        raise RuntimeError("GREENLINK_TEST_DATABASE_URL must target a simple PostgreSQL database name")

    admin_engine = create_engine(admin_database_url, future=True, isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as connection:
            exists = connection.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :database_name"),
                {"database_name": database_name},
            ).scalar()
            if not exists:
                connection.execute(text(f'CREATE DATABASE "{database_name}"'))
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
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
