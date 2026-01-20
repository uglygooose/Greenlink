# Cashbook Export Setup Checklist

Complete this checklist to ensure the system is properly configured and tested.

## 1. Installation & Dependencies ✓

- [ ] Python 3.8+ installed
- [ ] FastAPI 0.121.1 installed (`pip install fastapi`)
- [ ] openpyxl 3.11.0 installed (`pip install openpyxl==3.11.0`)
- [ ] All requirements installed (`pip install -r requirements.txt`)
- [ ] Database (MySQL) running and accessible
- [ ] Environment variables configured (.env file)

**Verify**:
```bash
python -c "import openpyxl; print(openpyxl.__version__)"
# Should output: 3.11.0
```

## 2. Code Integration ✓

- [ ] `app/routers/cashbook.py` created
- [ ] `app/main.py` updated to import cashbook router
- [ ] `app/main.py` updated to include cashbook router in app
- [ ] No syntax errors in modified files

**Verify**:
```bash
python -c "from app.routers import cashbook; print('✓ Cashbook imported successfully')"
python -c "from app.main import app; print('✓ Main app loads successfully')"
```

## 3. Database Schema ✓

- [ ] Bookings table exists with all required fields
- [ ] Fields present: id, player_name, price, status, tee_time_id, created_at
- [ ] Fields present: greenlink_id, handicap_number, club_card (optional but recommended)
- [ ] TeeTime table has tee_time field
- [ ] Booking status values: booked, checked_in, completed, cancelled

**Verify**:
```bash
# MySQL CLI
mysql -u root -p database_name
DESCRIBE bookings;
DESCRIBE tee_times;
```

Expected columns:
- bookings: id, tee_time_id, player_name, price, status, greenlink_id, handicap_number, club_card, created_at
- tee_times: id, tee_time, hole, created_at

## 4. API Endpoints Testing ✓

### Test 1: Server Startup
- [ ] Server starts without errors
- [ ] No import errors
- [ ] No database connection errors

```bash
uvicorn app.main:app --reload
# Should start without errors on port 8000
```

### Test 2: Health Check
- [ ] API responds to basic requests
- [ ] CORS working if needed

```bash
curl http://localhost:8000/
# Should return HTML or redirect
```

### Test 3: Daily Summary Endpoint
- [ ] Endpoint accessible at `/cashbook/daily-summary`
- [ ] Returns JSON response
- [ ] Returns correct date format
- [ ] Transaction count >= 0

```bash
curl "http://localhost:8000/cashbook/daily-summary"
# Should return JSON with date, totals, records
```

### Test 4: Export Excel Endpoint
- [ ] Endpoint accessible at `/cashbook/export-excel`
- [ ] Returns Excel file (XLSX format)
- [ ] File has correct headers
- [ ] File can be opened in Excel

```bash
curl "http://localhost:8000/cashbook/export-excel" \
  -o test_export.xlsx
file test_export.xlsx
# Should show: Microsoft Excel 2007+
```

### Test 5: Finalize Day Endpoint
- [ ] Endpoint accessible at `/cashbook/finalize-day`
- [ ] Returns JSON response
- [ ] Status is "success" or "no_data"
- [ ] Export URL is correct

```bash
curl -X POST "http://localhost:8000/cashbook/finalize-day"
# Should return JSON with status and summary
```

## 5. Excel File Format Verification ✓

- [ ] File opens in Excel without errors
- [ ] Header row is blue with white text
- [ ] Headers are: Period, Date, GDC, Account Number, Reference, Description, Amount, Tax Type, Tax Amount, Open Item, Projects Code, Contra Account, Exchange Rate, Bank Exchange Rate, Batch ID, Discount Tax Type, Discount Amount, Home Amount
- [ ] Data rows have proper formatting
- [ ] Number columns (Amount, Tax) formatted as currency
- [ ] Column widths are appropriate
- [ ] Top row is frozen

**Check in Excel**:
1. Open Cashbook_Payments_YYYYMMDD.xlsx
2. Verify header row formatting (blue background, white text)
3. Verify column widths readable
4. Verify frozen panes (top row stays when scrolling)
5. Verify number formatting (currency shows R/ZAR)

## 6. Data Validation ✓

