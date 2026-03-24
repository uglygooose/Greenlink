# GreenLink Service Test Matrix

## Scope

This is a code-verified service inventory for GreenLink as checked on 2026-03-24.

Source of truth used:

- FastAPI app routes loaded from `app.main`
- Frontend role shells in `frontend/admin.html`, `frontend/admin.js`, `frontend/dashboard.html`, `frontend/player.js`
- Legacy direct-flow pages in `frontend/booking.html`, `frontend/checkin.html`, `frontend/scoring.html`, `frontend/tsheet.html`

Current local club state found in the active SQLite dev database:

- Active club: `Umhlali Country Club` (`slug=umhlali`)
- Enabled modules: `golf`, `bowls`, `pro_shop`, `pub`, `golf_days`, `members`, `communications`
- Disabled module: `tennis`

Total live routes currently registered by the app: `151`

## What Exists Right Now

### 1. Platform / Public Services

- Platform startup state and readiness
  - `GET /api/public/platform-state`
  - `GET /health`
  - `GET /metrics`
- Public club configuration and branding
  - `GET /api/public/club`
  - `GET /api/public/club/me`
- Auth and session bootstrap
  - `POST /login`
  - `POST /users/`
  - `GET /users/me`
  - `GET /api/session/bootstrap`

### 2. Member Self-Service

- Sign in and self-signup
  - `frontend/index.html`
  - Login, signup, club-targeted signup, auto-login after signup
- Member home/dashboard
  - `frontend/dashboard.html?view=home`
- My bookings
  - Tee time browse by date
  - 9-hole / 18-hole filtering
  - Open / all / blocked filtering
  - Create booking from member shell
  - `GET /tsheet/range`
  - `POST /tsheet/booking`
- My rounds / scoring
  - View round actions
  - Open round
  - Submit adjusted gross score
  - Mark no return
  - `GET /scoring/my-bookings`
  - `GET /scoring/my-rounds`
  - `POST /scoring/my-rounds/open`
  - `PUT /scoring/my-rounds/{round_id}/submit`
  - `POST /scoring/my-rounds/{round_id}/no-return`
- Club news and communications feed
  - `GET /profile/club-feed`
- Messages / weather reconfirmation
  - `GET /profile/notifications`
  - `POST /profile/notifications/{notification_id}/action`
- Profile management
  - `GET /profile/me`
  - `PUT /profile/me`
  - `GET /profile/fees-available`

### 3. Club Operations: Golf

- Tee sheet generation and viewing
  - `GET /tsheet/`
  - `GET /tsheet/range`
  - `GET /tsheet/staff-range`
  - `POST /tsheet/create`
  - `POST /tsheet/generate`
- Booking creation and management
  - `POST /tsheet/booking`
  - `GET /tsheet/bookings/{tee_id}`
  - `PUT /tsheet/bookings/{booking_id}/move`
  - `GET /api/admin/bookings`
  - `GET /api/admin/bookings/{booking_id}`
  - `PUT /api/admin/bookings/{booking_id}/status`
  - `PUT /api/admin/bookings/{booking_id}/payment-method`
  - `PUT /api/admin/bookings/{booking_id}/account-code`
  - `PUT /api/admin/bookings/{booking_id}/price`
  - `PUT /api/admin/bookings/batch-update`
  - `DELETE /api/admin/bookings/{booking_id}`
- Check-in
  - `POST /checkin/{booking_id}`
  - UI in admin shell and legacy `frontend/checkin.html`
- Scoring and scorecard entry
  - `POST /scoring/submit`
  - Member round lifecycle endpoints above
  - Legacy `frontend/scoring.html`
- Tee sheet setup
  - `GET /api/admin/tee-sheet-profile`
  - `PUT /api/admin/tee-sheet-profile`
  - `GET /api/admin/booking-window`
  - `PUT /api/admin/booking-window`
  - `GET /settings/booking-window`
- Weather-related golf operations
  - `GET /api/admin/tee-sheet/weather/preview`
  - `GET /api/admin/tee-sheet/weather/auto-flags`
  - `POST /api/admin/tee-sheet/weather/reconfirm`
  - `GET /api/admin/tee-sheet/weather/responses`
