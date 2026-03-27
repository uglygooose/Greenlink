# GreenLink Benchmark Rules

## Source Of Truth

- Visual truth lives in the benchmark files in this folder.
- Functional truth lives in the current GreenLink application code.

## Core Constraint

- This is a presentation-only adaptation.
- Preserve routes, handlers, hooks, API calls, forms, validation, filtering, sorting, pagination, loading states, empty states, and error states.
- Do not remove features because a benchmark does not show them.

## Family Mapping

- Dashboard surfaces use `dashcode.html`.
- Finance and reporting surfaces use `fincode.html`.
- Communications surfaces use `comcode.html`.
- Pro shop surfaces use `PScode.html`.
- Tee sheet and dense operational golf surfaces use `tscode.html`.
- Player and mobile surfaces use `mobcode.html`.

## Family Extension

- Non-benchmark or GreenLink-specific pages must inherit the same shell, tokens, spacing, typography, surface hierarchy, card language, status-pill language, and action hierarchy.
- If no direct benchmark exists, adapt the nearest benchmark family.
- No second visual system is allowed.

## Navigation And Routing

- Do not change URL structure.
- Do not change routing behavior.
- Do not change navigation architecture.
- Do not change entry-point flow or new-tab behavior.

## Branding

- No per-club theme customization.
- No per-club color customization.
- No per-club layout customization.
- Club logo support stays available.

## Product Principle

- GreenLink should feel calm, precise, modern, and operationally efficient.
- Use tonal layering, whitespace, glass headers, restrained green, and one unified design language across admin and player surfaces.
- Same app, new skin.
