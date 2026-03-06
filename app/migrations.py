from __future__ import annotations

import json
import os

from sqlalchemy import Column, inspect, text
from sqlalchemy.schema import CreateColumn, CreateIndex


def _env_true(key: str) -> bool:
    return str(os.getenv(key, "")).strip().lower() in {"1", "true", "yes", "y", "on"}


def _should_run_auto_migrations(engine) -> bool:
    dialect = str(getattr(getattr(engine, "dialect", None), "name", "") or "").lower()
    if dialect in {"mysql", "sqlite"}:
        return True
    return _env_true("AUTO_MIGRATE")


def _load_metadata_tables():
    from app import fee_models, models  # noqa: F401
    from app.database import Base

    return list(Base.metadata.sorted_tables)


def _plain_column(column) -> Column:
    return Column(column.name, column.type, nullable=column.nullable)


def _table_names(conn) -> set[str]:
    return set(inspect(conn).get_table_names())


def _column_map(conn, table_name: str) -> dict[str, dict]:
    return {str(col.get("name")): col for col in inspect(conn).get_columns(table_name)}


def _index_names(conn, table_name: str) -> set[str]:
    inspector = inspect(conn)
    names = {str(idx.get("name")) for idx in inspector.get_indexes(table_name) if idx.get("name")}
    names.update(
        str(constraint.get("name"))
        for constraint in inspector.get_unique_constraints(table_name)
        if constraint.get("name")
    )
    return names


def _safe_execute(conn, statement: str, params: dict | None = None) -> None:
    conn.execute(text(statement), params or {})


def _add_missing_columns(conn, table) -> list[str]:
    changed: list[str] = []
    existing = _column_map(conn, table.name)
    for column in table.columns:
        if column.name in existing:
            continue
        ddl = str(CreateColumn(_plain_column(column)).compile(dialect=conn.dialect))
        _safe_execute(conn, f"ALTER TABLE {table.name} ADD COLUMN {ddl}")
        changed.append(column.name)
    return changed


def _create_missing_indexes(conn, table) -> list[str]:
    created: list[str] = []
    existing = _index_names(conn, table.name)
    for index in sorted(table.indexes, key=lambda row: row.name or ""):
        if index.unique:
            continue
        if not index.name or index.name in existing:
            continue
        ddl = str(CreateIndex(index).compile(dialect=conn.dialect))
        _safe_execute(conn, ddl)
        created.append(index.name)
    return created


def _existing_enum_values(conn, table_name: str, column_name: str) -> list[str]:
    col = _column_map(conn, table_name).get(column_name)
    if not col:
        return []
    col_type = col.get("type")
    values = getattr(col_type, "enums", None)
    if not values:
        return []
    return [str(v) for v in values]


def _ensure_mysql_enum_columns(conn, tables_by_name: dict[str, object]) -> list[str]:
    if str(getattr(conn.dialect, "name", "")).lower() != "mysql":
        return []

    repaired: list[str] = []
    for table_name, column_name in (
        ("users", "role"),
        ("fee_categories", "fee_type"),
        ("bookings", "status"),
        ("bookings", "source"),
    ):
        table = tables_by_name.get(table_name)
        if table is None or column_name not in table.c:
            continue
        desired = [str(v) for v in getattr(table.c[column_name].type, "enums", [])]
        if not desired:
            continue
        current = _existing_enum_values(conn, table_name, column_name)
        if current and set(desired).issubset(set(current)):
            continue
        ddl = str(CreateColumn(_plain_column(table.c[column_name])).compile(dialect=conn.dialect))
        _safe_execute(conn, f"ALTER TABLE {table_name} MODIFY COLUMN {ddl}")
        repaired.append(f"{table_name}.{column_name}")
    return repaired


def _ensure_postgres_enum_values(conn, tables_by_name: dict[str, object]) -> list[str]:
    if str(getattr(conn.dialect, "name", "")).lower() not in {"postgresql", "postgres"}:
        return []

    repaired: list[str] = []
    for table_name, column_name in (("users", "role"), ("fee_categories", "fee_type")):
        table = tables_by_name.get(table_name)
        if table is None or column_name not in table.c:
            continue
        enum_type = getattr(table.c[column_name].type, "name", None)
        values = [str(v) for v in getattr(table.c[column_name].type, "enums", [])]
        if not enum_type or not values:
            continue
        for value in values:
            safe_value = value.replace("'", "''")
            safe_type = str(enum_type).replace('"', "").replace("'", "")
            statement = f"""
            DO $$
            BEGIN
              IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '{safe_type}') THEN
                IF NOT EXISTS (
                  SELECT 1
                  FROM pg_enum e
                  JOIN pg_type t ON t.oid = e.enumtypid
                  WHERE t.typname = '{safe_type}' AND e.enumlabel = '{safe_value}'
                ) THEN
                  ALTER TYPE {safe_type} ADD VALUE '{safe_value}';
                END IF;
              END IF;
            END $$;
            """
            _safe_execute(conn, statement)
            repaired.append(f"{safe_type}:{safe_value}")
    return repaired


