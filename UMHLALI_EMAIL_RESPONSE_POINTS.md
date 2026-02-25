## GreenLink Response Points for Umhlali

### 1) Booking rules and tee sheet rules confirmed
- **Advance booking window:** Set to **28 days (4 weeks)** for members, affiliated visitors, and non-affiliated visitors.
- **Group/Golf Day cancellation policy:** Set to **minimum 10 days notice**.
- **Tee interval:** Set to **8 minutes**.
- **Seasonal tee profile configured:**
  - **Two-tee days (Tue/Wed/Thu/Sat):**
    - Summer: `06:30-08:30`, `11:30-13:30`, 9-hole from `15:40`
    - Winter: `06:45-08:00`, `11:00-13:00`, 9-hole from `15:15`
  - **One-tee days (Mon/Fri/Sun):**
    - Summer: `06:30-13:30`, 9-hole from `13:45` (configurable in profile)
    - Winter: `06:45-13:00`, 9-hole from `13:15` (configurable in profile)
- **Events support:** Bulk booking now supports **event type** (`Group`, `Golf Day`, `PMG`, `Other Event`) and optional debtor account code.

### 2) Green Fees POS question
- **GreenLink can replace day-to-day Green Fees POS workflows** for bookings, check-in, payment capture, and cashbook export.
- Recommended rollout is **parallel run first**, then formal cutover once reconciliation sign-off is complete.

### 3) “Accounts” customers (Playmore / schools / monthly invoicing)
- Supported flow:
  1. Mark booking payment method as **ACCOUNT**.
  2. Capture debtor account code on booking (**Debtor account** field).
  3. Cashbook export posts account transactions to the debtor code when provided.
  4. If no debtor code is captured, fallback uses configured **Debit GL (ACCOUNT)** mapping.
- This keeps account customers separate from direct cash/card sales in exports.

### 4) Journal posting to specific account vs Green Fees GL
- Confirmed: ACCOUNT transactions can post to **specific debtor accounts** (per booking) instead of only the default Green Fees GL.
- Revenue credit logic remains intact; debit side now supports account-based allocation.

### 5) Ashton students also using Squash / non-golf charging
- Yes, these can be captured in GreenLink operations:
  - Golf bookings remain under Golf flow.
  - Non-golf activity (e.g., squash/retail) can be captured under **Pro Shop / imported operations** depending workflow preference.
- For month-end school billing, use **ACCOUNT** payment method and debtor code consistently.

### 6) Pricing list update
- Umhlali-aligned fee catalogue has been updated with additional categories now present in system seed:
  - Group/charity golf bands
  - Trail/cart fee lines
  - Bowls fee lines
- Existing golf, visitor, competition, range, PMG, and cart pricing remains in place and seedable.
