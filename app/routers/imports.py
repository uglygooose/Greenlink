from __future__ import annotations

import csv
import hashlib
import json
import os
import re
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import desc, func, or_
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from sqlalchemy.orm import Session

from app.audit import record_audit_event
from app.auth import get_current_user, get_db
from app.observability import log_event
from app.rate_limit import IMPORT_RATE_LIMITER, client_ip_from_request, normalize_identity
from app.tenancy import get_active_club_id
from app.umhlali_operational_seed import seed_umhlali_operational_inputs
from app.models import (
    AccountCustomer,
    Booking,
    BookingSource,
    BookingStatus,
    ImportBatch,
    Member,
    RevenueTransaction,
    Club,
    ClubSetting,
    TeeTime,
    User,
    UserRole,
)
from app.people import (
    classify_membership_group,
    member_identity_key,
    normalize_membership_status,
    normalize_primary_operation,
    parse_membership_date,
    parse_yes_no_flag,
    sync_member_person,
)
from app.pricing import (
    PricingContext,
    infer_gender_from_values,
    normalize_gender,
    resolve_booking_pricing_profile,
    select_best_fee_category,
)
from app.fee_models import FeeType
from app.services.identity_integrity_service import (
    clear_pricing_unresolved_exception,
    emit_pricing_unresolved_exception,
    resolve_booking_identity_context,
    sync_member_identity,
)
from app.services import imports_service
from app.services.task_metrics_service import elapsed_ms, measure_started, record_task_timing

router = APIRouter(prefix="/api/admin/imports", tags=["imports"])


def _canonical_umhlali_slug() -> str:
    value = (os.getenv("GREENLINK_DEFAULT_CLUB_SLUG") or "umhlali").strip().lower()
    return value or "umhlali"


def verify_admin(current_user: User = Depends(get_current_user)) -> User:
    # CSV imports are setup/config actions; limit to club admins + super admins.
    if current_user.role not in {UserRole.super_admin, UserRole.admin}:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def _request_id(request: Request | None) -> str | None:
    if request is None:
        return None
    return str(getattr(getattr(request, "state", None), "request_id", "") or "").strip() or None


def _enforce_import_rate_limit(request: Request | None, club_id: int, admin: User) -> None:
    ip = client_ip_from_request(request) if request is not None else "unknown"
    identity = normalize_identity(getattr(admin, "email", None), default=f"user-{int(getattr(admin, 'id', 0) or 0)}")
    key = f"{int(club_id)}:{identity}:{ip}"
    allowed, retry_after, _remaining = IMPORT_RATE_LIMITER.check(key)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many import requests. Please retry shortly.",
            headers={"Retry-After": str(retry_after)},
        )


