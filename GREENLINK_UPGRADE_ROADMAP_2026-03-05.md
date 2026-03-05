# GreenLink Upgrade Roadmap (Execution of 7-Point Plan)

## 1) Competitor benchmark + standards

- Completed and documented in `COMPETITOR_BENCHMARK_2026-03-05.md`.
- Baseline translated into GreenLink ownership/click/trust targets.

## 2) Full UI-action-endpoint audit

- Completed and documented in `GREENLINK_FULL_AUDIT_2026-03-05.md`.
- Static coverage checks run across admin/player/frontend/backend wiring.

## 3) Gap matrix and target UX model

- Completed (P0/P1/P2 matrix inside full audit doc).
- Ownership model now explicit: Tee Sheet != People != Operations Config.

## 4) P0 implementation (done)

- Weather risk reliability and messaging hardening.
- Misplaced member import action removed from Tee Sheet.
- Member import entrypoint placed in People tools.

## 5) P1 implementation (done)

- Added direct cross-page shortcuts for frequent workflows:
  - Bookings -> Tee Sheet
  - Revenue -> Import Setup
  - Operations Config -> Revenue / People
- Added explicit sidebar and quick-nav access for imported operation pages.

## 6) Verification

- `node --check frontend/admin.js`
- `python -m py_compile app/weather_alerts.py app/routers/admin.py`
- Static audits run for:
  - nav -> section mapping
  - data-action -> handler mapping
  - onclick function existence
  - frontend API usage -> backend route coverage
  - player view map coverage

## 7) Delivery artifacts

- `COMPETITOR_BENCHMARK_2026-03-05.md`
- `GREENLINK_FULL_AUDIT_2026-03-05.md`
- `GREENLINK_UPGRADE_ROADMAP_2026-03-05.md`

## Open items for next wave

- Full visual spacing/density redesign pass per page.
- End-to-end task timing benchmarks (click/time to complete).
- CI guardrails for UI ownership regressions.
