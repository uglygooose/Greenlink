# People And Membership Contract

## Canonical Objects

### Person

`Person` is the platform-wide identity object.

Fields implemented in Phase 2:

- `id`
- `first_name`
- `last_name`
- `full_name`
- `email`
- `phone`
- `date_of_birth`
- `gender`
- `external_ref`
- `notes`
- `profile_metadata`
- timestamps

Normalization rules:

- emails are stored lowercase
- phone normalization is used for matching and duplicate detection
- `full_name` is stored consistently from first and last name inputs

### ClubMembership

`ClubMembership` is the club-local relationship surface.

Fields implemented in Phase 2:

- `id`
- `person_id`
- `club_id`
- `role`
- `status`
- `joined_at`
- `is_primary`
- `membership_number`
- `membership_metadata`

Role vocabulary:

- `club_admin`
- `club_staff`
- `member`

Status vocabulary:

- `active`
- `invited`
- `suspended`
- `inactive`

### User Linkage

`User` is optional login identity and may link to `Person` through `user.person_id`.

Implications:

- people can exist without credentials
- membership records do not require a `User`
- tenancy for authenticated users is resolved through the linked person’s memberships
- platform-level membership assignment is person-based, not user-based

### AccountCustomer

`AccountCustomer` is club-scoped and linked to `Person`.

Phase 2 fields:

- `id`
- `club_id`
- `person_id`
- `account_code`
- `active`
- `billing_email`
- `billing_phone`
- `billing_metadata`

## API Surface

Routes added in Phase 2:

- `GET /api/people`
- `POST /api/people`
- `GET /api/people/club-directory`
- `GET /api/people/{person_id}`
- `PATCH /api/people/{person_id}`
- `GET /api/people/{person_id}/memberships`
- `GET /api/people/{person_id}/integrity`
- `POST /api/people/memberships`
- `PATCH /api/people/memberships/{membership_id}`
- `POST /api/people/account-customers`
- `POST /api/people/bulk-intake/preview`
- `POST /api/people/bulk-intake/process`

## Selected Club Rules

Club-scoped people routes use the existing Phase 1 selected-club contract:

- `selected_club_id` query parameter
- or `X-Club-Id` header

Validation is still performed only by the tenancy layer.

Club-scoped Phase 2 people routes require an explicit selected club in the request, even for single-membership users.

Examples:

- club directory lookup
- membership create or update
- account-customer create
- bulk-intake preview and process

## Readiness And Integrity Contract

`GET /api/people/{person_id}/integrity` returns:

- the person summary
- duplicate candidates
- profile readiness
- membership readiness entries
- account-customer readiness entries
- structured issues/exceptions

Readiness status values:

- `ready`
- `warning`
- `blocked`

Issue scopes:

- `person`
- `membership`
- `account_customer`

Issue severities:

- `warning`
- `blocker`
