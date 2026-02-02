# Booking Price Editing - New Feature

## What's New

You can now edit individual booking prices directly from the Bookings section of the admin dashboard.

## How to Use

### Edit a Booking's Price

1. **Admin Dashboard → Bookings**
2. **Click "View" button** on any booking
3. **See the Price section** with "Edit Price" button (orange)
4. **Click "Edit Price"**
5. **Choose one of:**
   - Select a fee type from dropdown (e.g., "Senior Golf Fee - R250")
   - OR enter a custom price directly
6. **Click "Save Price"**
7. **Bookings list refreshes** with updated price

## API Endpoint Added

```bash
PUT /api/admin/bookings/{booking_id}/price
Authorization: Bearer {token}
Content-Type: application/json
Role: Admin only

# Option 1: Apply fee category
Body: {"fee_category_id": 1}

# Option 2: Set custom price
Body: {"custom_price": 300.00}

Response:
{
  "status": "success",
  "message": "Booking #123 price updated to Senior Golf Fee",
  "booking_id": 123,
  "new_price": 250.00,
  "fee_category": {...}  // Only if fee_category_id used
}
```

## Files Modified

**Backend:**
- `app/routers/admin.py` - Added `PUT /bookings/{booking_id}/price` endpoint

**Frontend:**
- `frontend/admin.js` 
  - Modified: `viewBookingDetail()` - Added edit button
  - Added: `openEditBookingPriceModal()` - Opens edit modal
  - Added: `saveBookingPrice()` - Saves booking price
  - Added: `closeBookingPriceModal()` - Closes modal

## Testing

1. Go to Bookings section
2. Click View on any booking
3. Verify "Edit Price" button appears next to price
4. Click it and select a fee type
5. Click Save
6. Verify booking refreshes with new price

## Examples

### Using cURL

```bash
# Edit booking with fee category
curl -X PUT http://localhost:8000/api/admin/bookings/1/price \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"fee_category_id": 2}'

# Edit booking with custom price
curl -X PUT http://localhost:8000/api/admin/bookings/1/price \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"custom_price": 450.00}'
```

## Key Features

✓ Edit individual booking prices
✓ Choose from fee categories or custom amount
✓ Updates only that specific booking
✓ Admin-only access (requires admin role)
✓ Instant feedback with success/error messages
✓ Bookings list auto-refreshes after save

## Differences from Player Price Editing

| Feature | Player Price | Booking Price |
|---------|--------------|---------------|
| Location | Players section → View | Bookings section → View |
| Affects | All active bookings for player | Single specific booking |
| Use case | Set standard price per player | Adjust individual booking |
| When to use | Player qualifies for fee type | One booking needs different price |

---

**Status:** Ready to use immediately
