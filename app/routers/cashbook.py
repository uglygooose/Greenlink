# app/routers/cashbook.py
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel
from io import BytesIO
import csv
from io import StringIO
import os
import json
import re
import uuid
from decimal import Decimal, ROUND_HALF_UP

from app.auth import get_db, get_current_user
from app.models import Booking, TeeTime, BookingStatus, LedgerEntry, LedgerEntryMeta, DayClose, AccountingSetting, User, UserRole, ClubSetting
from app.fee_models import FeeCategory
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

router = APIRouter(prefix="/cashbook", tags=["cashbook"])


def verify_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

class PaymentRecord(BaseModel):
    """Individual payment record"""
    period: str  # DD/MM/YYYY
    date: str  # DD/MM/YYYY
    gdc: str  # Golfer identifier
    account_number: str  # Account number from booking
    reference: str  # Reference code
    description: str  # Description of payment
    amount: float  # Payment amount
    tax_type: int  # 0=No tax, 1=Tax
    tax_amount: float  # Tax amount
    open_item: str  # Open item code
    projects_code: str  # Projects code (blank for now)
    contra_account: str  # Contra account (GL Account)
    exchange_rate: float  # Exchange rate (default 1)
    bank_exchange_rate: float  # Bank exchange rate (default 1)
    batch_id: int  # Batch identifier
    discount_tax_type: int  # 0=No discount tax, 1=Discount tax
    discount_amount: float  # Discount amount
    home_amount: float  # Home amount (same as amount in single currency)


class DailyPaymentsSummary(BaseModel):
    """Summary of payments collected"""
    date: str
    total_payments: float
    total_tax: float
    transaction_count: int
    records: List[PaymentRecord]


class AccountingSettingsPayload(BaseModel):
    green_fees_gl: Optional[str] = None
    cashbook_contra_gl: Optional[str] = None
    vat_rate: Optional[float] = None
    tax_type: Optional[int] = None
    cashbook_name: Optional[str] = None


def get_accounting_settings(db: Session) -> AccountingSetting:
    settings = db.query(AccountingSetting).first()
    if settings:
        return settings
    settings = AccountingSetting()
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def _upsert_club_setting(db: Session, key: str, value: str) -> None:
    row = db.query(ClubSetting).filter(ClubSetting.key == key).first()
    if row:
        row.value = value
        row.updated_at = datetime.utcnow()
    else:
        db.add(ClubSetting(key=key, value=value))


def _get_club_setting(db: Session, key: str) -> Optional[str]:
    row = db.query(ClubSetting).filter(ClubSetting.key == key).first()
    if not row or row.value is None:
        return None
    return str(row.value)


def _infer_date_format(sample: str) -> Optional[str]:
    raw = (sample or "").strip()
    if not raw:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return "YYYY-MM-DD"
    if re.match(r"^\d{2}/\d{2}/\d{4}$", raw):
        return "DD/MM/YYYY"
    if re.match(r"^\d{2}/\d{2}/\d{2}$", raw):
        return "DD/MM/YY"
    if re.match(r"^\d{4}/\d{2}/\d{2}$", raw):
        return "YYYY/MM/DD"
    return None


def _best_header_match(headers: List[str], *needles: str) -> Optional[str]:
    """
    Return the first header that contains all needle fragments (case-insensitive),
    preferring exact-ish matches.
    """
    normalized = [(h, re.sub(r"[^a-z0-9]+", "", (h or "").strip().lower())) for h in headers]
    want = [re.sub(r"[^a-z0-9]+", "", (n or "").strip().lower()) for n in needles if n]
    if not want:
        return None

    # Exact normalized match
    for h, n in normalized:
        if n in want:
            return h

    # Contains all fragments
    for h, n in normalized:
        if all(w in n for w in want):
            return h
    return None


def _build_layout_column_map(headers: List[str]) -> dict:
    return {
        "date": _best_header_match(headers, "date"),
        "reference": _best_header_match(headers, "ref") or _best_header_match(headers, "reference"),
        "description": _best_header_match(headers, "desc") or _best_header_match(headers, "description"),
        "account": _best_header_match(headers, "account") or _best_header_match(headers, "gl"),
        "debit": _best_header_match(headers, "debit"),
        "credit": _best_header_match(headers, "credit"),
        "amount": _best_header_match(headers, "amount") or _best_header_match(headers, "value"),
        "tax_flag": _best_header_match(headers, "tax", "flag") or _best_header_match(headers, "vat", "flag"),
        "tax_type": _best_header_match(headers, "taxtype") or _best_header_match(headers, "tax", "type"),
        "tax_amount": _best_header_match(headers, "taxamount") or _best_header_match(headers, "tax", "amount"),
    }


