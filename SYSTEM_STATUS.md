# GreenLink System Status

Last updated: 2026-04-03 11:23 SAST

## Canonical Snapshot Role

This file is the canonical current snapshot of actual repo state.

## Current Phase State

- Platform/auth/identity: Completed
- Core club operations: Partial
- Finance: Partial
- Superadmin: Partial
- Player: Partial

## TS Status

- Status: Partial
- Live: tee-sheet read model, booking lifecycle, admin tee-sheet route
- Not built: booking creation/editing UX
- Recently fixed: admin tee-sheet now runs under the persistent router-owned admin shell

## FIN Status

- Status: Partial
- Live: accounts, journal, ledger, revenue summary, outstanding summary, transaction-volume summary, canonical export batches, accounting export profile mapping
- Recently fixed:
  - admin finance KPI surfaces now use backend summary endpoints only
  - dashboard, finance, reports, members, and halfway no longer compute finance KPIs in React
  - unsupported finance visuals were removed rather than reimplemented client-side
- Not built: external sync, reconciliation, package-specific export validation

## SA Status

- Status: Partial
- Live: superadmin route group, persistent shell, club registry, club creation, onboarding workspace
- Recently fixed:
  - onboarding progression is backend-owned
  - invalid arbitrary step setting is rejected by backend
  - frontend sends onboarding intent only
- Not built: full Rules and Modules configuration, invitation/provisioning flow

## Player Status

- Status: Partial
- Live: player home, player ordering, club updates feed
- Recently fixed: player home no longer shows fake upcoming bookings
- Not built: booking read model, booking flow, profile flow

## Known Constraints

- Backend owns logic.
- Frontend sends intent only.
- Tee sheet remains a read model.
- Orders remain distinct from payments.
- Admin and superadmin shells must remain router-owned persistent layouts.
- Benchmark UI references remain the visual authority.

## Known Risks

- Login still hard-navigates superadmin users to `/admin/select-club` before route protection corrects to `/superadmin/clubs`.
- No player member-booking read model exists yet, so player-home bookings remain an empty state.
- Some non-finance reporting visuals still depend on frontend composition of backend records because a dedicated reporting slice does not exist yet.

## Latest Validation

- `frontend`: `npm.cmd run typecheck`
- `frontend`: targeted Vitest suites for persistent shells, finance pages, player home, and superadmin onboarding
- `backend`: `py -m uv run pytest backend/tests/test_superadmin_onboarding_foundation.py -q`
