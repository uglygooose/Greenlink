# app/routers/cashbook.py
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel
from io import BytesIO
import os

from app.auth import get_db
from app.models import Booking, TeeTime, BookingStatus
from app.fee_models import FeeCategory
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

router = APIRouter(prefix="/cashbook", tags=["cashbook"])

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


def get_active_completed_bookings(db: Session, target_date: Optional[date] = None) -> List:
    """Get all bookings that were checked in or completed on a specific date"""
    if target_date is None:
        target_date = date.today()
    
    # Query bookings that were checked in or completed on the target date
    bookings = db.query(Booking).join(TeeTime).filter(
        func.date(Booking.created_at) == target_date,
        Booking.status.in_([BookingStatus.checked_in, BookingStatus.completed])
    ).all()
    
    return bookings


def create_payment_record(booking: Booking, batch_id: int = 1) -> PaymentRecord:
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
    
    # Calculate tax (assuming 15% VAT for South Africa)
    tax_type = 1  # Has tax
    tax_rate = 0.15
    tax_amount = round(amount * tax_rate / (1 + tax_rate), 2)  # Extract tax from inclusive price
    
    # Account number: max 7 characters
    account_number = f"GL{booking.id:05d}"  # GL + 5 digits = 7 chars max
    
    # GDC: Use "G" for General Ledger
    gdc = "G"
    
    # Contra account: Remove slashes, just use account code
    contra_account = "3455000"  # No slashes
    
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
        open_item="",
        projects_code="",
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
    records = [create_payment_record(booking) for booking in bookings]
    
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
    records = [create_payment_record(booking) for booking in bookings]
    
    # Create Excel workbook
    excel_file = create_excel_workbook(records, target_date.strftime("%d/%m/%Y"))
    
    # Generate filename
    filename = f"Cashbook_Payments_{target_date.strftime('%Y%m%d')}.xlsx"
    
    return StreamingResponse(
        iter([excel_file.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


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
    records = [create_payment_record(booking) for booking in bookings]
    
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
