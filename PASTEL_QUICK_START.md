# Sage Pastel Partner - Quick Start (5 Minutes)

## What You Need
- [ ] Company already using Sage Pastel Partner
- [ ] Windows machine with Pastel installed
- [ ] Pastel login credentials
- [ ] Pastel company folder path
- [ ] FastAPI server (can be Linux/Mac, just call Windows Pastel server)

---

## Installation (5 Minutes)

### 1. On the FastAPI Server (Linux/Mac/Windows)

```bash
# Install dependency
pip install pywin32

# (If on Windows only, run this)
python -m pip install --upgrade pywin32
```

### 2. Find Pastel Information

Run this on the Windows machine with Pastel installed:

```
C:\Users\[YourUsername]\AppData\Roaming\Sage\Pastel\
```

Or:
```
C:\ProgramData\Sage\Pastel\
```

**Note:**
- Your company folder name (e.g., `GreenLink_Golf_Club`)
- Pastel username
- Pastel password

### 3. Configure .env

Add these lines to your `.env` file:

```env
PASTEL_COMPANY_NAME=GreenLink_Golf_Club
PASTEL_DATA_PATH=C:\ProgramData\Sage\Pastel\GreenLink_Golf_Club
PASTEL_USER=your_username
PASTEL_PASSWORD=your_password
```

**For Network Path (if Pastel is on another server):**
```env
PASTEL_DATA_PATH=\\192.168.1.100\Pastel\GreenLink_Golf_Club
```

### 4. Test It

```bash
python test_pastel_connection.py
```

Expected:
```
✓ Connected to: GreenLink Golf Club
✓ Customer created: CUST001
✓ Invoice created: INV001234
```

---

## Done! 

Now bookings automatically sync to Pastel Partner:

```python
from app.integrations import pastel_accounting

# When booking is confirmed:
result = pastel_accounting.sync_booking_transaction(
    booking_id=booking.id,
    player_name="John Doe",
    player_email="john@example.com",
    amount=1500.00,
    description="Green fee - Championship"
)

# Pastel invoice is created automatically
print(f"Invoice: {result['invoice_id']}")
print(f"Amount: R{result['amount']:.2f}")
print(f"VAT: R{result['vat_amount']:.2f}")
```

---

## Common Issues

| Issue | Fix |
|-------|-----|
| "Pastel SDK not available" | Install pywin32: `pip install pywin32` |
| "Connection failed" | Check PASTEL_DATA_PATH exists and .env is correct |
| "Access denied" | Verify PASTEL_USER and PASTEL_PASSWORD are correct |
| "Can't find company" | Confirm PASTEL_COMPANY_NAME matches folder name exactly |

---

## Support

For questions: See PASTEL_PARTNER_SETUP.md for detailed setup
