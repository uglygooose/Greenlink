from sqlalchemy import create_engine
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

if not DATABASE_URL:
    MYSQL_USER = os.getenv("MYSQL_USER", "root")
    MYSQL_PASSWORD = quote_plus(os.getenv("MYSQL_PASSWORD", ""))
    MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
    MYSQL_PORT = os.getenv("MYSQL_PORT", "3306")
    MYSQL_DB = os.getenv("MYSQL_DB", "greenlink")

    DATABASE_URL = f"mysql+mysqlconnector://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}"

connect_args = {}
# Supabase's PgBouncer pooler (transaction mode) can break when the driver uses
# server-side prepared statements. psycopg3 enables them by default after a few
# executions; disable them to avoid 500s on simple queries (e.g. /login).
if DATABASE_URL and DATABASE_URL.startswith("postgresql+psycopg"):
    connect_args["prepare_threshold"] = 0

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args=connect_args,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
