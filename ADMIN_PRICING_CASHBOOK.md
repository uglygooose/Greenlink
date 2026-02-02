# Admin Pricing & Cashbook Export

## Overview

This implementation adds two key features for the admin dashboard:

1. **Player Price Management** - Admins can edit prices for individual players by fee type
2. **Cashbook Export** - End-of-day CSV/Excel export of all payments

## Features Implemented

### 1. Player Price Management

**Visibility Control:**
- Players cannot see prices (removed from `/profile/fees-available`)
- Only admins can view and edit player pricing

**How it works:**
- Admin navigates to Players section
- Clicks "View" on a player
- Sees current price with "Edit Price" button
- Selects either:
  - **Fee Type** from dropdown (e.g., "Senior", "Junior", "Standard")
  - **Custom Price** for individual pricing
- System updates all active bookings for that player

**New Endpoints:**

```bash
# Get all available fee categories
GET /api/admin/fee-categories
Headers: Authorization: Bearer {token}
Role: Admin only

Response:
[
  {
    "id": 1,
    "code": 2001,
    "description": "Senior Golf Fee",
    "price": 250.0,
    "fee_type": "golf"
  },
  ...
]
```

```bash
# Update player's price
PUT /api/admin/players/{player_id}/price
Headers: Authorization: Bearer {token}
Content-Type: application/json
Role: Admin only

# Option 1: Apply fee category
Body: {
  "fee_category_id": 1
}

# Option 2: Set custom price
Body: {
  "custom_price": 300.00
}

Response:
{
  "status": "success",
  "message": "Updated 2 bookings with fee category: Senior Golf Fee",
  "player_id": 123,
  "fee_category": {
    "id": 1,
    "code": 2001,
    "description": "Senior Golf Fee",
    "price": 250.0
  }
}
```

```bash
# Get player's current pricing info
GET /api/admin/players/{player_id}/price-info
Headers: Authorization: Bearer {token}
Role: Admin only

Response:
{
  "player_id": 123,
  "player_name": "John Doe",
  "player_email": "john@example.com",
  "current_price": 350.00,
  "current_fee_category": {
    "id": 1,
    "code": 2001,
    "description": "Senior Golf Fee",
    "price": 250.0
  },
  "recent_bookings": [...]
}
```

### 2. Cashbook Export

**Daily Workflow:**
1. Admin navigates to "Cashbook" section in sidebar
2. Selects a date (defaults to today)
3. Clicks "Load Summary" button
4. System shows:
   - Total transactions for the day
   - Total payment amount
   - Total VAT/Tax collected
5. Table displays all payment records with details
6. Click "Export to CSV" to download Excel file

**Excel Format:**
The exported file contains:
- Period, Date, GDC, Account Number, Reference
- Description, Amount, Tax Type, Tax Amount
- Open Item, Projects Code, Contra Account
- Exchange Rate, Bank Exchange Rate, Batch ID
- Discount Tax Type, Discount Amount, Home Amount

All data is formatted for accounting software (Pastel, Sage One, etc.)

**New Endpoints:**

```bash
# Get daily payment summary
GET /cashbook/daily-summary?summary_date=2024-01-15
Headers: Authorization: Bearer {token}

Response:
{
  "date": "2024-01-15",
  "total_payments": 15750.00,
  "total_tax": 2050.00,
  "transaction_count": 45,
  "records": [
    {
      "period": "15",
      "date": "15/01/2024",
      "gdc": "G",
      "account_number": "GL00001",
      "reference": "BK00001",
      "description": "Golf Fee - Player Name",
      "amount": 350.00,
      "tax_type": 1,
      "tax_amount": 45.65,
      ...
    },
    ...
  ]
}
```

```bash
# Export to Excel
GET /cashbook/export-excel?export_date=2024-01-15
Headers: Authorization: Bearer {token}

Returns: Cashbook_Payments_20240115.xlsx (binary file)
```

```bash
# Finalize day and get summary
POST /cashbook/finalize-day?finalize_date=2024-01-15
Headers: Authorization: Bearer {token}

Response:
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

## Frontend Changes

### Admin Dashboard Navigation
- Added "💳 Cashbook" menu item to sidebar

### Cashbook Page
Located at: `frontend/admin.html` - New section with:
- Date picker for selecting export date
- "Load Summary" button to fetch daily summary
- Summary statistics card showing:
  - Date
  - Transaction count
  - Total amount
  - Total tax
- Payment records table with columns:
  - Period, Date, GDC, Reference, Description
  - Amount, Tax Type, Tax Amount
- "Export to CSV" button (disabled until data is loaded)

### Player Details Modal
Updated `frontend/admin.html` - Modified section with:
- Current price display
- "Edit Price" button (orange)
- Opens modal for fee selection or custom price entry

## Database

**No new tables required.** Existing tables are used:
- `bookings.price` - Updated with new/custom price
- `bookings.fee_category_id` - Links to selected fee category
- `fee_categories` - Existing table of fee types

**Data Flow:**
1. Admin edits player price
2. Query finds all active bookings for that player
3. Updates booking.price and/or booking.fee_category_id
4. At end of day, cashbook export reads bookings with status "checked_in" or "completed"
5. Generates accounting-formatted Excel file

## Usage Examples

### Set Player to Senior Rate
```bash
curl -X PUT http://localhost:8000/api/admin/players/123/price \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"fee_category_id": 5}'
```

### Set Custom Price for One Player
```bash
curl -X PUT http://localhost:8000/api/admin/players/123/price \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"custom_price": 400.00}'
```

### Export Today's Cashbook
```bash
curl http://localhost:8000/cashbook/export-excel \
  -H "Authorization: Bearer {token}" \
  -o cashbook_$(date +%Y%m%d).xlsx
```

### Export Specific Date
```bash
curl "http://localhost:8000/cashbook/export-excel?export_date=2024-01-15" \
  -H "Authorization: Bearer {token}" \
  -o cashbook_20240115.xlsx
```

## Files Modified

**Backend:**
- `app/routers/admin.py` - Added 3 new endpoints
- `app/routers/profile.py` - Removed price from player fees endpoint

**Frontend:**
- `frontend/admin.html` - Added cashbook section & price edit UI
- `frontend/admin.js` - Added cashbook functions & price editing
- `frontend/admin-style.css` - Added button & cashbook styles

## Security

✅ All price management endpoints require admin role
✅ Players cannot access pricing endpoints
✅ Cashbook endpoints require authentication
✅ Price updates only affect active bookings (booked/checked_in status)

## Next Steps

Optional enhancements:
- [ ] Email export file after generation
- [ ] Scheduled nightly exports
- [ ] Price history tracking
- [ ] Bulk price updates for multiple players
- [ ] Price templates by player age/handicap
- [ ] Discount/promotion pricing
