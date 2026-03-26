from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import ClubSetting, LedgerEntry, LedgerEntryMeta

PAID_BOOKING_STATUSES = frozenset({"checked_in", "completed"})


def _normalized_booking_status(value: Any) -> str:
    raw = getattr(value, "value", value)
    return str(raw or "").strip().lower()


def get_export_mapping_status(db: Session, *, club_id: int) -> dict[str, Any]:
    rows = (
        db.query(ClubSetting)
        .filter(
            ClubSetting.club_id == int(club_id),
            ClubSetting.key.in_(["pastel_journal_layout", "pastel_journal_mappings"]),
        )
        .all()
    )
    values = {
        str(getattr(row, "key", "") or "").strip(): str(getattr(row, "value", "") or "")
        for row in rows
    }

    layout_raw = str(values.get("pastel_journal_layout") or "").strip()
    mappings_raw = str(values.get("pastel_journal_mappings") or "").strip()

    layout_configured = bool(layout_raw)
    mappings_configured = False
    try:
        parsed = json.loads(mappings_raw) if mappings_raw else {}
    except Exception:
        parsed = {}
    if isinstance(parsed, dict):
        vat_output_gl = str(parsed.get("vat_output_gl") or "").strip()
        debit_gl = parsed.get("debit_gl") if isinstance(parsed.get("debit_gl"), dict) else {}
        mappings_configured = bool(vat_output_gl and any(str(value or "").strip() for value in debit_gl.values()))

    return {
        "layout_configured": layout_configured,
        "mappings_configured": mappings_configured,
        "configured": bool(layout_configured and mappings_configured),
    }


def build_finance_semantics_metadata(mapping_status: dict[str, Any]) -> dict[str, Any]:
    export_mapping = mapping_status or {}
    return {
        "booking_paid_rule": "paid_only_with_ledger_entry",
        "export_ready_requires": ["ledger_entry", "payment_method", "mapping_configured"],
        "day_close_is_export_proof": False,
        "revenue_transactions_reporting_only": True,
        "golf_day_bookings_separate_from_ledger": True,
        "export_mapping": {
            "layout_configured": bool(export_mapping.get("layout_configured")),
            "mappings_configured": bool(export_mapping.get("mappings_configured")),
            "configured": bool(export_mapping.get("configured")),
        },
    }


def collect_booking_ledger_snapshot(db: Session, booking_ids: list[int]) -> dict[int, dict[str, Any]]:
    ids = sorted({int(booking_id) for booking_id in booking_ids if int(booking_id or 0) > 0})
    if not ids:
        return {}

    rows = (
        db.query(LedgerEntry, LedgerEntryMeta)
        .outerjoin(LedgerEntryMeta, LedgerEntryMeta.ledger_entry_id == LedgerEntry.id)
        .filter(LedgerEntry.booking_id.in_(ids))
        .order_by(LedgerEntry.booking_id.asc(), LedgerEntry.id.desc())
        .all()
    )

    snapshot: dict[int, dict[str, Any]] = {}
    for ledger_entry, meta in rows:
        booking_id = int(getattr(ledger_entry, "booking_id", 0) or 0)
        if booking_id <= 0:
            continue
        current = snapshot.setdefault(
            booking_id,
            {
                "ledger_entry_count": 0,
                "exported_entry_count": 0,
                "payment_method": None,
            },
        )
        current["ledger_entry_count"] = int(current["ledger_entry_count"]) + 1
        if bool(getattr(ledger_entry, "pastel_synced", False)):
            current["exported_entry_count"] = int(current["exported_entry_count"]) + 1
        if not current.get("payment_method"):
            method = str(getattr(meta, "payment_method", "") or "").strip().upper() or None
            if method:
                current["payment_method"] = method

    return snapshot