_DATE_RE = re.compile(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$")
_ACCOUNT_RE = re.compile(r"^\d{5,10}$")


def _is_date_cell(value: str) -> bool:
    return bool(_DATE_RE.match(str(value or "").strip()))


def _is_account_cell(value: str) -> bool:
    return bool(_ACCOUNT_RE.match(str(value or "").strip()))


def _is_amount_cell(value: str) -> bool:
    s = str(value or "").strip()
    if not s:
        return False
    # Pastel exports often use dot decimals; require a dot or minus sign to avoid
    # accidentally treating batch numbers (e.g. "13") as an amount column.
    if "." not in s and "-" not in s:
        return False
    try:
        Decimal(s)
        return True
    except Exception:
        return False


def _guess_headerless_layout_map(headers: List[str], sample_row: List[str]) -> dict:
    """
    Best-effort mapping for Pastel Batch->Export files that don't include headers.
    Uses the first row as a template and maps common fields by position/pattern.
    """
    n = len(sample_row)
    if n != len(headers):
        headers = [f"COL_{i+1}" for i in range(n)]

    idx_date = next((i for i, v in enumerate(sample_row) if _is_date_cell(v)), None)
    idx_account = next((i for i, v in enumerate(sample_row) if _is_account_cell(v)), None)
    idx_amount = next((i for i, v in enumerate(sample_row) if _is_amount_cell(v)), None)
    idx_tax_flag = None
    idx_tax_amount = None
    if idx_amount is not None and (idx_amount + 1) < n:
        nxt = str(sample_row[idx_amount + 1] or "").strip()
        if nxt in {"0", "1"}:
            idx_tax_flag = idx_amount + 1
            if (idx_amount + 2) < n and _is_amount_cell(sample_row[idx_amount + 2]):
                idx_tax_amount = idx_amount + 2

    # Description/reference are typically free-text; pick the first meaningful text after account.
    idx_desc = None
    idx_ref = None
    if idx_account is not None:
        for i in range(idx_account + 1, n):
            v = str(sample_row[i] or "").strip()
            if not v:
                continue
            if idx_desc is None and any(c.isalpha() for c in v):
                idx_desc = i
                continue
            if idx_desc is not None and idx_ref is None and any(c.isalpha() for c in v):
                idx_ref = i
                break

    # Fallbacks for the common Pastel export shape shown by clubs (18 columns):
    # 1=batch, 2=date, 3=journal, 4=account, 5=desc, 6=ref/type, 7=amount
    if n >= 7:
        idx_date = idx_date if idx_date is not None else 1
        idx_account = idx_account if idx_account is not None else 3
        idx_desc = idx_desc if idx_desc is not None else 4
        idx_ref = idx_ref if idx_ref is not None else 5
        idx_amount = idx_amount if idx_amount is not None else 6
        if idx_tax_flag is None and n >= 9:
            idx_tax_flag = 7
        if idx_tax_amount is None and n >= 9:
            idx_tax_amount = 8

    # Tax type is often a short code like GOV01; it tends to appear later.
    idx_tax_type = None
    for i in range(n - 1, -1, -1):
        v = str(sample_row[i] or "").strip()
        if len(v) in {4, 5, 6, 7} and any(c.isalpha() for c in v) and any(c.isdigit() for c in v):
            idx_tax_type = i
            break

    def _h(i: int | None) -> str | None:
        if i is None:
            return None
        if 0 <= i < len(headers):
            return headers[i]
        return None

    # Pastel commonly displays "Reference" before "Description". In many exports, the first
    # text column after account is the on-screen Reference, and the next is Description.
    return {
        "date": _h(idx_date),
        "account": _h(idx_account),
        "reference": _h(idx_desc),
        "description": _h(idx_ref),
        "amount": _h(idx_amount),
        "tax_flag": _h(idx_tax_flag),
        "tax_type": _h(idx_tax_type),
        "debit": None,
        "credit": None,
        "tax_amount": _h(idx_tax_amount),
    }


def _looks_like_header_row(row: List[str]) -> bool:
    tokens = ("date", "ref", "reference", "desc", "description", "account", "debit", "credit", "amount", "tax")
    normalized = ["".join(ch.lower() for ch in str(c or "") if ch.isalnum()) for c in row]
    return any(any(t in cell for t in tokens) for cell in normalized)


@router.get("/pastel-layout")
def get_pastel_layout(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    raw = _get_club_setting(db, "pastel_journal_layout")
    if not raw:
        return {"configured": False}
    try:
        return {"configured": True, "layout": json.loads(raw)}
    except Exception:
        return {"configured": True, "layout_raw": raw}


@router.post("/pastel-layout")
async def upload_pastel_layout(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    """
    Upload a Pastel-exported journal CSV (Batch -> Export) so we can match the import layout exactly.
    Stores the parsed layout in ClubSetting key: pastel_journal_layout
    """
    try:
        data = await file.read()
        text = data.decode("utf-8-sig", errors="replace")
        sample = "\n".join(text.splitlines()[:10])

        sniffer = csv.Sniffer()
        try:
            dialect = sniffer.sniff(sample, delimiters=[",", ";", "|", "\t"])
        except Exception:
            dialect = csv.excel
        try:
            has_header = bool(sniffer.has_header(sample))
        except Exception:
            has_header = True

        reader = csv.reader(StringIO(text), dialect)
        rows: list[list[str]] = []
        for row in reader:
            if row and any(str(cell or "").strip() for cell in row):
                rows.append([str(cell or "").strip() for cell in row])
            if len(rows) >= 25:
                break

        if not rows:
            raise HTTPException(status_code=400, detail="Empty CSV file")

        # csv.Sniffer.has_header is often wrong for Pastel exports. Override if the
        # "header" row contains obvious data patterns (date/account/amount) and no
        # header-like tokens.
        if has_header:
            first_row = rows[0]
            if not _looks_like_header_row(first_row) and any(_is_date_cell(v) for v in first_row):
                has_header = False

        sample_rows: list[list[str]] = []
        if has_header:
            headers = rows[0]
            sample_rows = rows[1:11] if len(rows) > 1 else []
            first_data = sample_rows[0] if sample_rows else None
            column_map = _build_layout_column_map(headers)
        else:
            # Headerless Pastel exports: treat the first row as a template and build a positional map.
            first_data = rows[0]
            headers = [f"COL_{i+1}" for i in range(len(first_data))]
            column_map = _guess_headerless_layout_map(headers, first_data)
            sample_rows = rows[:10]

        date_col = _best_header_match(headers, "date")
        date_format = None
        if first_data and column_map.get("date") and column_map.get("date") in headers:
            idx = headers.index(column_map.get("date"))
            if idx < len(first_data):
                date_format = _infer_date_format(first_data[idx])

        # Extra inference to help per-client setups.
        inferred = {}
        try:
            amount_hdr = column_map.get("amount")
            account_hdr = column_map.get("account")
            tax_type_hdr = column_map.get("tax_type")
            tax_flag_hdr = column_map.get("tax_flag")
            tax_amount_hdr = column_map.get("tax_amount")

            amount_mirrors: list[str] = []
            account_digits_only = False
            observed_tax_types: list[str] = []
            inferred_amount_sign: str | None = None

            if first_data and account_hdr and account_hdr in headers:
                aidx = headers.index(account_hdr)
                if aidx < len(first_data):
                    account_digits_only = _is_account_cell(first_data[aidx])

            if first_data and amount_hdr and amount_hdr in headers:
                midx = headers.index(amount_hdr)
                if midx < len(first_data):
                    amount_val = str(first_data[midx] or "").strip()
                    for i, v in enumerate(first_data):
                        if i == midx:
                            continue
                        if str(v or "").strip() == amount_val and _is_amount_cell(v) and _is_amount_cell(amount_val):
                            amount_mirrors.append(headers[i])

            if tax_type_hdr and tax_type_hdr in headers and sample_rows:
                tidx = headers.index(tax_type_hdr)
                seen = set()
                for r in sample_rows:
                    if tidx >= len(r):
                        continue
                    v = str(r[tidx] or "").strip()
                    if not v:
                        continue
                    if v not in seen:
                        seen.add(v)
                        observed_tax_types.append(v)

            if amount_hdr and tax_flag_hdr and amount_hdr in headers and tax_flag_hdr in headers and sample_rows:
                midx = headers.index(amount_hdr)
                fidx = headers.index(tax_flag_hdr)
                for r in sample_rows:
                    if midx >= len(r) or fidx >= len(r):
                        continue
                    if str(r[fidx] or "").strip() != "1":
                        continue
                    try:
                        amt = Decimal(str(r[midx]).strip())
                    except Exception:
                        continue
                    inferred_amount_sign = "debit_positive" if amt < 0 else "debit_negative"
                    break

            inferred = {
                "amount_mirrors": amount_mirrors,
                "account_digits_only": account_digits_only,
                "observed_tax_types": observed_tax_types,
                "inferred_amount_sign": inferred_amount_sign,
                "has_tax_flag": bool(tax_flag_hdr and tax_flag_hdr in headers),
                "has_tax_amount": bool(tax_amount_hdr and tax_amount_hdr in headers),
            }
        except Exception:
            inferred = {}

        layout = {
            "delimiter": getattr(dialect, "delimiter", ","),
            "has_header": has_header,
            "columns": headers,
            "date_format": date_format,
            "column_map": column_map,
            "template_row": first_data,
            "sample_rows": sample_rows,
            "inferred": inferred,
            "uploaded_at": datetime.utcnow().isoformat(),
            "filename": file.filename or None,
        }

        _upsert_club_setting(db, "pastel_journal_layout", json.dumps(layout))
        db.commit()

        return {"status": "success", "layout": layout}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[PASTEL] Layout upload failed: {str(e)[:240]}")
        raise HTTPException(status_code=500, detail="Failed to process Pastel layout CSV")


class PastelJournalMappingsPayload(BaseModel):
    vat_output_gl: Optional[str] = None
    debit_gl: Optional[dict] = None  # e.g. {"CARD":"8400/000","CASH":"8100/000","EFT":"8410/000","ONLINE":"9450/000"}
    tax_type: Optional[str] = None   # Optional (depends on Pastel import layout)
    amount_sign: Optional[str] = None  # "debit_positive" (default) | "debit_negative"


@router.get("/pastel-mappings")
def get_pastel_mappings(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    raw = _get_club_setting(db, "pastel_journal_mappings")
    if not raw:
        return {"configured": False}
    try:
        return {"configured": True, "mappings": json.loads(raw)}
    except Exception:
        return {"configured": True, "mappings_raw": raw}


@router.put("/pastel-mappings")
def update_pastel_mappings(
    payload: PastelJournalMappingsPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin),
):
    raw = _get_club_setting(db, "pastel_journal_mappings")
    current = {}
    if raw:
        try:
            current = json.loads(raw) or {}
        except Exception:
            current = {}

    if payload.vat_output_gl is not None:
        current["vat_output_gl"] = (payload.vat_output_gl or "").strip() or None

    if payload.tax_type is not None:
        current["tax_type"] = (payload.tax_type or "").strip() or None

    if payload.debit_gl is not None:
        debit_gl = {}
        for k, v in (payload.debit_gl or {}).items():
            key = str(k or "").strip().upper()
            val = str(v or "").strip()
            if not key:
                continue
            debit_gl[key] = val or None
        current["debit_gl"] = debit_gl

    if payload.amount_sign is not None:
        val = str(payload.amount_sign or "").strip().lower()
        if val and val not in {"debit_positive", "debit_negative"}:
            raise HTTPException(status_code=400, detail="amount_sign must be 'debit_positive' or 'debit_negative'")
        current["amount_sign"] = val or None

    current["updated_at"] = datetime.utcnow().isoformat()

    _upsert_club_setting(db, "pastel_journal_mappings", json.dumps(current))
    db.commit()

    return {"status": "success", "mappings": current}


def get_active_completed_bookings(db: Session, target_date: Optional[date] = None) -> List:
    """
    Get all bookings that were paid on a specific date.

    Accounting rule: the transaction date is the payment date (when the ledger entry was created),
    not the tee time date.
    """
    if target_date is None:
        target_date = date.today()
    
    bookings = (
        db.query(Booking)
        .join(LedgerEntry, LedgerEntry.booking_id == Booking.id)
        .filter(
            func.date(LedgerEntry.created_at) == target_date,
            Booking.status.in_([BookingStatus.checked_in, BookingStatus.completed]),
        )
        .distinct()
        .all()
    )
    
    return bookings


def sanitize_gl(value: Optional[str]) -> str:
    if not value:
        return ""
    return value.replace("/", "").replace(" ", "").replace("-", "")


def format_amount(value: float) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text if text else "0"


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _to_decimal(value) -> Decimal:
    try:
        return Decimal(str(value or 0))
    except Exception:
        return Decimal("0")


def _money_str(value: Decimal) -> str:
    v = _q2(value)
    if v == 0:
        return ""
    return f"{v:.2f}"


def _money_str_zero(value: Decimal) -> str:
    v = _q2(value)
    if v == 0:
        return "0"
    return f"{v:.2f}"


def _format_gl_for_layout(gl: str, layout: dict) -> str:
    """
    Pastel exports sometimes use digits-only account codes (e.g. 9500000) even
    if the UI shows 9500/000. When the uploaded template indicates digits-only,
    we sanitize GLs accordingly.
    """
    raw = str(gl or "").strip()
    inferred = (layout or {}).get("inferred") or {}
    if inferred.get("account_digits_only"):
        return re.sub(r"[^0-9]", "", raw)
    return raw


def _clean_text(value: str, max_len: int = 60) -> str:
    raw = (value or "").strip()
    raw = re.sub(r"[^A-Za-z0-9 _\\-]", " ", raw)
    raw = re.sub(r"\\s+", " ", raw).strip()
    if max_len and len(raw) > max_len:
        raw = raw[:max_len].strip()
    return raw


def _format_date_for_layout(d: date, date_format: Optional[str]) -> str:
    fmt = (date_format or "").strip().upper()
    if fmt == "DD/MM/YYYY":
        return d.strftime("%d/%m/%Y")
    if fmt == "DD/MM/YY":
        return d.strftime("%d/%m/%y")
    if fmt == "YYYY/MM/DD":
        return d.strftime("%Y/%m/%d")
    if fmt == "YYYY-MM-DD":
        return d.strftime("%Y-%m-%d")
    # Default
    return d.strftime("%Y-%m-%d")


def _require_pastel_layout(db: Session) -> dict:
    raw = _get_club_setting(db, "pastel_journal_layout")
    if not raw:
        raise HTTPException(status_code=400, detail="Pastel journal layout is not configured. Upload the Pastel-exported CSV first.")
    try:
        layout = json.loads(raw) or {}
    except Exception:
        raise HTTPException(status_code=500, detail="Pastel journal layout is invalid. Re-upload the layout CSV.")

    cols = layout.get("columns") or []
    if not isinstance(cols, list) or not cols:
        raise HTTPException(status_code=500, detail="Pastel journal layout is missing columns. Re-upload the layout CSV.")
    return layout


def _require_pastel_mappings(db: Session) -> dict:
    raw = _get_club_setting(db, "pastel_journal_mappings")
    if not raw:
        raise HTTPException(status_code=400, detail="Pastel mappings are not configured. Save VAT + debit GL mappings first.")
    try:
        mappings = json.loads(raw) or {}
    except Exception:
        raise HTTPException(status_code=500, detail="Pastel mappings are invalid. Re-save mappings.")

    vat_gl = (mappings.get("vat_output_gl") or "").strip()
    if not vat_gl:
        raise HTTPException(
            status_code=400,
            detail="Missing Output VAT GL account in Pastel mappings. Set it in Admin → Cashbook → Output VAT GL Account, then click 'Save Pastel Mappings'.",
        )

    debit_gl = mappings.get("debit_gl") or {}
    if not isinstance(debit_gl, dict):
        debit_gl = {}
    mappings["vat_output_gl"] = vat_gl
    mappings["debit_gl"] = {str(k or "").strip().upper(): str(v or "").strip() for k, v in debit_gl.items()}
    return mappings


def _export_base_dir() -> str:
    raw = str(os.getenv("GREENLINK_SAGE_EXPORT_DIR", "") or os.getenv("GREENLINK_EXPORT_DIR", "") or "").strip()
    if raw:
        return raw
    return os.path.join(".tmp", "SageExports")


def _ensure_export_dirs(base_dir: str) -> dict:
    ready = os.path.join(base_dir, "Ready")
    imported = os.path.join(base_dir, "Imported")
    failed = os.path.join(base_dir, "Failed")
    archive = os.path.join(base_dir, "Archive")
    for d in (ready, imported, failed, archive):
        os.makedirs(d, exist_ok=True)
    return {"base": base_dir, "ready": ready, "imported": imported, "failed": failed, "archive": archive}


def create_payment_record(
    booking: Booking,
    settings: AccountingSetting,
    payment_date: Optional[date] = None,
    batch_id: int = 1,
) -> PaymentRecord:
    """Convert a booking to a payment record"""
    tee_time = booking.tee_time
    fee_category = booking.fee_category_id
    
    # Get fee details if available
    amount = booking.price if booking.price else 350.0
    
    # Create reference from booking ID and player
    reference = f"BK{booking.id:05d}"  # 5 chars max for reference
    description = f"Golf Fee - {booking.player_name}"
    
    # Format dates
    if payment_date:
        date_obj = datetime.combine(payment_date, datetime.min.time())
    else:
        date_obj = tee_time.tee_time if tee_time else datetime.now()
    date_str = date_obj.strftime("%d/%m/%Y")
    
    # Period: month number (1-12)
    period_num = date_obj.month
    
    # Calculate tax (defaults to 15% VAT for SA)
    tax_type = settings.tax_type if settings else 1
    tax_rate = settings.vat_rate if settings else 0.15
    if tax_type and tax_rate:
        tax_amount = round(amount * tax_rate / (1 + tax_rate), 2)  # Extract tax from inclusive price
    else:
        tax_amount = 0.0
    
    # Account number: GL account from settings
    account_number = sanitize_gl(settings.green_fees_gl if settings else "1000-000")
    
    # GDC: Use "G" for General Ledger
    gdc = "G"
    
    # Contra account: cashbook bank account (no slashes/spaces)
    contra_account = sanitize_gl(settings.cashbook_contra_gl if settings else "8400/000")
    
    return PaymentRecord(
        period=str(period_num),  # Month number as string
        date=date_str,
        gdc=gdc,  # General Ledger
        account_number=account_number,  # 7 chars max
        reference=reference,
        description=description,
        amount=amount,
        tax_type=tax_type,
        tax_amount=tax_amount,
        open_item=" ",
        projects_code="     ",
        contra_account=contra_account,  # No slashes
        exchange_rate=1,
        bank_exchange_rate=1,
        batch_id=batch_id,
        discount_tax_type=0,
        discount_amount=0,
        home_amount=amount
    )


def create_excel_workbook(payments: List[PaymentRecord], date_str: str) -> BytesIO:
    """Create an Excel workbook with payment records in the specified format"""
    wb = Workbook()
    ws = wb.active
    ws.title = "Payments"
    
    # Define headers matching the Excel template
    headers = [
        "Period", "Date", "GDC", "Account Number", "Reference", "Description",
        "Amount", "Tax Type", "Tax Amount", "Open Item", "Projects Code",
        "Contra Account", "Exchange Rate", "Bank Exchange Rate", "Batch ID",
        "Discount Tax Type", "Discount Amount", "Home Amount"
    ]
    
    # Write headers with styling
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx)
        cell.value = header
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = border
    
    # Write data rows
    data_alignment = Alignment(horizontal="left", vertical="center")
    number_alignment = Alignment(horizontal="right", vertical="center")
    
    for row_idx, payment in enumerate(payments, start=2):
        ws.cell(row=row_idx, column=1).value = payment.period
        ws.cell(row=row_idx, column=2).value = payment.date
        ws.cell(row=row_idx, column=3).value = payment.gdc
        ws.cell(row=row_idx, column=4).value = payment.account_number
        ws.cell(row=row_idx, column=5).value = payment.reference
        ws.cell(row=row_idx, column=6).value = payment.description
        ws.cell(row=row_idx, column=7).value = payment.amount
        ws.cell(row=row_idx, column=8).value = payment.tax_type
        ws.cell(row=row_idx, column=9).value = payment.tax_amount
        ws.cell(row=row_idx, column=10).value = payment.open_item
        ws.cell(row=row_idx, column=11).value = payment.projects_code
        ws.cell(row=row_idx, column=12).value = payment.contra_account
        ws.cell(row=row_idx, column=13).value = payment.exchange_rate
        ws.cell(row=row_idx, column=14).value = payment.bank_exchange_rate
        ws.cell(row=row_idx, column=15).value = payment.batch_id
        ws.cell(row=row_idx, column=16).value = payment.discount_tax_type
        ws.cell(row=row_idx, column=17).value = payment.discount_amount
        ws.cell(row=row_idx, column=18).value = payment.home_amount
        
        # Apply styling to data rows
        for col_idx in range(1, 19):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.border = border
            
            # Number formatting for amount columns
            if col_idx in [7, 9, 13, 14, 17, 18]:  # Amount columns
                cell.number_format = '#,##0.00'
                cell.alignment = number_alignment
            elif col_idx in [8, 15, 16]:  # Type columns
                cell.number_format = '0'
                cell.alignment = number_alignment
            else:
                cell.alignment = data_alignment
    
    # Adjust column widths
    column_widths = [12, 12, 15, 16, 12, 20, 12, 10, 12, 12, 14, 16, 12, 16, 10, 16, 16, 12]
    for col_idx, width in enumerate(column_widths, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width
    
    # Freeze header row
    ws.freeze_panes = "A2"
    
    # Save to BytesIO
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    
    return output


def create_csv_content(payments: List[PaymentRecord]) -> StringIO:
    output = StringIO()
    writer = csv.writer(output)
    for p in payments:
        writer.writerow([
            p.period,
            p.date,
            p.gdc,
            p.account_number,
            p.reference,
            p.description,
            format_amount(p.amount),
            p.tax_type,
            format_amount(p.tax_amount),
            p.open_item,
            p.projects_code,
            p.contra_account,
            format_amount(p.exchange_rate),
            format_amount(p.bank_exchange_rate),
            p.batch_id,
            p.discount_tax_type,
            format_amount(p.discount_amount),
            format_amount(p.home_amount)
        ])
    output.seek(0)
    return output


@router.get("/daily-summary")
def get_daily_summary(
    summary_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format, defaults to today"),
    db: Session = Depends(get_db)
) -> DailyPaymentsSummary:
    """Get summary of all payments collected for a specific day"""
    
    # Parse date
    if summary_date:
        try:
            target_date = datetime.strptime(summary_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        target_date = date.today()
    
    # Get bookings
    try:
        bookings = get_active_completed_bookings(db, target_date)
    except Exception as e:
        # Database not available, return empty summary
        return DailyPaymentsSummary(
            date=target_date.strftime("%Y-%m-%d"),
            total_payments=0.0,
            total_tax=0.0,
            transaction_count=0,
            records=[]
        )
    
    # Convert to payment records
    settings = get_accounting_settings(db)
    records = [create_payment_record(booking, settings, payment_date=target_date) for booking in bookings]
    
    # Calculate totals
    total_payments = sum(r.amount for r in records)
    total_tax = sum(r.tax_amount for r in records)
    
    return DailyPaymentsSummary(
        date=target_date.strftime("%Y-%m-%d"),
        total_payments=total_payments,
        total_tax=total_tax,
        transaction_count=len(records),
        records=records
    )


@router.get("/export-excel")
def export_daily_payments_excel(
    export_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format, defaults to today"),
    db: Session = Depends(get_db)
):
    """Export daily payments to Excel file"""
    
    # Parse date
    if export_date:
        try:
            target_date = datetime.strptime(export_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        target_date = date.today()
    
    # Get bookings
    try:
        bookings = get_active_completed_bookings(db, target_date)
    except Exception as e:
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    
    if not bookings:
        raise HTTPException(status_code=404, detail=f"No payments found for {target_date}")
    
    # Convert to payment records
    settings = get_accounting_settings(db)
    records = [create_payment_record(booking, settings, payment_date=target_date) for booking in bookings]
    
    # Create Excel workbook
    excel_file = create_excel_workbook(records, target_date.strftime("%d/%m/%Y"))
    
    # Generate filename
    filename = f"Cashbook_Payments_{target_date.strftime('%Y%m%d')}.xlsx"
    
    return StreamingResponse(
        iter([excel_file.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export-csv")
def export_daily_payments_csv(
    export_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format, defaults to today"),
    force: int = Query(0, description="1 to allow re-export for the same payment date (not recommended)"),
    db: Session = Depends(get_db)
):
    """
    Export a balanced daily VAT journal in the club's Pastel Partner journal import layout.

    Accounting rule: transaction date is the payment date (ledger_entries.created_at), not the tee time date.
    """
    if export_date:
        try:
            target_date = datetime.strptime(export_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        target_date = date.today()

    settings = get_accounting_settings(db)
    layout = _require_pastel_layout(db)
    mappings = _require_pastel_mappings(db)

    # Idempotency: avoid double-posting the same day (unless forced).
    if not force:
        exported_count = (
            db.query(func.count(LedgerEntry.id))
            .filter(func.date(LedgerEntry.created_at) == target_date, LedgerEntry.pastel_synced == 1)
            .scalar()
            or 0
        )
        if exported_count:
            raise HTTPException(status_code=409, detail="This payment date already looks exported. Reopen the day or use force=1.")

    try:
        rows = (
            db.query(LedgerEntry, Booking, FeeCategory, LedgerEntryMeta)
            .join(Booking, LedgerEntry.booking_id == Booking.id)
            .outerjoin(FeeCategory, FeeCategory.id == Booking.fee_category_id)
            .outerjoin(LedgerEntryMeta, LedgerEntryMeta.ledger_entry_id == LedgerEntry.id)
            .filter(
                LedgerEntry.booking_id.isnot(None),
                func.date(LedgerEntry.created_at) == target_date,
                Booking.status.in_([BookingStatus.checked_in, BookingStatus.completed]),
            )
            .all()
        )
    except Exception:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    if not rows:
        raise HTTPException(status_code=404, detail=f"No payments found for {target_date}")

    # Validate payment_method presence.
    missing_pm = []
    for le, b, fee_cat, meta in rows:
        method = str(getattr(meta, "payment_method", "") or "").strip().upper()
        if not method:
            missing_pm.append(int(getattr(b, "id", 0) or 0))
    missing_pm = [bid for bid in missing_pm if bid]
    if missing_pm:
        raise HTTPException(
            status_code=400,
            detail=f"Missing payment method for {len(missing_pm)} booking(s): {', '.join([str(x) for x in missing_pm[:30]])}"
        )

    debit_gl = mappings.get("debit_gl") or {}
    vat_output_gl = mappings.get("vat_output_gl")

    # Aggregate gross totals.
    gross_by_method: dict[str, Decimal] = {}
    gross_by_fee_type: dict[str, Decimal] = {}
    ledger_entry_ids: list[int] = []
    booking_ids: list[int] = []

    for le, b, fee_cat, meta in rows:
        amount = _q2(_to_decimal(getattr(le, "amount", 0) or 0))
        if amount <= 0:
            continue

        method = str(getattr(meta, "payment_method", "") or "").strip().upper()
        fee_type_raw = getattr(fee_cat, "fee_type", None)
        fee_type = str(getattr(fee_type_raw, "value", fee_type_raw) or "golf").strip().lower() or "golf"

        gross_by_method[method] = _q2(gross_by_method.get(method, Decimal("0")) + amount)
        gross_by_fee_type[fee_type] = _q2(gross_by_fee_type.get(fee_type, Decimal("0")) + amount)

        if getattr(le, "id", None):
            ledger_entry_ids.append(int(le.id))
        if getattr(b, "id", None):
            booking_ids.append(int(b.id))

    if not gross_by_method:
        raise HTTPException(status_code=404, detail=f"No positive-value payments found for {target_date}")

    # Validate debit GL mappings for used methods.
    used_methods = sorted(gross_by_method.keys())
    missing_debits = [m for m in used_methods if not str(debit_gl.get(m, "") or "").strip()]
    if missing_debits:
        raise HTTPException(status_code=400, detail=f"Missing debit GL mapping for payment method(s): {', '.join(missing_debits)}")

    # VAT calculations (inclusive amounts).
    try:
        rate = Decimal(str(settings.vat_rate if getattr(settings, "vat_rate", None) is not None else 0.15))
    except Exception:
        rate = Decimal("0.15")
    if rate < 0:
        rate = Decimal("0")

    vat_by_fee_type: dict[str, Decimal] = {}
    net_by_fee_type: dict[str, Decimal] = {}
    for ft, gross in gross_by_fee_type.items():
        if rate > 0:
            vat = _q2(gross * (rate / (Decimal("1") + rate)))
        else:
            vat = Decimal("0.00")
        net = _q2(gross - vat)
        vat_by_fee_type[ft] = vat
        net_by_fee_type[ft] = net

    vat_total = _q2(sum(vat_by_fee_type.values(), Decimal("0")))
    net_total = _q2(sum(net_by_fee_type.values(), Decimal("0")))
    gross_total = _q2(sum(gross_by_method.values(), Decimal("0")))

    if _q2(net_total + vat_total) != gross_total:
        raise HTTPException(status_code=500, detail="VAT split does not balance to gross total after rounding.")

    batch_ref = f"GREENLINK_{target_date.strftime('%Y%m%d')}"
    batch_desc = _clean_text(f"Daily golf takings {target_date.strftime('%Y-%m-%d')}", max_len=60)

    # Build journal lines (debits per payment method; credits net revenue per fee type + output VAT).
    lines: list[dict] = []
    method_order = ["CASH", "CARD", "EFT", "ONLINE"]
    ordered_methods = [m for m in method_order if m in gross_by_method] + [m for m in used_methods if m not in method_order]
    for method in ordered_methods:
        account = str(debit_gl.get(method) or "").strip()
        lines.append({
            "account": account,
            "debit": gross_by_method[method],
            "credit": Decimal("0.00"),
            "ref": _clean_text(method, max_len=20),
            "desc": _clean_text(f"{batch_desc} {method}", max_len=60),
        })

    # Revenue credits
    revenue_gl_default = (getattr(settings, "green_fees_gl", None) or "").strip()
    revenue_by_fee_type = (mappings.get("revenue_gl") or {}) if isinstance(mappings.get("revenue_gl"), dict) else {}
    for ft in sorted(net_by_fee_type.keys()):
        net_amt = net_by_fee_type[ft]
        if net_amt == 0:
            continue
        account = str(revenue_by_fee_type.get(ft) or revenue_gl_default or "").strip()
        if not account:
            raise HTTPException(status_code=400, detail=f"Missing revenue GL mapping for fee type '{ft}'.")
        lines.append({
            "account": account,
            "debit": Decimal("0.00"),
            "credit": net_amt,
            "ref": _clean_text(str(ft).upper(), max_len=20),
            "desc": _clean_text(f"{batch_desc} {ft}", max_len=60),
        })

    # VAT credit
    if vat_total != 0:
        lines.append({
            "account": str(vat_output_gl).strip(),
            "debit": Decimal("0.00"),
            "credit": vat_total,
            "ref": "VAT CONT",
            "desc": _clean_text(f"Output VAT {target_date.strftime('%Y-%m-%d')}", max_len=60),
        })

    debit_sum = _q2(sum((l["debit"] for l in lines), Decimal("0")))
    credit_sum = _q2(sum((l["credit"] for l in lines), Decimal("0")))
    if debit_sum != credit_sum:
        raise HTTPException(status_code=500, detail="Journal is out of balance after rounding.")

    # Render CSV according to stored Pastel layout.
    columns = layout.get("columns") or []
    column_map = layout.get("column_map") or {}
    header_to_idx = {str(h): i for i, h in enumerate(columns)}

    has_debit = bool(column_map.get("debit")) and column_map.get("debit") in header_to_idx
    has_credit = bool(column_map.get("credit")) and column_map.get("credit") in header_to_idx
    has_amount = bool(column_map.get("amount")) and column_map.get("amount") in header_to_idx

    required = ["date", "account"]
    for key in required:
        header = column_map.get(key)
        if not header or header not in header_to_idx:
            raise HTTPException(status_code=500, detail=f"Pastel layout missing required column for '{key}'. Re-upload layout CSV.")

    # Layouts typically have either (Debit,Credit) columns or a single signed Amount column.
    if not ((has_debit and has_credit) or has_amount):
        raise HTTPException(
            status_code=500,
            detail="Pastel layout must include Debit/Credit columns or an Amount column. Re-upload a Batch->Export sample that matches your import layout.",
        )

    date_format = layout.get("date_format")
    date_value = _format_date_for_layout(target_date, date_format)
    delimiter = layout.get("delimiter") or ","
    has_header = bool(layout.get("has_header", True))
    template_row = layout.get("template_row")
    has_template = isinstance(template_row, list) and len(template_row) == len(columns)

    def _base_row() -> list:
        if has_template:
            return [str(x or "") for x in list(template_row)]
        return ["" for _ in columns]

    def _set(row: list, key: str, value: str) -> None:
        header = column_map.get(key)
        if not header:
            return
        idx = header_to_idx.get(header)
        if idx is None:
            return
        row[idx] = value

    # Some Pastel layouts repeat the signed amount in multiple columns.
    amount_mirror_headers: list[str] = []
    try:
        amount_mirror_headers = list(((layout.get("inferred") or {}).get("amount_mirrors") or []))
    except Exception:
        amount_mirror_headers = []

    def _set_amount_mirrors(row: list, value: str) -> None:
        for h in amount_mirror_headers:
            idx = header_to_idx.get(str(h))
            if idx is None:
                continue
            if idx < len(row):
                row[idx] = value

    out = StringIO(newline="")
    writer = csv.writer(out, delimiter=delimiter, lineterminator="\r\n")
    if has_header:
        writer.writerow(columns)

    tax_type_sales = str((mappings.get("tax_type") or "")).strip()
    amount_sign = str((mappings.get("amount_sign") or "")).strip().lower() or "debit_positive"
    vat_output_gl_fmt = _format_gl_for_layout(str(vat_output_gl or "").strip(), layout) if vat_output_gl else ""
    for line in lines:
        row = _base_row()
        _set(row, "date", date_value)
        # Reference/Description
        if column_map.get("reference") and column_map.get("reference") in header_to_idx:
            _set(row, "reference", batch_ref if has_header else str(line.get("ref") or batch_ref))
        if column_map.get("description") and column_map.get("description") in header_to_idx:
            # If the template already has a short constant description (e.g. "Payment"), keep it.
            if has_template:
                d_idx = header_to_idx[column_map.get("description")]
                existing = str(row[d_idx] or "").strip() if d_idx < len(row) else ""
                if existing and len(existing) <= 20:
                    pass
                else:
                    _set(row, "description", str(line["desc"]))
            else:
                _set(row, "description", str(line["desc"]))

        account_value = _format_gl_for_layout(str(line["account"]), layout)
        _set(row, "account", account_value)

        # Determine whether this is a revenue line (taxable) vs debit line or VAT control line.
        is_debit_line = bool(line["debit"] and _q2(line["debit"]) != 0)
        is_credit_line = bool((not is_debit_line) and line["credit"] and _q2(line["credit"]) != 0)
        is_vat_control_line = bool(vat_output_gl_fmt) and account_value.strip() == vat_output_gl_fmt
        is_revenue_line = bool(is_credit_line and not is_vat_control_line)
        apply_sales_tax = bool(is_revenue_line and tax_type_sales)

        # Amount (or Debit/Credit)
        amt = None
        if has_amount:
            # Signed-amount layout.
            amt = Decimal("0.00")
            if is_debit_line:
                amt = _q2(line["debit"])
                if amount_sign == "debit_negative":
                    amt = -amt
            else:
                amt = _q2(line["credit"])
                # Credit is opposite sign to debit.
                if amount_sign == "debit_positive":
                    amt = -amt
                else:
                    amt = +amt
            amt_str = _money_str(amt)
            _set(row, "amount", amt_str)
            _set_amount_mirrors(row, amt_str)
            if has_debit:
                _set(row, "debit", "")
            if has_credit:
                _set(row, "credit", "")
        else:
            # Debit/Credit layout.
            if is_debit_line:
                _set(row, "debit", _money_str(line["debit"]))
                _set(row, "credit", "")
            else:
                _set(row, "debit", "")
                _set(row, "credit", _money_str(line["credit"]))

        # Tax fields (layout-specific).
        # Many Pastel layouts expect explicit "00"/"01" + numeric zeroes, not blanks.
        if column_map.get("tax_type") and column_map.get("tax_type") in header_to_idx:
            _set(row, "tax_type", tax_type_sales if apply_sales_tax else "00")

        if column_map.get("tax_flag") and column_map.get("tax_flag") in header_to_idx:
            _set(row, "tax_flag", "1" if apply_sales_tax else "0")

        if column_map.get("tax_amount") and column_map.get("tax_amount") in header_to_idx:
            if apply_sales_tax:
                # Use the net revenue line amount to compute VAT (net * rate).
                base_net = _q2(line["credit"]) if is_credit_line else _q2(line["debit"])
                vat_amt = _q2(base_net * rate) if rate > 0 else Decimal("0.00")
                # Match sign to the signed amount when available.
                if amt is not None and amt < 0:
                    vat_amt = -vat_amt
                _set(row, "tax_amount", _money_str_zero(vat_amt))
            else:
                _set(row, "tax_amount", "0")

        writer.writerow(row)

    csv_text = out.getvalue()

    run_id = uuid.uuid4().hex[:8]
    base_name = f"PASTEL_JOURNAL_GREENLINK_{target_date.strftime('%Y%m%d')}_{run_id}"
    file_name = f"{base_name}.csv"
    audit_name = f"{base_name}.audit.json"
    job_name = f"{base_name}.job.json"

    dirs = _ensure_export_dirs(_export_base_dir())
    csv_path = os.path.join(dirs["ready"], file_name)
    audit_path = os.path.join(dirs["ready"], audit_name)
    job_path = os.path.join(dirs["ready"], job_name)

    try:
        with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
            f.write(csv_text)

        audit = {
            "status": "built",
            "runId": run_id,
            "date": target_date.strftime("%Y-%m-%d"),
            "batchRef": batch_ref,
            "totals": {
                "gross": float(gross_total),
                "vat": float(vat_total),
                "net": float(net_total),
            },
            "payment_methods": {k: float(v) for k, v in gross_by_method.items()},
            "fee_types": {k: float(v) for k, v in gross_by_fee_type.items()},
            "ledger_entry_count": len(set(ledger_entry_ids)),
            "booking_count": len(set(booking_ids)),
            "layout": {
                "filename": layout.get("filename"),
                "date_format": layout.get("date_format"),
                "delimiter": layout.get("delimiter"),
                "columns": columns,
            },
        }
        with open(audit_path, "w", encoding="utf-8") as f:
            json.dump(audit, f, indent=2)

        job = {
            "runId": run_id,
            "date": target_date.strftime("%Y-%m-%d"),
            "batchRef": batch_ref,
            "csv": csv_path,
            "audit": audit_path,
        }
        with open(job_path, "w", encoding="utf-8") as f:
            json.dump(job, f, indent=2)
    except Exception as e:
        print(f"[PASTEL] Failed to write export files: {str(e)[:240]}")
        raise HTTPException(status_code=500, detail="Failed to write export files")

    # Mark ledger entries as exported (idempotency + audit trail).
    try:
        if ledger_entry_ids:
            db.query(LedgerEntry).filter(LedgerEntry.id.in_(list(set(ledger_entry_ids)))).update(
                {
                    LedgerEntry.pastel_synced: 1,
                    LedgerEntry.pastel_transaction_id: batch_ref,
                },
                synchronize_session=False,
            )
            db.commit()
    except Exception as e:
        print(f"[PASTEL] Failed to mark ledger entries exported: {str(e)[:240]}")

    response = FileResponse(csv_path, media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename={file_name}"
    response.headers["X-GreenLink-RunId"] = run_id
    response.headers["X-GreenLink-BatchRef"] = batch_ref
    return response


@router.get("/export-job-status")
def get_export_job_status(
    export_date: str = Query(..., description="Payment date in YYYY-MM-DD format"),
    run_id: str = Query(..., description="Run ID returned in X-GreenLink-RunId header"),
):
    try:
        target_date = datetime.strptime(export_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid export_date format. Use YYYY-MM-DD")

    rid = (run_id or "").strip()
    if not rid or len(rid) > 40:
        raise HTTPException(status_code=400, detail="Invalid run_id")

    base_name = f"PASTEL_JOURNAL_GREENLINK_{target_date.strftime('%Y%m%d')}_{rid}"
    result_file = f"{base_name}.result.json"

    dirs = _ensure_export_dirs(_export_base_dir())
    for bucket in ("imported", "failed", "ready"):
        folder = dirs.get(bucket)
        if not folder:
            continue
        path = os.path.join(folder, result_file)
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f) or {}
        except Exception:
            data = {"status": "unknown", "message": "Result file unreadable"}
        data.setdefault("runId", rid)
        data.setdefault("date", target_date.strftime("%Y-%m-%d"))
        return data

    return {"status": "pending", "runId": rid, "date": target_date.strftime("%Y-%m-%d")}


@router.get("/close-status")
def get_close_status(
    summary_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format, defaults to today"),
    db: Session = Depends(get_db)
):
    if summary_date:
        try:
            target_date = datetime.strptime(summary_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        target_date = date.today()

    close = db.query(DayClose).filter(DayClose.close_date == target_date).order_by(DayClose.id.desc()).first()
    if not close:
        return {
            "date": target_date.strftime("%Y-%m-%d"),
            "is_closed": False
        }

    return {
        "date": target_date.strftime("%Y-%m-%d"),
        "is_closed": close.status == "closed",
        "status": close.status,
        "closed_at": close.closed_at.isoformat() if close.closed_at else None,
        "closed_by_user_id": close.closed_by_user_id,
        "export_batch_id": close.export_batch_id,
        "export_filename": close.export_filename,
        "auto_push": bool(close.auto_push)
    }


@router.get("/settings")
def get_accounting_settings_api(
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    settings = get_accounting_settings(db)
    return {
        "green_fees_gl": settings.green_fees_gl,
        "cashbook_contra_gl": settings.cashbook_contra_gl,
        "vat_rate": settings.vat_rate,
        "tax_type": settings.tax_type,
        "cashbook_name": settings.cashbook_name,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None
    }


@router.put("/settings")
def update_accounting_settings_api(
    payload: AccountingSettingsPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    settings = get_accounting_settings(db)
    if payload.green_fees_gl is not None:
        settings.green_fees_gl = payload.green_fees_gl.strip()
    if payload.cashbook_contra_gl is not None:
        settings.cashbook_contra_gl = payload.cashbook_contra_gl.strip()
    if payload.vat_rate is not None:
        settings.vat_rate = payload.vat_rate
    if payload.tax_type is not None:
        settings.tax_type = payload.tax_type
    if payload.cashbook_name is not None:
        settings.cashbook_name = payload.cashbook_name.strip()
    settings.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(settings)
    return {
        "status": "success",
        "settings": {
            "green_fees_gl": settings.green_fees_gl,
            "cashbook_contra_gl": settings.cashbook_contra_gl,
            "vat_rate": settings.vat_rate,
            "tax_type": settings.tax_type,
            "cashbook_name": settings.cashbook_name
        }
    }


@router.post("/close-day")
def close_day(
    close_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format, defaults to today"),
    auto_push: int = Query(0, description="1 to enable auto-push (placeholder)"),
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    if close_date:
        try:
            target_date = datetime.strptime(close_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        target_date = date.today()

    existing = db.query(DayClose).filter(
        DayClose.close_date == target_date,
        DayClose.status == "closed"
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Day is already closed")

    bookings = get_active_completed_bookings(db, target_date)
    booking_ids = [b.id for b in bookings]
    batch_id = f"GL-{target_date.strftime('%Y%m%d')}-{datetime.utcnow().strftime('%H%M%S')}"

    # NOTE: Do not mark ledger entries as exported here.
    # The export job (/cashbook/export-csv) writes the CSV and then marks entries as exported.

    filename = f"Cashbook_Payments_{target_date.strftime('%Y%m%d')}.csv"
    close = db.query(DayClose).filter(DayClose.close_date == target_date).first()
    if close:
        close.status = "closed"
        close.closed_by_user_id = admin.id
        close.closed_at = datetime.utcnow()
        close.export_method = "cashbook"
        close.export_batch_id = batch_id
        close.export_filename = filename
        close.auto_push = 1 if auto_push else 0
    else:
        close = DayClose(
            close_date=target_date,
            status="closed",
            closed_by_user_id=admin.id,
            closed_at=datetime.utcnow(),
            export_method="cashbook",
            export_batch_id=batch_id,
            export_filename=filename,
            auto_push=1 if auto_push else 0
        )
        db.add(close)

    db.commit()

    return {
        "status": "closed",
        "date": target_date.strftime("%Y-%m-%d"),
        "batch_id": batch_id,
        "bookings": len(booking_ids),
        "export_filename": filename
    }


@router.post("/reopen-day")
def reopen_day(
    reopen_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format, defaults to today"),
    db: Session = Depends(get_db),
    admin: User = Depends(verify_admin)
):
    if reopen_date:
        try:
            target_date = datetime.strptime(reopen_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        target_date = date.today()

    close = db.query(DayClose).filter(
        DayClose.close_date == target_date,
        DayClose.status == "closed"
    ).first()
    if not close:
        raise HTTPException(status_code=404, detail="Day is not closed")

    bookings = get_active_completed_bookings(db, target_date)
    booking_ids = [b.id for b in bookings]
    if booking_ids:
        ledger_entries = db.query(LedgerEntry).filter(LedgerEntry.booking_id.in_(booking_ids)).all()
        for le in ledger_entries:
            le.pastel_synced = 0
            le.pastel_transaction_id = None

    close.status = "reopened"
    close.reopened_by_user_id = admin.id
    close.reopened_at = datetime.utcnow()
    db.commit()

    return {
        "status": "reopened",
        "date": target_date.strftime("%Y-%m-%d")
    }


@router.post("/finalize-day")
def finalize_day_payments(
    finalize_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format, defaults to today"),
    db: Session = Depends(get_db)
):
    """
    Finalize payments for a day:
    1. Get all checked-in and completed bookings
    2. Create payment records
    3. Export to Excel
    4. Return file path and summary
    """
    
    # Parse date
    if finalize_date:
        try:
            target_date = datetime.strptime(finalize_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        target_date = date.today()
    
    # Get bookings
    try:
        bookings = get_active_completed_bookings(db, target_date)
    except Exception as e:
        return {
            "status": "error",
            "date": target_date.strftime("%Y-%m-%d"),
            "message": "Database connection unavailable",
            "transaction_count": 0,
            "total_amount": 0.0
        }
    
    if not bookings:
        return {
            "status": "no_data",
            "date": target_date.strftime("%Y-%m-%d"),
            "message": f"No payments found for {target_date}",
            "transaction_count": 0,
            "total_amount": 0.0
        }
    
    # Convert to payment records
    settings = get_accounting_settings(db)
    records = [create_payment_record(booking, settings, payment_date=target_date) for booking in bookings]
    
    # Calculate totals
    total_payments = sum(r.amount for r in records)
    total_tax = sum(r.tax_amount for r in records)
    
    return {
        "status": "success",
        "date": target_date.strftime("%Y-%m-%d"),
        "transaction_count": len(records),
        "total_amount": total_payments,
        "total_tax": total_tax,
        "export_url": f"/cashbook/export-excel?export_date={target_date.strftime('%Y-%m-%d')}",
        "message": f"Successfully processed {len(records)} payments for {target_date.strftime('%Y-%m-%d')}"
    }
