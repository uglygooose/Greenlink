from __future__ import annotations

import csv
import hashlib
import io
import re
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", (value or "").strip().lower()).strip("_")


def normalize_row_keys(row: dict[str, Any]) -> dict[str, Any]:
    return {normalize_key(str(k)): v for k, v in (row or {}).items()}


def parse_import_date(value: Any) -> date | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except Exception:
            continue
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except Exception:
        return None


def parse_import_datetime(value: Any) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        pass
    for fmt in ("%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M", "%d/%m/%Y %H:%M"):
        try:
            return datetime.strptime(raw, fmt)
        except Exception:
            continue
    return None


def parse_import_amount(value: Any) -> float | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    neg = False
    if raw.startswith("(") and raw.endswith(")"):
        neg = True
        raw = raw[1:-1]
    raw = raw.replace("R", "").replace("$", "").replace("Â£", "").replace("â‚¬", "")
    raw = raw.replace(",", "").strip()
    try:
        parsed = float(raw)
        return -parsed if neg else parsed
    except Exception:
        return None


def sha256_bytes(data: bytes) -> str:
    hasher = hashlib.sha256()
    hasher.update(data)
    return hasher.hexdigest()


def open_csv_reader(content: bytes) -> csv.DictReader:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = content.decode(encoding)
            return csv.DictReader(io.StringIO(text))
        except Exception:
            continue
    raise HTTPException(status_code=400, detail="Could not decode CSV file")


def normalize_revenue_stream(value: Any) -> str | None:
    raw = str(value or "").strip().lower()
    if not raw:
        return None
    aliases = {
        "bar": "pub",
        "restaurant": "pub",
        "food": "pub",
        "fnb": "pub",
        "clubhouse": "pub",
        "bowling": "bowls",
        "greens": "bowls",
        "golfshop": "golf",
        "proshop": "pro_shop",
        "pro_shop": "pro_shop",
        "retail": "pro_shop",
        "shop": "pro_shop",
        "greenfee": "golf",
        "green_fees": "golf",
        "green fees": "golf",
    }
    return aliases.get(raw, raw)
