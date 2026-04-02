# GreenLink - Master System File

## 1. System Definition

GreenLink is a club-scoped golf operations platform built for real club execution.

It is not:
- self-serve SaaS
- a generic admin template
- a theming product
- a frontend-led system

It is:
- implementation-led
- backend-truth driven
- deterministic
- operationally focused
- built around club rollout, club execution, and controlled expansion

## 2. Non-Negotiable Rules

- Backend owns logic.
- Frontend sends intent only.
- No duplicated business rules across layers.
- No hidden side effects.
- No domain mixing.
- Club-scoped truth must stay in shared models and services, not page-local state.
- Narrow slices are preferred over broad rebuilds.
- Existing benchmark HTML files and GreenLink design references are the UI authority.

## 3. Product Operating Model

GreenLink has three distinct operating contexts:

- Superadmin
  - implementation
  - onboarding
  - rollout control
  - club readiness
- Club admin and staff
  - live club operations
  - finance, members, tee sheet, orders, comms, reporting
- Player
  - lightweight member-facing actions

Superadmin is not "admin with more buttons". It is a separate operational mode.

## 4. Current System State

### Platform and auth
- FastAPI backend with PostgreSQL runtime
- JWT access tokens plus refresh-token rotation
- `/api/session/bootstrap` is the frontend source of truth
- club-scoped tenancy is enforced through auth plus selected-club resolution
- seeded deterministic users exist for superadmin, admin, staff, and member

### Identity
- User -> Person -> ClubMembership model is in place
- AccountCustomer exists as finance identity
- people directory, membership, account-customer, and bulk-intake foundations are implemented

### Rules and pricing
- booking rule-set and pricing-matrix backend foundations are implemented
- admin golf settings page exists, but it is still structurally older than the normalized admin workspaces

### Golf operations
- tee sheet read model exists
- booking aggregate exists
- lifecycle exists:
  - reserved
  - cancelled
  - checked_in
  - completed
  - no_show
- admin tee-sheet page is live for viewing and lifecycle actions
- booking creation backend exists, but a full booking-creation UI flow is still missing

### Finance
- FinanceAccount and append-only FinanceTransaction are implemented
- ledger and journal views derive from transactions
- manual transactions, order charge posting, settlement recording, and member-account POS posting exist
- canonical export batches are implemented
- accounting export profile mapping is implemented above the canonical batch layer

### Orders and POS
- player ordering is live at `/player/order`
- admin order queue is live at `/admin/orders`
- order lifecycle is implemented:
  - placed -> preparing -> ready -> collected
  - placed -> cancelled
- explicit charge posting and settlement recording exist
- POS transaction foundation exists
- POS terminal is live at `/admin/pos-terminal`

### Communications
- admin news-post CRUD exists
- published posts are available to player-facing read flows
- player home now reads backend news posts instead of a static updates block

### Superadmin onboarding
- distinct superadmin shell and route exist
- club registry exists
- club creation exists
- onboarding state and current step are persisted on club data
- onboarding workspace exists with steps:
  - Basic Info
  - Finance
  - Rules
  - Modules
- finance step links to existing accounting profiles
- club admin and staff assignment is wired through existing membership models

## 5. Current Route Surface

### Admin
- `/admin/dashboard`
- `/admin/golf/tee-sheet`
- `/admin/golf/settings`
- `/admin/orders`
- `/admin/members`
- `/admin/finance`
- `/admin/communications`
- `/admin/halfway`
- `/admin/pro-shop`
- `/admin/reports`
- `/admin/pos-terminal`

### Superadmin
- `/superadmin/clubs`

### Player
- `/player/home`
- `/player/order`

Routes not yet implemented despite earlier planning expectations:
- `/player/book`
- `/player/profile`

## 6. UI and Layout Authority

Primary visual references:
- `frontend/src/ui-benchmarks/`
- `frontend/src/design-system/greenlink-design-system.md`

Layout rules:
- persistent sidebar and topbar shells
- workspace-level title row plus KPI band where appropriate
- tonal layering over border-heavy framing
- whitespace-driven structure
- Finance page remains the admin KPI and rail reference

Admin workspace normalization is implemented across the main menu surfaces.
POS terminal remains intentionally standalone.

## 7. Finance Export Architecture

Canonical export layer:
- persisted FinanceExportBatch
- deterministic `journal_basic` profile
- date-range batch generation
- preview, download, history, and void workflow
- idempotent generate-or-return-existing behavior

Mapped export layer:
- persisted club-scoped AccountingExportProfile
- mapping config stored separately from canonical batches
- transformed `generic_journal_mapped` output generated from canonical batch payloads
- deterministic preview and download workflow

GreenLink remains the operational source system.
It does not replace external accounting software and does not yet perform live external API sync.

## 8. Superadmin Onboarding Architecture

Superadmin onboarding writes into the same club and club-config structures used by live club operations.

This means:
- no parallel onboarding-only config store
- finance profile linkage writes to real club config
- club assignments write to real club memberships
- rules and module readiness read from real system data

## 9. Known Gaps

- tee sheet still lacks full booking creation and editing UX
- golf settings page remains visually and structurally behind the normalized admin workspaces
- finance export currently uses canonical and mapped CSV output only; no external package-specific validation or transport exists yet
- reports remain largely frontend-derived summaries rather than a dedicated reporting backend
- player app is still partial
- POS member-account flow remains intentionally constrained
- communications admin UI is live, but editing depth remains narrow
- superadmin onboarding rules and modules steps are readiness scaffolds, not full configuration UIs

## 10. Known Risks

- login page still hard-navigates superadmin users to `/admin/select-club` before protected-route correction redirects to `/superadmin/clubs`
- local development can drift if frontend API base and backend CORS origins are mismatched between `localhost` and `127.0.0.1`
- dashboard and reports still compute some operational summaries in frontend code
- several older docs and comments can drift if not updated alongside shipping slices

## 11. Current Reference Validation

Recent full application validation before this documentation update:
- frontend typecheck passed
- frontend tests passed
- backend tests passed

The authoritative runtime and planning references from this point are:
- this file
- `docs/architecture/current-system-status.md`
- `docs/contracts/`
- `docs/runbooks/local-development.md`

## 12. Final Rule

If older planning notes, stale summaries, or previous handoff text contradict current code:

- current code wins
- this file should be updated to match that code
