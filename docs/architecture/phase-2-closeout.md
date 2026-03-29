# Phase 2 Closeout

## Delivered

Phase 2 closed the people and identity foundation with:

- canonical global `Person`
- person-based `ClubMembership`
- optional explicit `User -> Person` linkage
- club-scoped `AccountCustomer`
- integrity and readiness evaluation
- bulk-intake preview/process foundations
- `/api/people/*` routes with role and tenancy enforcement

## Validated

The closeout pass verified:

- `Person` is the identity root for club participation
- `ClubMembership` is person-based in models, services, routes, tests, and docs
- selected-club enforcement for people APIs stays centralized in tenancy
- club-scoped people routes require explicit selected club context
- `club_staff` access remains limited
- `member` access is denied
- bulk-intake outcomes are deterministic and scoped to people/membership/account-customer behavior only

## Corrected During Closeout

- removed the remaining platform membership assignment path that still accepted `user_id`
- tightened tenancy so club-scoped people routes require explicit selected club context
- added closeout tests for missing selected club, cross-club denial, and club-staff bulk-intake limits
- aligned Phase 2 docs with the implemented API behavior

## Still Out Of Scope

Phase 2 still does not include:

- golf operations
- bookings or tee sheet
- check-in or scoring
- pricing rules
- finance workflows
- POS
- communications workflows
- imports UI or CSV upload UX
- dashboards or benchmark UI

## Readiness

Phase 2 is ready to commit and ready to support Phase 3 planning on top of a person-centered identity foundation.