- Bulk golf-day tee booking
  - `POST /api/admin/tee-sheet/bulk-book`
  - `DELETE /api/admin/tee-sheet/bulk-book/{group_id}`

### 4. Club Operations: Members / Staff / Debtors

- Member directory and search
  - `GET /api/admin/members`
  - `GET /api/admin/members/search`
  - `GET /api/admin/members/{member_id}`
  - `POST /api/admin/members`
  - `PUT /api/admin/members/{member_id}`
- Player and guest lookup
  - `GET /api/admin/players`
  - `GET /api/admin/players/{player_id}`
  - `GET /api/admin/guests`
- Staff management
  - `GET /api/admin/staff`
  - `POST /api/admin/staff`
  - `PUT /api/admin/staff/{user_id}`
  - `GET /api/admin/staff-role-context`
- Account customer / debtor account management
  - `GET /api/admin/account-customers`
  - `POST /api/admin/account-customers`
  - `PUT /api/admin/account-customers/{account_customer_id}`

### 5. Club Operations: Golf Days / Events

- Golf-day booking pipeline
  - `GET /api/admin/golf-day-bookings`
  - `POST /api/admin/golf-day-bookings`
  - `PUT /api/admin/golf-day-bookings/{golf_day_booking_id}`

### 6. Club Operations: Communications

- Club communications management
  - `GET /api/admin/communications`
  - `POST /api/admin/communications`
  - `PUT /api/admin/communications/{communication_id}`
- Member-facing communication delivery
  - `GET /profile/club-feed`
  - `GET /profile/notifications`
  - `POST /profile/notifications/{notification_id}/action`

### 7. Pricing / Fees

- Fee catalog and fee lookup
  - `GET /fees/`
  - `GET /fees/golf`
  - `GET /fees/cart`
  - `GET /fees/push-cart`
  - `GET /fees/caddy`
  - `GET /fees/code/{code}`
  - `GET /fees/{fee_id}`
- Fee suggestion engine
  - `POST /fees/suggest/golf`
  - `POST /fees/suggest/cart`
  - `POST /fees/suggest/push-cart`
  - `POST /fees/suggest/caddy`
- Club pricing matrix and pricing admin
  - `GET /api/admin/fee-categories`
  - `GET /api/admin/pricing-matrix`
  - `POST /api/admin/pricing-matrix`
  - `PUT /api/admin/pricing-matrix/{fee_id}`
  - `DELETE /api/admin/pricing-matrix/{fee_id}`
  - `POST /api/admin/pricing-matrix/apply-reference`
  - `PUT /api/admin/players/{player_id}/price`
  - `GET /api/admin/players/{player_id}/price-info`
  - `PUT /api/admin/bookings/{booking_id}/price`

### 8. Revenue / Finance / Cashbook

- Dashboard and revenue views
  - `GET /api/admin/dashboard`
  - `GET /api/admin/revenue`
  - `GET /api/admin/summary`
  - `GET /api/admin/ledger`
  - `GET /api/admin/audit-logs`
  - `GET /api/admin/operational-alerts`
- Targets and assumptions
  - `GET /api/admin/targets`
  - `PUT /api/admin/targets`
  - `PUT /api/admin/targets/assumptions`
  - `GET /api/admin/operation-targets`
  - `PUT /api/admin/operation-targets`
- Cashbook and accounting exports
  - `GET /cashbook/daily-summary`
  - `GET /cashbook/pro-shop-summary`
  - `GET /cashbook/export-preview`
  - `GET /cashbook/export-csv`
  - `GET /cashbook/export-csv-pro-shop`
  - `GET /cashbook/export-excel`
  - `GET /cashbook/settings`
  - `PUT /cashbook/settings`
  - `GET /cashbook/pastel-layout`
  - `POST /cashbook/pastel-layout`
  - `GET /cashbook/pastel-mappings`
  - `PUT /cashbook/pastel-mappings`
  - `GET /cashbook/close-status`
  - `POST /cashbook/close-day`
  - `POST /cashbook/reopen-day`
  - `POST /cashbook/finalize-day`

### 9. Imports / Sync

- Import history and settings
  - `GET /api/admin/imports`
  - `GET /api/admin/imports/revenue-settings`
  - `PUT /api/admin/imports/revenue-settings`
