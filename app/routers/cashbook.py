# app/routers/cashbook.py
from fastapi import APIRouter, Depends, HTTPException, Query
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

from app.auth import get_db, get_current_user
from app.models import Booking, TeeTime, BookingStatus, LedgerEntry, DayClose, AccountingSetting, User, UserRole
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


def get_active_completed_bookings(db: Session, target_date: Optional[date] = None) -> List:
    """Get all bookings that were checked in or completed on a specific date"""
    if target_date is None:
        target_date = date.today()
    
    # Query bookings that were checked in or completed on the target date
    bookings = db.query(Booking).join(TeeTime).filter(
        func.date(TeeTime.tee_time) == target_date,
        Booking.status.in_([BookingStatus.checked_in, BookingStatus.completed])
    ).all()
    
    return bookings


def sanitize_gl(value: Optional[str]) -> str:
    if not value:
        return ""
    return value.replace("/", "").replace(" ", "").replace("-", "")


def format_amount(value: float) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text if text else "0"


def create_payment_record(booking: Booking, settings: AccountingSetting, batch_id: int = 1) -> PaymentRecord:
    """Convert a booking to a payment record"""
    tee_time = booking.tee_time
    fee_category = booking.fee_category_id
    
    # Get fee details if available
    amount = booking.price if booking.price else 350.0
    
    # Create reference from booking ID and player
    reference = f"BK{booking.id:05d}"  # 5 chars max for reference
    description = f"Golf Fee - {booking.player_name}"
    
    # Format dates
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
    records = [create_payment_record(booking, settings) for booking in bookings]
    
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
    records = [create_payment_record(booking, settings) for booking in bookings]
    
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
    db: Session = Depends(get_db)
):
    """Export daily payments to CSV file (Sage import)"""
    if export_date:
        try:
            target_date = datetime.strptime(export_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        target_date = date.today()

    try:
        bookings = get_active_completed_bookings(db, target_date)
    except Exception:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    if not bookings:
        raise HTTPException(status_code=404, detail=f"No payments found for {target_date}")

    settings = get_accounting_settings(db)
    records = [create_payment_record(booking, settings) for booking in bookings]
    csv_content = create_csv_content(records)

    filename = f"Cashbook_Payments_{target_date.strftime('%Y%m%d')}.csv"
    response = StreamingResponse(iter([csv_content.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response


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

    if booking_ids:
        ledger_entries = db.query(LedgerEntry).filter(LedgerEntry.booking_id.in_(booking_ids)).all()
        for le in ledger_entries:
            le.pastel_synced = 1
            le.pastel_transaction_id = batch_id

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
    records = [create_payment_record(booking, settings) for booking in bookings]
    
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