def _audit_import_event(
    db: Session,
    request: Request | None,
    admin: User,
    action: str,
    entity_type: str,
    *,
    club_id: int,
    entity_id: str | int | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    record_audit_event(
        db,
        action=action,
        entity_type=entity_type,
        actor_user_id=int(getattr(admin, "id", 0) or 0) or None,
        entity_id=entity_id,
        payload=payload,
        request_id=_request_id(request),
        club_id=int(club_id),
    )


def _norm_key(value: str) -> str:
    return imports_service.normalize_key(value)


def _row_keys(row: dict[str, Any]) -> dict[str, Any]:
    return imports_service.normalize_row_keys(row)


def _parse_date(value: Any) -> date | None:
    return imports_service.parse_import_date(value)


def _parse_datetime(value: Any) -> datetime | None:
    return imports_service.parse_import_datetime(value)


def _parse_amount(value: Any) -> float | None:
    return imports_service.parse_import_amount(value)

def _sha256_bytes(data: bytes) -> str:
    return imports_service.sha256_bytes(data)

def _open_csv_bytes(content: bytes) -> csv.DictReader:
    return imports_service.open_csv_reader(content)

def _norm_stream(value: Any) -> str | None:
    return imports_service.normalize_revenue_stream(value)


def _normalize_import_provider(value: Any) -> str:
    raw = str(value or "").strip().lower()
    aliases = {
        "tee-sheet": "tee_sheet",
        "teesheet": "tee_sheet",
        "tee_sheet": "tee_sheet",
        "umhlali_tee_sheet": "tee_sheet",
    }
    return aliases.get(raw, raw)


def _normalize_tee_label(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    compact = re.sub(r"[^0-9a-z]+", "", raw.lower())
    if compact.startswith("10"):
        return "10"
    if compact.startswith("1"):
        return "1"
    match = re.match(r"^(\d+)", compact)
    if match:
        return str(int(match.group(1)))
    return raw


def _normalized_name_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())

_ALLOWED_REVENUE_STREAMS = {"golf", "pro_shop", "pub", "bowls", "other"}


def _normalize_revenue_stream_for_settings(value: Any) -> str:
    stream = _norm_stream(value) or "other"
    return stream if stream in _ALLOWED_REVENUE_STREAMS else "other"


def _revenue_settings_key(stream: str) -> str:
    return f"revenue_import_settings:{stream}"


def _default_revenue_import_settings(stream: str) -> dict[str, Any]:
    return {
        "version": 1,
        "stream": stream,
        "date_field": None,
        "amount_field": None,
        "description_field": None,
        "category_field": None,
        "external_id_field": None,
        "stream_field": None,
        "tax_field": None,
        "amount_sign": "as_is",  # as_is | invert
        "amount_basis": "gross",  # gross | net
        "tax_adjustment": "ignore",  # ignore | add | subtract
        "tax_rate": 0.15,  # decimal form
        "allow_stream_override": False,
        "dedupe_without_external_id": True,
    }


def _normalize_field_name(value: Any) -> str | None:
    k = _norm_key(str(value or ""))
    return k or None


def _normalize_revenue_import_settings(raw: Any, stream: str) -> dict[str, Any]:
    out = _default_revenue_import_settings(stream)
    if not isinstance(raw, dict):
        return out

    out["date_field"] = _normalize_field_name(raw.get("date_field"))
    out["amount_field"] = _normalize_field_name(raw.get("amount_field"))
    out["description_field"] = _normalize_field_name(raw.get("description_field"))
    out["category_field"] = _normalize_field_name(raw.get("category_field"))
    out["external_id_field"] = _normalize_field_name(raw.get("external_id_field"))
    out["stream_field"] = _normalize_field_name(raw.get("stream_field"))
    out["tax_field"] = _normalize_field_name(raw.get("tax_field"))

    amount_sign = str(raw.get("amount_sign") or "").strip().lower()
    out["amount_sign"] = amount_sign if amount_sign in {"as_is", "invert"} else "as_is"

    amount_basis = str(raw.get("amount_basis") or "").strip().lower()
    out["amount_basis"] = amount_basis if amount_basis in {"gross", "net"} else "gross"

    tax_adjustment = str(raw.get("tax_adjustment") or "").strip().lower()
    out["tax_adjustment"] = tax_adjustment if tax_adjustment in {"ignore", "add", "subtract"} else "ignore"

    try:
        rate = float(raw.get("tax_rate"))
        out["tax_rate"] = min(max(rate, 0.0), 1.0)
    except Exception:
        out["tax_rate"] = 0.15

    out["allow_stream_override"] = bool(raw.get("allow_stream_override", False))
    out["dedupe_without_external_id"] = bool(raw.get("dedupe_without_external_id", True))
    return out


def _merge_revenue_import_settings(base: dict[str, Any], overlay: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(overlay, dict):
        return dict(base)
    merged = dict(base)
    for key in list(base.keys()):
        if key in overlay and overlay[key] is not None:
            merged[key] = overlay[key]
    return _normalize_revenue_import_settings(merged, str(merged.get("stream") or base.get("stream") or "other"))


def _read_revenue_import_settings(db: Session, club_id: int, stream: str) -> dict[str, Any] | None:
    key = _revenue_settings_key(stream)
    row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == key).first()
    if not row or not (row.value or "").strip():
        return None
    try:
        parsed = json.loads(row.value)
    except Exception:
        return None
    return _normalize_revenue_import_settings(parsed, stream)


def _write_revenue_import_settings(db: Session, club_id: int, stream: str, settings: dict[str, Any]) -> None:
    key = _revenue_settings_key(stream)
    payload = json.dumps(_normalize_revenue_import_settings(settings, stream))
    row = db.query(ClubSetting).filter(ClubSetting.club_id == int(club_id), ClubSetting.key == key).first()
    if row:
        row.value = payload
        row.updated_at = datetime.utcnow()
    else:
        db.add(ClubSetting(club_id=int(club_id), key=key, value=payload, updated_at=datetime.utcnow()))


def _pick_detected_field(fieldnames: list[str], candidates: list[str]) -> str | None:
    if not fieldnames:
        return None
    normalized_to_original: dict[str, str] = {}
    for raw in fieldnames:
        key = _norm_key(str(raw or ""))
        if key and key not in normalized_to_original:
            normalized_to_original[key] = key
    for candidate in candidates:
        key = _norm_key(candidate)
        if key in normalized_to_original:
            return normalized_to_original[key]
    return None


def _detect_revenue_import_settings(fieldnames: list[str], stream: str) -> dict[str, Any]:
    detected = _default_revenue_import_settings(stream)
    detected["date_field"] = _pick_detected_field(
        fieldnames,
        ["transaction_date", "date", "posted_date", "payment_date", "txn_date", "sale_date"],
    )
    detected["amount_field"] = _pick_detected_field(
        fieldnames,
        ["amount", "total", "value", "gross", "gross_amount", "net_amount", "net", "sales_amount"],
    )
    detected["description_field"] = _pick_detected_field(
        fieldnames,
        ["description", "details", "memo", "narration", "note", "item"],
    )
    detected["category_field"] = _pick_detected_field(
        fieldnames,
        ["category", "department", "type", "segment", "revenue_type"],
    )
    detected["external_id_field"] = _pick_detected_field(
        fieldnames,
        ["external_id", "transaction_id", "id", "receipt_no", "receipt", "reference", "invoice_no"],
    )
    detected["stream_field"] = _pick_detected_field(
        fieldnames,
        ["stream", "source", "department", "revenue_stream", "business_unit"],
    )
    detected["tax_field"] = _pick_detected_field(
        fieldnames,
        ["tax_amount", "tax", "vat_amount", "vat", "gst_amount", "tax_value"],
    )
    return detected


def _row_value(row: dict[str, Any], configured_key: str | None, fallbacks: list[str]) -> Any:
    keys: list[str] = []
    if configured_key:
        keys.append(_norm_key(configured_key))
    keys.extend([_norm_key(v) for v in fallbacks if _norm_key(v)])
    seen: set[str] = set()
    for key in keys:
        if not key or key in seen:
            continue
        seen.add(key)
        value = row.get(key)
        if value is None:
            continue
        if str(value).strip() == "":
            continue
        return value
    return None


class RevenueImportSettingsPayload(BaseModel):
    date_field: str | None = None
    amount_field: str | None = None
    description_field: str | None = None
    category_field: str | None = None
    external_id_field: str | None = None
    stream_field: str | None = None
    tax_field: str | None = None
    amount_sign: str = "as_is"
    amount_basis: str = "gross"
    tax_adjustment: str = "ignore"
    tax_rate: float = 0.15
    allow_stream_override: bool = False
    dedupe_without_external_id: bool = True


@router.get("/revenue-settings")
def get_revenue_import_settings(
    stream: str = Query("other", description="Revenue stream: golf|pro_shop|pub|bowls|other"),
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    stream_norm = _normalize_revenue_stream_for_settings(stream)
    defaults = _default_revenue_import_settings(stream_norm)
    saved = _read_revenue_import_settings(db, club_id, stream_norm)
    settings = _merge_revenue_import_settings(defaults, saved)
    return {
        "stream": stream_norm,
        "configured": saved is not None,
        "settings": settings,
        "required_fields": ["date_field", "amount_field"],
    }


@router.put("/revenue-settings")
def save_revenue_import_settings(
    payload: RevenueImportSettingsPayload,
    request: Request,
    stream: str = Query("other", description="Revenue stream: golf|pro_shop|pub|bowls|other"),
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    stream_norm = _normalize_revenue_stream_for_settings(stream)
    normalized = _normalize_revenue_import_settings(payload.dict(), stream_norm)
    _write_revenue_import_settings(db, club_id, stream_norm, normalized)
    _audit_import_event(
        db,
        request,
        admin,
        action="imports.revenue_settings_saved",
        entity_type="import_settings",
        club_id=int(club_id),
        entity_id=stream_norm,
        payload={"stream": stream_norm, "settings": normalized},
    )
    db.commit()
    return {
        "status": "ok",
        "stream": stream_norm,
        "configured": True,
        "settings": normalized,
    }


@router.get("")
def list_import_batches(
    kind: str | None = Query(None, description="Optional: bookings|revenue|members"),
    source: str | None = Query(None, description="Optional: pub|bowls|golfscape|hna|etc"),
    limit: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    try:
        q = db.query(ImportBatch).filter(ImportBatch.club_id == club_id)
        if kind:
            q = q.filter(ImportBatch.kind == kind.strip().lower())
        if source:
            q = q.filter(ImportBatch.source == source.strip().lower())
        rows = q.order_by(desc(ImportBatch.imported_at)).limit(limit).all()
        return {
            "imports": [
                {
                    "id": r.id,
                    "kind": r.kind,
                    "source": r.source,
                    "file_name": r.file_name,
                    "sha256": r.sha256,
                    "imported_at": r.imported_at.isoformat() if r.imported_at else None,
                    "rows_total": int(r.rows_total or 0),
                    "rows_inserted": int(r.rows_inserted or 0),
                    "rows_updated": int(r.rows_updated or 0),
                    "rows_failed": int(r.rows_failed or 0),
                    "notes": r.notes,
                }
                for r in rows
            ]
        }
    except SQLAlchemyError as e:
        log_event(
            "error",
            "imports.list.db_error",
            club_id=int(club_id),
            error_type=type(e).__name__,
            error=str(e)[:240],
        )
        raise HTTPException(status_code=503, detail="Database connection unavailable")


@router.post("/umhlali-operational-sync")
async def sync_umhlali_operational_inputs(
    request: Request,
    force: bool = Query(False, description="Force re-import even when operational data already exists."),
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    target_club = db.query(Club).filter(Club.id == int(club_id)).first()
    if target_club is None:
        raise HTTPException(status_code=404, detail="Club not found")
    target_slug = str(getattr(target_club, "slug", "") or "").strip().lower()
    target_name = str(getattr(target_club, "name", "") or "").strip().lower()
    expected_slug = _canonical_umhlali_slug()
    if target_slug != expected_slug and "umhlali" not in target_name:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Umhlali operational sync must run in the Umhlali club context "
                f"(expected slug '{expected_slug}', got '{target_slug or 'unset'}')."
            ),
        )

    _enforce_import_rate_limit(request, int(club_id), admin)
    try:
        result = seed_umhlali_operational_inputs(db, club_id=int(club_id), force=bool(force))
        _audit_import_event(
            db,
            request,
            admin,
            action="imports.umhlali_operational_sync",
            entity_type="import_batch",
            club_id=int(club_id),
            payload={"force": bool(force), "result": result},
        )
        db.commit()
        return result
    except SQLAlchemyError as e:
        db.rollback()
        log_event(
            "error",
            "imports.umhlali_operational_sync.db_error",
            club_id=int(club_id),
            error_type=type(e).__name__,
            error=str(e)[:240],
        )
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        db.rollback()
        log_event(
            "error",
            "imports.umhlali_operational_sync.unexpected_error",
            club_id=int(club_id),
            error_type=type(e).__name__,
            error=str(e)[:240],
        )
        raise HTTPException(status_code=500, detail="Umhlali operational sync failed")


@router.post("/revenue-csv")
async def import_revenue_csv(
    request: Request,
    stream: str = Query("other", description="Revenue stream: pub|bowls|golf|pro_shop|other"),
    dedupe_without_external_id: bool | None = Query(None, description="Override dedupe behavior for rows without external IDs"),
    use_saved_settings: bool = Query(True, description="Apply saved import settings for this stream when available"),
    save_settings: bool = Query(False, description="Save detected/mapped settings for this stream after import"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    _enforce_import_rate_limit(request, int(club_id), admin)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    stream_norm = _normalize_revenue_stream_for_settings(stream)
    file_hash = _sha256_bytes(content)

    batch = ImportBatch(
        club_id=club_id,
        kind="revenue",
        source=stream_norm,
        file_name=(file.filename or "").strip() or None,
        sha256=file_hash,
        imported_at=datetime.utcnow(),
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    inserted = 0
    updated = 0
    failed = 0
    total = 0
    notes: list[str] = []
    streams_seen: set[str] = set()
    settings_saved = False

    try:
        reader = _open_csv_bytes(content)
        fieldnames = [str(v or "") for v in (reader.fieldnames or [])]

        defaults = _default_revenue_import_settings(stream_norm)
        detected_settings = _detect_revenue_import_settings(fieldnames, stream_norm)
        saved_settings = _read_revenue_import_settings(db, club_id, stream_norm) if use_saved_settings else None

        settings_source = "saved" if saved_settings is not None else "detected"
        effective_settings = _merge_revenue_import_settings(defaults, saved_settings if saved_settings is not None else detected_settings)
        # Fill blank configured fields from detected headers where possible.
        effective_settings = _merge_revenue_import_settings(
            effective_settings,
            {
                k: v
                for k, v in detected_settings.items()
                if k.endswith("_field") and effective_settings.get(k) in (None, "") and v not in (None, "")
            },
        )
        effective_settings["stream"] = stream_norm
        effective_dedupe = (
            bool(effective_settings.get("dedupe_without_external_id", True))
            if dedupe_without_external_id is None
            else bool(dedupe_without_external_id)
        )

        if save_settings:
            _write_revenue_import_settings(db, club_id, stream_norm, effective_settings)
            db.commit()
            settings_saved = True

        for idx, raw_row in enumerate(reader):
            total += 1
            row = _row_keys(raw_row)

            row_stream_raw = (
                _row_value(
                    row,
                    str(effective_settings.get("stream_field") or ""),
                    ["stream", "source", "department", "revenue_stream", "business_unit"],
                )
                if bool(effective_settings.get("allow_stream_override", False))
                else None
            )
            row_stream = _norm_stream(row_stream_raw)
            row_stream = row_stream or stream_norm
            if row_stream not in _ALLOWED_REVENUE_STREAMS:
                row_stream = "other"
            streams_seen.add(row_stream)

            txn_date = _parse_date(
                _row_value(
                    row,
                    str(effective_settings.get("date_field") or ""),
                    ["transaction_date", "date", "posted_date", "payment_date", "sale_date"],
                )
            )
            amount = _parse_amount(
                _row_value(
                    row,
                    str(effective_settings.get("amount_field") or ""),
                    ["amount", "total", "value", "gross", "gross_amount", "net_amount", "net"],
                )
            )
            if amount is not None and str(effective_settings.get("amount_sign") or "as_is") == "invert":
                amount = float(amount) * -1.0

            tax_amount = _parse_amount(
                _row_value(
                    row,
                    str(effective_settings.get("tax_field") or ""),
                    ["tax_amount", "tax", "vat_amount", "vat", "gst_amount"],
                )
            )
            if amount is not None:
                tax_adjustment = str(effective_settings.get("tax_adjustment") or "ignore")
                tax_rate = float(effective_settings.get("tax_rate") or 0.0)
                if tax_adjustment == "add":
                    if tax_amount is not None:
                        amount = float(amount) + abs(float(tax_amount))
                    elif str(effective_settings.get("amount_basis") or "gross") == "net" and tax_rate > 0:
                        amount = float(amount) * (1.0 + tax_rate)
                elif tax_adjustment == "subtract" and tax_amount is not None:
                    amount = float(amount) - abs(float(tax_amount))

            if txn_date is None or amount is None:
                failed += 1
                if len(notes) < 5:
                    notes.append(f"Row {idx+2}: missing/invalid date or amount")
                continue

            external_id = (
                str(
                    _row_value(
                        row,
                        str(effective_settings.get("external_id_field") or ""),
                        ["external_id", "transaction_id", "id", "receipt_no", "receipt", "reference", "invoice_no"],
                    )
                    or ""
                )
                .strip()
                or None
            )
            if external_id is None and effective_dedupe:
                # Best-effort stable ID based on row content (excluding empty fields).
                fingerprint = {
                    k: (str(v).strip() if v is not None else "")
                    for k, v in row.items()
                    if str(v or "").strip() != ""
                }
                fingerprint["__stream"] = row_stream
                external_id = "auto:" + hashlib.sha256(
                    json.dumps(fingerprint, sort_keys=True).encode("utf-8")
                ).hexdigest()[:24]

            description = str(
                _row_value(
                    row,
                    str(effective_settings.get("description_field") or ""),
                    ["description", "details", "memo", "narration", "note"],
                )
                or ""
            ).strip() or None
            category = str(
                _row_value(
                    row,
                    str(effective_settings.get("category_field") or ""),
                    ["category", "department", "type", "segment"],
                )
                or ""
            ).strip() or None

            existing = None
            if external_id is not None:
                existing = (
                    db.query(RevenueTransaction)
                    .filter(
                        RevenueTransaction.club_id == club_id,
                        RevenueTransaction.source == row_stream,
                        RevenueTransaction.external_id == external_id,
                    )
                    .first()
                )

            if existing:
                existing.transaction_date = txn_date
                existing.amount = float(amount)
                existing.description = description
                existing.category = category
                existing.import_batch_id = batch.id
                updated += 1
            else:
                db.add(
                    RevenueTransaction(
                        club_id=club_id,
                        source=row_stream,
                        transaction_date=txn_date,
                        external_id=external_id,
                        amount=float(amount),
                        description=description,
                        category=category,
                        import_batch_id=batch.id,
                        created_at=datetime.utcnow(),
                    )
                )
                inserted += 1

        if len(streams_seen) > 1:
            batch.source = "mixed"

        batch.rows_total = total
        batch.rows_inserted = inserted
        batch.rows_updated = updated
        batch.rows_failed = failed
        batch.notes = "\n".join(notes) if notes else None
        _audit_import_event(
            db,
            request,
            admin,
            action="imports.revenue_csv_imported",
            entity_type="import_batch",
            club_id=int(club_id),
            entity_id=int(batch.id),
            payload={
                "batch_id": int(batch.id),
                "stream": str(batch.source or stream_norm),
                "rows_total": int(total),
                "rows_inserted": int(inserted),
                "rows_updated": int(updated),
                "rows_failed": int(failed),
                "settings_source": settings_source,
                "settings_saved": bool(settings_saved),
            },
        )
        db.commit()

        return {
            "batch_id": batch.id,
            "kind": batch.kind,
            "source": batch.source,
            "imported_at": batch.imported_at.isoformat(),
            "rows_total": total,
            "rows_inserted": inserted,
            "rows_updated": updated,
            "rows_failed": failed,
            "notes": batch.notes,
            "streams_seen": sorted(streams_seen),
            "settings_source": settings_source,
            "settings_saved": settings_saved,
            "settings_applied": effective_settings,
            "detected_settings": detected_settings,
        }
    except IntegrityError as e:
        db.rollback()
        log_event(
            "warning",
            "imports.revenue.integrity_error",
            club_id=int(club_id),
            error_type=type(e).__name__,
            error=str(e)[:240],
        )
        raise HTTPException(status_code=409, detail="Import conflict (duplicate external IDs?)")
    except SQLAlchemyError as e:
        db.rollback()
        log_event(
            "error",
            "imports.revenue.db_error",
            club_id=int(club_id),
            error_type=type(e).__name__,
            error=str(e)[:240],
        )
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        db.rollback()
        log_event(
            "error",
            "imports.revenue.unexpected_error",
            club_id=int(club_id),
            error_type=type(e).__name__,
            error=str(e)[:240],
        )
        raise HTTPException(status_code=500, detail="Revenue import failed")


@router.post("/members-csv")
async def import_members_csv(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    _enforce_import_rate_limit(request, int(club_id), admin)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    file_hash = _sha256_bytes(content)
    batch = ImportBatch(
        club_id=club_id,
        kind="members",
        source="members",
        file_name=(file.filename or "").strip() or None,
        sha256=file_hash,
        imported_at=datetime.utcnow(),
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    inserted = 0
    updated = 0
    failed = 0
    total = 0
    notes: list[str] = []
    existing_rows = db.query(Member).filter(Member.club_id == club_id).all()
    by_member_number = {
        str(getattr(row, "member_number", "") or "").strip(): row
        for row in existing_rows
        if str(getattr(row, "member_number", "") or "").strip()
    }
    by_email = {
        str(getattr(row, "email", "") or "").strip().lower(): row
        for row in existing_rows
        if str(getattr(row, "email", "") or "").strip()
    }
    by_identity = {}
    for row in existing_rows:
        key = member_identity_key(
            first_name=getattr(row, "first_name", None),
            last_name=getattr(row, "last_name", None),
            membership_category=getattr(row, "membership_category", None),
            membership_status=getattr(row, "membership_status", None),
            membership_date=getattr(row, "membership_date", None),
            membership_expiration=getattr(row, "membership_expiration", None),
        )
        by_identity[key] = row
    by_import_reference = {
        str(getattr(row, "import_reference", "") or "").strip(): row
        for row in existing_rows
        if str(getattr(row, "import_reference", "") or "").strip()
    }
    pending_by_member_number = {}
    pending_by_email = {}
    pending_by_identity = {}
    pending_by_import_reference = {}
    insert_payloads = []

    try:
        reader = _open_csv_bytes(content)
        for idx, raw_row in enumerate(reader):
            total += 1
            row = _row_keys(raw_row)

            member_number = str(row.get("member_number") or row.get("member_no") or "").strip() or None
            first_name = str(row.get("first_name") or row.get("firstname") or row.get("first") or "").strip()
            last_name = str(row.get("last_name") or row.get("lastname") or row.get("last") or "").strip()
            name = str(row.get("name") or "").strip()
            if (not first_name or not last_name) and name:
                parts = name.split(" ", 1)
                first_name = first_name or parts[0]
                last_name = last_name or (parts[1] if len(parts) > 1 else "")

            email = str(row.get("email") or "").strip().lower() or None
            phone = str(row.get("phone") or row.get("mobile") or "").strip() or None
            handicap_number = str(row.get("handicap_number") or row.get("hcp") or "").strip() or None
            home_club = str(row.get("home_club") or row.get("club") or "").strip() or None
            country_of_residence = str(row.get("country_of_residence") or row.get("country") or "").strip() or None
            membership_category = str(row.get("membership_category_raw") or row.get("membership") or row.get("membership_category") or "").strip() or None
            primary_operation = normalize_primary_operation(row.get("primary_operation"), membership_category)
            membership_status_raw = str(row.get("status") or row.get("membership_status") or "active").strip()
            membership_status = normalize_membership_status(membership_status_raw)
            membership_date = parse_membership_date(row.get("membership_date") or row.get("start_date"))
            membership_expiration = parse_membership_date(row.get("membership_expiration") or row.get("expiry_date"))
            source_row_number_raw = str(row.get("source_row_number") or "").strip()
            try:
                source_row_number = int(source_row_number_raw) if source_row_number_raw else None
            except Exception:
                source_row_number = None
            source_file = str(row.get("source_file") or file.filename or "").strip() or None
            import_reference = f"{source_file}:{source_row_number}" if source_file and source_row_number is not None else None
            if import_reference:
                touched_import_refs.add(import_reference)
            if member_number:
                touched_member_numbers.add(member_number)
            if email:
                touched_emails.add(email)
            record_status = str(row.get("record_status") or membership_status).strip() or membership_status
            person_type = str(row.get("person_type") or "Member").strip() or "Member"
            if not home_club and import_reference and "umhlali" in import_reference.lower():
                home_club = "Umhlali Country Club"
            payload = {
                "club_id": club_id,
                "member_number": member_number,
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "phone": phone,
                "handicap_number": handicap_number,
                "home_club": home_club,
                "country_of_residence": country_of_residence,
                "membership_category": membership_category,
                "membership_category_raw": membership_category,
                "primary_operation": primary_operation,
                "membership_status": membership_status,
                "member_lifecycle_status": membership_status,
                "record_status": record_status,
                "person_type": person_type,
                "membership_date": membership_date,
                "membership_expiration": membership_expiration,
                "source_file": source_file,
                "source_row_number": source_row_number,
                "import_reference": import_reference,
                "golf_access": parse_yes_no_flag(row.get("golf_access")),
                "tennis_access": parse_yes_no_flag(row.get("tennis_access")),
                "bowls_access": parse_yes_no_flag(row.get("bowls_access")),
                "squash_access": parse_yes_no_flag(row.get("squash_access")),
                "active": 1 if membership_status == "active" else 0,
                "player_category": classify_membership_group(primary_operation or membership_category or ""),
            }
            identity_key = member_identity_key(
                first_name=first_name,
                last_name=last_name,
                membership_category=membership_category,
                membership_status=membership_status,
                membership_date=membership_date,
                membership_expiration=membership_expiration,
            )

            if not first_name or not last_name:
                failed += 1
                if len(notes) < 5:
                    notes.append(f"Row {idx+2}: missing name")
                continue

            existing = None
            if import_reference:
                existing = by_import_reference.get(import_reference)
            if existing is None and import_reference:
                existing = pending_by_import_reference.get(import_reference)
            if member_number:
                existing = existing or by_member_number.get(member_number)
            if existing is None and member_number:
                existing = pending_by_member_number.get(member_number)
            if existing is None and email:
                existing = by_email.get(email)
            if existing is None and email:
                existing = pending_by_email.get(email)
            if existing is None:
                existing = by_identity.get(identity_key)
            if existing is None:
                existing = pending_by_identity.get(identity_key)

            if existing:
                if isinstance(existing, dict):
                    existing.update(payload)
                else:
                    existing.first_name = first_name
                    existing.last_name = last_name
                    if member_number:
                        existing.member_number = member_number
                    existing.email = email
                    existing.phone = phone
                    existing.handicap_number = handicap_number
                    existing.home_club = home_club
                    existing.country_of_residence = country_of_residence
                    existing.membership_category = membership_category or existing.membership_category
                    existing.membership_category_raw = membership_category or existing.membership_category_raw
                    existing.primary_operation = primary_operation
                    existing.membership_status = membership_status
                    existing.member_lifecycle_status = membership_status
                    existing.record_status = record_status
                    existing.person_type = person_type
                    existing.membership_date = membership_date
                    existing.membership_expiration = membership_expiration
                    existing.source_file = source_file
                    existing.source_row_number = source_row_number
                    existing.import_reference = import_reference
                    existing.golf_access = payload["golf_access"]
                    existing.tennis_access = payload["tennis_access"]
                    existing.bowls_access = payload["bowls_access"]
                    existing.squash_access = payload["squash_access"]
                    existing.player_category = classify_membership_group(existing.primary_operation or existing.membership_category or "")
                    existing.active = 1 if membership_status == "active" else 0
                    updated += 1
            else:
                insert_payloads.append(payload)
                existing = payload
                inserted += 1

            if import_reference:
                if isinstance(existing, dict):
                    pending_by_import_reference[import_reference] = existing
                else:
                    by_import_reference[import_reference] = existing
            if member_number:
                if isinstance(existing, dict):
                    pending_by_member_number[member_number] = existing
                else:
                    by_member_number[member_number] = existing
            if email:
                if isinstance(existing, dict):
                    pending_by_email[email] = existing
                else:
                    by_email[email] = existing
            if isinstance(existing, dict):
                pending_by_identity[identity_key] = existing
            else:
                by_identity[identity_key] = existing

        if insert_payloads:
            chunk_size = 100
            for start in range(0, len(insert_payloads), chunk_size):
                db.bulk_insert_mappings(Member, insert_payloads[start : start + chunk_size])
                db.flush()

        touched_query = db.query(Member).filter(Member.club_id == club_id)
        if touched_import_refs:
            touched_query = touched_query.filter(Member.import_reference.in_(sorted(touched_import_refs)))
        elif touched_member_numbers or touched_emails:
            filters = []
            if touched_member_numbers:
                filters.append(Member.member_number.in_(sorted(touched_member_numbers)))
            if touched_emails:
                filters.append(func.lower(Member.email).in_(sorted(touched_emails)))
            if filters:
                touched_query = touched_query.filter(or_(*filters))
        for touched_member in touched_query.all():
            sync_member_person(db, touched_member, source_system="members_import")
            sync_member_identity(db, touched_member, source_system="members_import")

        batch.rows_total = total
        batch.rows_inserted = inserted
        batch.rows_updated = updated
        batch.rows_failed = failed
        batch.notes = "\n".join(notes) if notes else None
        _audit_import_event(
            db,
            request,
            admin,
            action="imports.members_csv_imported",
            entity_type="import_batch",
            club_id=int(club_id),
            entity_id=int(batch.id),
            payload={
                "batch_id": int(batch.id),
                "rows_total": int(total),
                "rows_inserted": int(inserted),
                "rows_updated": int(updated),
                "rows_failed": int(failed),
            },
        )
        db.commit()
        record_task_timing(
            db,
            club_id=int(club_id),
            task_key="import_review_time",
            duration_ms=elapsed_ms(started_at),
            actor_role="admin",
            actor_user_id=int(getattr(admin, "id", 0) or 0) or None,
            request_id=_request_id(request),
            meta={"kind": "members", "rows_total": int(total)},
        )
        db.commit()

        return {
            "batch_id": batch.id,
            "kind": batch.kind,
            "source": batch.source,
            "imported_at": batch.imported_at.isoformat(),
            "rows_total": total,
            "rows_inserted": inserted,
            "rows_updated": updated,
            "rows_failed": failed,
            "notes": batch.notes,
        }
    except IntegrityError as e:
        db.rollback()
        log_event(
            "warning",
            "imports.members.integrity_error",
            club_id=int(club_id),
            error_type=type(e).__name__,
            error=str(e)[:240],
        )
        raise HTTPException(status_code=409, detail="Import conflict (duplicate members?)")
    except SQLAlchemyError as e:
        db.rollback()
        log_event(
            "error",
            "imports.members.db_error",
            club_id=int(club_id),
            error_type=type(e).__name__,
            error=str(e)[:240],
        )
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        db.rollback()
        log_event(
            "error",
            "imports.members.unexpected_error",
            club_id=int(club_id),
            error_type=type(e).__name__,
            error=str(e)[:240],
        )
        raise HTTPException(status_code=500, detail="Member import failed")


@router.post("/bookings-csv")
async def import_bookings_csv(
    request: Request,
    provider: str = Query(..., description="Upstream provider: golfscape|hna|other"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
    club_id: int = Depends(get_active_club_id),
):
    _enforce_import_rate_limit(request, int(club_id), admin)
    started_at = measure_started()
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    provider_norm = _normalize_import_provider(provider)
    if not provider_norm:
        raise HTTPException(status_code=400, detail="provider is required")

    file_hash = _sha256_bytes(content)
    batch = ImportBatch(
        club_id=club_id,
        kind="bookings",
        source=provider_norm,
        file_name=(file.filename or "").strip() or None,
        sha256=file_hash,
        imported_at=datetime.utcnow(),
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    inserted = 0
    updated = 0
    failed = 0
    total = 0
    notes: list[str] = []
    touched_import_refs: set[str] = set()
    touched_member_numbers: set[str] = set()
    touched_emails: set[str] = set()
    touched_tee_ids: set[int] = set()
    pruned = 0
    seen_external_row_ids: set[str] = set()

    try:
        members = (
            db.query(Member)
            .filter(Member.club_id == club_id, Member.active == 1)
            .all()
        )
        members_by_number = {
            str(getattr(row, "member_number", "") or "").strip().lower(): row
            for row in members
            if str(getattr(row, "member_number", "") or "").strip()
        }
        members_by_email = {
            str(getattr(row, "email", "") or "").strip().lower(): row
            for row in members
            if str(getattr(row, "email", "") or "").strip()
        }
        members_by_name: dict[str, list[Member]] = {}
        for row in members:
            key = _normalized_name_key(f"{getattr(row, 'first_name', '')} {getattr(row, 'last_name', '')}")
            if key:
                members_by_name.setdefault(key, []).append(row)

        account_customers = (
            db.query(AccountCustomer)
            .filter(AccountCustomer.club_id == club_id)
            .all()
        )
        account_customer_by_code = {
            str(getattr(row, "account_code", "") or "").strip().lower(): row
            for row in account_customers
            if str(getattr(row, "account_code", "") or "").strip()
        }

        tee_sheet_meta: dict[str, Any] | None = None
        upstream_rows: list[dict[str, Any]] = []
        if provider_norm == "tee_sheet":
            tee_sheet_meta = imports_service.parse_tee_sheet_csv(content)
            upstream_rows = list(tee_sheet_meta.get("rows") or [])
            if tee_sheet_meta.get("play_date"):
                notes.append(f"Tee sheet date: {tee_sheet_meta['play_date'].isoformat()}")
            if tee_sheet_meta.get("course_name"):
                notes.append(f"Course: {tee_sheet_meta['course_name']}")
        else:
            reader = _open_csv_bytes(content)
            upstream_rows = [_row_keys(raw_row) for raw_row in reader]

        for idx, row in enumerate(upstream_rows):
            total += 1

            tee_val = _normalize_tee_label(row.get("tee") or row.get("hole") or row.get("start_tee"))
            tee_time = row.get("tee_time") if provider_norm == "tee_sheet" else _parse_datetime(row.get("tee_time") or row.get("start_time") or row.get("datetime") or "")
            if tee_time is None:
                d = _parse_date(row.get("date") or row.get("booking_date") or row.get("tee_date"))
                t = str(row.get("time") or row.get("start") or row.get("tee") or "").strip()
                if d and re.match(r"^\d{1,2}:\d{2}$", t):
                    tee_time = _parse_datetime(f"{d.isoformat()} {t}")
            if tee_time is None:
                failed += 1
                if len(notes) < 8:
                    notes.append(f"Row {idx + 2}: missing or invalid tee time")
                continue

            booking_id = str(row.get("booking_id") or row.get("reservation_id") or row.get("id") or "").strip() or None
            player_name = str(row.get("player_name") or row.get("name") or row.get("player") or "").strip() or "External booking"
            player_email = str(row.get("player_email") or row.get("email") or "").strip().lower() or None
            member_number = str(row.get("member_number") or row.get("member_no") or "").strip() or None
            membership_label = str(row.get("membership_label") or row.get("membership_category") or "").strip() or None

            external_line_id = str(row.get("line_id") or row.get("player_id") or row.get("external_row_id") or "").strip() or None
            if external_line_id and booking_id:
                external_row_id = f"{booking_id}:{external_line_id}"
            else:
                basis = f"{provider_norm}|{booking_id or ''}|{tee_time.isoformat()}|{tee_val or ''}|{player_name}|{player_email or ''}"
                external_row_id = hashlib.sha256(basis.encode("utf-8")).hexdigest()[:28]
            if provider_norm == "tee_sheet" and external_row_id:
                seen_external_row_ids.add(external_row_id)

            status_raw = str(row.get("status") or "").strip().lower()
            status_map = {
                "booked": BookingStatus.booked,
                "checked_in": BookingStatus.checked_in,
                "completed": BookingStatus.completed,
                "cancelled": BookingStatus.cancelled,
                "canceled": BookingStatus.cancelled,
                "no_show": BookingStatus.no_show,
                "noshow": BookingStatus.no_show,
            }
            status = status_map.get(status_raw, BookingStatus.booked)

            holes = int(_parse_amount(row.get("holes") or row.get("no_of_holes") or 18) or 18)
            holes = 9 if holes == 9 else 18
            prepaid = str(row.get("prepaid") or "").strip().lower() in {"1", "true", "yes", "y"}
            explicit_price = _parse_amount(row.get("price") or row.get("amount") or row.get("fee"))

            # Ensure tee_time row exists.
            tee_time_key = tee_time.replace(second=0, microsecond=0)
            tt = (
                db.query(TeeTime)
                .filter(
                    TeeTime.club_id == club_id,
                    TeeTime.tee_time == tee_time_key,
                )
                .all()
            )
            tt = next(
                (
                    row_tt
                    for row_tt in tt
                    if _normalize_tee_label(getattr(row_tt, "hole", None)) == tee_val
                ),
                None,
            )
            if not tt:
                tt = TeeTime(
                    club_id=club_id,
                    tee_time=tee_time_key,
                    hole=tee_val,
                    capacity=4,
                    status="open",
                )
                db.add(tt)
                db.commit()
                db.refresh(tt)
            elif _normalize_tee_label(getattr(tt, "hole", None)) != str(getattr(tt, "hole", "") or "").strip():
                tt.hole = tee_val

            touched_tee_ids.add(int(tt.id))

            matched_member = None
            if member_number:
                matched_member = members_by_number.get(member_number.lower())
            if matched_member is None and player_email:
                matched_member = members_by_email.get(player_email.lower())
            if matched_member is None:
                name_matches = members_by_name.get(_normalized_name_key(player_name), [])
                if len(name_matches) == 1:
                    matched_member = name_matches[0]
            member_id = int(getattr(matched_member, "id", 0) or 0) or None

            account_code = str(
                row.get("account_code")
                or row.get("debtor_account")
                or row.get("account")
                or row.get("customer_code")
                or ""
            ).strip() or None
            account_customer_id = None
            account_customer = None
            if account_code:
                account_customer = account_customer_by_code.get(account_code.lower())
                if account_customer:
                    account_customer_id = int(account_customer.id)

            pricing_profile = resolve_booking_pricing_profile(
                tee_time=tt.tee_time,
                explicit_player_type=str(row.get("player_type") or "").strip() or None,
                member=matched_member,
                membership_category=membership_label or getattr(matched_member, "membership_category_raw", None) or getattr(matched_member, "membership_category", None),
                user_account_type=None,
                player_category=getattr(matched_member, "player_category", None),
                age=None,
                has_member_link=bool(member_id),
                handicap_sa_id=str(row.get("handicap_sa_id") or "").strip() or getattr(matched_member, "handicap_sa_id", None),
                home_club=str(row.get("home_club") or "").strip() or getattr(matched_member, "home_club", None),
            )
            fee_category_id = None
            price = explicit_price
            if price is None:
                fee_category = select_best_fee_category(
                    db,
                    PricingContext(
                        fee_type=FeeType.GOLF,
                        tee_time=tt.tee_time,
                        player_type=pricing_profile.player_type,
                        gender=(
                            normalize_gender(getattr(matched_member, "gender", None))
                            or infer_gender_from_values(
                                membership_label,
                                getattr(matched_member, "membership_category_raw", None),
                                getattr(matched_member, "membership_category", None),
                                getattr(matched_member, "player_category", None),
                            )
                        ),
                        holes=holes,
                        age=pricing_profile.age,
                        pricing_tags=pricing_profile.pricing_tags,
                    ),
                )
                if fee_category is not None:
                    fee_category_id = int(getattr(fee_category, "id", 0) or 0) or None
                    price = float(getattr(fee_category, "price", 0.0) or 0.0)
                else:
                    price = 0.0
                    emit_pricing_unresolved_exception(
                        db,
                        club_id=int(club_id),
                        dedupe_suffix=f"{provider_norm}:{external_row_id}",
                        player_name=player_name,
                        context={
                            "external_row_id": external_row_id,
                            "provider": provider_norm,
                            "player_type": pricing_profile.player_type,
                            "membership_label": membership_label,
                            "player_email": player_email,
                            "tee_time": tt.tee_time.isoformat(),
                        },
                    )
                    if len(notes) < 8:
                        notes.append(f"Row {idx + 2}: no fee matched for {player_name}")
            else:
                clear_pricing_unresolved_exception(
                    db,
                    club_id=int(club_id),
                    dedupe_suffix=f"{provider_norm}:{external_row_id}",
                )

            global_person, relationship_state, _identity_issues = resolve_booking_identity_context(
                db,
                club_id=int(club_id),
                booking_id=None,
                player_name=player_name,
                player_email=player_email,
                member=matched_member,
                user=None,
                account_customer=account_customer,
                player_type=pricing_profile.player_type,
                source_system="bookings_import",
                source_ref=f"{provider_norm}:{external_row_id}",
            )

            base_notes = str(row.get("notes") or row.get("comment") or "").strip()
            if membership_label:
                membership_note = f"Imported tee sheet category: {membership_label}"
                base_notes = f"{base_notes}\n{membership_note}".strip() if base_notes else membership_note

            existing = (
                db.query(Booking)
                .filter(
                    Booking.club_id == club_id,
                    Booking.external_provider == provider_norm,
                    Booking.external_row_id == external_row_id,
                )
                .first()
            )

            if existing:
                existing.tee_time_id = tt.id
                existing.member_id = member_id
                existing.global_person_id = int(getattr(global_person, "id", 0) or 0) or None
                existing.club_relationship_state_id = int(getattr(relationship_state, "id", 0) or 0) or None
                existing.player_name = player_name
                existing.player_email = player_email
                existing.source = BookingSource.external
                existing.external_booking_id = booking_id
                existing.external_group_id = booking_id
                existing.external_row_id = external_row_id
                existing.club_card = account_code
                existing.account_customer_id = account_customer_id
                existing.player_type = pricing_profile.player_type
                existing.fee_category_id = fee_category_id
                existing.price = float(price)
                existing.status = status
                existing.holes = holes
                existing.prepaid = prepaid
                existing.mirrored_at = datetime.utcnow()
                existing.import_batch_id = batch.id
                existing.notes = base_notes or None
                updated += 1
            else:
                db.add(
                    Booking(
                        club_id=club_id,
                        tee_time_id=tt.id,
                        member_id=member_id,
                        global_person_id=int(getattr(global_person, "id", 0) or 0) or None,
                        club_relationship_state_id=int(getattr(relationship_state, "id", 0) or 0) or None,
                        player_name=player_name,
                        player_email=player_email,
                        source=BookingSource.external,
                        external_provider=provider_norm,
                        external_booking_id=booking_id,
                        external_group_id=booking_id,
                        external_row_id=external_row_id,
                        club_card=account_code,
                        account_customer_id=account_customer_id,
                        party_size=1,
                        fee_category_id=fee_category_id,
                        player_type=pricing_profile.player_type,
                        price=float(price),
                        status=status,
                        holes=holes,
                        prepaid=prepaid,
                        mirrored_at=datetime.utcnow(),
                        capacity_conflict=False,
                        import_batch_id=batch.id,
                        notes=base_notes or None,
                        created_at=datetime.utcnow(),
                    )
                )
                inserted += 1

        if provider_norm == "tee_sheet" and tee_sheet_meta and tee_sheet_meta.get("play_date"):
            play_date = tee_sheet_meta["play_date"]
            start_dt = datetime.combine(play_date, datetime.min.time())
            end_dt = start_dt + timedelta(days=1)
            mirrored_rows = (
                db.query(Booking)
                .join(TeeTime, Booking.tee_time_id == TeeTime.id)
                .filter(
                    Booking.club_id == club_id,
                    Booking.external_provider == provider_norm,
                    TeeTime.club_id == club_id,
                    TeeTime.tee_time >= start_dt,
                    TeeTime.tee_time < end_dt,
                )
                .all()
            )
            for mirrored in mirrored_rows:
                external_key = str(getattr(mirrored, "external_row_id", "") or "").strip()
                if external_key and external_key in seen_external_row_ids:
                    continue
                tee_time_id = int(getattr(mirrored, "tee_time_id", 0) or 0)
                if tee_time_id > 0:
                    touched_tee_ids.add(tee_time_id)
                db.delete(mirrored)
                pruned += 1
            if pruned > 0 and len(notes) < 8:
                notes.append(f"Removed {pruned} stale tee sheet booking(s) for {play_date.isoformat()}")

        # Capacity conflict marking for touched tee times
        if touched_tee_ids:
            occupying_statuses = {BookingStatus.booked, BookingStatus.checked_in, BookingStatus.completed}
            for tee_id in touched_tee_ids:
                tt = db.query(TeeTime).filter(TeeTime.id == tee_id).first()
                if not tt:
                    continue
                total_party = (
                    db.query(func.coalesce(func.sum(Booking.party_size), 0))
                    .filter(
                        Booking.tee_time_id == tee_id,
                        Booking.status.in_(list(occupying_statuses)),
                    )
                    .scalar()
                    or 0
                )
                cap = int(getattr(tt, "capacity", None) or 4)
                conflict = int(total_party) > cap
                db.query(Booking).filter(Booking.tee_time_id == tee_id).update(
                    {Booking.capacity_conflict: conflict}, synchronize_session=False
                )

        batch.rows_total = total
        batch.rows_inserted = inserted
        batch.rows_updated = updated
        batch.rows_failed = failed
        batch.notes = "\n".join(notes) if notes else None
        _audit_import_event(
            db,
            request,
            admin,
            action="imports.bookings_csv_imported",
            entity_type="import_batch",
            club_id=int(club_id),
            entity_id=int(batch.id),
            payload={
                "batch_id": int(batch.id),
                "provider": provider_norm,
                "rows_total": int(total),
                "rows_inserted": int(inserted),
                "rows_updated": int(updated),
                "rows_failed": int(failed),
                "rows_pruned": int(pruned),
                "tee_times_touched": len(touched_tee_ids),
                "play_date": tee_sheet_meta.get("play_date").isoformat() if tee_sheet_meta and tee_sheet_meta.get("play_date") else None,
            },
        )
        db.commit()
        record_task_timing(
            db,
            club_id=int(club_id),
            task_key="import_review_time",
            duration_ms=elapsed_ms(started_at),
            actor_role="admin",
            actor_user_id=int(getattr(admin, "id", 0) or 0) or None,
            request_id=_request_id(request),
            meta={"kind": "bookings", "provider": provider_norm, "rows_total": int(total)},
        )
        db.commit()

        return {
            "batch_id": batch.id,
            "kind": batch.kind,
            "source": batch.source,
            "imported_at": batch.imported_at.isoformat(),
            "rows_total": total,
            "rows_inserted": inserted,
            "rows_updated": updated,
            "rows_failed": failed,
            "rows_pruned": pruned,
            "notes": batch.notes,
            "tee_times_touched": len(touched_tee_ids),
        }
    except IntegrityError as e:
        db.rollback()
        log_event(
            "warning",
            "imports.bookings.integrity_error",
            club_id=int(club_id),
            provider=provider_norm,
            error_type=type(e).__name__,
            error=str(e)[:240],
        )
        raise HTTPException(status_code=409, detail="Import conflict (duplicate external row IDs?)")
    except SQLAlchemyError as e:
        db.rollback()
        log_event(
            "error",
            "imports.bookings.db_error",
            club_id=int(club_id),
            provider=provider_norm,
            error_type=type(e).__name__,
            error=str(e)[:240],
        )
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        db.rollback()
        log_event(
            "error",
            "imports.bookings.unexpected_error",
            club_id=int(club_id),
            provider=provider_norm,
            error_type=type(e).__name__,
            error=str(e)[:240],
        )
        raise HTTPException(status_code=500, detail="Booking import failed")
