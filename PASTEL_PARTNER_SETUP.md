# Sage Pastel Partner Integration Setup

## Quick Start (Existing Pastel Installation)

Since your company already has Sage Pastel Partner installed, here's how to connect GreenLink directly to it.

---

## Step 1: Find Your Pastel Company Folder

On the Windows machine where Pastel is installed:

```
Typically: C:\ProgramData\Sage\Pastel\
or
C:\Users\[YourUsername]\AppData\Roaming\Sage\Pastel\
```

**Inside this folder, locate:**
- Your company folder name (e.g., `GreenLink_Golf_Club`)
- Contains: `Data.mdb` (Pastel database file)

### Example Path:
```
C:\ProgramData\Sage\Pastel\GreenLink_Golf_Club\
```

---

## Step 2: Get the Pastel SDK DLL

The SDK DLL should already be on the Pastel server:

```
C:\Program Files\Sage\Pastel\
```

**Find:** `Pastel.Evolution.dll` (check Pastel folder)

---

## Step 3: Configure Environment Variables

Add to your `.env` file on the FastAPI server:

```env
# Pastel Partner Configuration - REQUIRED
PASTEL_COMPANY_NAME=GreenLink_Golf_Club
PASTEL_DATA_PATH=\\PASTEL_SERVER_IP\Pastel\GreenLink_Golf_Club
PASTEL_USER=your_pastel_login_username
PASTEL_PASSWORD=your_pastel_login_password

# MySQL Database
DATABASE_URL=mysql+pymysql://user:password@localhost/greenlink_db

# API Settings
SECRET_KEY=your-secret-key-here
ENVIRONMENT=production
```

### Example for Network Paths:
```env
# If Pastel is on a network server:
PASTEL_DATA_PATH=\\192.168.1.100\Pastel\GreenLink_Golf_Club

# If Pastel is on same machine:
PASTEL_DATA_PATH=C:\ProgramData\Sage\Pastel\GreenLink_Golf_Club

# If using UNC paths on Windows:
PASTEL_DATA_PATH=\\PASTEL-SERVER\SharedPastel\GreenLink_Golf_Club
```

---

## Step 4: Install Python Dependencies

```bash
# On Windows with Pastel:
pip install pywin32

# Run this after installing pywin32:
python -m pip install --upgrade pywin32
```

On Mac/Linux (if accessing Pastel over network):
- Use Docker with Windows container, OR
- Use Flowgear connector (cloud integration)

## Step 5: Test Connection

Create `test_pastel_connection.py`:

```python
#!/usr/bin/env python
# test_pastel_connection.py
import sys
from app.pastel_partner import pastel_partner

print("=" * 60)
print("Testing Sage Pastel Partner Connection")
print("=" * 60)

# Test 1: Get company info
print("\n1. Testing company connection...")
result = pastel_partner.get_company_info()
if result["success"]:
    print(f"   ✓ Connected to: {result.get('company_name')}")
    print(f"   ✓ SDK Version: {result.get('sdk_version')}")
else:
    print(f"   ✗ Failed: {result['error']}")
    sys.exit(1)

# Test 2: Create test customer
print("\n2. Testing customer creation...")
customer = pastel_partner.create_customer(
    name="Test Player",
    email="test@greenlink.local",
    mobile="0712345678"
)
if customer["success"]:
    print(f"   ✓ Customer created: {customer['customer_id']}")
    customer_id = customer['customer_id']
else:
    print(f"   ✗ Failed: {customer['error']}")
    sys.exit(1)

# Test 3: Create test invoice
print("\n3. Testing invoice creation...")
invoice = pastel_partner.create_sales_invoice(
    customer_id=customer_id,
    description="Test Green Fee",
    amount=1500.00,
    booking_id=999
)
if invoice["success"]:
    print(f"   ✓ Invoice created: {invoice['invoice_id']}")
    print(f"   ✓ Amount: R{invoice['amount']:.2f}")
    print(f"   ✓ VAT: R{invoice['vat_amount']:.2f}")
else:
    print(f"   ✗ Failed: {invoice['error']}")
    sys.exit(1)

print("\n" + "=" * 60)
print("All tests passed! Pastel integration is ready.")
print("=" * 60)
```

Run the test:
```bash
cd /Users/mulweliramufhuhfhi/fastapi_mysql_app
python test_pastel_connection.py
```

Expected output:
```
============================================================
Testing Sage Pastel Partner Connection
============================================================

1. Testing company connection...
   ✓ Connected to: GreenLink Golf Club
   ✓ SDK Version: 7.20.0.77

2. Testing customer creation...
   ✓ Customer created: CUST001

3. Testing invoice creation...
   ✓ Invoice created: INV001234
   ✓ Amount: R1500.00
   ✓ VAT: R195.65

============================================================
All tests passed! Pastel integration is ready.
============================================================
```

---

## API Reference

### Key Methods

#### `create_customer(name, email, mobile)`
Creates a new customer (debtor account) in Pastel.

**Returns:**
```python
{
    "success": True,
    "customer_id": "CUST001",
    "name": "John Doe"
}
```

#### `create_sales_invoice(customer_id, description, amount, booking_id, vat_applicable)`
Creates a sales invoice in Pastel.

**Example:**
```python
result = pastel_partner.create_sales_invoice(
    customer_id="CUST001",
    description="Green fee",
    amount=1500.00,  # VAT inclusive
    booking_id=123,
    vat_applicable=True  # 15% VAT (South Africa)
)
```

