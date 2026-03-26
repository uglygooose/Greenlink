# Identity + Exception Enforcement Status

Date: 2026-03-26

This file exists to prevent fake completion claims.

## 1. Migration / Backfill Proof

Machine-readable proof is available through:

- `GET /api/admin/enforcement-proof`
- `POST /api/admin/enforcement-proof/backfill`

What the proof checks now:

- required schema columns exist for:
  - `users`
  - `members`
  - `bookings`
  - `club_relationship_states`
  - `operational_exceptions`
  - `task_timing_events`
- current club rows missing:
  - `users.global_person_id`
  - `members.person_id`
  - `members.global_person_id`
  - `bookings.global_person_id`
  - `bookings.club_relationship_state_id`
- open `identity/profile` exceptions
- open `revenue_integrity_close` exceptions

What `backfill` does now:

- re-syncs users into person + global identity
- re-syncs members into person + global identity + club relationship state
- re-syncs bookings into integrity law
- re-syncs account-customer linkage
- re-syncs golf-day and pro-shop revenue integrity
- re-syncs player profile readiness exceptions

Completion rule:

- enforcement is not done unless `GET /api/admin/enforcement-proof` returns:
  - `ready: true`
  - zero missing-link counts
  - no open integrity/revenue blocker counts left from incomplete migration

## 2. Coverage Map

### Covered

- `app/crud.py:create_booking`
- `app/routers/imports.py:import_bookings_csv`
- `app/routers/imports.py:import_members_csv`
- `app/routers/admin.py:update_booking_status`
- `app/routers/admin.py:update_booking_payment_method`
- `app/routers/admin.py:update_booking_account_code`
- `app/routers/admin.py:batch_update_bookings`
- `app/routers/admin.py:update_player_price`
- `app/routers/admin.py:update_booking_price`
- `app/routers/admin.py:_create_weather_notifications`
- `app/routers/tee.py:move_booking`
- `app/services/club_communications_service.py:create_club_communication`
- `app/services/club_communications_service.py:update_club_communication`
- `app/services/golf_day_bookings_service.py:create_golf_day_booking_payload`
- `app/services/golf_day_bookings_service.py:update_golf_day_booking_payload`
- `app/services/account_customers_service.py:create_account_customer_payload`
- `app/services/account_customers_service.py:update_account_customer_payload`
- `app/services/pro_shop_service.py:create_pro_shop_sale_payload` for `payment_method=account`
- `app/routers/profile.py:update_my_profile`
- `app/routers/profile.py:get_my_profile`
- `app/routers/cashbook.py:close_day`

### Partial

- `app/services/people_repair_queue_service.py`
- `frontend/js/admin/members-panel.js`
  - repair ownership now exists
  - direct in-queue repair actions are still shallow
- `app/services/pro_shop_service.py`
  - account-sale blockers exist
  - fast repair path does not
- `frontend/player.js`
  - player readiness now renders from server-owned readiness payloads
  - admin-side repair remains shallow

### Remaining Bypass / Product Gaps

- `app/services/club_members_service.py`
  - no shortest-path owned identity repair actions yet
- pro-shop blocker resolution
  - no action-first fix path
- admin-side readiness repair
  - no shortest-path corrective actions yet

These are not silent mutation bypasses anymore. They are still product gaps.

## 3. Waiver Policy

Waivers are locked down intentionally.

API:

- `GET /api/admin/exceptions/waiver-policy`

Current policy:

- no exception waivers are permitted
- `waived` is reserved for future explicit policy only
- direct code paths cannot set `waived` accidentally

Practical rule:

- booking, identity, communication, profile-readiness, and revenue-integrity exceptions must be resolved through owning workflows
- they cannot be hand-waved away

Why:

- if `waived` exists without policy, it becomes the easiest way to fake clean close and fake data trust

## 4. Do Not Pretend

What is true now:

- mutation-path enforcement is materially real
- revenue and communication blockers now surface
- player readiness is server-owned instead of frontend-guessed
- legacy data can be measured and backfilled with proof
- waivers are no longer an undefined loophole

What is not true yet:

- the product still lacks some direct repair actions inside the people queue
- the product still lacks a fast operator-facing fix path for pro-shop blockers
- enforcement complete is only valid after a real club passes the proof report cleanly
