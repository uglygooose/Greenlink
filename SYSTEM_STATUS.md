# GreenLink System Status

Last updated: 2026-04-03 18:45 SAST

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
- Live: tee-sheet read model, booking lifecycle, admin tee-sheet route inside router-owned persistent admin shell
- Not built: booking creation/editing UX

## FIN Status

- Status: Partial
- Live: accounts, journal, ledger, revenue summary, outstanding summary, transaction-volume summary, canonical export batches, accounting export profile mapping
- Backend now returns pre-computed pct fields on each summary item (`revenue_share_pct`, `volume_share_pct`, `accounts_*_pct`); `AdminReportsPage` consumes these directly and no client-side finance math remains
- Not built: external sync, reconciliation, package-specific export validation

## Orders and POS Status

- Status: Partial
- Live: player ordering, admin order queue, charge posting, settlement recording, POS terminal
- POS terminal is inside the router-owned AdminLayout; no standalone nav chrome
- Not built: member account checkout in POS

## SA Status

- Status: Partial
- Live: superadmin route group, persistent shell, club registry, club creation, onboarding workspace (Basic Info, Finance, Rules, Modules)
- Live: backend-owned onboarding progression; frontend sends intent only
- Live: overview page at `/superadmin/overview` with fleet KPIs, finance/team readiness bars, needs-attention list, and clubs table
- Live: club pause/reactivate (`PATCH /clubs/{id}/status`) and club delete (`DELETE /clubs/{id}`, blocked for live clubs)
- Live: overview and clubs actions carry a concrete `clubId` route selection into the registry
- Live: superadmin can hand off into club-scoped admin workspaces (`/admin/finance`, `/admin/golf/settings`, `/admin/dashboard`) after selecting a club
- Default redirect is `/superadmin/overview`; sidebar has two real nav items (Overview, Clubs)
- Not built: full Rules and Modules configuration, invitation/provisioning flow

## Player Status

- Status: Partial
- Live: player home, player ordering, club updates news feed
- No fake upcoming bookings; honest empty state until a backend member-booking read model exists
- Not built: booking read model, booking flow, profile flow

## Known Constraints

- Backend owns logic.
- Frontend sends intent only.
- No finance math in React. All chart widths and KPIs come from backend pct/summary fields.
- Tee sheet remains a read model.
- Orders remain distinct from payments.
- Admin and superadmin shells must remain router-owned persistent layouts.
- Benchmark UI references remain the visual authority.

## Known Risks

- No player member-booking read model exists yet; player-home bookings remain empty state.
- Non-finance reporting visuals (order status, member breakdown) still compose charts from backend records in the frontend; a dedicated reporting aggregation slice does not exist yet.

## Latest Validation

- `frontend`: `npm.cmd run typecheck` - clean
- `frontend`: targeted Vitest suites for persistent shells, route protection, finance pages, player home, and superadmin onboarding
- `backend`: `py -m uv run pytest -q` - full suite
- `backend`: `py -m uv run ruff check .` - passes (pre-existing E501 in superadmin service)
