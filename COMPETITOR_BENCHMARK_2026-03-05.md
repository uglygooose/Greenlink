# GreenLink Competitor Benchmark (2026-03-05)

## Scope

This benchmark focuses on direct workflow competitors for private/public golf club operations:

- `Lightspeed Golf`
- `foreUP`
- `Club Caddie`
- `Golfmanager`
- `BRS Golf`
- `HNA / DotGolf context` (player handicap workflow expectations in South Africa)

## Current market baseline (what clubs expect by default)

### 1) Tee sheet + booking operations

Baseline across competitors:

- Fast tee-sheet actions in one place (generate, block, move, check-in, cancel, no-show).
- Online booking control windows and booking rules.
- Clear distinction between tee availability vs booking status vs payment state.
- Operational day controls with minimal clicks for staff.

Observed from:

- foreUP product positioning and golf tee sheet pages.
- Club Caddie "all-in-one" positioning for booking + operations.
- BRS Golf core booking product messaging.

### 2) Revenue + POS + inventory

Baseline across competitors:

- Revenue and POS are split by operation (golf/pro shop/F&B), then rolled up to executive view.
- Pro shop workflows include product catalog, stock levels, low-stock attention, and sales history windows.
- Reporting is expected to be configurable and export-ready.

Observed from:

- Lightspeed Golf support docs (report builder and operational reporting capabilities).
- foreUP product stack (POS + course operations).
- Golfmanager KPI guidance for golf facilities.

### 3) Member and player workflow

Baseline across competitors:

- Member identity, profile quality, and booking friction are tightly linked.
- Player-facing mobile flow prioritizes: book quickly, manage rounds, update profile, respond to prompts.
- Clubs expect messaging loops for confirmations and booking follow-up.

Observed from:

- Club Caddie member-centric platform claims.
- foreUP + BRS booking-led player experience.
- HNA communication trend toward simplified "open round / enter score / follow golfers" flow.

### 4) UX standard baseline

Baseline expected for modern SaaS operations tools:

- Action ownership is explicit (feature appears only where domain responsibility lives).
- Fewer high-friction paths (avoid "hunt" behavior for imports/settings/actions).
- Status and error language is specific and actionable.
- System status updates should use accessible status regions for assistive technology.

Observed from:

- GOV.UK Design System patterns.
- W3C/WAI status-message guidance.

## GreenLink target to stay above baseline

## `A. Action ownership model`

- Tee Sheet: only tee operations.
- People: member/staff lifecycle and member import.
- Operations Config: revenue import mappings/settings.
- Revenue: analytics and drill-down, not import execution.

## `B. Click-efficiency targets`

- Top 5 daily staff tasks in <= 2 interactions from current page:
  - Open tee sheet
  - Open imports setup
  - Import members
  - Open import log
  - Switch operation view

## `C. Trust and resilience targets`

- Weather risk should degrade gracefully:
  - Primary provider -> backup provider -> cached forecast.
  - No false "everything risky" fallback when provider is down.
- Status text must describe *what is unavailable* and *what fallback is active*.

## `D. Information architecture targets`

- Every sidebar item must map to a visible page section.
- Every quick-nav destination must map to a real page and handler.
- No duplicated controls across unrelated domains.

## Sources

- foreUP: https://foreupgolf.com/
- foreUP tee sheet page: https://foreupgolf.com/golf-tee-sheet-software/
- Club Caddie: https://clubcaddie.com/why-club-caddie/
- Lightspeed Golf support: https://golf-support.lightspeedhq.com/hc/en-us/articles/25533668262043-Custom-report-builder
- Golfmanager KPI article: https://www.golfmanager.com/en/blog/golf-club-management-indicators-kpi/
- BRS Golf: https://www.brsgolf.com
- HNA newsletter context: https://www.handicaps.co.za/88243-2/
- GOV.UK Design System: https://design-system.service.gov.uk/
- W3C WAI status messages: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