**Returns:**
```python
{
    "success": True,
    "invoice_id": "INV001234",
    "amount": 1500.00,
    "vat_amount": 195.65,
    "booking_reference": "GOLF-123"
}
```

#### `sync_booking_transaction(booking_id, player_name, player_email, amount, description)`
Complete workflow: creates customer + invoice in one call.

**Returns:**
```python
{
    "success": True,
    "customer_id": "CUST001",
    "invoice_id": "INV001234",
    "transaction_id": "PASTEL-INV001234",
    "amount": 1500.00,
    "vat_amount": 195.65,
    "synced": True,
    "timestamp": "2025-12-03T10:30:00"
}
```

#### `get_customer(customer_id)`
Retrieve existing customer details.

#### `get_company_info()`
Verify connection and get company details.

---

## Integration with FastAPI

### Update CRUD Operations

In `app/crud.py`, when a booking is confirmed:

```python
from app.integrations import pastel_accounting

def confirm_booking(db: Session, booking_id: int, player_email: str, player_name: str, amount: float):
    # ... existing booking confirmation logic ...
    
    # Sync to Pastel Partner
    sync_result = pastel_accounting.sync_booking_transaction(
        booking_id=booking_id,
        player_name=player_name,
        player_email=player_email,
        amount=amount,
        description=f"Green fee - {booking.course_name}"
    )
    
    if sync_result["success"]:
        # Log transaction
        print(f"[BOOKING] Synced to Pastel: {sync_result['transaction_id']}")
    else:
        # Log error but don't fail booking
        print(f"[BOOKING] Pastel sync failed: {sync_result['error']}")
    
    return booking
```

### Router Endpoint

```python
# app/routers/bookings.py
from app.integrations import pastel_accounting

@router.post("/bookings/{booking_id}/confirm")
async def confirm_booking(booking_id: int, db: Session = Depends(get_db)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Sync to Pastel
    sync_result = pastel_accounting.sync_booking_transaction(
        booking_id=booking.id,
        player_name=booking.player_name,
        player_email=booking.player_email,
        amount=booking.total_fee
    )
    
    return {
        "booking_id": booking.id,
        "pastel_sync": sync_result
    }
```

---

## Alternative: Cloud Integration with Flowgear

If you're using **cloud Pastel** or prefer no-code integration:

### Flowgear Setup

1. **Signup**: https://www.flowgear.net
2. **Create Connector**: Pre-built Pastel Partner connector available
3. **Configure**: Connect to your Pastel Partner instance
4. **Build Workflow**: Drag-and-drop integration builder
5. **Deploy**: No server setup required

**Benefits**:
- Works on Mac/Linux/Windows
- No SDK installation needed
- Professional support
- Real-time data sync

### Flowgear Webhook Integration

```python
# app/integrations.py - Add webhook endpoint
import requests

class FlowgearPastel:
    """Flowgear-based Pastel integration (cloud)"""
    
    FLOWGEAR_WEBHOOK = os.getenv("FLOWGEAR_WEBHOOK_URL")
    
    @staticmethod
    def sync_transaction(booking_id, player_name, player_email, amount):
        """Send data to Flowgear for Pastel sync"""
        payload = {
            "booking_id": booking_id,
            "player_name": player_name,
            "player_email": player_email,
            "amount": amount,
            "timestamp": datetime.now().isoformat()
        }
        
        response = requests.post(
            FlowgearPastel.FLOWGEAR_WEBHOOK,
            json=payload,
            timeout=10
        )
        
        return response.json()
```

---

## Troubleshooting

### Issue: "Pastel SDK not available"

**Solution 1**: Ensure DLL is in PATH
```bash
# Windows: Add to system PATH
setx PATH "%PATH%;C:\path\to\Pastel.Evolution.dll"

# Or copy to Python site-packages
cp Pastel.Evolution.dll /Library/Python/3.9/lib/python/site-packages/
```

**Solution 2**: Install pywin32
```bash
pip install pywin32
python -m pip install --upgrade pywin32
```

### Issue: "Can't connect to Pastel company"

**Check**:
1. PASTEL_DATA_PATH points to correct folder
2. PASTEL_USER and PASTEL_PASSWORD are correct
3. Company database file exists: `{PASTEL_DATA_PATH}/Data.mdb`
4. Pastel Partner is not currently open by another user

### Issue: "Invoice creation failed"

**Check**:
1. Customer account exists in Pastel
2. Amount is positive number
3. VAT calculation: amount must be exclusive or inclusive (not both)
4. Pastel database not in use

---

## Support

- **Sage Community**: https://communityhub.sage.com/za/sage-50-pastel/
- **SDK Support**: [sdk-support@sage.co.za](mailto:sdk-support@sage.co.za)
- **Flowgear Support**: https://www.flowgear.net (South Africa: 0861-61-3569)

---

## Performance Notes

- **Connection Time**: 2-5 seconds per operation (SDK overhead)
- **Recommended**: Use connection pooling or async processing
- **Batch Operations**: Group multiple invoices to reduce connection overhead

### Async Processing Example

```python
# Use Celery or APScheduler for background sync
from celery import shared_task

@shared_task
def sync_booking_to_pastel(booking_id: int):
    """Background task to sync booking"""
    from app.integrations import pastel_accounting
    
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    
    result = pastel_accounting.sync_booking_transaction(
        booking_id=booking.id,
        player_name=booking.player_name,
        player_email=booking.player_email,
        amount=booking.total_fee
    )
    
    return result
```
