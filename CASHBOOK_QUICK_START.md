# Cashbook Export - Quick Start Guide

## Daily End-of-Day Payment Export

### Via Browser (Easiest)

1. **Check Today's Payments**
   - Visit: `http://your-app/cashbook/daily-summary`
   - Review: transaction count, total amount, total tax

2. **Download Excel Export**
   - Click: `http://your-app/cashbook/export-excel`
   - File saves as: `Cashbook_Payments_YYYYMMDD.xlsx`
   - Open with Excel or Google Sheets

3. **Import to Accounting System**
   - Copy data from exported Excel
   - Paste into your accounting software
   - Verify totals match

### Via Command Line (API)

```bash
# 1. View summary
curl "http://localhost:8000/cashbook/daily-summary" | jq

# 2. Download Excel
curl "http://localhost:8000/cashbook/export-excel" \
  -o cashbook_$(date +%Y%m%d).xlsx

# 3. For specific date (YYYY-MM-DD format)
curl "http://localhost:8000/cashbook/export-excel?export_date=2024-01-15" \
  -o cashbook_20240115.xlsx
```

## What Gets Exported?

- ✅ All golf fees from completed rounds
- ✅ Player names and identifiers
- ✅ Booking references
- ✅ Tax calculations (15% VAT)
- ✅ GL account coding (3455/000)

## Exported File Includes

| Info | Details |
|------|---------|
| **Period** | Date in DD/MM/YYYY |
| **Amount** | Total golf fee |
| **Tax** | 15% VAT extracted |
| **Account** | GL 3455/000 (golf fees) |
| **Reference** | Unique booking ID |
| **Batch** | Batch number (1) |

## Common Tasks

### Export Today's Payments
```
http://localhost:8000/cashbook/export-excel
```

### Export Previous Day
```
http://localhost:8000/cashbook/export-excel?export_date=2024-01-14
```

### Export Specific Date
```
http://localhost:8000/cashbook/export-excel?export_date=2024-01-10
```

### View Summary Only (No Download)
```
http://localhost:8000/cashbook/daily-summary
```

## Excel File Structure

- **Filename**: `Cashbook_Payments_YYYYMMDD.xlsx`
- **Rows**: One per completed golf round
- **Columns**: 18 (Period through Home Amount)
- **Formatting**: Headers in blue, numbers formatted to 2 decimals

## Typical Daily Workflow

```
09:00 - App opens, ready for bookings
12:00 - First golfers check in
18:00 - Day complete
        → Visit /cashbook/daily-summary
        → Review: 45 rounds, R15,750 collected
        → Download Excel via /cashbook/export-excel
        → Import into accounting system
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No payments found | Check that rounds were marked "completed" |
| Missing player data | GDC field shows: GreenLink ID > Handicap > Club Card |
| File won't download | Try different browser or use curl command |
| Wrong date exported | Check date format: YYYY-MM-DD (not DD/MM/YYYY) |

## Notes

- ✓ Sage One integration **removed** (no longer needed)
- ✓ No manual invoice creation required
- ✓ Tax calculated automatically
- ✓ Batch processing supports daily reconciliation
- ✓ Historical data available for any date

## Support

For issues or customizations, refer to: `CASHBOOK_EXPORT.md`
