# GreenLink Pricing Integration Setup

## Overview

Your complete 2026 fee schedule is now integrated with automated Sage One syncing!

## Step 1: Create Database Table

Run this SQL:

```bash
mysql -u root -p greenlink < create_fees_table.sql
```

## Step 2: Populate Fee Categories

Run the Python script to load all 60+ fee categories:

```bash
python3 populate_fees.py
```

You should see:
```
Populating fee categories...
  Added: 1 - GOLF MEMBER MEN - 18 HOLES - R340
  Added: 73 - GOLF MEMBER LADIES - 18 HOLES - R340
  ...
✓ Successfully populated 60 fee categories!
```

## Step 3: Verify Data

Check in MySQL:

```bash
mysql -u root -p greenlink
```

```sql
SELECT code, description, price FROM fee_categories WHERE fee_type = 'golf' LIMIT 10;
```

## Fee Categories Loaded

### Golf Fees - Members (18 Holes)
- Code 1: Men - R340
- Code 73: Ladies - R340  
- Code 3: Scholar - R140
- Code 5: Student - R230
- Code 7/74: POB (Mon + Tues-Fri AM) - R290

### Golf Fees - Visitors
- Code 36: Introduced/Reduced - R560
- Code 20: Weekdays 18 holes - R575
- Code 22: Weekends 18 holes - R700
- Code 2018: Non-affiliated Weekdays - R700
- Code 2017: Non-affiliated Weekends - R900

### Cart Hire
- Code 50: Member 18 holes - R400
- Code 51: Member 9 holes - R270
- Code 52: Non-member 18 holes - R495
- Code 53: Non-member 9 holes - R325

### Competition Fees
- Code 88: Weekdays - R85
- Code 77: Saturday - R85
- Code 94: Ladies Thursday - R50

### Driving Range
- Code 68: Full bucket member - R70
- Code 66: Full bucket visitor - R85
- Code 69: Unlimited monthly - R900

## How It Works with Sage One

When booking:

1. **User selects fee category** (e.g., "Golf Member Men 18 Holes")
2. **Price auto-populated** from database (R340)
3. **Booking created** with correct price
4. **Sage One syncs**:
   - Customer created
   - Invoice generated for R340
   - Transaction ID stored

## Booking Flow

```
Select Tee Time → Select Fee Type → Player Details → Book → Sage One Sync
```

## API Endpoints

### Get All Golf Fees
```
GET /fees/golf
```

### Get Fee by Code
```
GET /fees/code/1
```
Returns: Golf Member Men 18 Holes - R340

### Create Booking with Fee
```
POST /tsheet/booking
{
  "tee_time_id": 1,
  "player_name": "John Doe",
  "player_email": "john@example.com",
  "fee_category_id": 1,  // Code 1 = Member Men 18 holes
  "handicap_number": "12345"
}
```

Price auto-set to R340 from fee_category

## Testing

### Test 1: Member Booking
```bash
# Book as member
Fee Code: 1 (Member Men 18 holes)
Expected Sage One Invoice: R340
```

### Test 2: Visitor Booking
```bash
# Book as weekend visitor
Fee Code: 22 (Visitor Weekends 18 holes)
Expected Sage One Invoice: R700
```

### Test 3: With Cart
```bash
# Book with cart
Fee Code 1: Golf R340
Fee Code 50: Cart R400
Total Sage One Invoice: R740
```

## Multiple Fees Per Booking

Players can have multiple fees (e.g., green fee + cart):

1. Create booking with golf fee
2. Add additional ledger entry for cart
3. Both sync to Sage One separately

## Updating Prices

To update 2027 prices:

1. Update `populate_fees.py` with new prices
2. Run: `python3 populate_fees.py`
3. Existing codes update automatically

Or manually:

```sql
UPDATE fee_categories 
SET price = 360 
WHERE code = 1;
```

## Front-End Integration

The booking form will show dropdown:

```
Select Fee Type:
[ ] Golf Member Men 18 Holes - R340
[ ] Golf Member Ladies 18 Holes - R340  
[ ] Visitor Weekdays 18 Holes - R575
[ ] Visitor Weekends 18 Holes - R700
```

Price auto-fills when selected!

## Sage One Integration

Each booking creates:
- **Customer**: Player name/email
- **Invoice**: With selected fee amount
- **Reference**: BOOKING-{id}
- **Description**: Fee description from table

Example Sage One invoice:
```
Customer: John Doe
Description: GOLF MEMBER MEN - 18 HOLES
Amount: R340.00 (inc VAT)
Reference: BOOKING-123
```

## Reports

Query bookings by fee type:

```sql
SELECT 
    b.id,
    b.player_name,
    fc.description,
    b.price,
    b.status
FROM bookings b
JOIN fee_categories fc ON b.fee_category_id = fc.id
WHERE fc.fee_type = 'golf'
AND DATE(b.created_at) = CURDATE();
```

## Next Steps

1. ✅ Run `create_fees_table.sql`
2. ✅ Run `python3 populate_fees.py`
3. ✅ Update frontend to show fee dropdown
4. ✅ Test booking with different fees
5. ✅ Verify Sage One sync

---

**All 60+ fee categories from your 2026 price list are ready!**
