- Did this add frontend business logic?
- Did this duplicate logic?
- Did this increase state complexity?
- Did this add files without removing complexity?
- Did this violate backend ownership?
- Did this scatter mutations or invalidation?

For backend extension work (anything in `backend/`):

- Did this preserve existing working flows?

For frontend rebuild work (Phases 7, 10, 12 and equivalent v1.5+ rebuilds, anything in `frontend/src/pages/` or `frontend/src/features/`):

- Is this surface a ground-up rebuild rather than an incremental patch of the existing UI?
- Did old code delete as the new surface landed (no parallel implementations, no `_old` files left behind)?