def build_booking_finance_state(
    *,
    booking_status: str | None,
    ledger_entry_count: int,
    exported_entry_count: int = 0,
    payment_method: str | None = None,
    mapping_status: dict[str, Any] | None = None,
) -> dict[str, Any]:
    status = _normalized_booking_status(booking_status)
    ledger_count = max(0, int(ledger_entry_count or 0))
    exported_count = max(0, int(exported_entry_count or 0))
    method = str(payment_method or "").strip().upper() or None
    mapping = mapping_status or {}

    is_paid = ledger_count > 0
    paid_status_without_ledger = status in PAID_BOOKING_STATUSES and not is_paid
    payment_method_present = bool(method)
    mapping_configured = bool(mapping.get("configured"))
    exported = bool(is_paid and exported_count > 0 and exported_count == ledger_count)
    export_ready = bool(is_paid and payment_method_present and mapping_configured)

    if is_paid:
        payment_status_code = "paid"
        payment_status_label = "Paid"
    elif paid_status_without_ledger:
        payment_status_code = "paid_status_missing_ledger"
        payment_status_label = "Paid status missing ledger"
    else:
        payment_status_code = "unpaid"
        payment_status_label = "Unpaid"

    if exported:
        export_status_code = "exported"
        export_status_label = "Exported"
    elif export_ready:
        export_status_code = "export_ready"
        export_status_label = "Export-ready"
    elif is_paid and not payment_method_present:
        export_status_code = "missing_payment_method"
        export_status_label = "Needs payment method"
    elif is_paid and not mapping_configured:
        export_status_code = "missing_mapping"
        export_status_label = "Mapping missing"
    else:
        export_status_code = "not_exportable"
        export_status_label = "Not exportable"

    return {
        "is_paid": is_paid,
        "paid_status_without_ledger": paid_status_without_ledger,
        "payment_status_code": payment_status_code,
        "payment_status_label": payment_status_label,
        "ledger_entry_count": ledger_count,
        "payment_method": method,
        "payment_method_present": payment_method_present,
        "export_mapping_configured": mapping_configured,
        "export_ready": export_ready,
        "exported": exported,
        "exported_entry_count": exported_count,
        "export_status_code": export_status_code,
        "export_status_label": export_status_label,
    }


def build_ledger_entry_finance_state(
    *,
    pastel_synced: bool,
    payment_method: str | None,
    mapping_status: dict[str, Any] | None = None,
) -> dict[str, Any]:
    method = str(payment_method or "").strip().upper() or None
    mapping = mapping_status or {}
    payment_method_present = bool(method)
    mapping_configured = bool(mapping.get("configured"))
    exported = bool(pastel_synced)
    export_ready = bool(payment_method_present and mapping_configured)

    if exported:
        export_status_code = "exported"
        export_status_label = "Exported"
    elif export_ready:
        export_status_code = "export_ready"
        export_status_label = "Export-ready"
    elif not payment_method_present:
        export_status_code = "missing_payment_method"
        export_status_label = "Needs payment method"
    elif not mapping_configured:
        export_status_code = "missing_mapping"
        export_status_label = "Mapping missing"
    else:
        export_status_code = "not_exportable"
        export_status_label = "Not exportable"

    return {
        "is_paid": True,
        "payment_method": method,
        "payment_method_present": payment_method_present,
        "export_mapping_configured": mapping_configured,
        "export_ready": export_ready,
        "exported": exported,
        "export_status_code": export_status_code,
        "export_status_label": export_status_label,
    }


def summarize_ledger_finance_states(finance_states: list[dict[str, Any]] | None) -> dict[str, Any]:
    states = [state for state in (finance_states or []) if isinstance(state, dict)]
    counts = {
        "total_rows": len(states),
        "exported_rows": 0,
        "export_ready_rows": 0,
        "blocked_rows": 0,
        "missing_payment_method_rows": 0,
        "missing_mapping_rows": 0,
    }
    for state in states:
        exported = bool(state.get("exported"))
        export_ready = bool(state.get("export_ready"))
        export_status_code = str(state.get("export_status_code") or "").strip().lower()
        if exported:
            counts["exported_rows"] += 1
            continue
        if export_ready:
            counts["export_ready_rows"] += 1
        else:
            counts["blocked_rows"] += 1
        if export_status_code == "missing_payment_method":
            counts["missing_payment_method_rows"] += 1
        if export_status_code == "missing_mapping":
            counts["missing_mapping_rows"] += 1
    counts["pending_export_rows"] = counts["export_ready_rows"] + counts["blocked_rows"]
    return counts
