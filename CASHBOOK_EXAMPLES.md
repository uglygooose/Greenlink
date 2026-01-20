# Cashbook Export - Example Outputs

## Example 1: Daily Summary Response

### Request
```bash
GET http://localhost:8000/cashbook/daily-summary?summary_date=2024-01-15
```

### Response
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
      "gdc": "GL123456",
      "account_number": "ACC000001",
      "reference": "BK000001",
      "description": "Golf Fee - John Smith",
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
    },
    {
      "period": "15/01/2024",
      "date": "15/01/2024",
      "gdc": "GL234567",
      "account_number": "ACC000002",
      "reference": "BK000002",
      "description": "Golf Fee - Alice Johnson",
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
    },
    {
      "period": "15/01/2024",
      "date": "15/01/2024",
      "gdc": "GL345678",
      "account_number": "ACC000003",
      "reference": "BK000003",
      "description": "Golf Fee - Bob Williams",
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

## Example 2: Finalize Day Response

### Request
```bash
POST http://localhost:8000/cashbook/finalize-day?finalize_date=2024-01-15
```

### Response (Success)
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

### Response (No Data)
```json
{
  "status": "no_data",
  "date": "2024-01-15",
  "message": "No payments found for 2024-01-15",
  "transaction_count": 0,
  "total_amount": 0.0
}
```

## Example 3: Excel Export File

### File: Cashbook_Payments_20240115.xlsx

```
│ Period     │ Date       │ GDC      │ Account    │ Reference │ Description         │ Amount   │ Tax Type │ Tax Amount │
├────────────┼────────────┼──────────┼────────────┼───────────┼─────────────────────┼──────────┼──────────┼────────────┤
│ 15/01/2024 │ 15/01/2024 │ GL123456 │ ACC000001  │ BK000001  │ Golf Fee - John Smith│  350.00  │    1     │   45.65    │
│ 15/01/2024 │ 15/01/2024 │ GL234567 │ ACC000002  │ BK000002  │ Golf Fee - Alice J.  │  350.00  │    1     │   45.65    │
│ 15/01/2024 │ 15/01/2024 │ GL345678 │ ACC000003  │ BK000003  │ Golf Fee - Bob Wil.  │  350.00  │    1     │   45.65    │
│ 15/01/2024 │ 15/01/2024 │ GL456789 │ ACC000004  │ BK000004  │ Golf Fee - Carol Di. │  350.00  │    1     │   45.65    │
│ 15/01/2024 │ 15/01/2024 │ GL567890 │ ACC000005  │ BK000005  │ Golf Fee - Dan Evans │  350.00  │    1     │   45.65    │
│ ...        │ ...        │ ...      │ ...        │ ...       │ ...                 │ ...      │ ...      │ ...        │
├────────────┼────────────┼──────────┼────────────┼───────────┼─────────────────────┼──────────┼──────────┼────────────┤
│ TOTAL      │            │          │            │           │                     │15,750.00 │          │  2,050.00  │
```

### Continued Columns
```
│ Open Item │ Projects Code │ Contra Account │ Exchange Rate │ Bank Ex Rate │ Batch ID │ Discount Type │ Discount Amt │ Home Amount │
├───────────┼───────────────┼────────────────┼───────────────┼──────────────┼──────────┼───────────────┼──────────────┼─────────────┤
│           │               │   3455/000     │      1        │      1       │    1     │       0       │     0.00     │   350.00    │
│           │               │   3455/000     │      1        │      1       │    1     │       0       │     0.00     │   350.00    │
│           │               │   3455/000     │      1        │      1       │    1     │       0       │     0.00     │   350.00    │
│           │               │   3455/000     │      1        │      1       │    1     │       0       │     0.00     │   350.00    │
│           │               │   3455/000     │      1        │      1       │    1     │       0       │     0.00     │   350.00    │
│           │               │   3455/000     │      1        │      1       │    1     │       0       │     0.00     │   350.00    │
│           │               │                │               │              │          │               │              │ 15,750.00   │
```

## Example 4: Browser Usage

### Step 1: View Today's Summary
```
URL: http://localhost:8000/cashbook/daily-summary

Result displayed in browser:
{
  "date": "2024-01-15",
  "total_payments": 15750.00,
  "total_tax": 2050.00,
  "transaction_count": 45,
  "records": [...]
}
```

### Step 2: Download Excel File
```
URL: http://localhost:8000/cashbook/export-excel

Action: Browser downloads file as Cashbook_Payments_20240115.xlsx
```

### Step 3: Open in Excel
```
File opens with:
- Professional formatting
- Blue header row
- 18 columns with proper widths
- Currency formatting
- Frozen top row
- Ready to copy-paste into accounting system
```

## Example 5: Command Line Usage

### Get Summary
```bash
$ curl "http://localhost:8000/cashbook/daily-summary" | jq
{
  "date": "2024-01-15",
  "total_payments": 15750,
  "total_tax": 2050,
  "transaction_count": 45,
  "records": [
    {
      "period": "15/01/2024",
      "date": "15/01/2024",
      "gdc": "GL123456",
      "account_number": "ACC000001",
      ...
    }
  ]
}
```

### Download Excel
```bash
$ curl "http://localhost:8000/cashbook/export-excel" \
  -o cashbook_20240115.xlsx

# File saved successfully
$ ls -lh cashbook_20240115.xlsx
-rw-r--r--  1 user  staff   48K Jan 15 18:30 cashbook_20240115.xlsx
```

### Historical Export
```bash
$ curl "http://localhost:8000/cashbook/export-excel?export_date=2024-01-10" \
  -o cashbook_20240110.xlsx
  
$ curl "http://localhost:8000/cashbook/export-excel?export_date=2024-01-05" \
  -o cashbook_20240105.xlsx
```

### Finalize Day
```bash
$ curl -X POST "http://localhost:8000/cashbook/finalize-day"
{
  "status": "success",
  "date": "2024-01-15",
  "transaction_count": 45,
  "total_amount": 15750,
  "total_tax": 2050,
  "export_url": "/cashbook/export-excel?export_date=2024-01-15",
  "message": "Successfully processed 45 payments for 2024-01-15"
}
```

## Example 6: Integration with Accounting System

### Data Format Ready for Import
The Excel file can be directly imported into:
- **Excel**: Copy/paste data into existing templates
- **Google Sheets**: Upload or copy/paste
- **QuickBooks**: Map columns and import
- **Xero**: Use import wizard
- **Manual Entry**: All data formatted for easy visual entry

### Fields Mapped for Standard Accounting Software

| Accounting Software | Maps To | Notes |
|---|---|---|
| **QuickBooks** | Invoice Date → Period/Date | Account → Contra Account |
| **Xero** | Contact → GDC | Amount → Line Amount |
| **Wave** | Description → Notes | Amount → Item Amount |
| **Google Sheets** | Paste directly | Maintains formatting |
| **Excel** | Manual ledger entry | Copy to GL account sheet |

### Example Import Steps (Google Sheets)
```
1. Open Cashbook_Payments_20240115.xlsx
2. Copy all data (Ctrl+A)
3. Open Google Sheets
4. Create new sheet
5. Paste (Ctrl+V)
6. Auto-format table
7. Done - ready for reconciliation
```

## Example 7: Error Responses

### No Payments Found (404)
```bash
$ curl "http://localhost:8000/cashbook/export-excel?export_date=2024-01-01"

{
  "detail": "No payments found for 2024-01-01"
}
```

### Invalid Date Format (400)
```bash
$ curl "http://localhost:8000/cashbook/daily-summary?summary_date=15-01-2024"

{
  "detail": "Invalid date format. Use YYYY-MM-DD"
}
```

### Server Error (500)
```bash
{
  "detail": "Internal server error"
}

Check:
1. FastAPI server is running
2. Database connection is valid
3. All required fields exist in database
```

## Example 8: Sample Excel File Statistics

### File Properties
```
Name: Cashbook_Payments_20240115.xlsx
Size: 48 KB
Format: XLSX (Excel 2007+)
Sheets: 1 (Payments)
Rows: 46 (1 header + 45 data rows)
Columns: 18
Date Created: 2024-01-15
```

### Data Statistics
```
Total Transactions: 45
Total Amount: R15,750.00
Total Tax: R2,050.00
Average Transaction: R350.00
Batch ID: 1
Tax Rate Applied: 15%
```

## Example 9: Weekly Rollup

### Multiple Days Combined
```bash
# Monday
curl "http://localhost:8000/cashbook/export-excel?export_date=2024-01-15" \
  -o cashbook_Mon_20240115.xlsx

# Tuesday
curl "http://localhost:8000/cashbook/export-excel?export_date=2024-01-16" \
  -o cashbook_Tue_20240116.xlsx

# Wednesday
curl "http://localhost:8000/cashbook/export-excel?export_date=2024-01-17" \
  -o cashbook_Wed_20240117.xlsx

# Combined in spreadsheet = Weekly Summary
# Total Week: R47,250.00 (45 + 40 + 50 transactions)
```

## Example 10: API Documentation Access

### Swagger UI (Interactive)
```
URL: http://localhost:8000/docs

Features:
- Try out each endpoint
- See request/response examples
- View parameter descriptions
- Test with real data
```

### ReDoc (Documentation)
```
URL: http://localhost:8000/redoc

Features:
- Complete API reference
- Schema definitions
- Example values
- Implementation details
```

---

All examples show realistic data with proper formatting and error handling. The system is production-ready.
