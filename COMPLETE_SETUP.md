# 🎉 GreenLink Complete Setup Guide

## System Overview

Your GreenLink system now includes:
- ✅ User authentication
- ✅ Tee time booking with 60+ fee types
- ✅ Player check-in with Handicap SA integration (mock)
- ✅ Score entry and submission
- ✅ **Sage One Accounting integration**
- ✅ Complete 2026 pricing structure

---

## Quick Start (5 Steps)

### Step 1: Update Database

```bash
# Apply all schema changes
mysql -u root -p greenlink < migrate_db.sql
mysql -u root -p greenlink < create_fees_table.sql

# Add role column if missing
mysql -u root -p greenlink
ALTER TABLE users ADD COLUMN role ENUM('admin', 'club_staff', 'player') DEFAULT 'player';
exit;
```

### Step 2: Load Fee Categories

```bash
python3 populate_fees.py
```

You should see:
```
✓ Successfully populated 60+ fee categories!
```

### Step 3: Configure Sage One (Optional)

Edit your `.env` file and add:

```bash
SAGE_ONE_API_KEY=your_api_key_here
SAGE_ONE_COMPANY_ID=your_company_id_here
```

Get API keys from: https://accounting.sageone.co.za → Settings → API Keys

### Step 4: Install Dependencies

```bash
pip3 install -r requirements.txt
pip3 install requests
```

### Step 5: Start Server

```bash
python -m uvicorn app.main:app --reload
```

Expected output:
```
[INTEGRATIONS] Using Sage One Accounting
INFO: Uvicorn running on http://127.0.0.1:8000
INFO: Application startup complete.
```

---

## Complete Workflow Test

### 1. Login
- Open: http://127.0.0.1:8000/frontend/index.html
- Click "Create one"
- Create account and login

### 2. Create Tee Time & Book
- Click "Open T-Sheet"
- Select date/time → Click "Create"
- Click "Bookings" on the tee time
- Fill in booking form:
  - **Player Name**: John Doe
  - **Email**: john@test.com
  - **Handicap**: 12345
  - **Fee Type**: "GOLF MEMBER MEN - 18 HOLES - R340"
- Click "Book Player"

**Check Server Console:**
```
[SAGE ONE] Syncing booking 1 to Sage One
[SAGE ONE] Creating customer: John Doe
[SAGE ONE] Creating invoice: R340.00
[SAGE ONE] ✓ Booking synced successfully
```

### 3. Check-in Player
- Go back to Dashboard
- Click "Check-in"
- Type: `12345` in scanner field
- Click "Search Booking"
- Click "✓ Check In"

**Check Server Console:**
```
[MOCK HANDICAP SA] Opening round for John Doe
[MOCK HANDICAP SA] Round ID: HSA-20251118-XXXXXXXX
```

### 4. Submit Scores
- Go back to Dashboard
- Click "Score Entry"
- Enter Booking ID
- Click "Load Scorecard"
- Fill in all 18 holes
- Click "✓ Submit Scorecard"

**Check Server Console:**
```
[MOCK HANDICAP SA] Submitting scores for round...
[MOCK HANDICAP SA] Round closed successfully
```

---

## System Features

### 🎯 Booking System
- 60+ fee types from 2026 price list
- Auto-price calculation
- Member/Visitor/Student/Scholar rates
- Weekday/Weekend pricing
- Cart hire options

### 💰 Sage One Integration
- Auto-create customers
- Generate tax invoices (15% VAT)
- Track transaction IDs
- Sync on every booking

### ⛳ Handicap SA (Mock)
- Open rounds on check-in
- Submit scores to close rounds
- Track round IDs
- Ready for real API

### 📊 Complete Flow
```
Book → Sage One Invoice → Check-in → Handicap SA Opens → Play → Score Entry → Handicap SA Closes
```

---

## Fee Categories Available

### Golf - Members
- Men 18 holes: R340
- Ladies 18 holes: R340
- Scholar 18 holes: R140
- Student 18 holes: R230
- POB (Mon + Tues-Fri AM): R290

### Golf - Visitors
- Weekday 18 holes: R575
- Weekend 18 holes: R700
- Non-affiliated weekday: R700
- Non-affiliated weekend: R900
- Introduced/Reduced: R560

### Carts
- Member 18 holes: R400
- Member 9 holes: R270
- Visitor 18 holes: R495
- Visitor 9 holes: R325

### Competitions
- Weekdays: R85
- Saturday: R85
- Ladies Thursday: R50

