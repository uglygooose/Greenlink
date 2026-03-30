# CODEX EXECUTION RULES — GREENLINK

## CONTEXT

You are working on GreenLink, a **club-scoped operational system**.

You are NOT:
- building a generic SaaS app
- redesigning UI
- inventing patterns

You ARE:
- extending an existing system
- following the Master Build Plan
- implementing narrow, deterministic slices

---

## CORE BUILD PRINCIPLES

- Backend owns all logic
- Frontend sends intent only
- No duplicated logic
- No hidden state
- No side effects
- No mixing domains

---

## UI RULES (STRICT)

- Benchmark HTML files are source of truth
- DO NOT redesign UI
- DO NOT invent new design systems
- ONLY:
  - extract
  - componentize
  - map data

Design system:
- no borders
- tonal layering
- whitespace-driven layout
- green = action only

---

## ARCHITECTURE RULES

- Tee sheet is a READ MODEL (never write directly)
- Lifecycle transitions are backend-owned
- Frontend must NOT implement business rules
- Use existing services/patterns only

---

## DEVELOPMENT RULES

- Work in **phase-specific scope only**
- Build narrow slices
- Do not expand scope
- Do not refactor unrelated code
- Do not introduce new patterns

---

## LAYOUT RULES

- Sidebar + Topbar are persistent
- Only content area updates
- No full page reload patterns

---

## SUPERADMIN RULE

- No theming system
- Only allow club logo upload

---

## FINAL CHECK BEFORE COMPLETION

- Does it follow the Master Plan phase?
- Is scope minimal?
- Is backend owning logic?
- Is UI matching benchmark?
- Is there any redesign? (if yes → fix)

If anything violates these → fix before completing