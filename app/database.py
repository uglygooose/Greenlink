from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()

# Prefer a full SQLAlchemy database URL when provided (e.g., Supabase Postgres).
# Examples:
# - MySQL:     mysql+mysqlconnector://user:pass@localhost:3306/greenlink
# - Supabase:  postgresql+psycopg://postgres:pass@db.<ref>.supabase.co:5432/postgres
DATABASE_URL = os.getenv("DATABASE_URL")
DATABASE_URL_STRICT = str(os.getenv("DATABASE_URL_STRICT", "")).strip().lower() in {"1", "true", "yes"}

def _normalize_database_url(url: str | None) -> str | None:
    """
    Render/Supabase often provides Postgres URLs as:
      - postgres://...
      - postgresql://...

    SQLAlchemy's default driver for those schemes is typically psycopg2, but this
    project uses psycopg3 (installed via `psycopg[binary]`).

    Normalize to `postgresql+psycopg://...` so deployments don't fail with
    `ModuleNotFoundError: No module named 'psycopg2'`.
    """
    if not url:
        return url
    raw = url.strip()
    if not raw:
        return raw
    # If a driver is already specified (e.g., postgresql+psycopg), leave it alone.
    if raw.startswith("postgresql+"):
        return raw
    if raw.startswith("postgres://"):
        return "postgresql+psycopg://" + raw[len("postgres://") :]
    if raw.startswith("postgresql://"):
        return "postgresql+psycopg://" + raw[len("postgresql://") :]
    return raw

DATABASE_URL = _normalize_database_url(DATABASE_URL)

def _engine_info(engine) -> dict:
    try:
        url = engine.url
        return {
            "driver": getattr(url, "drivername", None),
            "host": getattr(url, "host", None),
            "port": getattr(url, "port", None),
            "database": getattr(url, "database", None),
        }
    except Exception:
        return {"driver": None, "host": None, "port": None, "database": None}

def _build_mysql_url() -> str:
    mysql_user = os.getenv("MYSQL_USER", "root")
    mysql_password = quote_plus(os.getenv("MYSQL_PASSWORD", ""))
    mysql_host = os.getenv("MYSQL_HOST", "localhost")
    mysql_port = os.getenv("MYSQL_PORT", "3306")
    mysql_db = os.getenv("MYSQL_DB", "greenlink")
    return f"mysql+mysqlconnector://{mysql_user}:{mysql_password}@{mysql_host}:{mysql_port}/{mysql_db}"

def _connect_args_for(url: str) -> dict:
    if not url:
        return {}
    if url.startswith("postgresql+psycopg"):
        # Supabase's PgBouncer pooler (transaction mode) can break when the driver uses
        # server-side prepared statements (prepared statements are per-connection, but
        # PgBouncer can swap server connections between transactions).
        #
        # psycopg3 uses prepared statements after `prepare_threshold` executions;
        # disable them entirely by setting it to `None`.
        return {"prepare_threshold": None}
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}

def _try_engine(url: str):
    if not url:
        return None, "empty url"
    connect_args = _connect_args_for(url)
    engine = create_engine(
        url,
        echo=False,
        pool_pre_ping=True,
        connect_args=connect_args,
    )
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1"))
        return engine, None
    except Exception as e:
        return None, str(e)[:200]

engine = None
engine_error = None
DB_SOURCE = None  # "DATABASE_URL" | "MYSQL" | "SQLITE"

if DATABASE_URL:
    engine, engine_error = _try_engine(DATABASE_URL)
    if engine_error:
        print(f"[DB] DATABASE_URL connection failed: {engine_error}")
    else:
        DB_SOURCE = "DATABASE_URL"

if engine is None and DATABASE_URL and DATABASE_URL_STRICT:
    raise RuntimeError("DATABASE_URL_STRICT is enabled, refusing to fall back after DATABASE_URL failure.")

if engine is None:
    mysql_url = _build_mysql_url()
    engine, engine_error = _try_engine(mysql_url)
    if engine_error:
        print(f"[DB] MySQL connection failed: {engine_error}")
    else:
        DB_SOURCE = "MYSQL"

if engine is None:
    sqlite_url = os.getenv("SQLITE_FALLBACK_URL", "sqlite:///./greenlink.dev.db")
    engine, engine_error = _try_engine(sqlite_url)
    if engine_error:
        print(f"[DB] SQLite fallback failed: {engine_error}")
        raise RuntimeError("Database initialization failed after all fallbacks.")
    DB_SOURCE = "SQLITE"

DB_INFO = _engine_info(engine)
if DATABASE_URL and DB_SOURCE != "DATABASE_URL":
    print(f"[DB] Using fallback database (source={DB_SOURCE}).")
    print("[DB] Hint: set DATABASE_URL_STRICT=1 to disable fallbacks after DATABASE_URL failure.")
print(
    f"[DB] Active database: source={DB_SOURCE} driver={DB_INFO.get('driver')} "
    f"host={DB_INFO.get('host')} port={DB_INFO.get('port')} db={DB_INFO.get('database')}"
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
