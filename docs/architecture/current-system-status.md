# GreenLink Current System Status

Last updated: 2026-04-02

## 1. Executive Summary

GreenLink is now a functioning club-scoped operations platform with real backend foundations across auth, identity, bookings, finance, orders, POS, communications, and superadmin onboarding. The project is no longer in a foundation-only state.

The current shape of the product is:
- strong backend domain coverage
- partially complete frontend coverage
- normalized admin workspace framework across most live admin pages
- new finance export and accounting profile mapping foundation
- new superadmin onboarding foundation

The main missing work is no longer "build the system". The main missing work is completing the unfinished operational and onboarding surfaces on top of the existing backend truth.

## 2. Backend Status

### 2.1 Platform, auth, and tenancy

Working:
- access-token and refresh-token auth
- session bootstrap contract
- selected-club resolution
- club-scoped API behavior
- superadmin shell resolution without required club selection

Key files:
- `backend/app/api/routes/auth.py`
- `backend/app/api/routes/session.py`
- `backend/app/services/auth_service.py`
- `backend/app/services/session_bootstrap_service.py`
- `backend/app/tenancy/service.py`

Notes:
- superadmin now resolves to `/superadmin/clubs`
- non-superadmin club access still depends on membership and selected-club context

### 2.2 Identity and people

Working:
- people directory
- membership upsert/update
- account-customer creation
- bulk-intake preview/process
- integrity evaluation

Strength:
- the core identity split of User, Person, and ClubMembership is correct and reusable across admin, player, and superadmin flows

Missing or partial:
- richer onboarding/invitation flows for creating or inviting new operator users are not yet implemented in superadmin onboarding

### 2.3 Golf operations

Working:
- tee-sheet read model
- booking lifecycle
- tee-sheet mutations for live operational states
- rule-set and pricing-matrix backend support

Missing or partial:
- no complete booking-creation UI in admin
- no player booking flow
- golf settings UI is still older than the rest of the normalized admin shell surfaces

### 2.4 Finance

Working:
- append-only FinanceTransaction model
- account summary and ledger derivation
- journal view
- manual finance posting
- order charge posting
- order settlement recording
- canonical export batches
- accounting export profile mapping

Strength:
- finance export now has the correct layered structure:
  - canonical source batches
  - mapped profile layer above canonical batches

Missing or partial:
- no package-specific Pastel/Sage validation layer yet
- no reconciliation engine
- no external sync/push integration
- some finance dashboarding is still UI-level composition rather than dedicated backend read models

### 2.5 Orders

Working:
- player ordering
- admin order queue
- operational lifecycle
- explicit charge posting
- explicit settlement recording

Missing or partial:
- player menu remains driven by backend static configuration rather than a club-managed menu/catalog model

### 2.6 POS

Working:
- POS product read model
- POS transaction creation
- backend ownership of price/name resolution from product identity
- inactive product protections

Missing or partial:
- full inventory movement logic does not exist
- member-account checkout remains intentionally constrained until a cleaner member lookup flow is introduced

### 2.7 Communications

Working:
- admin CRUD for news posts
- published member-facing read feed
- player-home integration for live posts

Missing or partial:
- editing depth is still limited
- broader messaging or campaign tooling does not exist and is intentionally out of scope

### 2.8 Superadmin onboarding

Working:
- superadmin-specific route group
- club creation
- club registry
- onboarding state
- onboarding current step
- finance linkage
- role assignment for club admin and staff

Strength:
- onboarding writes into the real club environment instead of a duplicate configuration system

Missing or partial:
- rules step is readiness-only
- modules step is readiness-only
- no invitation or user-provisioning workflow
- no broader system-health, billing, or global settings implementation beyond shell placeholders

## 3. Frontend Status

### 3.1 Admin surfaces

Working well:
- Dashboard
- Tee Sheet
- Members
- Finance
- Halfway
- Pro Shop
- Communications
- Reports

These surfaces now share a more consistent workspace anatomy:
- persistent shell
- title/date row
- KPI summary band
- main content area

Partial:
- Golf Settings is still visually older and not fully aligned with the normalized workspace system
- Orders is functional but still sits slightly outside the full normalized pattern
- POS terminal is intentionally separate

### 3.2 Finance frontend

Working:
- canonical export batch generation
- batch history
- preview
- download
- void flow
- accounting profile create/update
- mapped export preview/download

Strength:
- the page now reflects real workflow instead of placeholder buttons

### 3.3 Superadmin frontend

Working:
- distinct shell
- club registry panel
- create-club drawer
- step container
- step navigation
- finance linkage UI
- assignment search and role assignment

Missing or partial:
- non-club pages in superadmin sidebar are placeholders
- rules and modules are scaffolds rather than complete configuration steps

### 3.4 Player frontend

Working:
- player home
- player order
- news posts on player home

Missing or partial:
- bookings on player home remain incomplete
- no player booking route
- no player profile route

## 4. What Is Working Reliably

- auth, refresh, logout, and bootstrap
- club-scoped access control
- admin shell and most admin workspaces
- finance account and transaction foundations
- export batches and profile-based mapped exports
- order queue plus finance linkage
- communications publishing and player feed
- superadmin club onboarding foundation

## 5. What Is Missing

- tee-sheet booking creation UX
- player booking and profile flows
- rules/modules onboarding completion
- package-specific accounting validation layer
- full inventory/accounting crossover
- richer superadmin user provisioning
- stronger reporting backend read models

## 6. Key Risks and Technical Debt

### 6.1 Flow correctness
- login page still navigates superadmins to `/admin/select-club` before the protected route corrects to `/superadmin/clubs`

### 6.2 Local runtime drift
- frontend API base URL and backend CORS allowed origins can drift between `localhost` and `127.0.0.1`

### 6.3 UI/data boundary softness
- dashboard and reports still compute some summaries in frontend code

### 6.4 Surface inconsistency
- golf settings remains behind the current shell system
- POS remains intentionally separate, which is acceptable but should remain a conscious exception

### 6.5 Documentation drift
- old docs can become misleading quickly unless kept aligned with routes and shipped features

## 7. Recommended Immediate Planning Frame

The strongest next planning options from this state are:

1. Tee-sheet completion
- admin booking creation and editing workflow
- better operational throughput on the most core golf surface

2. Superadmin onboarding completion
- make rules and modules steps real against existing backend data
- finish the implementation-led rollout model

3. Finance external-shape validation
- add sample external journal template validation above mapped exports
- keep finance progression narrow and architecture-safe

## 8. Reference Files

Use these as the current in-repo reference set:

- `docs/MASTER_SYSTEM.md`
- `docs/contracts/session-bootstrap.md`
- `docs/runbooks/local-development.md`
- `frontend/src/design-system/greenlink-design-system.md`
- `frontend/src/ui-benchmarks/`

This file should be updated whenever a meaningful slice changes route truth, workflow truth, or domain boundaries.
