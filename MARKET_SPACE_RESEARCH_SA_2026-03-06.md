# GreenLink Market Space and SA Compliance Research

Date: 2026-03-06
Scope: Golf/pro-shop SaaS competitive baseline, South African reconciliation/accounting requirements, and product standards GreenLink should meet or exceed.

## 1) Executive findings

- The strongest golf operations platforms are converging on one model: unified tee sheet + multi-department POS + member/CRM + integrated reporting + broad integration ecosystem.
- Accounting depth is a major differentiator at enterprise clubs: operators expect AP/AR/GL support, audit-ready exports, and robust reconciliation controls.
- For South Africa, GreenLink must enforce VAT invoice/timing rules, retention windows, and POPIA security safeguards while supporting company-level reporting framework choices under Companies Regulations.
- A manual end-of-day export and Sage upload model is valid, but only if GreenLink enforces strict file layout/versioning, balancing checks, traceable close batches, and exception handling.

## 2) Competitor baseline (what "good" looks like in 2026)

## 2.1 Lightspeed Golf (Chronogolf)

Observed capabilities:
- Unified platform across tee sheet, POS, F&B, reporting, and back office.
- Integrated payments, inventory, accounting, and reporting flows.
- Revenue tooling: online booking, dynamic pricing, waitlist, AI-assisted workflows.

Implication for GreenLink:
- GreenLink must keep all revenue streams (golf, pro shop, pub, bowls, other) in one operational and reconciliation model, not separate silos.

Sources:
- https://www.lightspeedhq.com/golf/
- https://www.lightspeedhq.com/golf/pos/

## 2.2 foreUP

Observed capabilities:
- Cloud golf suite with tee sheet, POS, billing, F&B, business intelligence, marketing.
- No-show prevention and prepayment controls in tee sheet.
- Inventory and role-based operations in POS.

Implication for GreenLink:
- End-to-end workflow should include daily controls from booking to payment to closeout and then accounting export.

Sources:
- https://www.foreupgolf.com/
- https://www.foreupgolf.com/tee-sheet-software/
- https://www.foreupgolf.com/golf-course-point-of-sale/

## 2.3 Club Caddie

Observed capabilities:
- Single program across pro shop, bar/restaurant, and other on-site outlets.
- Back-office/accounting reports exposed from operational system.
- Open APIs and accounting integration ecosystem (including QuickBooks support references).

Implication for GreenLink:
- GreenLink should treat all operation streams as first-class accounting feeders with stream-level mapping and reconciliation.

Sources:
- https://clubcaddie.com/solutions/register/
- https://clubcaddie.com/partners-integrations/
- https://support.clubcaddie.com/

## 2.4 Jonas Club Software

Observed capabilities:
- Deep accounting modules (AP, AR, GL) and integrated membership billing.
- POS is tightly integrated into member account posting and inventory workflows.
- Clear enterprise posture on integrated club finance operations.

Implication for GreenLink:
- Even with manual Sage upload, GreenLink needs enterprise-grade accounting controls (batch integrity, reconciliation evidence, role-based approvals, audit trace).

Sources:
- https://www.jonasclub.com/club-accounting/
- https://www.jonasclub.com/point-of-sale/

## 2.5 Golfmanager

Observed capabilities:
- Open API strategy and broad integrations (including accounting tools).
- Explicit ability to export billing data and integrate with accounting software.
- ISO/security and cloud-operational maturity messaging.

Implication for GreenLink:
- GreenLink should store operation-specific import/export profiles as reusable templates per club with version history.

Sources:
- https://www.golfmanager.com/
- https://golfmanager.com/integrations/

## 3) South Africa regulatory/accounting baseline

## 3.1 VAT operational controls (SARS)

Key controls to enforce:
- VAT-inclusive pricing principles and output-minus-input mechanics.
- Preserve documentary proof and transaction records for at least five years.
- Tax invoice issuance timing and threshold controls (including full tax invoice requirements around thresholds/zero-rated scenarios).
- VAT201 submission/payment cut-off controls (25th or eFiling last-business-day handling).

