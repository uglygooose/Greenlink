# GreenLink UI Rules

- This project uses a fixed visual system.
- Benchmark files in `docs/design-benchmarks/` are the visual source of truth.
- The GreenLink codebase is the functional source of truth.
- Never redesign UI.
- Never remove existing features.
- Never break routes or logic.
- Always preserve handlers, hooks, API calls, forms, validation, filters, sorting, pagination, loading states, empty states, and error states.
- Adapt presentation only.

## Benchmark Mapping

- Dashboard -> `dashcode.html`
- Finance -> `fincode.html`
- Communications -> `comcode.html`
- Pro Shop -> `PScode.html`
- Tee sheet -> `tscode.html`
- Mobile -> `mobcode.html`

## Extension Rule

- GreenLink-specific pages with no direct benchmark must inherit the same shell, tokens, spacing, typography, surface hierarchy, card language, status-pill language, and action hierarchy.
- If no direct benchmark exists, adapt the nearest benchmark family.
- No second visual system is allowed.

## Navigation Rule

- Do not change URL structure, routing behavior, navigation architecture, entry-point flow, or new-tab behavior during the benchmark pass.

## Branding Rule

- No per-club themes.
- No color customization.
- No layout customization.
- Superadmin may only upload club logo.

## Safety Rule

- Same app, new skin.
- When visual purity conflicts with functional safety, preserve functionality.
