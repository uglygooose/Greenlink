# Flowgear + Pastel Partner Setup (Mac FastAPI)

## Overview

Since FastAPI is on Mac and Pastel Partner is on Windows, use **Flowgear** as a cloud bridge:

```
Mac FastAPI → Flowgear Webhook → Windows Pastel Partner
```

No pywin32 needed on Mac. Flowgear handles the Pastel SDK on their servers.

---

## Step 1: Sign Up to Flowgear

1. Go to: https://www.flowgear.net
2. Click **Free Trial** (no credit card needed)
3. Sign up with your email
4. Verify email

---

## Step 2: Create Flowgear Account for Pastel

In Flowgear dashboard:

1. **Add Connection** → Sage Pastel Partner
2. **Configure**:
   - **Host**: IP address of Windows machine with Pastel
   - **Username**: Your Pastel login
   - **Password**: Your Pastel password
   - **Company Name**: Your Pastel company name (e.g., `GreenLink_Golf_Club`)

3. **Test Connection** → Should show ✓ Success

---

## Step 3: Create Flowgear Workflow

In Flowgear Platform:

1. **New Workflow** → Give it a name: `GreenLink_Pastel_Sync`

2. **Add Trigger**: HTTP Request (Webhook)
   - Flowgear will generate a webhook URL
   - Copy this URL

3. **Add Nodes**:

   **Node 1: Create Customer**
   - Connector: Sage Pastel Partner
   - Action: Create Debtor (Customer)
   - Map fields:
     - Name: `$.player_name`
     - Email: `$.player_email`
     - Mobile: `$.player_phone` (optional)

   **Node 2: Create Invoice**
   - Connector: Sage Pastel Partner
   - Action: Create Sales Invoice
   - Map fields:
     - Customer ID: Output from Node 1
     - Description: `$.description`
     - Amount: `$.amount`
     - Reference: `$.booking_id`

   **Node 3: Return Response**
   - Add HTTP Response
   - Return success/invoice details

4. **Save & Deploy**

---

## Step 4: Add to FastAPI .env

```env
# Flowgear Configuration
FLOWGEAR_WEBHOOK_URL=https://flows.flowgear.net/webhooks/[YOUR_WEBHOOK_ID]
FLOWGEAR_API_KEY=your_api_key_if_needed

# Other config
DATABASE_URL=mysql+pymysql://user:password@localhost/greenlink_db
SECRET_KEY=your-secret-key
```

Get the webhook URL from Flowgear workflow (Step 3, Trigger node).

---

## Step 5: Test It

```bash
cd /Users/mulweliramufhuhfhi/fastapi_mysql_app

# Create test script
cat > test_flowgear.py << 'EOF'
import requests
import json

webhook_url = "YOUR_FLOWGEAR_WEBHOOK_URL_HERE"

payload = {
    "booking_id": 123,
    "player_name": "John Doe",
    "player_email": "john@greenlink.local",
    "amount": 1500.00,
    "description": "Green fee - Championship"
}

response = requests.post(webhook_url, json=payload)
print(json.dumps(response.json(), indent=2))
EOF

# Run test
python3 test_flowgear.py
```

Expected response:
```json
{
  "success": true,
  "customer_id": "CUST001",
  "invoice_id": "INV001234",
  "amount": 1500.00,
  "vat_amount": 195.65
}
```

---

## Step 6: Integrate with Booking Confirmation

In `app/crud.py`:

```python
from app.integrations import pastel_accounting

def confirm_booking(db: Session, booking_id: int, player_email: str, player_name: str, amount: float):
    # ... existing booking logic ...
    
    # Sync to Pastel via Flowgear
    sync_result = pastel_accounting.sync_booking_transaction(
        booking_id=booking_id,
        player_name=player_name,
        player_email=player_email,
        amount=amount,
        description=f"Green fee - {booking.course_name}"
    )
    
    if sync_result["success"]:
        print(f"✓ Synced to Pastel: {sync_result['invoice_id']}")
    else:
        print(f"✗ Sync failed: {sync_result['error']}")
    
    return booking
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Webhook URL not working | Verify FLOWGEAR_WEBHOOK_URL in .env is correct |
| "Connection to Pastel failed" | Check Pastel IP, username, password in Flowgear settings |
| Timeout errors | Increase timeout in `pastel_flowgear.py` (currently 30s) |
| Invoice not created | Check Flowgear workflow logs for mapping errors |

---

## Support

- **Flowgear**: https://www.flowgear.net
- **South Africa**: 0861-61-3569
- **Email**: support@flowgear.net
- **Community**: https://www.flowgear.net/support

---

## Cost

- **Free Tier**: Limited workflows/month
- **Paid**: $99-499/month depending on usage
- No charge for failed requests
