# Session Bootstrap Contract

`GET /api/session/bootstrap` is the frontend source of truth.

## Inputs

- Bearer access token.
- Optional `selected_club_id` query param.
- Optional `X-Club-Id` header.

The raw selected club input is validated only by the tenancy service.

## Response

- `user`
- `available_clubs`
- `selected_club_id`
- `selected_club`
- `club_selection_required`
- `role_shell`
- `default_workspace`
- `landing_path`
- `module_flags`
- `permissions`
- `feature_flags`

## Resolution rules

- One active club membership: auto-select it.
- Multiple active club memberships: require explicit selection.
- Zero active club memberships for non-superadmin: return no selected club, no shell, and a `/login` landing path.
- Superadmin: may authenticate without a club, but club-scoped work requires explicit selection.
- `available_clubs` can include non-active memberships for visibility, but only active memberships are selectable.
- Superadmin sees active clubs platform-wide for preview/select behavior.

## Landing rules

- `club_admin` and `club_staff` resolve to `/admin/dashboard`.
- `member` resolves to `/player/home`.
- `superadmin` without a selected club resolves to `/admin/select-club`.

## Related auth routes

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