def _repair_club_settings_primary_key(conn) -> bool:
    dialect = str(getattr(conn.dialect, "name", "")).lower()
    if dialect not in {"mysql", "postgresql", "postgres"}:
        return False
    if "club_settings" not in _table_names(conn):
        return False
    cols = _column_map(conn, "club_settings")
    if "club_id" not in cols or "key" not in cols:
        return False
    null_count = int(conn.execute(text("SELECT COUNT(*) FROM club_settings WHERE club_id IS NULL")).scalar() or 0)
    if null_count > 0:
        return False
    pk_cols = [str(v).lower() for v in (inspect(conn).get_pk_constraint("club_settings").get("constrained_columns") or [])]
    if pk_cols == ["club_id", "key"] or pk_cols == ["key", "club_id"]:
        return False
    if pk_cols != ["key"]:
        return False
    if dialect == "mysql":
        _safe_execute(conn, "ALTER TABLE club_settings DROP PRIMARY KEY, ADD PRIMARY KEY (club_id, `key`)")
        return True
    _safe_execute(conn, "ALTER TABLE club_settings DROP CONSTRAINT IF EXISTS club_settings_pkey")
    _safe_execute(conn, 'ALTER TABLE club_settings ADD PRIMARY KEY (club_id, "key")')
    return True


def _apply_default_value_backfills(conn) -> list[str]:
    table_names = _table_names(conn)
    applied: list[str] = []
    updates = [
        ("accounting_settings", "cashbook_contra_gl", "'8400/000'"),
        ("accounting_settings", "green_fees_gl", "'1000-000'"),
        ("accounting_settings", "cashbook_name", "'Main Bank'"),
        ("fee_categories", "active", "1"),
        ("account_customers", "active", "1"),
        ("golf_day_bookings", "payment_status", "'pending'"),
        ("pro_shop_products", "active", "1"),
        ("pro_shop_products", "stock_qty", "0"),
        ("pro_shop_products", "reorder_level", "0"),
        ("pro_shop_sales", "payment_method", "'card'"),
        ("pro_shop_sales", "subtotal", "0"),
        ("pro_shop_sales", "discount", "0"),
        ("pro_shop_sales", "tax", "0"),
        ("pro_shop_sales", "total", "0"),
        ("bookings", "party_size", "1"),
    ]
    for table_name, column_name, sql_value in updates:
        if table_name not in table_names:
            continue
        cols = _column_map(conn, table_name)
        if column_name not in cols:
            continue
        _safe_execute(
            conn,
            f"UPDATE {table_name} SET {column_name} = {sql_value} WHERE {column_name} IS NULL",
        )
        applied.append(f"{table_name}.{column_name}")
    return applied


def _record_schema_version(conn, details: dict) -> None:
    if "schema_versions" not in _table_names(conn):
        return
    payload = json.dumps(details, ensure_ascii=True, default=str, separators=(",", ":"))
    exists = conn.execute(
        text("SELECT component FROM schema_versions WHERE component = :component"),
        {"component": "auto_compatibility"},
    ).scalar()
    params = {
        "component": "auto_compatibility",
        "version": 2,
        "status": str(details.get("status") or "ready"),
        "details_json": payload,
    }
    if exists:
        _safe_execute(
            conn,
            """
            UPDATE schema_versions
            SET version = :version,
                status = :status,
                details_json = :details_json,
                updated_at = CURRENT_TIMESTAMP
            WHERE component = :component
            """,
            params,
        )
        return
    _safe_execute(
        conn,
        """
        INSERT INTO schema_versions (component, version, status, details_json, updated_at)
        VALUES (:component, :version, :status, :details_json, CURRENT_TIMESTAMP)
        """,
        params,
    )


def run_auto_migrations(engine) -> dict[str, object]:
    diagnostics: dict[str, object] = {
        "ran": False,
        "status": "skipped",
        "dialect": str(getattr(getattr(engine, "dialect", None), "name", "") or "").lower(),
        "added_columns": [],
        "created_indexes": [],
        "enum_repairs": [],
        "default_backfills": [],
        "repairs": [],
    }
    if not _should_run_auto_migrations(engine):
        return diagnostics

    tables = _load_metadata_tables()
    tables_by_name = {table.name: table for table in tables}

    with engine.begin() as conn:
        for table in tables:
            if table.name not in _table_names(conn):
                continue
            added = _add_missing_columns(conn, table)
            if added:
                diagnostics["added_columns"].append({"table": table.name, "columns": added})

        mysql_repairs = _ensure_mysql_enum_columns(conn, tables_by_name)
        if mysql_repairs:
            diagnostics["enum_repairs"].extend(mysql_repairs)
        postgres_repairs = _ensure_postgres_enum_values(conn, tables_by_name)
        if postgres_repairs:
            diagnostics["enum_repairs"].extend(postgres_repairs)

        for table in tables:
            if table.name not in _table_names(conn):
                continue
            created = _create_missing_indexes(conn, table)
            if created:
                diagnostics["created_indexes"].append({"table": table.name, "indexes": created})

        backfills = _apply_default_value_backfills(conn)
        if backfills:
            diagnostics["default_backfills"] = backfills
        if _repair_club_settings_primary_key(conn):
            diagnostics["repairs"].append("club_settings.primary_key")

        diagnostics["ran"] = True
        diagnostics["status"] = "ready"
        _record_schema_version(conn, diagnostics)
    return diagnostics