- CSV imports
  - `POST /api/admin/imports/bookings-csv`
  - `POST /api/admin/imports/members-csv`
  - `POST /api/admin/imports/revenue-csv`
- Umhlali operational sync
  - `POST /api/admin/imports/umhlali-operational-sync`

### 10. Pro Shop

- Product catalog and stock management
  - `GET /api/admin/pro-shop/products`
  - `POST /api/admin/pro-shop/products`
  - `PUT /api/admin/pro-shop/products/{product_id}`
  - `POST /api/admin/pro-shop/products/{product_id}/adjust-stock`
- Pro shop sales
  - `GET /api/admin/pro-shop/sales`
  - `POST /api/admin/pro-shop/sales`
- Cashbook linkage
  - `GET /cashbook/pro-shop-summary`
  - `GET /cashbook/export-csv-pro-shop`

### 11. Club Setup

- Club branding / profile
  - `GET /api/admin/club-profile`
  - `PUT /api/admin/club-profile`
- Booking rules and tee-sheet setup
  - `GET /api/admin/booking-window`
  - `PUT /api/admin/booking-window`
  - `GET /api/admin/tee-sheet-profile`
  - `PUT /api/admin/tee-sheet-profile`
- Operational targets
  - `GET /api/admin/operation-targets`
  - `PUT /api/admin/operation-targets`

### 12. Super Admin / Platform Control

- Command centre and platform catalog
  - `GET /api/super/command-center`
  - `GET /api/super/catalog`
- Club management
  - `GET /api/super/clubs`
  - `POST /api/super/clubs`
  - `PUT /api/super/clubs/{club_id}`
  - `POST /api/super/clubs/setup`
  - `GET /api/super/clubs/{club_id}/workspace`
- Platform user and access management
  - `GET /api/super/staff`
  - `POST /api/super/staff`
  - `PUT /api/super/staff/{user_id}`
- Demo environment control
  - `POST /api/super/demo/ensure`

### 13. Legacy Direct Pages Still Present

- `frontend/tsheet.html`
- `frontend/booking.html`
- `frontend/checkin.html`
- `frontend/scoring.html`

These still exercise real backend flows and should be included in live testing even if the newer admin/member shells are your main UI.

## Recommended Live Test Order

### P0: Core Commercial Path

- Login as club admin
- Open admin shell
- Confirm dashboard loads
- Open golf workspace and view tee sheet
- Create a tee time if needed
- Create a booking
- Edit booking status and payment method
- Check in the booking
- Open round / submit score
- Confirm revenue and ledger update
- Export cashbook CSV
- Close and reopen day

### P1: Member Self-Service

- Self-signup as visitor
- Self-signup as member
- Member login
- Browse tee sheet
- Create booking from member shell
- Update member profile
- View club news
- Action weather reconfirmation notification
- Submit adjusted gross score
- Mark no return

### P1: Club Operations

- Search members
- Create member
- Update member
- Create staff user
- Create account customer / debtor
- Link debtor to booking
- Create golf-day booking
- Bulk-book golf day on tee sheet
- Publish communication
- Confirm communication appears in member feed

### P1: Finance / Imports / Pro Shop

- Create pro shop product
- Adjust stock
- Record pro shop sale
- Confirm sale appears in revenue and cashbook views
- Import revenue CSV
- Import members CSV
- Import bookings CSV
- Run Umhlali operational sync

### P2: Setup / Governance / Platform

- Update club profile
- Update booking window
- Update tee-sheet profile
- Update pricing matrix
- Apply pricing reference template
- Update targets and assumptions
- Review audit logs
- Review operational alerts
- Test super admin command centre
- Create or edit club from super admin
- Create platform staff user
- Refresh demo environment

## Module-Specific Note

For the current local Umhlali setup, these should be treated as in-scope for live testing:

- Golf
- Bowls
- Pro Shop
- Pub
- Golf Days
- Members
- Communications

This should be treated as out of scope for current-club live testing unless you enable it first:

- Tennis

## Quick Coverage Check

If you want a fast "everything touched" pass, the minimum role set is:

- `super_admin`
- `admin`
- `club_staff`
- `player`

If all four roles can complete their primary journeys without error, you will cover most of the implemented GreenLink surface area.
