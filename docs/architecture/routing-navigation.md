# Routing & Navigation Architecture

GreenLink keeps routing shell-first and workspace-scoped.

- Shell routing stays persistent.
- Only the content area changes within the active workspace.
- Admin and player routes remain separated by role shell.
- Club selection and landing resolution remain owned by the session bootstrap contract.

## Landing Paths

- `club_admin` and `club_staff` land on `/admin/dashboard`
- `member` lands on `/player/home`
- `superadmin` without a selected club lands on `/admin/select-club`

## Admin Workspace Routes

- `/admin/dashboard`
- `/admin/golf/tee-sheet`
- `/admin/golf/settings`
- `/admin/orders`
- `/admin/finance`
- `/admin/communications`
- `/admin/pos-terminal`
- `/admin/select-club`

`/admin/orders` is the intended staff/admin operational route for the order queue.

## Player Workspace Routes

- `/player/home`
- `/player/order`

`/player/order` is the intended player route for minimal halfway-house and clubhouse order placement.

## Navigation Notes

- Tee-sheet, orders, finance, and player ordering are separate operational surfaces.
- Route additions must preserve the persistent shell and avoid modal-style navigation ownership.
- Backend session bootstrap remains the source of truth for shell and landing-path resolution.
