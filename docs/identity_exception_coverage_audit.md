# Identity + Exception Coverage Audit

Date: 2026-03-26

This file is a blunt inventory of what now obeys the new identity/integrity layer and exception law, what only partially obeys it, and what still bypasses it.

## Covered Now

- `app/crud.py:create_booking`
  - Reads booking identity context from global person + per-club relationship state.
  - Persists `global_person_id` and `club_relationship_state_id`.
  - Emits `identity_ambiguous_for_booking` or `pricing_context_unresolved` where required.
- `app/routers/imports.py:import_members_csv`
  - Syncs imported members into the new identity layer.
  - Makes import-touched rows explicit instead of hidden cleanup.
- `app/routers/imports.py:import_bookings_csv`
  - Resolves booking identity context.
  - Emits unresolved pricing exceptions.
  - Links imported bookings into the identity layer.
- `app/routers/cashbook.py:get_close_status`
  - Exposes blocking exception count on `revenue_integrity_close`.
- `app/routers/cashbook.py:close_day`
  - Hard-blocks close when open `revenue_integrity_close` exceptions exist.
  - Hard-blocks close when unresolved blocked settlement rows still exist.
- `app/routers/admin.py:update_booking_status`
- `app/routers/admin.py:update_booking_payment_method`
- `app/routers/admin.py:update_booking_account_code`
- `app/routers/admin.py:batch_update_bookings`
- `app/routers/admin.py:update_player_price`
- `app/routers/admin.py:update_booking_price`
  - Booking mutation paths now re-enter booking integrity sync.
  - Paid-state and linkage drift now reopen standardized exceptions instead of staying hidden.
- `app/routers/admin.py:_create_weather_notifications`
  - Targeted weather prompts now skip untrusted contacts and emit `communication_target_untrusted`.
- `app/services/club_communications_service.py:create_club_communication`
- `app/services/club_communications_service.py:update_club_communication`
  - Publishing to `members` or `all` now blocks when open `communications_publish` exceptions exist.
- `app/people.py`
  - User/member person sync now also syncs into global identity + club relationship state.
- `app/services/operational_alerts_service.py`
  - Surfaces identity and revenue-integrity blockers into operational alerts.

## Partial Coverage

- `app/services/club_members_service.py`
  - Exposes club relationship payloads and timing metrics.
  - Still behaves as a people workflow, not an exception-owned repair queue.

- `app/services/golf_day_bookings_service.py:create_golf_day_booking_payload`
- `app/services/golf_day_bookings_service.py:update_golf_day_booking_payload`
  - Golf-day settlement now opens and resolves `revenue_integrity_close` blockers when account linkage is untrusted.
- `app/services/account_customers_service.py:create_account_customer_payload`
- `app/services/account_customers_service.py:update_account_customer_payload`
  - Account-customer mutations now reopen or resolve linked booking/golf-day integrity blockers.
- `app/routers/tee.py:move_booking`
  - Tee moves now re-enter booking integrity sync instead of carrying stale trust state.
- `app/services/pro_shop_service.py:create_pro_shop_sale_payload`
  - Pro-shop account sales now open `revenue_integrity_close` blockers when they cannot be trusted to one active account customer.
- `app/routers/profile.py:update_my_profile`
  - Player profile updates now emit `profile_readiness_unresolved` and communication-trust blockers when member-state assumptions are still unsafe for upcoming bookings.
- `app/routers/profile.py:get_my_profile`
- `frontend/player.js`
  - Player readiness is now server-owned and rendered from exception-backed readiness payloads instead of frontend-only checklist guesses.
- `app/services/people_repair_queue_service.py`
- `app/routers/admin.py:get_member_repair_queue`
  - Identity/profile blockers now roll up into an owned people repair queue instead of only existing as raw exception rows.

## Still Bypassing Exception Law
- `frontend/js/admin/members-panel.js`
  - Queue now exists, but the people repair surface is still shallow and does not yet offer direct in-queue repair actions.

## Highest-Risk Gaps

1. `people repair actions`
   - Risk: the queue exists, but operators still need deeper direct repair actions instead of route-jumping into full records.
   - Why it matters: surfaced blockers without the shortest fix path still waste staff time.

2. `pro-shop repair path`
   - Risk: account-sale blockers now exist, but there is still no dedicated UI path to resolve them quickly.
   - Why it matters: enforced law without an obvious fix path creates operator friction.

3. `admin-side readiness repair`
   - Risk: player readiness is now visible, but admin-side repair still route-jumps instead of offering the shortest corrective action.
   - Why it matters: blockers are visible, but club operators still pay extra navigation cost to clear them.

## Next Enforcement Order

1. Add direct repair actions to the people queue for member linkage, contact trust, and profile readiness.
2. Add a fast repair path for pro-shop account-sale blockers and stock/cash-up anomalies.
3. Add direct admin repair actions for the player readiness queue instead of forcing full-record navigation for every fix.

## Do Not Pretend

The product now has a real foundation layer. It does not yet have full exception law coverage.

Anything that changes booking truth, revenue linkage, or communication targeting and does not open or resolve an operational exception is still outside the law.
