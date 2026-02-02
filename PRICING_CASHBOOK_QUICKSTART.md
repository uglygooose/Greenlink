# Admin Pricing & Cashbook Quick Start

## What Was Built

Two admin features:

1. **Player Price Management** - Edit prices per player by fee type or custom amount
2. **Cashbook Export** - Export daily payments to accounting-format Excel

## Quick Start (3 minutes)

### For Admins

**1. Edit a Player's Price:**
- Dashboard → Players → Click "View"
- See "Current Price" section
- Click "Edit Price" button
- Select fee type OR enter custom price
- Click "Save Price"

**2. Export Daily Cashbook:**
- Dashboard → Cashbook (new menu item)
- Date auto-fills with today
- Click "Load Summary" → See daily totals
- Click "Export to CSV" → Download Excel file

### For Players

**Prices are hidden** - Players see fee names only, not prices:
- GET `/profile/fees-available` returns: `[{id, code, description}]`
- No `price` field shown to players

## Key Files

| File | Changes |
|------|---------|
| `app/routers/admin.py` | +140 lines: 3 new endpoints |
| `app/routers/profile.py` | -1 line: removed price field |
| `frontend/admin.html` | +60 lines: cashbook section |
| `frontend/admin.js` | +120 lines: price & export logic |
| `frontend/admin-style.css` | +130 lines: button & layout styles |

## API Endpoints (Admin Only)

### Get Fee Categories
```bash
GET /api/admin/fee-categories
```
Returns list of available fee types and prices.

### Update Player Price
```bash
PUT /api/admin/players/{player_id}/price
Body: {"fee_category_id": 1} 
   OR {"custom_price": 300.00}
```
Applies price to all active bookings for that player.

### Get Player Price Info
```bash
GET /api/admin/players/{player_id}/price-info
```
Returns current price and recent bookings.

### Get Cashbook Summary
```bash
GET /cashbook/daily-summary?summary_date=2024-01-15
```
Returns daily transaction summary and payment records.

### Export Cashbook
```bash
GET /cashbook/export-excel?export_date=2024-01-15
```
Downloads Excel file with all accounting fields.

## Verification Checklist

- [ ] Admin can view player in Players section
- [ ] "Edit Price" button appears in player details
- [ ] Can select fee type and save
- [ ] Can enter custom price and save
- [ ] Cashbook menu item appears in sidebar
- [ ] Cashbook page loads with today's date
- [ ] Can select different date
- [ ] Summary stats display correctly
- [ ] Payment records table populates (if data exists)
- [ ] "Export to CSV" button downloads Excel
- [ ] Excel file opens in spreadsheet app
- [ ] Player cannot see prices in their profile

## Common Tasks

### Set a player to Senior pricing:
```bash
Click Player → Edit Price → Select "Senior Golf Fee" → Save
```

### Override a player's price to R500:
```bash
Click Player → Edit Price → Enter 500 in custom price → Save
```

### Export yesterday's cashbook:
```bash
Click Cashbook → Select yesterday's date → Load Summary → Export
```

### Check how many payments were made today:
```bash
Click Cashbook → Transaction count shows total
```

## Data Flow

```
1. Admin edits player price
   ↓
2. System finds all active bookings for player
   ↓
3. Updates booking.price and/or booking.fee_category_id
   ↓
4. At end of day: Player checks in & completes round
   ↓
5. Booking marked as "completed" with new price
   ↓
6. Admin clicks Cashbook → Export
   ↓
7. System finds all "checked_in" and "completed" bookings for date
   ↓
8. Generates Excel file with accounting fields (GL account, VAT, etc.)
   ↓
9. Admin downloads file for Pastel/Sage One import
```

## Testing (5 minutes)

**Test 1: Edit price and verify update**
```bash
Note current player price → Edit to fee category → 
View player again → Price should be updated
```

**Test 2: Export cashbook**
```bash
Go to Cashbook → Select date with bookings → 
Load Summary → Click Export → File downloads
```

**Test 3: Verify player can't see prices**
```bash
Login as player → Call /profile/fees-available → 
Check response has no "price" field
```

## Next Steps

- [ ] Test with real player data
- [ ] Try different fee categories
- [ ] Export and verify Excel format
- [ ] Import Excel into accounting software (optional)

---

**Documentation:** See `ADMIN_PRICING_CASHBOOK.md` for full details
**Testing Guide:** See `TEST_PRICING_CASHBOOK.md` for complete test cases