### Driving Range
- Full bucket member: R70
- Full bucket visitor: R85
- Unlimited monthly: R900

---

## API Endpoints

### Fees
```
GET  /fees/              # All fees
GET  /fees/golf          # Golf fees only
GET  /fees/cart          # Cart fees only
GET  /fees/code/1        # Get by code
```

### Bookings
```
POST /tsheet/booking     # Create booking
GET  /tsheet/bookings/1  # Get bookings for tee time
```

### Check-in
```
POST /checkin/1          # Check in booking #1
```

### Scoring
```
POST /scoring/submit     # Submit scores
```

---

## Database Schema

### Tables
- `users` - User accounts
- `tee_times` - Available slots
- `bookings` - Player bookings
- `fee_categories` - 60+ fee types (NEW)
- `rounds` - Scoring rounds
- `ledger_entries` - Financial transactions

### Key Relationships
```
Booking → FeeCategory (pricing)
Booking → LedgerEntry (accounting)
Booking → Round (scoring)
```

---

## Sage One Invoice Example

When a booking is created with "GOLF MEMBER MEN - 18 HOLES":

**Sage One Invoice:**
```
Customer: John Doe (john@test.com)
Description: GOLF MEMBER MEN - 18 HOLES
Amount: R340.00
VAT (15%): R44.35
Total: R340.00 (VAT inclusive)
Reference: BOOKING-1
Status: Unpaid
```

---

## Troubleshooting

### "Fees router not loaded"
```bash
# Make sure fee_models.py exists
ls app/fee_models.py

# Restart server
python -m uvicorn app.main:app --reload
```

### "No fees in dropdown"
```bash
# Populate fees
python3 populate_fees.py

# Verify
mysql -u root -p greenlink
SELECT COUNT(*) FROM fee_categories;
```

### "Sage One not syncing"
```bash
# Check .env file
cat .env | grep SAGE

# Should see:
# SAGE_ONE_API_KEY=...
# SAGE_ONE_COMPANY_ID=...

# Restart server
```

### "Handicap card not found"
Make sure you enter the same handicap number when:
1. Creating booking
2. Searching in check-in

---

## File Structure

```
fastapi_mysql_app/
├── app/
│   ├── main.py              # FastAPI app
│   ├── models.py            # Database models
│   ├── fee_models.py        # Fee categories (NEW)
│   ├── sage_one.py          # Sage One API (NEW)
│   ├── integrations.py      # Mock Handicap SA
│   ├── crud.py              # Business logic
│   ├── schemas.py           # Pydantic models
│   └── routers/
│       ├── fees.py          # Fee endpoints (NEW)
│       ├── tee.py           # Booking
│       ├── checkin.py       # Check-in
│       └── scoring.py       # Scores
├── frontend/
│   ├── index.html           # Login
│   ├── dashboard.html       # Main menu
│   ├── tsheet.html          # Booking (UPDATED)
│   ├── checkin.html         # Check-in
│   └── scoring.html         # Score entry
├── populate_fees.py         # Load fee data (NEW)
├── create_fees_table.sql    # Fee table SQL (NEW)
└── migrate_db.sql           # Schema updates
```

---

## Going Live

### 1. Real Handicap SA API
When available, update `app/integrations.py`:
```python
class RealHandicapSA:
    def open_round(self, ...):
        response = requests.post(
            "https://api.handicapsa.co.za/rounds/open",
            ...
        )
```

### 2. Sage One Production
- Get production API key
- Update `.env` with production credentials
- Test with small transaction first

### 3. Security
- Enable HTTPS
- Update CORS origins in `main.py`
- Use strong passwords
- Backup database daily

---

## Support Files

- [SAGE_ONE_SETUP.md](SAGE_ONE_SETUP.md) - Sage One detailed guide
- [PRICING_SETUP.md](PRICING_SETUP.md) - Fee structure details
- [RUN_TESTS.md](RUN_TESTS.md) - Testing workflow
- [README_IMPLEMENTATION.md](README_IMPLEMENTATION.md) - Implementation notes

---

## Status

✅ **Production Ready** (with mock Handicap SA)

**When you add Sage One API keys:** Full accounting automation  
**When Handicap SA API ready:** Replace mock with real API

---

## Next Steps

1. ✅ Run database migrations
2. ✅ Populate fees
3. ✅ Add Sage One API keys
4. ✅ Test complete workflow
5. ✅ Verify Sage One invoices
6. 🚀 **Go Live!**

Need help? Check the server console for detailed logs with `[SAGE ONE]` and `[MOCK HANDICAP SA]` prefixes.
