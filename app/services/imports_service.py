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


def decode_csv_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return content.decode(encoding)
        except Exception:
            continue
    raise HTTPException(status_code=400, detail="Could not decode CSV file")


def _normalize_multiline_csv_records(text: str) -> list[str]:
    lines = str(text or "").splitlines()
    records: list[str] = []
    buffer: list[str] = []
    quote_count = 0
    for raw_line in lines:
        line = str(raw_line or "").rstrip("\r")
        if not buffer and not line.strip():
            continue
        buffer.append(line)
        quote_count += line.count('"')
        if quote_count % 2 == 0:
            records.append("\n".join(buffer))
            buffer = []
            quote_count = 0
    if buffer:
        records.append("\n".join(buffer))
    return records


def _parse_csv_record(record: str) -> list[str]:
    parsed = next(csv.reader(io.StringIO(record)))
    if len(parsed) == 1 and "," in str(parsed[0] or ""):
        reparsed = next(csv.reader(io.StringIO(str(parsed[0] or ""))))
        if len(reparsed) > 1:
            return reparsed
    return parsed


def _parse_tee_sheet_slot_record(record: str) -> list[str]:
    def _clean_cell(value: str) -> str:
        return str(value or "").replace('"', "").strip()

    parsed = _parse_csv_record(record)
    if len(parsed) >= 6:
        return [_clean_cell(value) for value in parsed[:6]]

    lines = [str(line or "").rstrip("\r") for line in str(record or "").splitlines() if str(line or "").strip()]
    if not lines:
        return parsed

    first = re.match(r'^"?(?P<time>\d{1,2}:\d{2}\s+[AP]M),""(?P<hole>[^"]+)""(?:,""(?P<start>.*))?$', lines[0], flags=re.IGNORECASE)
    if not first:
        return parsed

    cells: list[str] = []
    current = str(first.group("start") or "")
    for line in lines[1:]:
        closing = re.match(r'^"(?P<append>.*)"""$', line)
        if closing:
            append_value = str(closing.group("append") or "")
            current = f"{current}\n{append_value}".strip() if current else append_value
            cells.append(_clean_cell(current))
            current = ""
            continue

        middle = re.match(r'^"(?P<append>.*?)"",""(?P<next>.*)"$', line)
        if middle:
            append_value = str(middle.group("append") or "")
            current = f"{current}\n{append_value}".strip() if current else append_value
            cells.append(_clean_cell(current))
            current = str(middle.group("next") or "")
            continue

        current = f"{current}\n{line}".strip() if current else line

    if current:
        cells.append(_clean_cell(current))

    while len(cells) < 4:
        cells.append("")

    return [_clean_cell(str(first.group("time") or "")), _clean_cell(str(first.group("hole") or "")), *cells[:4]]


def _parse_tee_sheet_date(value: str) -> date | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    for fmt in ("%A, %d %B %Y", "%d %B %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except Exception:
            continue
    return parse_import_date(raw)


def parse_tee_sheet_csv(content: bytes) -> dict[str, Any]:
    text = decode_csv_text(content)
    raw_lines = [str(line or "").rstrip("\r") for line in text.splitlines()]
    if not raw_lines:
        raise HTTPException(status_code=400, detail="Empty tee sheet CSV")

    course_name: str | None = None
    play_date: date | None = None
    slot_rows: list[dict[str, Any]] = []
    slot_index = 0
    data_started = False
    current_slot: list[str] = []

    for line in raw_lines:
        if not line.strip():
            continue
        if not data_started:
            parsed = _parse_csv_record(line)
            if not parsed:
                continue
            head = str(parsed[0] or "").strip()
            label = ",".join(str(item or "").strip().lower() for item in parsed[:2])
            if head.lower().startswith("course:"):
                course_name = str(parsed[1] if len(parsed) > 1 else "").strip() or None
                continue
            if head.lower().startswith("date:"):
                play_date = _parse_tee_sheet_date(str(parsed[1] if len(parsed) > 1 else ""))
                continue
            if "time" in label and "start hole" in label:
                data_started = True
                continue
            continue

        if re.match(r'^\s*"?\d{1,2}:\d{2}\s+[AP]M,', line, flags=re.IGNORECASE):
            if current_slot:
                parsed = _parse_tee_sheet_slot_record("\n".join(current_slot))
                if len(parsed) >= 2:
                    time_text = str(parsed[0] or "").strip()
                    hole_text = str(parsed[1] or "").strip()
                    if time_text and hole_text:
                        if play_date is None:
                            raise HTTPException(status_code=400, detail="Tee sheet date is missing")
                        try:
                            tee_clock = datetime.strptime(time_text, "%I:%M %p").time()
                        except Exception as exc:
                            raise HTTPException(status_code=400, detail=f"Invalid tee time in tee sheet: {time_text}") from exc
                        slot_index += 1
                        slot_rows.append(
                            {
                                "slot_index": slot_index,
                                "tee_time": datetime.combine(play_date, tee_clock),
                                "hole": hole_text,
                                "players": [str(value or "").strip() for value in parsed[2:6]],
                            }
                        )
            current_slot = [line]
        elif current_slot:
            current_slot.append(line)

    if current_slot:
        parsed = _parse_tee_sheet_slot_record("\n".join(current_slot))
        if len(parsed) >= 2:
            time_text = str(parsed[0] or "").strip()
            hole_text = str(parsed[1] or "").strip()
            if time_text and hole_text:
                if play_date is None:
                    raise HTTPException(status_code=400, detail="Tee sheet date is missing")
                try:
                    tee_clock = datetime.strptime(time_text, "%I:%M %p").time()
                except Exception as exc:
                    raise HTTPException(status_code=400, detail=f"Invalid tee time in tee sheet: {time_text}") from exc
                slot_index += 1
                slot_rows.append(
                    {
                        "slot_index": slot_index,
                        "tee_time": datetime.combine(play_date, tee_clock),
                        "hole": hole_text,
                        "players": [str(value or "").strip() for value in parsed[2:6]],
                    }
                )

    if play_date is None:
        raise HTTPException(status_code=400, detail="Tee sheet date is missing")

    player_rows: list[dict[str, Any]] = []
    for slot in slot_rows:
        group_key = f"tee-sheet|{play_date.isoformat()}|{slot['tee_time'].strftime('%H%M')}|{slot['hole']}"
        for player_idx, raw_player in enumerate(slot["players"], start=1):
            entry = str(raw_player or "").strip()
            if not entry:
                continue
            parts = [part.strip() for part in entry.splitlines() if str(part or "").strip()]
            if not parts:
                continue
            player_name = parts[0]
            membership_label = " | ".join(parts[1:]) if len(parts) > 1 else None
            player_rows.append(
                {
                    "tee_time": slot["tee_time"],
                    "date": play_date,
                    "time": slot["tee_time"].strftime("%H:%M"),
                    "hole": slot["hole"],
                    "booking_id": group_key,
                    "line_id": f"{slot['slot_index']}-{player_idx}",
                    "slot_index": slot["slot_index"],
                    "player_slot": player_idx,
                    "player_name": player_name,
                    "membership_label": membership_label,
                    "notes": membership_label,
                }
            )

    return {
        "course_name": course_name,
        "play_date": play_date,
        "rows": player_rows,
        "slot_count": len(slot_rows),
    }


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
