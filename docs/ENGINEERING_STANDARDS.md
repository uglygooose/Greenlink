GreenLink Engineering Standards
1. Ownership (non-negotiable)

Frontend:

rendering
interaction state
UI-only derived values
optimistic UI only

Frontend must NOT:

implement business rules
implement pricing logic
calculate finance values
validate lifecycle transitions
act as source of truth

Backend owns all domain logic.

2. Page structure

Pages must:

compose hooks + components only

Pages must NOT:

contain business logic
contain large derived calculations
manage all state directly
3. Subtraction rule (MANDATORY)

Before adding or extracting code, you must:

delete duplicate logic
remove dead helpers
remove unused state
remove redundant memoization
remove spec/patch comments

If nothing was removed, the change is wrong.

4. State rules
No duplicated state for same concept
No storing derived values in state
Complex flows → useReducer
Each hook = one workflow
5. Mutations
No duplicated mutation blocks
One pattern per mutation type
Centralized invalidation only
No scattered query invalidation
6. Derived data
Compute once
Do not duplicate across file
Do not compute inside JSX
7. Optimistic updates

Allowed:

UI reflection of backend action

Forbidden:

redefining business logic
recomputing domain truth
8. Components
Presentational only
Receive computed props
No embedded business logic
9. Memoization

Keep only if:

prevents real performance issue

Otherwise:

remove it
10. Comments

Remove:

step-based comments
patch notes
spec residue

Keep only:

invariants
non-obvious reasoning
11. File creation rule

Do NOT create new files unless:

it reduces complexity
it removes duplication
it clarifies ownershi