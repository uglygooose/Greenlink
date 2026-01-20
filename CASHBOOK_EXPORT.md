# Daily Cashbook & Payment Export

This system collects all payments throughout the day and exports them to Excel at end-of-day, eliminating the need for Sage One or other accounting integrations.

## Overview

Payments are automatically recorded when golfers:
- Check in for their round
- Complete their scorecard

At the end of the day, administrators can generate an Excel export with all transactions formatted for manual entry into accounting systems.

## Features

- **Automatic Payment Tracking**: Captures golf fees from completed bookings
- **Excel Export**: Generates formatted spreadsheets matching standard cashbook layouts
- **Daily Summary**: View totals and transaction counts before exporting
- **Tax Calculation**: Automatically includes VAT calculations (15% South Africa)
- **Flexible Dating**: Export payments for any specific date

## API Endpoints

### 1. Get Daily Payment Summary

```bash
GET /cashbook/daily-summary?summary_date=2024-01-15
```

Returns summary of all payments for a specific day:
```json
{
  "date": "2024-01-15",
  "total_payments": 15750.00,
  "total_tax": 2050.00,
  "transaction_count": 45,
  "records": [
    {
      "period": "15/01/2024",
      "date": "15/01/2024",
      "gdc": "PLAYER_ID",
      "account_number": "ACC000001",
      "reference": "BK000001",
      "description": "Golf Fee - Player Name",
      "amount": 350.00,
      "tax_type": 1,
      "tax_amount": 45.65,
      "open_item": "",
      "projects_code": "",
      "contra_account": "3455/000",
      "exchange_rate": 1,
      "bank_exchange_rate": 1,
      "batch_id": 1,
      "discount_tax_type": 0,
      "discount_amount": 0,
      "home_amount": 350.00
    }
  ]
}
```

### 2. Export to Excel

```bash
GET /cashbook/export-excel?export_date=2024-01-15
```

Returns an Excel file (`Cashbook_Payments_20240115.xlsx`) with:
- **Period**: DD/MM/YYYY format date
- **Date**: Transaction date
- **GDC**: Golfer identifier (GreenLink ID or handicap number)
- **Account Number**: Unique account reference
- **Reference**: Booking reference code
- **Description**: Transaction description
- **Amount**: Payment amount
- **Tax Type**: 1 = Has tax, 0 = No tax
- **Tax Amount**: VAT amount (15%)
- **Exchange Rate**: Currency exchange rate (default 1)
- **Bank Exchange Rate**: Bank rate (default 1)
- **Batch ID**: Batch identifier (defaults to 1)
- **Discount Amount**: Any discounts applied
- **Home Amount**: Amount in home currency

### 3. Finalize Day Payments

```bash
POST /cashbook/finalize-day?finalize_date=2024-01-15
```

Processes all payments for a day and returns:
```json
{
  "status": "success",
  "date": "2024-01-15",
  "transaction_count": 45,
  "total_amount": 15750.00,
  "total_tax": 2050.00,
  "export_url": "/cashbook/export-excel?export_date=2024-01-15",
  "message": "Successfully processed 45 payments for 2024-01-15"
}
```

## Usage Examples

### Daily Workflow

1. **Morning**: System ready, no configuration needed
2. **Throughout Day**: Golfers check in and complete scorecards - payments recorded automatically
3. **End of Day**: Administrator runs finalization:

```bash
# Get summary
curl "http://localhost:8000/cashbook/daily-summary"

# Review totals, then export
curl "http://localhost:8000/cashbook/export-excel" \
  -o payments_$(date +%Y%m%d).xlsx

# Manually import into accounting system
```

### Historical Data Export

Export payments from a previous date:
```bash
curl "http://localhost:8000/cashbook/export-excel?export_date=2024-01-10" \
  -o payments_20240110.xlsx
```

## Excel File Format

The exported Excel file includes:
- **Header Row**: Blue background with white text
- **Data Rows**: Formatted with proper column widths
- **Frozen Header**: Top row stays visible when scrolling
- **Number Formatting**: Currency amounts formatted to 2 decimal places
- **Borders**: All cells have borders for clarity

### Column Specifications

| Column | Data Type | Format | Notes |
|--------|-----------|--------|-------|
| Period | Text | DD/MM/YYYY | Date of transaction |
| Date | Text | DD/MM/YYYY | Same as Period |
| GDC | Text | - | Golfer ID or reference |
| Account Number | Text | ACC###### | Unique account ID |
| Reference | Text | BK###### | Booking reference |
| Description | Text | - | "Golf Fee - Player Name" |
| Amount | Number | #,##0.00 | Total payment |
| Tax Type | Number | 0 or 1 | 1 = VAT included |
| Tax Amount | Number | #,##0.00 | Extracted VAT (15%) |
| Open Item | Text | - | Leave blank |
| Projects Code | Text | - | Leave blank |
| Contra Account | Text | - | GL Account (3455/000) |
| Exchange Rate | Number | 0.00 | Currency rate |
| Bank Exchange Rate | Number | 0.00 | Bank rate |
| Batch ID | Number | 0 | Batch number (1) |
| Discount Tax Type | Number | 0 or 1 | 0 = No discount tax |
| Discount Amount | Number | #,##0.00 | Applied discount |
| Home Amount | Number | #,##0.00 | Amount in ZAR |

## Database Requirements

Ensure your bookings table has the following fields:
- `id`: Primary key
- `player_name`: Golfer's name
- `greenlink_id`: GreenLink identifier (optional)
- `handicap_number`: SAGA handicap (optional)
- `club_card`: Member card number (optional)
- `price`: Fee amount
- `status`: Booking status (checked_in, completed)
- `tee_time_id`: Reference to tee time
- `created_at`: Timestamp

## Migration from Sage One

**Old Flow:**
- Record booking → Create invoice → Send to Sage One → Sync data → Manual entry

**New Flow:**
- Record booking → Check in → Complete scorecard → Auto-calculated payment → End-of-day export

This eliminates manual data entry and reduces integration complexity.

## Configuration

Currently hardcoded values (can be made configurable):
- **GL Account**: 3455/000 (Green Fees)
- **VAT Rate**: 15% (South African standard)
- **Batch ID**: 1 (default)
- **Exchange Rate**: 1.0 (single currency)

To customize, edit `/app/routers/cashbook.py`:

```python
# In create_payment_record() function:
contra_account="3455/000",  # Change GL account here
tax_rate = 0.15  # Change VAT rate here
```

## Troubleshooting

**No payments found**
- Verify bookings were checked in
- Check booking status (must be checked_in or completed)
- Ensure correct date format (YYYY-MM-DD)

**Missing player data**
- GDC field uses fallback order: greenlink_id → handicap_number → club_card → "N/A"
- Update booking data to populate these fields

**Excel file won't open**
- Ensure openpyxl is installed: `pip install openpyxl==3.11.0`
- Try opening with different spreadsheet application

## Future Enhancements

Planned features:
- [ ] Configurable GL accounts per fee type
- [ ] Custom VAT rates per jurisdiction
- [ ] Multi-currency support
- [ ] Payment method tracking (cash/card)
- [ ] Discount tracking
- [ ] Deposit/prepayment handling
- [ ] Monthly reconciliation reports
- [ ] Automated email delivery of exports