- [ ] Payment records have correct date format (DD/MM/YYYY)
- [ ] Account numbers formatted correctly (ACC######)
- [ ] Reference codes formatted correctly (BK######)
- [ ] Amounts are non-negative
- [ ] Tax amounts are 15% of amount
- [ ] GDC field has fallback values
- [ ] GL account is 3455/000 (or custom configured value)

**Verify in Excel**:
- Row 2: Check date format (should be 15/01/2024, not 2024-01-15)
- Row 2: Check account format (should be ACC000001)
- Row 2: Check amount is numeric and >= 0
- Row 2: Check tax is ~15% of amount (45.65 for 350.00)

## 7. Configuration Review ✓

- [ ] GL Account set correctly (default: 3455/000)
- [ ] VAT Rate set correctly (default: 15% for South Africa)
- [ ] Tax Type set correctly (default: 1 = tax included)
- [ ] Batch ID strategy decided (default: 1)
- [ ] Date format verified (DD/MM/YYYY in exports)

**Check in code**:
```bash
grep -n "contra_account" app/routers/cashbook.py
grep -n "tax_rate" app/routers/cashbook.py
grep -n "tax_type" app/routers/cashbook.py
```

## 8. Query Parameter Testing ✓

### Test with Specific Date
- [ ] Query parameter `summary_date` works
- [ ] Query parameter `export_date` works
- [ ] Query parameter `finalize_date` works
- [ ] Date format validation works (YYYY-MM-DD)
- [ ] Invalid date format returns 400 error

```bash
# Valid date
curl "http://localhost:8000/cashbook/daily-summary?summary_date=2024-01-15"

# Invalid date (should fail gracefully)
curl "http://localhost:8000/cashbook/daily-summary?summary_date=15-01-2024"
```

## 9. Error Handling ✓

- [ ] No payments found returns 404 with message
- [ ] Invalid date format returns 400 with message
- [ ] Server errors return 500
- [ ] All errors include helpful messages

```bash
# Test no data
curl "http://localhost:8000/cashbook/export-excel?export_date=1900-01-01"
# Should return 404: No payments found

# Test invalid date
curl "http://localhost:8000/cashbook/daily-summary?summary_date=invalid"
# Should return 400: Invalid date format
```

## 10. Documentation Review ✓

- [ ] CASHBOOK_QUICK_START.md exists and is clear
- [ ] CASHBOOK_EXPORT.md is complete
- [ ] CASHBOOK_EXAMPLES.md shows expected outputs
- [ ] CASHBOOK_IMPLEMENTATION.md explains the system
- [ ] test_cashbook.py is available for testing
- [ ] SAGE_ONE_MIGRATION_NOTES.md documents the change

**Verify**:
```bash
ls -la CASHBOOK_*.md
ls -la SAGE_ONE_MIGRATION_NOTES.md
ls -la test_cashbook.py
```

## 11. Automated Testing ✓

- [ ] test_cashbook.py script runs without errors
- [ ] All tests pass
- [ ] Excel file is generated successfully
- [ ] Generated Excel file is readable

```bash
python test_cashbook.py
# All tests should show ✓ PASS
```

## 12. API Documentation ✓

- [ ] Swagger UI accessible at `/docs`
- [ ] ReDoc accessible at `/redoc`
- [ ] All cashbook endpoints visible in docs
- [ ] Endpoint descriptions are clear
- [ ] Request/response examples are correct

```bash
# Visit in browser:
http://localhost:8000/docs
http://localhost:8000/redoc
```

## 13. Integration Testing ✓

### End-to-End Test
- [ ] Create/update booking in system
- [ ] Check in booking
- [ ] Complete scorecard
- [ ] Export payments
- [ ] Verify booking appears in export
- [ ] Verify amount is correct
- [ ] Verify tax is correct

### Steps
1. Access booking system
2. Create new booking
3. Check in golfer
4. Record scorecard
5. Mark as completed
6. Run `/cashbook/export-excel`
7. Open exported file
8. Verify booking data in Excel

## 14. Browser Compatibility ✓

- [ ] Export works in Chrome
- [ ] Export works in Firefox
- [ ] Export works in Safari
- [ ] Export works in Edge
- [ ] File downloads with correct filename
- [ ] File downloads without errors

## 15. Performance Testing ✓

- [ ] Export with 50+ records completes in < 5 seconds
- [ ] Memory usage is reasonable (< 100MB)
- [ ] No database timeout issues
- [ ] Large Excel files don't crash system

```bash
# Time the export
time curl "http://localhost:8000/cashbook/export-excel" -o test.xlsx
# Should complete in < 5 seconds
```

## 16. Backup & Recovery ✓

- [ ] Excel files backed up regularly
- [ ] Database backed up before migration
- [ ] Recovery procedure documented
- [ ] Rollback plan available if needed

## 17. User Training ✓

- [ ] Users know how to access export
- [ ] Users understand the workflow
- [ ] Users can open and use exported Excel file
- [ ] Users know how to import to accounting software
- [ ] Users have contact for support

**Training Materials**:
- CASHBOOK_QUICK_START.md (5 min read)
- CASHBOOK_EXAMPLES.md (10 min read)
- Live demo of export process

## 18. Final Validation ✓

### Sanity Checks
- [ ] System works as expected
- [ ] No unexpected errors in logs
- [ ] Performance is acceptable
- [ ] All files are in place
- [ ] Documentation is complete
- [ ] Users are trained

### Sign-off
- [ ] Developer: System implementation complete
- [ ] QA: All tests passed
- [ ] Admin: Ready for production
- [ ] Users: Training complete

## Post-Deployment Checklist ✓

- [ ] Monitor for errors in first 24 hours
- [ ] Verify first end-of-day export
- [ ] Verify import to accounting software
- [ ] Document any issues found
- [ ] Plan first major release after user feedback

## Cleanup (Optional) ✓

**Remove Sage One Integration Files** (if not used elsewhere):
```bash
rm app/sage_one.py
rm app/pastel_partner.py
rm app/pastel_flowgear.py
rm SAGE_ONE_SETUP.md
rm PASTEL_PARTNER_SETUP.md
rm PASTEL_QUICK_START.md
rm FLOWGEAR_SETUP.md
```

## Status

- [ ] All items checked and verified
- [ ] System ready for production
- [ ] Date: _____________
- [ ] Checked by: _____________

---

## Quick Troubleshooting

| Issue | Checklist Item | Solution |
|-------|---|---|
| openpyxl not found | #1 | `pip install openpyxl==3.11.0` |
| Server won't import cashbook | #2 | Check syntax in cashbook.py |
| No payments exported | #3, #7 | Verify booking status is checked_in/completed |
| Excel file won't open | #5 | Check MIME type or try different app |
| Invalid date errors | #8 | Use YYYY-MM-DD format in query string |
| 404 on export | #9 | No bookings for that date |

---

**Estimated Completion Time**: 2-3 hours for full checklist

Once all items are checked, your system is ready for production deployment!
