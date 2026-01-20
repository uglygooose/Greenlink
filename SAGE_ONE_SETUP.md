# Sage One Accounting Integration Setup

## Overview

Your GreenLink system now integrates with **Sage One Accounting** (https://accounting.sageone.co.za) to automatically sync all financial transactions.

## What Gets Synced

When a booking is created:
1. ✅ **Customer** created in Sage One (player details)
2. ✅ **Tax Invoice** created (R350 for members, R560 for guests)
3. ✅ **Transaction** recorded in ledger
4. ✅ Invoice ID stored in your database

## Getting Your Sage One API Credentials

### Step 1: Get API Key

1. Login to your Sage One account: https://accounting.sageone.co.za
2. Go to **Settings** → **Company Profile** → **API Keys**
3. Click **Create New API Key**
4. Copy the API key (you'll only see it once!)

### Step 2: Get Company ID

1. In Sage One, go to **Settings** → **Company Profile**
2. Look for your **Company ID** (usually a number)
3. Copy it

### Step 3: Add to .env File

Open your `.env` file and add these lines:

```bash
# Sage One Accounting Integration
SAGE_ONE_API_KEY=your_api_key_here
SAGE_ONE_COMPANY_ID=your_company_id_here

# Example:
# SAGE_ONE_API_KEY=sk_live_a1b2c3d4e5f6g7h8i9j0
# SAGE_ONE_COMPANY_ID=12345
```

### Step 4: Restart Server

```bash
# Stop your server (Ctrl+C)
# Then restart:
uvicorn app.main:app --reload
```

You should see:
```
[INTEGRATIONS] Using Sage One Accounting
```

## Testing the Integration

### 1. Create a Test Booking

1. Go to T-Sheet
2. Create a tee time
3. Book a player with:
   - Name: Test Player
   - Email: test@greenlink.co.za
   - Price: R350

### 2. Check Server Console

You should see:
```
[SAGE ONE] Syncing booking 1 to Sage One
[SAGE ONE] Creating customer: Test Player (test@greenlink.co.za)
[SAGE ONE] Customer created with ID: 12345
[SAGE ONE] Creating invoice for booking 1: R350.00
[SAGE ONE] Invoice created with ID: 67890
[SAGE ONE] ✓ Booking 1 synced successfully
```

### 3. Verify in Sage One

1. Login to Sage One
2. Go to **Customers** → You should see "Test Player"
3. Go to **Invoices** → You should see invoice for R350.00
4. Reference will be: `BOOKING-1`

## API Features Used

### Customer API
```
POST /Customer
```
Creates a new customer with player details

### Tax Invoice API
```
POST /TaxInvoice
```
Creates invoice with:
- Green fee amount
- 15% VAT included
- Booking reference

### Company Info API
```
GET /CompanyEntity/Get
```
Verifies connection to your company

## How It Works

When a booking is created in GreenLink:

```
Player Books → Create Customer in Sage One → Create Invoice → Store Transaction ID
```

The invoice includes:
- **Description**: "Green fee - [Player Name]"
- **Amount**: R350 (members) or R560 (guests)
- **Tax**: 15% VAT (included)
- **Reference**: BOOKING-[ID]

## Fallback to Mock

If Sage One API is not configured or fails, the system automatically falls back to the mock integration:

```
[INTEGRATIONS] Sage One not available, using mock
[MOCK PASTEL] Syncing transaction...
```

This ensures your system keeps working even if Sage One is down.

## Troubleshooting

### "SAGE_ONE_API_KEY not set"
- Add the API key to your `.env` file
- Restart the server

### "401 Unauthorized"
- Check your API key is correct
- Make sure it hasn't expired
- Generate a new API key in Sage One

### "Customer already exists"
- Sage One prevents duplicate customers
- The API will return the existing customer ID
- Invoice will still be created

### "Invoice creation failed"
- Check your Sage One account is active
- Verify you have permission to create invoices
- Check the server logs for detailed error

## Database Fields

The system tracks Sage One sync status:

**ledger_entries table:**
- `pastel_synced`: 1 if synced, 0 if not
- `pastel_transaction_id`: Format `SAGE-{invoice_id}`

## API Rate Limits

Sage One API limits:
- **100 requests per minute**
- **10,000 requests per day**

For a golf club with 100 bookings/day, you'll use ~300 requests (well within limits).

## Security Notes

⚠️ **Never commit your .env file to git!**

Your `.env` file contains sensitive API keys. Make sure `.env` is in your `.gitignore` file.

## Support

For Sage One API issues:
- Documentation: https://accounting.sageone.co.za/api/2.0.0/help
- Support: https://www.sage.com/en-za/support/

For GreenLink integration issues:
- Check server logs for `[SAGE ONE]` messages
- Verify API credentials in `.env`
- Test with mock integration first

## Cost

Sage One API is included with your Sage One subscription at no extra cost.

## Next Steps

1. ✅ Add API credentials to `.env`
2. ✅ Restart server
3. ✅ Create test booking
4. ✅ Verify in Sage One dashboard
5. ✅ Go live!

---

**Status:** Ready for production when you add your API credentials!
