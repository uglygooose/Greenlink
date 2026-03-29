# Phase 2: People + Identity + Club Relationship Foundation

## Scope

Phase 2 adds the first real GreenLink business domain:

- canonical global `Person`
- club-local `ClubMembership`
- explicit `User` to `Person` linkage
- club-scoped `AccountCustomer`
- integrity and readiness evaluation
- bulk-intake-ready preview/process foundations
- `/api/people/*` API surface

This phase does not add golf, bookings, check-in, scoring, pricing, finance workflows, POS, communications, imports UI, dashboards, or benchmark UI.

## Core Model Decisions

### `Person` is global

`Person` is now the canonical human identity record across the platform. It stores:

- legal/display name fields
- normalized email
- normalized phone
- optional demographics and external references
- metadata for future onboarding/import pipelines

`Person` is intentionally free of golf-specific, booking-specific, and finance-specific behavior.

### `ClubMembership` is club-local

`ClubMembership` now belongs to `Person`, not directly to `User`.

It carries:

- `person_id`
- `club_id`
- club-local `role`
- club-local `status`
- `joined_at`
- `is_primary`
- `membership_number`
- `membership_metadata`

This makes one person able to participate in multiple clubs without duplicating the global identity record.

### `User` is optional login identity

`User` remains the authenticated platform account, but it is no longer the source of club identity.

- a `User` may link to one `Person`
- a `Person` does not need to be a `User`
- club records can exist before credentials are issued

Phase 1 tenancy, bootstrap, and role resolution now resolve club relationships through `User -> Person -> ClubMembership`.

### `AccountCustomer` is finance-adjacent groundwork only

`AccountCustomer` is a club-scoped identifier that links a `Person` to a future finance/customer account surface.

Phase 2 supports:

- `club_id`
- `person_id`
- unique `account_code` inside a club
- active posture
- optional billing contact overrides

No finance workflows or ledger behavior exist in this phase.

## Integrity Foundation

Phase 2 introduces structured identity evaluation instead of ad hoc booleans or strings.

The integrity/readiness layer evaluates:

- duplicate risk by normalized email
- duplicate risk by normalized phone
- missing contact data
- incomplete person profile
- membership readiness for club participation
- account-customer readiness for future billing use

Outputs are explicit and structured:

- readiness status: `ready`, `warning`, `blocked`
- warnings
- blockers
- duplicate candidates
- exception-like issue records with scope and severity

No persistent repair queue or large exception subsystem was added yet.

## Authorization

People-domain authorization is intentionally narrower than raw club access:

- `superadmin`: platform-wide read/write and cross-club operations
- `club_admin`: manage people, memberships, account-customer records, and bulk intake in the selected club
- `club_staff`: read people in the selected club and run bulk-intake preview only
- `member`: no people-management API access

Selected-club validation remains centralized in the tenancy layer from Phase 1.

For club-scoped people routes, the selected club must be explicit in the request even if the user only has one active membership. This keeps bulk intake, membership management, and person access deterministic at the API boundary.

## Bulk Intake Foundation

Phase 2 does not build the import feature. It builds the domain contract that imports will use later.

The bulk-intake service accepts rows for an explicit target club and classifies them into deterministic outcomes:

- `create_person_create_membership`
- `match_existing_create_membership`
- `match_existing_update_membership`
- `reject_row`
- `warning_only`

This keeps future CSV uploads and onboarding automation out of the UI layer and inside explicit backend domain logic.
