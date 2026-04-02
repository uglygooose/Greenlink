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
- Superadmin: may authenticate without a club and resolves to the dedicated superadmin shell without club selection.
- `available_clubs` can include non-active memberships for visibility, but only active memberships are selectable.
- Superadmin sees active clubs platform-wide for preview/select behavior.

## Landing rules

- `club_admin` and `club_staff` resolve to `/admin/dashboard`.
- `member` resolves to `/player/home`.
- `superadmin` resolves to `/superadmin/clubs`.

## Notes

- `selected_club` remains nullable for superadmin because the superadmin workspace is not club-scoped in the same way as admin and player shells.
- Superadmin may still inspect and set selected club context for cross-workspace preview flows, but club selection is not required to bootstrap the shell.

## Related auth routes

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
