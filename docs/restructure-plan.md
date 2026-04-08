# GreenLink Admin Restructure Plan

This document is the implementation companion for the admin restructure.

## Summary
- [x] Preserve router-owned persistent admin and superadmin shells.
- [x] Preserve backend-owned logic and current route foundations.
- [x] Reposition admin IA around `Overview`, `Golf`, `People`, `Finance`, `Operations`, `Communications`, and `Club Settings`.
- [x] Keep `Sports` and `Golf > Bookings` deferred until backend truth exists.

## Stop-And-Fix Rule
- [ ] If any validation command fails, fix the issue and re-run that validation before moving to the next milestone.

## Route Mapping
| Route | Proposed place | Action | Status |
|---|---|---|---|
| `/admin/dashboard` | Overview | Keep route, relabel in UI | [x] |
| `/admin/golf/dashboard` | Golf > Dashboard | Add | [x] |
| `/admin/golf/tee-sheet` | Golf > Tee Sheet | Keep | [x] |
| `/admin/golf/settings` | Golf > Settings | Keep | [x] |
| `/admin/people/dashboard` | People > Dashboard | Add | [x] |
| `/admin/members` | People > Members | Keep | [x] |
| `/admin/finance/dashboard` | Finance > Dashboard | Add | [x] |
| `/admin/finance` | Finance > Close Day | Keep route, reframe in UI | [x] |
| `/admin/reports` | Finance > Reports | Keep, regroup | [x] |
| `/admin/halfway` | Operations > Halfway | Keep | [x] |
| `/admin/pro-shop` | Operations > Pro Shop | Keep | [x] |
| `/admin/pos-terminal` | Operations > POS Terminal | Keep | [x] |
| `/admin/orders` | Operations > Order Queue | Keep, secondary access | [x] |
| `/admin/communications` | Communications | Keep | [x] |
| `/admin/settings/club` | Club Settings | Add | [x] |
| `/admin/targets` | Club Settings > Targets | Keep, secondary access | [x] |
| `/admin/golf/bookings` | Golf > Bookings | Defer until backend read model exists | [ ] |
| `/admin/sports/*` | Sports | Defer until backend evolves | [ ] |

## Milestones
- [x] Milestone 1: sidebar/nav restructuring only
- [x] Milestone 2: Overview decision engine using existing backend data only
- [x] Milestone 3: Golf section normalization and revenue-engine structure
- [x] Milestone 4: Finance section reframing including Close Day workflow
- [x] Milestone 5: People section normalization into CRM-lite
- [x] Milestone 6: Operations grouping as unified commerce engine
- [x] Milestone 7: Sports framework definition only
- [x] Milestone 8: Club Settings surface

## Decisions Locked
- [x] `/admin/dashboard` remains the canonical Overview route.
- [x] `/admin/finance` becomes the visible `Close Day` workspace without inventing a backend close command.
- [x] `Orders` and `Targets` remain live but move out of primary sidebar navigation.
- [x] New live admin routes must be present in the backend bootstrap menu contract.
- [x] Sports stays non-live until backend module and route truth exists.
- [x] Golf Bookings stays deferred until a dedicated backend booking-management read model exists.

## Validation Commands
- Frontend typecheck: `npm.cmd run typecheck`
- Frontend lint: `npm.cmd run lint`
- Frontend tests: `npm.cmd run test`
- Backend targeted auth/bootstrap tests: `py -m uv run pytest -q backend/tests/test_auth_and_bootstrap.py`

## Market Competitiveness Layer
- [x] Overview is structured as a decision engine with actionable next steps.
- [x] Golf has a revenue-engine dashboard structure without frontend pricing logic.
- [x] People is framed as CRM-lite with neutral unavailable states for unsupported insights.
- [x] Operations is framed as a unified commerce engine while routes remain separate.
- [x] Close Day is framed as an operational workflow spanning golf, commerce, and finance.
- [x] Sports is defined as a future module framework, not a live placeholder.
- [x] Overview and Golf Dashboard reserve structural space for future automation and AI signals without showing fake data.