Source:
- https://www.sars.gov.za/wp-content/uploads/Ops/Guides/Legal-Pub-Guide-VAT404-VAT-404-Guide-for-Vendors.pdf

## 3.2 Company records retention (Companies Act)

Key controls to enforce:
- Company records must be retained for seven years (or longer where other law requires).
- Accounting records and annual statements retention must align with statutory windows.

Source:
- https://www.justice.gov.za/legislation/acts/2008-071.pdf

## 3.3 Public Interest Score and reporting framework choices (Companies Regulations)

Key controls to consider in reporting setup:
- PIS formula inputs include employees, third-party liabilities, turnover, and beneficial interest counts.
- Financial reporting framework obligations vary by company category/PIS; IFRS / IFRS for SMEs / SA GAAP pathways apply by rule.

Source:
- https://www.justice.gov.za/legislation/acts/2008-071-reg.pdf

## 3.4 POPIA security and breach response

Key controls to enforce:
- Appropriate reasonable technical and organisational safeguards for personal information.
- Breach notification to regulator/data subjects as soon as reasonably possible after discovery, subject to legal exceptions.

Source:
- https://www.justice.gov.za/legislation/acts/2013-004.pdf

## 4) GreenLink "above standard" target architecture

## 4.1 Reconciliation control model (non-negotiable)

For every close date and every operation stream:
- Source totals: operation day totals captured in GreenLink.
- Journal totals: export-ready totals by GL/tax/payment method.
- Balance proof: debit total equals credit total (hard fail if not).
- Variance check: stream totals must tie to source totals with tolerance = 0.00 by default.
- Evidence package: export file + mapping version + close user + timestamp + checksum + exception notes.

## 4.2 Manual Sage upload operating standard

GreenLink should enforce this day-end sequence:
1. Close day (locks operational edits for the date unless reopened by authorised role).
2. Generate export file from approved mapping profile.
3. Validate balance and tax controls before download.
4. User uploads into Sage manually.
5. User records Sage batch reference back in GreenLink.
6. GreenLink marks status as Imported and stores who/when/reference.

## 4.3 Operation-specific profile strategy

Per club, per stream (`golf`, `pro_shop`, `pub`, `bowls`, `other`):
- Import profile (column mapping, tax adjustment behaviour, sign handling, dedupe logic).
- Export profile (layout template aligned to Sage-ready format where required).
- Versioning (effective date, changed by, rollback).

This is necessary to support different legacy operation systems while preserving auditability.

## 4.4 Audit and governance controls

- Immutable close batch identifiers.
- Reopen requires reason + role and creates audit event.
- No silent remap after close; any mapping changes are versioned.
- Daily exception queue (missing account codes, missing tax flags, unmapped payment methods, duplicate external IDs).
- Download and import logs are reportable.

## 5) Product gap checklist for GreenLink (priority)

P0 (must-have now):
- All operation streams available in configuration/import UI.
- RPA-based accounting handoff removed; manual export path only.
- Database reset/purge tooling that preserves only admin identities when preparing fresh onboarding.
- Stream-level reconciliation checks and explicit failure messages.

P1 (next):
- Batch reference capture after Sage upload.
- Close-package archive view (export + mappings + totals + audit metadata).
- Approval workflow for close/reopen (maker-checker optional).

P2 (scale):
- Compliance dashboard (VAT submission cadence, missing invoices, unresolved variances).
- IFRS/SME reporting-mode profile per club with report pack presets.

## 6) Recommended acceptance criteria for "above standard"

GreenLink should not be considered go-live ready for SA clubs unless all are true:
- 100% of day-close batches are balanced at export time.
- 100% of exported lines trace back to source transactions or approved adjustments.
- 100% of mapping changes are versioned and attributable.
- 100% of operations can be onboarded with per-stream templates without code changes.
- Data retention policies enforce minimum 7-year company records and support VAT evidence retention.
- POPIA safeguards and breach procedures are documented and operational.

## 7) Decision for current GreenLink direction

The manual Sage upload direction is sound for speed and control in the current phase, provided GreenLink behaves as a controlled reconciliation system rather than a file generator. The differentiator is not auto-push; it is trustworthy close controls, audit evidence, and operation-wide mapping governance.
