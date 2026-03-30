# GreenLink — Master System File

## 1. System Definition

GreenLink is a **club-scoped operational system** designed for real-world golf club execution.

It is NOT:
- a generic SaaS platform
- a configurable theming system
- a UI-driven product

It IS:
- a high-performance operational system
- backend-truth driven
- deterministic and domain-correct
- built for speed, clarity, and correctness

---

## 2. Core Principles (NON-NEGOTIABLE)

- Backend owns all logic
- Frontend sends intent only
- No duplicated logic across layers
- No hidden state or side effects
- No domain mixing
- Explicit over implicit
- Narrow slices over broad builds

---

## 3. Build Order (ENFORCED)

Foundation → Identity → Rules → Operations → UI

⚠️ UI-first development is invalid and will break the system.

---

## 4. Current System State (SOURCE OF TRUTH)

### Phase 1 — Platform ✅
- FastAPI backend
- PostgreSQL
- JWT auth (access + refresh)
- `/api/session/bootstrap`
- club-scoped tenancy

### Phase 2 — Identity ✅
- User → Person → ClubMembership
- AccountCustomer (finance identity)
- deterministic seed system

### Phase 3 — Rules ⚠️ (foundation present, not expanded)
- validation structures exist
- pricing/availability engine foundations exist

### Phase 4 — Golf Operations ✅ CORE COMPLETE
- tee sheet read model
- booking aggregate
- booking lifecycle:
  - reserved
  - cancelled
  - checked_in
  - completed
  - no_show
- admin tee sheet operational UI

### Phase 5 — Finance (PARTIAL COMPLETE)
- FinanceAccount model
- FinanceTransaction (append-only)
- Ledger derived from transactions
- order-to-finance posting (explicit)

### Phase 6 — Orders (ACTIVE + FUNCTIONAL)
- Order + OrderItem domain
- player ordering flow (`/player/order`)
- admin order queue (`/admin/orders`)
- lifecycle:
  - placed → preparing → ready → collected
  - placed → cancelled
- staff queue operational
- collected view added
- charge posting (manual, explicit)

---

## 5. Domain Models

### 5.1 Identity

User → Person → ClubMembership

Rules:
- User ≠ Person
- Person ≠ Membership
- Membership is club-scoped

---

### 5.2 Booking

Booking is the operational golf reservation.

Components:
- Booking aggregate
- BookingParticipant
- TeeSheet read model (derived)

Rules:
- tee sheet is READ ONLY
- booking owns lifecycle
- frontend does not mutate booking state

---

### 5.3 Orders

Order represents an **intent to purchase items**, not a transaction.

Entities:
- Order
- OrderItem

Lifecycle:
- placed → preparing → ready → collected
- placed → cancelled

Rules:
- order ≠ payment
- order ≠ POS transaction
- collected ≠ paid
- prices are snapshotted
- order does NOT mutate inventory
- order creation must be idempotent

---

### 5.4 Finance

Entities:
- FinanceAccount
- FinanceTransaction

Rules:
- transactions are append-only
- no update/delete
- ledger is derived (SUM)
- backend owns all financial logic

Order linkage:
- orders may create a charge via explicit posting
- posting is NOT automatic
- posting is NOT payment

---

## 6. Domain Boundaries (CRITICAL)

### Orders do NOT:
- act as payments
- mutate finance automatically
- reserve inventory
- alter booking state

### Bookings do NOT:
- handle payments
- store financial data
- manage orders

### Finance does NOT:
- rely on frontend calculations
- depend on UI state

---

## 7. UI Authority (STRICT)

Source of truth:
- benchmark HTML files

Design system:
- Precision Utility

Rules:
- no borders
- tonal layering only
- whitespace defines structure
- green = action only
- no redesign allowed

Frontend may only:
- map backend data
- componentize benchmark UI

---

## 8. Layout + Routing

### Layout
- Sidebar + Topbar persistent
- Only content area updates
- No full page reload patterns

### Routing

#### Admin
- `/admin/dashboard`
- `/admin/golf/tee-sheet`
- `/admin/orders`
- `/admin/pos`
- `/admin/finance/...`

#### Player
- `/player/home`
- `/player/book`
- `/player/order`
- `/player/profile`

Routing is workspace-based.

---

## 9. Performance Model

- optimistic UI where safe
- minimal data loading
- query invalidation over local mutation
- fast perceived interactions

---

## 10. Environment + Dev Setup

- PostgreSQL ONLY
- Alembic migrations required
- Python 3.12
- `uv` execution required

### Startup

Backend:

py -3.12 -m uv run alembic upgrade head
py -3.12 -m uv run python -m app.scripts.seed_users
py -3.12 -m uv run uvicorn app.main:app --reload

Frontend:

npm run dev

---

## 11. Auth + Seed System

Seed is mandatory.

Credentials:
- superadmin
- admin
- staff
- member

Rules:
- seed must be idempotent
- identity must align with Person + Membership
- `.test` emails only

---

## 12. Codex Execution Rules (ENFORCED)

Codex MUST:
- follow phase-specific scope
- not redesign UI
- not expand scope
- not introduce new patterns

Always:
- backend owns logic
- frontend sends intent
- use existing services

If violated → fix before completion

---

## 13. Current Operational Features

### Golf Ops
- tee sheet live
- booking lifecycle complete

### Orders
- player ordering (single-screen flow)
- admin queue
- collected view
- lifecycle management

### Finance
- account + transaction system
- manual charge posting from order drawer

---

## 14. Known Constraints

- no theming system (logo only)
- no frontend finance logic
- no order-payment coupling
- no inventory system yet
- no POS checkout yet

---

## 15. Next Build Targets

Immediate:
- refine order → finance flow
- introduce payment/tender capture (controlled)
- POS foundation (Phase 6.1)

Later:
- reporting
- communications
- player expansion

---

## 16. Final Rule

If anything contradicts this file:

→ THIS FILE IS CORRECT