# Bulk Intake Foundation Contract

## Purpose

Phase 2 introduces the backend intake contract that later CSV and onboarding workflows will target.

This is not the imports feature.

No file upload UI, parser UI, finance import logic, or operational dashboard flow is part of this phase.

## Request Shape

Endpoints:

- `POST /api/people/bulk-intake/preview`
- `POST /api/people/bulk-intake/process`

The target club is explicit through the selected-club request context.

Phase 2 requires that explicit selected club to be present on bulk-intake requests.

Each row may include:

- source row id
- first name
- last name
- email
- phone
- membership number
- role
- status
- external ref
- notes
- membership metadata
- profile metadata

## Matching Rules

Phase 2 matching is deterministic and explainable:

- normalized email match
- normalized phone match
- ambiguous multi-person matches reject the row
- no hidden fuzzy merge logic

## Outcome Vocabulary

Each row is classified into exactly one action:

- `create_person_create_membership`
- `match_existing_create_membership`
- `match_existing_update_membership`
- `reject_row`
- `warning_only`

The response also carries:

- warnings
- blockers
- duplicate candidates
- matched person id where applicable
- matched membership id where applicable
- explanation text

## Preview vs Process

`preview`:

- classifies rows
- does not persist changes

`process`:

- applies the same classification logic
- persists creates and updates

This keeps later import UX thin and ensures the business rules live in backend services rather than upload handlers or frontend code.

Role policy in Phase 2:

- `superadmin`: preview and process
- `club_admin`: preview and process inside the selected club
- `club_staff`: preview only inside the selected club
- `member`: no bulk-intake access
