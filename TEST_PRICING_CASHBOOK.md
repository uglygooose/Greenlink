# Testing Guide: Admin Pricing & Cashbook Export

## Setup

1. **Start backend:**
```bash
uvicorn app.main:app --reload
```

2. **Login as admin:**
   - Go to `http://localhost:8000/admin.html`
   - Use admin credentials

3. **Ensure test data exists:**
```bash
# Create a test player if needed
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Player",
    "email": "test@example.com",
    "password": "password123"
  }'
```

## Test 1: View Player Pricing

**Steps:**
1. Click "👥 Players" in sidebar
2. Click "View" button on any player
3. **Expected:** Modal shows "Current Price" with "Edit Price" button

**Verify:**
- Current price displays correctly
- Edit Price button is visible and clickable

---

## Test 2: Edit Player Price with Fee Category

**Steps:**
1. In player detail modal, click "Edit Price" button
2. Select a fee category from dropdown (e.g., "Senior Golf Fee")
3. Leave custom price empty
4. Click "Save Price"

**Expected:**
- Alert shows: "Updated X bookings with fee category: [Name]"
- Player modal closes
- Players list refreshes

**Verify:**
- Only active bookings (booked/checked_in) are updated
- Other bookings remain unchanged
- Price reflects selected category

---

## Test 3: Edit Player Price with Custom Amount

**Steps:**
1. In player detail modal, click "Edit Price" button
2. Leave fee category as "-- Custom Price --"
3. Enter custom amount (e.g., 400.50)
4. Click "Save Price"

**Expected:**
- Alert shows: "Updated X bookings with custom price: R400.50"
- Modal closes and list refreshes

**Verify:**
- Custom price is applied to active bookings
- Fee category is cleared for those bookings

---

## Test 4: Verify Prices Not Visible to Players

**Steps:**
1. Create or use a player account
2. Call endpoint: `GET /profile/fees-available`
3. Review response

**Expected:**
- Response includes: `id`, `code`, `description`
- Response does NOT include: `price`

**Sample Response:**
```json
[
  {
    "id": 1,
    "code": 2001,
    "description": "Senior Golf Fee"
  }
]
```

---

## Test 5: Load Cashbook Summary

**Steps:**
1. Click "💳 Cashbook" in sidebar
2. Verify date is set to today (auto-populated)
3. Click "Load Summary" button

**Expected:**
- Summary stats display:
  - Date (today)
  - Transaction Count (0 if no bookings)
  - Total Amount (R0.00 if no bookings)
  - Total Tax (R0.00 if no bookings)
- Export button remains disabled if no data
- Table shows either:
  - "No payment records found for this date" (if empty)
  - OR list of payment records (if data exists)

---

## Test 6: Load Previous Date's Cashbook

**Steps:**
1. In Cashbook page, click date picker
2. Select a past date with known bookings
3. Click "Load Summary"

**Expected:**
- Summary updates with data for selected date
- Payment records table populates with transactions
- Export button becomes enabled (if data exists)

---

## Test 7: Export Cashbook to Excel

**Steps:**
1. Load a cashbook summary with data (see Test 6)
2. Verify export button is enabled
3. Click "Export to CSV" button

**Expected:**
- File download starts: `Cashbook_Payments_YYYYMMDD.xlsx`
- Alert shows: "Cashbook exported successfully!"

**Verify Excel File:**
1. Open downloaded file
2. Check columns are present:
   - Period, Date, GDC, Account Number, Reference
   - Description, Amount, Tax Type, Tax Amount
   - Open Item, Projects Code, Contra Account
   - Exchange Rate, Bank Exchange Rate, Batch ID
   - Discount Tax Type, Discount Amount, Home Amount
3. Verify header row is blue with white text
4. Verify amounts are formatted as currency
5. Verify header row is frozen (stays visible when scrolling)

---

## Test 8: API Testing with cURL

**Get Fee Categories:**
```bash
curl http://localhost:8000/api/admin/fee-categories \
  -H "Authorization: Bearer {your_admin_token}"
```

**Update Player Price (Fee Category):**
```bash
curl -X PUT http://localhost:8000/api/admin/players/1/price \
  -H "Authorization: Bearer {your_admin_token}" \
  -H "Content-Type: application/json" \
  -d '{"fee_category_id": 2}'
```

**Update Player Price (Custom):**
```bash
curl -X PUT http://localhost:8000/api/admin/players/1/price \
  -H "Authorization: Bearer {your_admin_token}" \
  -H "Content-Type: application/json" \
  -d '{"custom_price": 300.00}'
```

**Get Player Price Info:**
```bash
curl http://localhost:8000/api/admin/players/1/price-info \
  -H "Authorization: Bearer {your_admin_token}"
```

**Get Daily Summary:**
```bash
curl "http://localhost:8000/cashbook/daily-summary?summary_date=2024-01-15" \
  -H "Authorization: Bearer {your_admin_token}"
```

**Export Cashbook:**
```bash
curl "http://localhost:8000/cashbook/export-excel?export_date=2024-01-15" \
  -H "Authorization: Bearer {your_admin_token}" \
  -o cashbook_20240115.xlsx
```

---

## Test 9: Security Verification

**Verify Admin-Only Access:**

1. **Try without token:**
```bash
curl http://localhost:8000/api/admin/fee-categories
# Expected: 403 Unauthorized
```

2. **Try as non-admin user:**
```bash
curl http://localhost:8000/api/admin/fee-categories \
  -H "Authorization: Bearer {player_token}"
# Expected: 403 Admin access required
```

3. **Try price endpoint as player:**
```bash
curl -X PUT http://localhost:8000/api/admin/players/1/price \
  -H "Authorization: Bearer {player_token}" \
  -H "Content-Type: application/json" \
  -d '{"fee_category_id": 2}'
# Expected: 403 Admin access required
```

---

## Test 10: Edge Cases

**Empty Date Selection:**
```bash
Click Load Summary without selecting date
Expected: Alert "Please select a date"
```

**Export Without Data:**
```bash
Select a date with no bookings
Click Export button (should be disabled)
Expected: Button is grayed out
```

**Invalid Price:**
```bash
Try to set negative custom price
Expected: Error message in response
```

**Non-existent Player:**
```bash
curl -X PUT http://localhost:8000/api/admin/players/99999/price \
  -H "Authorization: Bearer {token}" \
  -d '{"fee_category_id": 1}'
# Expected: 404 Player not found
```

---

## Troubleshooting

**Export button stays disabled:**
- Check if there are any bookings for the selected date
- Verify bookings have status "checked_in" or "completed"
- Check browser console for errors

**Excel file won't open:**
- Ensure `openpyxl` is installed: `pip install openpyxl==3.11.0`
- Try opening with different spreadsheet application

**Price not updating:**
- Verify player has active bookings (status: booked/checked_in)
- Check backend logs for errors
- Verify admin token is valid

**Cashbook shows no data:**
- Confirm bookings exist for the date
- Check booking status (must be checked_in or completed)
- Verify date format is correct (YYYY-MM-DD)

---

## Success Criteria

✅ Players cannot see prices
✅ Admins can edit player prices
✅ Price updates apply to active bookings
✅ Cashbook summary shows correct totals
✅ Excel export downloads with all required columns
✅ All endpoints require admin authentication
✅ Invalid inputs show appropriate error messages
