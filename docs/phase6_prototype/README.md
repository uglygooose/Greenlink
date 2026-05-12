# Phase 6 prototype — Claude Design deliverable

Date received: 2026-05-12
Source: Claude Design (Anthropic Claude Code design integration)
Status: Reference only. The live frontend is implemented in Phase 7 against this prototype.

## Approved defaults
- Display serif: Newsreader
- Workhorse sans: Manrope
- Density: default
- Theme: light (dark mode tokens defined; not surfaced as a user toggle in v1)

## What's in here
- GreenLink Phase 6.html — entry point. Open in a browser to view.
- tokens.css — design system tokens. The contract Phase 7 ports into frontend/src/styles/.
- system.jsx — shared primitives (Icon, Wordmark, Swatch, StateChip, Avatar, PinFlag).
- components.jsx — component primitives (Button, Input, Card, Badge, Table).
- foundation.jsx — reference boards (palette, type, motion). Not implemented as live routes.
- surfaces.jsx — six surfaces (login, admin shell + dashboard, settings hub, onboarding welcome, POPIA, completion).
- design-canvas.jsx — prototype's stacked-canvas layout.
- app.jsx — composition + TWEAK_DEFAULTS.
- tweaks-panel.jsx — runtime typeface/density/theme switcher.
- uploads/ — reference imagery.
- chats/ — full transcripts of the Claude Design conversation that produced this prototype. Reference for understanding why specific design decisions were made (palette choices, typography selection, permission-system framing). Useful during Phase 8 (USP surfaces) and Phase 11 (player surfaces) if Phase 6 decisions need re-examining.

## Tweaks panel
The runtime panel that switches typeface / density / theme is design-tool only. The live frontend ships with the locked defaults above. Do not implement the panel in production.

## Relationship to Phase 7
Phase 7 implements this prototype in frontend/src/. The files here are read-only reference. If the design needs to evolve, that happens in a new Claude Design phase (Phase 8 for USP surfaces, Phase 11 for player + supporting surfaces).
