# Client Feedback Plan (Umhlali Demo)

This document maps the client's demo feedback to concrete product requirements and implementation work in this repo.

## Decisions Confirmed

- KPI "Rounds" should be counted as **paid**: booking status in `checked_in` or `completed` (consistent with revenue).
- Student/Adult/Pensioner should be implemented with **SA defaults + configurable overrides** (see "Player Categories").
- Rounds target should be **auto-derived** from an **annual rounds target** of `35,000` for now.
- Revenue targets are derived from a member/visitor mix model unless explicitly overridden:
  - Member rounds share: 50%
  - Member revenue share: 33%
  - Baseline member 18-hole fee: fee code `1` when loaded (fallback R340)
  - `annual_revenue = (annual_rounds * member_round_share * member_fee) / member_revenue_share`

## Workstreams

### 1) Admin Dashboard: Targets vs Actual (Rounds + Revenue)

Requirement:
- Show Target vs Actual for `Rounds` and `Revenue` for Day / WTD / MTD / YTD.
- Provide early indication (% to target, variance).

Implementation:
- Add `kpi_targets` table (annual targets by year/metric).
- Add `/api/admin/kpis` (or extend `/api/admin/dashboard`) to return:
  - Actuals for each period
  - Derived targets for each period
  - % to target and variance
- Admin UI: add a "Targets" card section with period toggles and progress bars.

### 2) Bookings + Players: Handicap SA + Profile Fields + Booking Snapshots

Requirement:
- Show for bookings/players:
  - Handicap SA Player ID (or "Unregistered")
  - Home club name
  - Handicap Index at time of booking / playing
  - Male/Female
  - Student/Adult/Pensioner
  - Prepaid status
  - 18 holes vs 9 holes

Implementation:
- Extend `users` (player profile):
  - `gender`, `player_category`, `handicap_index`
  - Use existing `handicap_sa_id`, `home_course`
- Extend `bookings` (snapshot fields, so history remains correct):
  - `holes`, `prepaid`
  - `gender`, `player_category`
  - `handicap_sa_id`, `home_club`
  - `handicap_index_at_booking`, `handicap_index_at_play`
- Booking creation:
  - If player is a registered `User` or `Member`, snapshot these values onto the booking.
  - If not, allow manual entry during booking (admin / proshop flows).
- Admin UI:
  - Add columns to Bookings/Players tables and surface in detail modals.

### 3) Revenue Page: Period Toggle + Targets

Requirement:
- Toggle: Day / Week / Month / YTD
- Show target + actual for the selected period

Implementation:
- Update `/api/admin/revenue` to accept `period` + `anchor_date` and return period totals.
- UI: add period toggle and show target/actual summary; keep charts but align ranges with selected period.

### 4) Tee Times: Tee 10 Under Tee 1 + Slot Control + Booking Window

Requirement:
- For each time slot, show Tee 1 then Tee 10.
- Allow club to pre-book/close tee slots.
- Enforce "players can pre-book X days in advance".

Implementation:
- UI: render tee sheet grouped by time slot with Tee 1 and Tee 10 rows.
- Add admin endpoints to set `tee_times.status` (open/blocked/reserved).
- Add `club_settings.booking_window_days` (default off) and enforce for player bookings.

### 5) Ledger: Reconciliation vs Historical

Requirement:
- Reconcile for Day/Week/Month/YTD:
  - Booked vs Played (paid) vs No-show
  - Revenue (paid) vs Ledger total
  - Variance indicators

Implementation:
- Add `/api/admin/reconciliation?period=...&anchor_date=...`
- UI: show a reconciliation card on Ledger page.

### 6) Cashbook Export: From/To Date

Requirement:
- Export and view over a user-selected period.

Implementation:
- Extend cashbook endpoints to accept `from_date` + `to_date` (keep existing `export_date` for backward compatibility).
- UI: replace single date picker with From/To and show totals for range.

### 7) Landing Page: Photo + Strapline

Requirement:
- Use a high-quality Umhlali photo with a welcoming strapline.

Implementation:
- Replace landing header background and typography in `frontend/index.html` / `frontend/style.css`.
- Asset: add `frontend/assets/umhlali-hero.jpg` (final provided by Ally/client).

### 8) Booking Requirements: Cart / Push Cart / Caddy

Requirement:
- On initial booking capture, allow selecting requirements for cart/push cart/caddy.

Implementation:
- Add booking fields `cart`, `push_cart`, `caddy` (or `caddy_required`).
- Surface in bookings list/detail and ledger descriptions.

## Player Categories (SA Defaults)

Because clubs vary, we'll implement configurable thresholds. Defaults:
- `pensioner`: age >= 60 (aligned with SA "older persons" grant eligibility)
- `student`: set explicitly OR derived if age is within a configurable range (default 18–25) and flagged as student
- `adult`: otherwise

We will keep this policy in code as defaults and allow override via `club_settings`.

## Migration Strategy (Supabase + Render)

This project does not currently run migrations automatically. To avoid breaking demos:
- Implement a minimal, idempotent **auto-migration** step for Postgres:
  - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
  - `CREATE TABLE IF NOT EXISTS ...`
- Gate it behind `AUTO_MIGRATE=1` env var so production can later switch to proper migrations.
