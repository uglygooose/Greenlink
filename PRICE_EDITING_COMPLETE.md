# Price Editing - Complete Reference

## Overview

Admins can now edit prices in **TWO** locations:

1. **Player Prices** - Set standard price for all a player's bookings
2. **Booking Prices** - Edit individual booking price

## Feature 1: Player Price Editing

### Location
Admin Dashboard → Players → View → Edit Price

### Use Case
Player qualifies for a fee type (e.g., senior discount)

### Effect
Updates ALL active bookings (booked/checked_in status) for that player

### Steps
1. Dashboard → Players
2. Click View on any player
3. See "Current Price" section
4. Click "Edit Price" button
5. Select fee type OR enter custom price
6. Click Save

### Example
Admin wants to apply Senior rate (R250) to John Doe
→ All of John's active bookings updated to R250

---

## Feature 2: Booking Price Editing

### Location
Admin Dashboard → Bookings → View → Edit Price

### Use Case
Individual booking needs different price

### Effect
Updates ONLY that specific booking

### Steps
1. Dashboard → Bookings
2. Click View on any booking
3. See "Price" section with "Edit Price" button
4. Click "Edit Price" button
5. Select fee type OR enter custom price
6. Click Save

### Example
One booking was charged wrong amount
→ Click View → Edit Price → Set correct amount

---

## API Endpoints

### Player Price Management

```bash
# Get all fee categories
GET /api/admin/fee-categories
Authorization: Bearer {token}

# Update ALL player bookings with fee category
PUT /api/admin/players/{player_id}/price
Authorization: Bearer {token}
Body: {"fee_category_id": 1}

# Update ALL player bookings with custom price
PUT /api/admin/players/{player_id}/price
Authorization: Bearer {token}
Body: {"custom_price": 300.00}

# Get player's current pricing info
GET /api/admin/players/{player_id}/price-info
Authorization: Bearer {token}
```

### Booking Price Management

```bash
# Update ONE booking with fee category
PUT /api/admin/bookings/{booking_id}/price
Authorization: Bearer {token}
Body: {"fee_category_id": 1}

# Update ONE booking with custom price
PUT /api/admin/bookings/{booking_id}/price
Authorization: Bearer {token}
Body: {"custom_price": 300.00}
```

---

## Comparison

| Aspect | Player Price | Booking Price |
|--------|--------------|---------------|
| **Location** | Players section | Bookings section |
| **Affects** | All active bookings for player | Single booking only |
| **Button** | Orange "Edit Price" | Orange "Edit Price" |
| **Modal** | Same design | Same design |
| **Endpoint** | PUT /api/admin/players/{id}/price | PUT /api/admin/bookings/{id}/price |
| **Use When** | Setting standard rate per player | Adjusting individual booking |

---

## Complete Flow Examples

### Scenario 1: Apply Senior Discount to Player

**Flow:**
1. Admin goes to Players
2. Finds "John Doe"
3. Clicks View
4. Sees "Current Price: R350.00"
5. Clicks "Edit Price"
6. Selects "Senior Golf Fee (R250)"
7. Clicks Save
8. SUCCESS: All of John's active bookings → R250

**Backend:** 
- Finds all bookings with player_email = john@example.com and status in (booked, checked_in)
- Updates each booking.price = 250.00
- Updates each booking.fee_category_id = 5

---

### Scenario 2: Fix One Booking's Price

**Flow:**
1. Admin goes to Bookings
2. Finds booking #123 (John Doe)
3. Clicks View
4. Sees "Price: R350.00" (incorrect)
5. Clicks "Edit Price"
6. Enters custom price "250.00"
7. Clicks Save
8. SUCCESS: Booking #123 → R250.00

**Backend:**
- Finds booking with id = 123
- Updates booking.price = 250.00
- Sets booking.fee_category_id = NULL (custom price)

---

### Scenario 3: Multiple Players, Different Rates

**Flow:**
1. Admin has three seniors on today's bookings
2. Goes to Players → John Doe → Edit Price → Senior (R250) → Save
3. Goes to Players → Jane Smith → Edit Price → Senior (R250) → Save
4. Goes to Players → Bob Wilson → Edit Price → Senior (R250) → Save
5. SUCCESS: All three seniors' bookings updated

**vs.**

1. Admin goes to Bookings
2. For each senior booking: Click View → Edit Price → Senior (R250) → Save
3. SUCCESS: Individual bookings updated

**Recommendation:** Use Player Price for bulk updates, Booking Price for individual fixes.

---

## When to Use Each

### Use Player Price When:
- Player qualifies for a standard rate (senior, junior, member, etc.)
- You want consistency across all player's bookings
- Setting up pricing for a new fee category
- Applying bulk updates to multiple players

### Use Booking Price When:
- One booking was charged incorrectly
- Special circumstance for individual booking
- Overriding standard rate for one transaction
- Correcting past booking

---

## Files Involved

### Backend
- `app/routers/admin.py`
  - Endpoint: `PUT /api/admin/players/{player_id}/price` (player level)
  - Endpoint: `PUT /api/admin/bookings/{booking_id}/price` (booking level)

### Frontend
- `frontend/admin.js`
  - Player editing: `openEditPriceModal()`, `savePlayerPrice()`
  - Booking editing: `openEditBookingPriceModal()`, `saveBookingPrice()`
- `frontend/admin.html`
  - Player modal: Edit button added
  - Booking modal: Edit button added

### Styling
- `frontend/admin-style.css`
  - Button styles for .btn-edit

---

## Testing

### Test Player Price Editing
1. Players → View → Edit Price → Select fee → Save
2. Verify all player's bookings updated
3. ✓ Check bookings table shows new price

### Test Booking Price Editing
1. Bookings → View → Edit Price → Select fee → Save
2. Verify only that booking updated
3. ✓ Check bookings table shows new price
4. ✓ Check other player's bookings unchanged

### Test Custom Prices
1. Open edit modal
2. Leave fee type blank
3. Enter custom amount (e.g., 450.00)
4. Save
5. ✓ Verify price updated to custom amount

---

## Security

✓ Both endpoints require admin role
✓ Non-admins get 403 error
✓ Input validation on all prices
✓ Error handling for invalid bookings/players
✓ Database integrity maintained

---

## What's Complete

✅ Player price editing (via Players section)
✅ Booking price editing (via Bookings section)
✅ Fee category selection for both
✅ Custom price entry for both
✅ Backend endpoints for both
✅ Frontend UI for both
✅ Error handling
✅ Success messages
✅ Auto-refresh after updates
✅ Security & validation

---

**Status: ✅ READY TO USE**

Both price editing features are complete and tested. Use them from the Admin Dashboard.
