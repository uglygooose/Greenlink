# GreenLink — Product Document

*Last regenerated: 2026-05-11.*
*Source of truth for what GreenLink is, who it's for, and what it must do.*
*Code is the source of truth for what GreenLink currently has. See `docs/LIVE_STATE.md`.*
*Drift between these two documents is tracked in `docs/DRIFT_LOG.md`.*

---

## 1. What GreenLink is

GreenLink is a club operations platform for golf clubs. It runs the operational backbone of a club — the tee sheet, the point of sale, the member ledger, the daily financial close, the communications, the handicap data — and bridges those operations cleanly into the accounting and handicap systems clubs already use.

Where most golf club software is either decades-old on-premise software (Clubmaster, Jonas Club) or cloud-first but built around North American workflows (Lightspeed Golf, Club Caddie, foreUP), GreenLink is built cloud-first around the operational and financial reality of South African clubs — and built to a standard that scales from there to the rest of Africa and globally.

**GreenLink is open by design.** Every meaningful operation has a documented API. Tournament management goes to Golf Genius via an integration, not a built-in module. Pace-of-play data comes in from Tagmarshal. Tee-time inventory flows out to Supreme Golf and GolfNow when the club chooses to syndicate. Accounting posts to Sage Pastel Partner, Sage 200 Evolution, and Xero ZA over their respective APIs. The market consistently rewards open systems and punishes closed ones — every closed-API or legacy-Windows vendor in the SA and global market is currently shedding share. GreenLink's API is a first-class product surface, not an afterthought.

GreenLink is opinionated about two things:

- **The tee sheet is the source of truth for course operations.** Every booking, every move, every check-in, every payment, every pace-of-play status, every cart and caddie assignment flows through it. If the tee sheet is slow, wrong, or unreliable, the club cannot operate. GreenLink makes the tee sheet world-class.
- **Financial reconciliation must be ledger-to-ledger, not screenshot-to-spreadsheet.** Daily close should take twenty minutes per till, post a clean summary journal to the club's existing accounting platform, and leave behind a member-level AR sub-ledger any auditor can read. GreenLink does this where competitors export CSVs and hope.

Everything else — pro shop POS, halfway-house ordering, communications, handicap integration, reporting, AI features, multi-sport extension — is built around those two anchors.

GreenLink is **not** a tournament management platform (use Golf Genius), not a pace-of-play GPS system (integrate Tagmarshal), not a consumer tee-time marketplace (partner with Supreme Golf), not a resort ERP (CiMSO GOLFmanager exists). Trying to be those things is how software gets bloated, distracted, and beaten by focused competitors.

---

## 2. Who GreenLink is for

GreenLink serves four distinct audiences. The product must work for all four; the tee sheet and finance modules must be excellent for the first two.

**Club admin** — the General Manager, the operations manager, the finance lead. Their day involves managing daily operations across all departments, reconciling the previous day's finances, posting to the accounting system, generating reports for the board, managing memberships and renewals, and approving exceptions. They are time-poor, judgment-rich, and the people who decide whether to keep paying for GreenLink. Their primary surfaces are the daily dashboard, the close-day wizard, the reports hub, the member directory, and the settings hub.

**Staff** — the pro shop attendant, the starter, the marshal, the halfway-house operator, the F&B server. Their day involves taking bookings on the phone or at the counter, checking players in, processing payments, taking food and drink orders, managing the cart pool, running the till. They need a tee sheet they can move flights around on without breaking it, a POS that doesn't slow them down at 7am on a Saturday, a way to charge a member to their account without asking for an account number, and the ability to do all of this on whatever device is in front of them — a desktop in the pro shop, a tablet in the halfway house, a phone in their pocket on the course. Their primary surface is the tee sheet, with the POS and order queue close behind.

**Members** — the golfers who play the course. Their app interaction is short and frequent: book a tee time (three taps, day → time → confirm), check their handicap, post a score, see the latest news from the club, view their account balance, occasionally book the dining room. They are not customers of GreenLink, they are customers of the club, and the GreenLink experience reflects on the club. The member app needs to feel modern, fast, and trustworthy, never dated or buggy. **Authentication must just work.** The universal #1 complaint about competitor member apps is broken logins forcing app re-installs ("try to use the same credentials and it doesn't know who you are. You have to constantly delete the app and reinstall it" is a real review of an industry leader). Session handling, token refresh, and biometric login on the PWA's Capacitor wrapper get first-class engineering attention. Their primary surfaces are home (news + upcoming bookings), book, profile (handicap + statement).

**Superadmin** — operates GreenLink itself. Onboards new clubs, configures their tenant, manages the platform-wide module catalog and integration profiles, monitors health across the fleet. Not a customer-facing role; the platform operator. The primary surface is the superadmin shell with club registry, onboarding workspace, and accounting profile management.

---

## 3. The two USPs

Everything strategic about GreenLink follows from being world-class on these two, and merely competent on the rest. Both are defined precisely — not "good tee sheet" but a specific operational standard, and not "accounting integration" but a specific technical bar.

**A note on v1, v2, v3.** Throughout this document, capabilities are tiered v1, v2, or v3. **These are not calendar dates and they are not a roadmap.** They are definitions of *best practice at each level of platform maturity*. The standard — the world-class capability defined in this document — is the endpoint. v3 reaches the standard. v2 closes the gap. v1 is the minimum credible product a club can operate on, with pragmatic bridges where the full standard isn't yet built.

The bridge concept matters. Full real-time API integration to Sage Pastel Partner is the standard, and the moat. v1 does not require it to be built — v1 requires the daily close to produce an *import-ready file in Pastel's format* that the bookkeeper imports manually. Same operational outcome, fraction of the engineering cost, immediate v1 viability. v2 replaces the export-import bridge with the real-time API. The standard does not move; the implementation matures.

The same logic applies elsewhere: HandicapsSA score-push is the standard, v1 links members out to HandicapsSA for posting. Meta Cloud API conversational WhatsApp booking is the standard, v1 sends WhatsApp transactional templates via a bulk-comms provider's WhatsApp channel. **Identify the standard. Ship a bridge that delivers the operational outcome. Replace the bridge with the standard when the engineering investment is justified by paying customers.** This is the discipline that makes v1 shippable in weeks rather than quarters, without compromising on what GreenLink ultimately is.

### 3.1 Tee sheet excellence

A world-class tee sheet, defined operationally, has the following non-negotiable properties:

**Layout.** Vertical-time grid. Rows are tee-time slots at 5, 7, 8, 9, or 10-minute increments depending on the course's policy. Columns are either four player slots or paired Front-9/Back-9 lanes. Multi-course clubs see the courses side by side at the same time grid. No timeline view, no Gantt, no swimlanes — operators reject these because a tee time is a discrete slot, not a duration. The mental model has been preserved since paper tee sheets in the 1970s; modern systems differentiate on what's layered on top, not by replacing the grid.

**Multi-course portfolio dashboard.** Clubs with more than one course (East/West, championship/par-3, 18-hole + 9-hole) see a portfolio view at the top — utilisation, revenue, weather, alerts per course — with one-click drill into any individual course's sheet. Single-course clubs see this as a single tile. Same surface, scales naturally.

**State, visualised.** Six states, each with a distinct visual treatment: open, booked, checked-in, at-risk (about to be no-show), no-show, blocked. Colour palette is deuteranopia-safe — red/green alone is an accessibility failure. State lives on the row, identity (member name, party size, cart count) lives on the tile. Never more than six colours visible at once.

**Drag-and-drop primitives.** Five operations, each a single fluid gesture with sub-100ms feedback:

- *Move a whole flight* to another slot
- *Promote an individual player* within a flight (e.g. move from slot 4 to slot 1)
- *Split a flight* into two flights at adjacent times
- *Squeeze insert* — drop a new flight into a 5-minute gap between two 10-minute flights, with operator confirmation
- *Cross-side flip* — move a flight from front-9 to back-9 or vice versa

Squeeze is the single most operationally important primitive and must be one or two clicks. Most competitors require many.

**Walk-in waitlist as a first-class object.** When a foursome shows up unexpectedly, staff can register them in a waitlist tray, the system suggests the next available gap or shotgun start, and they're drag-dropped onto the sheet with a single gesture. Pricing is auto-resolved from their player type and the time of day. Payment is taken at the same screen. A starter ticket prints or sends to their phone.

**Recurring booking templates.** A member who plays every Tuesday at 9am has a recurring template, not 52 separate bookings. The template generates bookings forward on a rolling window, can be paused, can be skipped on holidays, and gracefully handles course closures (the booking is auto-cancelled with a notification, not silently lost).

**Named block templates.** Common block patterns — "lesson tee 11am-12pm Tuesdays", "course closure for maintenance Monday 6am-10am", "marshal-only block during a shotgun event", "society reservation across slots 7:30-9:00" — are saved as templates. Staff apply them in two clicks rather than reconstructing the block grid each time.

**Tournament and society days.** A separate operating mode for the day. Shotgun start view shows all tees in parallel at the start time; pace-of-play tracking works against a single common start; scoring integrates with Golf Genius; one consolidated invoice posts to the tournament's account at the end of the day with line items per player. The day's tee sheet for normal members operates on the non-tournament portion of the course (if applicable) or is correctly blocked out (if not). The tee sheet shouldn't fight the operator on tournament days; it should know what's happening and adapt.

**Concurrency-safe by design.** Optimistic locking with a five-minute hold on slot selection. Two staff members on two devices cannot accidentally double-book. The audit log records every state transition with timestamp, user, and source channel.

**Native dynamic pricing, with channel-aware integrity.** A layered rate engine: base table (player type × day-type × time-block), override layer (weather, course conditions, blackouts), optional ML demand multiplier with operator-set floor and ceiling, channel-specific surcharges. Every fee on the sheet must be explainable — staff can click any price and see exactly which rule produced it ("R870 = R650 base + R150 weekend premium + R70 cart"). **Direct bookings are protected from aggregator-channel pricing contamination** — if a club syndicates discounted off-peak slots through Supreme Golf or GolfNow, those discounts must not bleed into the direct member booking flow. The Lightspeed/Chronogolf instance of this bug (third-party discounted prices showing up on direct rounds) is the canonical mistake to avoid. Channel is a first-class dimension in pricing rules, not an afterthought.

**Aggregator sync, when chosen.** When a club opts in to syndicate tee times through Supreme Golf, GolfNow, or another aggregator, the sync is real-time and idempotent. Pulled inventory is locked the moment it's claimed externally. Status updates flow back within seconds. The aggregator is a downstream consumer of GreenLink's truth, never an authority over it.

**Pace overlay on the tile itself.** When integrated with Tagmarshal or equivalent, each flight's pace-of-play status appears as a small chevron on its tile — green/amber/red, no separate screen needed. Industry-wide gap; clear UX win.

**Marshal-on-phone.** A three-button workflow per group — Start, Turn, Finish — with push alerts for late check-ins and a "request marshal" escalation. Ruggedized phone or pocket tablet, not a desktop. Available from day one, not deferred to v3.

**Keyboard shortcuts.** Documented, discoverable, professional. Jump-to-time, tab between player slots, function keys for check-in/turn/finish, single-letter for new walk-in to next gap. Free differentiator: no major competitor publishes a shortcut reference card.

**Failure modes designed out.** No tee sheet "lost" during peak hours. No price-modification-blocks-the-sale bugs. No stale data on the pro shop terminal because someone booked online ten seconds ago. Real-time sync across all devices. "Temporarily blocked" lock during slot selection. Role-based override controls with audit. Printed paper backup tee sheets at 7am are an industry workaround — GreenLink makes them obsolete by reliability, not by preservation.

### 3.2 Financial reconciliation

A world-class financial layer, defined technically, has the following non-negotiable properties:

**Real-time API integration to Sage Pastel Partner, Sage 200 Evolution, and Xero ZA.** This is the actual moat. No global vendor has built it — Lightspeed integrates Sage 50 and Sage Business Cloud but not Pastel Partner; Clubmaster sidesteps by replacing the GL with its own ledger; foreUP only does QuickBooks. SA clubs running R3m+ annual revenue audit on Pastel or Sage 200 Evolution, and no software currently posts cleanly into those systems. GreenLink is the first.

The integration is not a CSV export. It is daily summary journal posting via API, with configurable chart-of-accounts mapping per club. The mapping UI lets the club's bookkeeper say "tee sheet revenue → 1000-Sales-Golf", "halfway-house F&B → 1100-Sales-FB", "member dues received → 5000-Members-Dues-Received", etc. Once mapped, daily posting is one click — or scheduled to run automatically at the end of close-day.

**Member-level AR sub-ledger.** Every member's house charges flow to their own sub-account. Statements are generated from the sub-ledger, not from a tee sheet query. Aged AR reports work the way an accountant expects — current / 30 / 60 / 90+ buckets, with the member's running balance always reconcilable to the GL control account.

**SA VAT apportionment built in.** Recreational club rules under section 10(1)(cO) require sub-fee revenue, green-fee revenue, F&B revenue, and non-member income each to be tagged distinctly. GreenLink tags every transaction at source. Revenue flows to the right GL accounts with the right VAT codes automatically. Auditor-ready.

**Reconciled-by-tender-type close.** A SA club typically runs two or three card acquirers (Yoco, Adumo, sometimes Standard Bank or Nedbank merchant), plus cash, plus PayShap, plus member-account-charges. Close-day auto-matches each acquirer batch settlement to the POS card-tender totals, flags any drift, and lets staff resolve the gap before the journal posts. **Cash variance is tracked by employee, by drawer, and over time** — patterns of consistent under/overage by a specific employee are surfaced as gentle anomalies, not accusations, but the data is there when needed.

**DebiCheck mandate flow native to onboarding.** New member signs up → cell verified → DebiCheck mandate triggered in-app → bank authenticates → first debit-order runs on the agreed date. Priority Debit handling means lower chargeback risk than legacy debit orders. The whole flow is in one screen; the member doesn't open a separate banking app.

**PayShap as default for under-R3,000 transactions.** Halfway-house, green fees, pro-shop small-ticket — instant rail, cheaper than card swipes, settled in seconds. Card stays as the fallback for higher-value transactions and visitors.

**Card-on-file via tokenised SA processor.** Card details are tokenised at Yoco, Peach Payments, or the club's processor of choice. **GreenLink never stores raw card data.** Tokens are stored with full audit trail. POPIA-compliant by architecture, not by policy. Member can update their card via a secure link without staff handling card details at any point.

**Tournament and society one-invoice billing.** Society events (corporate days, charity tournaments, school golf days) generate a single invoice at the end of the day, not 60 separate green-fee transactions. Comp items (sponsored carts, prize-table items, complimentary halfway-house) are tracked as line items with their own GL treatment. The society's contact pays the invoice; member accounts are not touched. Reconciles cleanly.

**Multi-club consolidation.** Management groups operating multiple clubs (an increasingly common SA pattern) see consolidated reporting across all their clubs from a single login. Each club retains its own GL, but cash position, AR aging, RevPATT, and operational KPIs roll up. Membership cross-recognition is configurable — a member of club A can play club B at a reciprocal rate, with the revenue routed and the transaction recorded at both ends.

**Real-time AR-driven tee-sheet block.** Members with overdue accounts past a configurable threshold (e.g. 60 days) cannot complete an online booking until they settle. Compresses AR aging by 30–50% in clubs that have implemented this elsewhere. The block is friendly: "Your account is currently R2,340 in arrears. Please settle to resume online bookings, or call the office."

**Yellow-Dog-grade inventory layer for pro shop and F&B.** Stock-in / stock-out tracking, vendor invoice EDI (auto-receipt of stock from supplier EDI feeds where supported), reorder thresholds, weekly cycle counts, shrinkage monitoring, supplier price tracking. Pro shop and halfway-house inventory are different operational beasts — pro shop is slow-moving high-value, halfway-house is fast-moving low-value with cash skim risk. The inventory layer respects that difference.

**RevPATT, RevPUR, weather-adjusted utilisation, and effective average green fee — daily.** Not just on the monthly Board Pack. These are the metrics that actually drive a golf club's economics and they belong on the GM's dashboard at 6:30am on their phone, before they get to the office. **The "secretary trap" — averaging headline green fees instead of effective realised rates — is a known industry mistake. GreenLink reports effective rates always.** Headline rates are visible as a separate field when needed, but never as the default.

**Two-page Board Pack auto-generator.** Once a month, one click produces a PDF: page one is the financial KPIs (Membership Dues Ratio, Available Cash, Net Worth trajectory, AR aging, capital reserves, member churn), page two is the operational KPIs (rounds played, RevPATT, utilization %, F&B spend per round, average effective green fee, weather-adjusted utilization). HFTP's Williams 2025 framework. No vendor currently ships this; managers build it by hand monthly. Game-changer for time-poor GMs.

---

## 4. Table stakes — what GreenLink must reach parity on

These are the features GreenLink does not differentiate on. Every credible competitor has them. Being missing means GreenLink is not a credible product. Being competent here is the *price of admission* to compete on the two USPs.

**Unified POS spanning pro shop, F&B, and halfway-house.** One terminal app, three operational profiles. Pro shop runs slow-moving high-value retail with barcode scanning, vendor management, and member-account-on-tab. F&B runs table service or counter service with modifiers, splits, and tip allocation. Halfway-house runs a fast service-window flow with charge-to-member as the default tender and a pre-order-from-tee surface available to members on the course. All three share the same product catalogue, the same member directory, and the same tender types. Tickets close, post to the tee sheet (where the booking has a tab), and flow to the daily journal automatically.

**Member portal and PWA.** Three-tap booking (day → time → confirm), defaulting player count and cart from the member's last booking. Statement view with pay-now link. Push notifications scoped to what members actually want (tee-time reminders, comp draws, weather cancellations) and nothing else. Buddy list with handicap visibility. Score posting that flows to the handicap system. Course info, dress code, dining hours. Member-facing dining and event reservations where the club offers them. Wrapped in a Capacitor shell for iOS/Android distribution after the PWA proves itself.

**Handicap module with per-competition WHS allowances.** Course Handicap and Playing Handicap calculated client-side from the WHS formula. Score entry with one-screen flow. Tournament handicap allowances are configurable per competition — defaults match WHS (95% individual stroke play, 85% four-ball stroke play, 90% four-ball match play, 50% foursomes, 60/40 greensomes), but the operator can override per competition because IE/SC/WG already permit this and SA will follow. Handicap history, slope and rating sync, course rating files, junior handicaps, senior tees. Score-verification anti-cheat is a v3 feature, not v1.

**Member directory and CRM-grade membership management.** Membership types, household structures, junior/senior/social variants, mid-year designation changes, prorated billing, renewal cycles, lapsed-member workflows, gift memberships, reciprocal-club arrangements. The edge cases that every real club has are not edge cases inside GreenLink — they're explicit features.

**Communications.** Email via integrated transactional and bulk provider. SMS at SA bulk rates. WhatsApp Business Platform for transactional templates (booking confirmation, comp draw, weather cancellation) — this is increasingly table stakes in SA even though no competitor has it natively, and it'll be the norm within 24 months. Targeted segmentation by handicap range, membership type, usage pattern. The communications module is competent, not flashy.

**Operational reporting.** Daily, weekly, monthly cadences. Sales by department, rounds played, no-show percentage, F&B covers, cash variance, RevPATT, AR aging, member churn, F&B spend per round, weather-adjusted utilisation. Reports run in seconds, not minutes (the GolfNow G1 sales report cited at 3+ minutes is the floor we must clear by a factor of 30+). Reports export cleanly to PDF and Excel. Saved report views per user. Scheduled email delivery for the GM's morning routine.

**Reliability — the table stake everyone else misses.** No tee sheet "lost" during peak hours. No POS that crashes at 7am on a Saturday. No member app that hangs on launch. The single most cited operational defect across every competitor's review corpus is reliability under load. GreenLink's architecture must treat Saturday-morning load as the default case, not the edge case. Real-time sync across all devices. Optimistic locking on every write. Audit logs on every state transition. Offline-first POS with IndexedDB write queue and UUIDv7 idempotency keys, so load-shedding or 4G dropout doesn't take the club offline. **Reliability is the feature that wins clubs and the feature that loses them. Treat it as a USP, even though it isn't formally one.**

**Integrations as a first-class product.** Golf Genius for tournament management — bidirectional, day-one. Tagmarshal for pace-of-play overlay on the tee sheet. Sagacity or GolfBack for clubs that want third-party dynamic pricing on top of GreenLink's native engine. Supreme Golf and GolfNow for clubs that opt in to syndication. Yellow Dog Inventory for clubs whose existing inventory operations are too deep to migrate immediately. Every integration has a documented API contract, an admin-visible health status, and a clearly-defined data ownership boundary (GreenLink owns the source of truth; integrations are downstream consumers).

**Audit log, end to end.** Every state transition on a booking, every charge, every refund, every member edit, every settings change. Timestamp, user, source channel, before/after values. Visible to club admin. Exportable. Auditor-ready. Compliance isn't an afterthought — POPIA requires it and clubs need it for their own governance.

**Daily close in 20–30 minutes per till.** Not the marketing promise. The measured reality. Once GreenLink has design partners running, this becomes a published benchmark — no NGCOA or Golf Inc figure currently exists publicly for SA, so GreenLink can own the category-defining metric.

---

## 5. What GreenLink consciously does not build

Disciplined product scope is a feature. The temptation to build everything is the failure mode of every golf club software vendor — Clubmaster's accumulated modular bloat is the clearest cautionary example. Saying no is how GreenLink stays excellent at its USPs.

**Consumer marketplace.** GolfNow has 9,000+ courses and the network effects of a 20-year head start. Supreme Golf's free distribution-engine model is the right partner. Building a competing marketplace is a $50m bet against incumbents that GreenLink will not make. Integration, not competition.

**Pace-of-play GPS hardware.** Tagmarshal is South African–founded, has 900+ courses including 50 of the US Top 100, and runs an AI/ML platform on 100 billion data points. Building competing hardware is a $5m+ misadventure with no end state where GreenLink wins. Deep integration with Tagmarshal, including the pace-overlay on the tee sheet tile, is the right play — and it unlocks an SA-tech-meets-SA-tech narrative that strengthens both companies.

**Tournament management.** Golf Genius runs 37 million rounds across 63 countries and 10,400+ clubs. It is the de facto industry layer for tournament software. Trying to displace it is wrong; integrating with it is right. GreenLink reads tournament configuration from Golf Genius, hands off scoring to it, and accepts handicap-allowance output from it.

**Resort ERP.** CiMSO GOLFmanager owns the SA resort segment (Fancourt, Simola). Hotel PMS, spa booking, F&B menu engineering at restaurant-management depth, banqueting, room-key card integration — these are different products with different economics. GreenLink stops at the golf club operations boundary. A resort that wants both can run GOLFmanager for the hotel and GreenLink for the golf club, with documented integration points between them.

**Private-club banquet, lodging, and country-club function depth.** Jonas Club has a 30-year head start on private-club back-office breadth. The economics of competing on that surface are bad. GreenLink serves country clubs and members' clubs at the operations layer; the function-room and lodging depth is a v3+ question once the operational moat is real.

**Native KDS hardware and proprietary POS terminals.** Off-the-shelf Star Micronics and Epson receipt printers, Yoco/Adumo card terminals, any consumer tablet on the LAN. GreenLink's print agent talks ESC/POS over localhost. Hardware is commodity; the software is the product.

**Separate native staff apps.** One responsive React PWA, usable from 320px (a starter's phone) to 27" (back-office reporting). Installed-to-desktop on the pro shop terminal where useful. iOS/Android Capacitor wrappers only for the member app, only when v2 needs APNs and biometric authentication.

**Bowls, tennis, padel modules in v1.** GreenLink is opinionated about golf. Multi-sport is a v2+ extension when the golf product is excellent and the market demand is proven. Bowls clubs that want a dedicated bowls platform are pointed to HandiBowls (separate product, same company, integration-ready when both products are mature). Tennis and padel are real extensions to consider once GreenLink's club ops platform has 20+ live golf clubs and a clear pattern for non-golf modules to inherit the shared infrastructure (member directory, finance ledger, comms, reporting).

**Estate / HOA module in v1.** The research correctly identifies this as a high-growth segment (Steyn City, Pearl Valley, Fancourt residential, Simbithi, Mount Edgecombe). It is a v2+ moat opportunity, not a v1 distraction. Estate-attached clubs in v1 use GreenLink for golf operations only; the residential levy integration is a roadmap item once the core platform has revenue.

**Multi-club consolidation in v1.** Operating multiple clubs from one login is genuinely valuable for management groups, and the research flagged this as an SA-specific moat. But the architecture must be designed for it (multi-tenancy with proper RLS, consolidated reporting layer, cross-club membership reciprocity) before the feature ships — and getting one club running well comes first. v1 is single-club. v2 introduces consolidation when there's a real management-group customer.

---

## 6. SA-specific moat opportunities, ranked

The research identified ten SA-specific moat opportunities. They are ranked here by combined impact (how much it differentiates GreenLink from incumbents) and leverage (how much it costs to build relative to the moat it creates). Each moat has explicit tier and bridge mechanism.

**1. Sage Pastel Partner / Sage 200 Evolution / Xero ZA accounting integration.**
- **Standard (v2-v3):** real-time API journal posting per club, with configurable CoA mapping UI, daily summary journals + member-level AR detail.
- **v1 bridge:** daily close produces import-ready files in each platform's native import format. Pastel Partner's CSV import format, Sage 200 Evolution's batch import, Xero's CSV bank rules. Bookkeeper imports manually. CoA mapping UI exists in v1 because the export file structure depends on it; just no live API call.
- **v2 transition:** Pastel Partner API integration (highest SA market priority, build first).
- **v3:** Sage 200 Evolution and Xero ZA APIs reach parity. Multi-club consolidation across all three.

**2. HNA / DotGolf handicap integration.**
- **Standard (v2-v3):** daily handicap index refresh, course-rating sync, score-push from GreenLink directly to DotGolf.
- **v1 bridge:** GreenLink captures scores via the member PWA; on submit, member is link-routed to HandicapsSA to post the score there. Member experience inside GreenLink is complete (entry, history view via HandicapsSA's read endpoints if available, or scraped/manual sync); the actual handicap calculation happens at DotGolf. Per-competition WHS allowance configuration works on the locally captured course handicap.
- **v2 transition:** read-side API integration (pull index, slope/rating, score history).
- **v3:** full bidirectional integration with score push.

**3. Offline-first POS with PayShap + tap-to-pay + member-account unified.**
- **Standard = v1.** No bridge available; this is architectural. IndexedDB write queue, UUIDv7 idempotency, server-authoritative conflict resolution, Service Worker + Workbox. Built in v1 because retrofitting offline-first to a cloud-first architecture is a rebuild, not a patch. *Note: v1 ships as a regular responsive web app; full offline PWA defers to v1.5.*

**4. DebiCheck mandate flow native to onboarding.**
- **Standard (v1.5-v2):** in-app mandate triggered during member onboarding, bank-authenticated, Priority Debit handling, full flow on one screen.
- **v1 bridge:** standard debit-order signup form with mandate handled outside GreenLink (paper or via the bookkeeper's existing process), captured details stored against the member record for v1.5 migration.
- **v1.5:** integrate one of the DebiCheck aggregators (Stitch, Ozow, Netcash) for the in-app flow.

**5. WhatsApp Business Platform for transactional templates.**
- **Standard (v2):** Meta Cloud API direct integration via Clickatell / Infobip / Trembi / 360dialog, conversational templates including reply-to-confirm.
- **v1 bridge:** none — WhatsApp deferred to v1.5+. SMS deferred to v1.5+. v1 ships with email transactional + in-app message list for booking confirmation, weather cancellation, comp draw notifications.
- **v2:** Meta business verification, direct Cloud API, full conversational interface (which then becomes the substrate for the AI booking feature in v2).

**6. Multi-club golfer 360 — HNA Player ID as canonical identifier.**
- **Standard (v2):** architecturally treat HNA Player ID as canonical member identifier; cross-club recognition; reciprocal-rate billing handled automatically.
- **v1 architecture:** member schema includes HNA Player ID field as primary external identifier. Single-tenant only in v1, but the data model is ready for v2 multi-tenancy expansion.
- **v2 feature:** activates when GreenLink onboards a management group with multiple clubs.

**7. Estate / HOA module integrating residential levy with golf membership.**
- **Standard (v3):** unified resident-and-member statements, levy collection automation, residential access controls (gate codes, visitor management) tied to membership status.
- **v1 / v2:** not built. Estate-attached clubs in v1 use GreenLink for golf operations only.
- **v3:** dedicated module, requires homeowners' association governance review, separate engineering workstream.

**8. POPIA compliance shipped by default.**
- **Standard = v1.** Legally required, not bridgeable. Information Officer workflow, automated consent capture, granular access controls per data category, audit trail on every PII access, af-south-1 (Cape Town) data residency. v1 ships with the architecture; v2 hardens with explicit consent UI surfaces and DSR (data subject request) automation.

**9. CMASA partnership with anonymised benchmarking.**
- **Standard (v2-v3):** opted-in clubs contribute anonymised live data to CMASA's F&B, Operations, and Salary surveys; live benchmarking dashboard for GreenLink clubs against peers.
- **v1:** not feasible — no benchmarking is possible from a sample of one or two clubs.
- **v2:** initiate CMASA conversation once five-plus clubs are live. Build benchmarking data layer.
- **v3:** dashboard goes live, becomes category-defining.

**10. Real-time AR-driven tee-sheet block.**
- **Standard = v1.** Logic-only, no external integration required. Member with overdue balance past configurable threshold cannot complete online booking until settled. Friendly UX. Logic shipped in v1.

---

## 7. AI features — prioritised by tier

GreenLink's AI strategy is not "AI everywhere." It is "AI where the evidence shows real operational leverage, deferred where the evidence shows it's vapourware." The research surveyed what's actually deployed today and what conspicuously isn't deployed by anyone. The gaps are GreenLink's opportunities.

The architecture commitment underneath all of this is that **the semantic layer ships in v1 even if only two AI features ship in v1.** A clean semantic layer (dbt or equivalent) over the operational PostgreSQL warehouse, with stable definitions of every metric and entity, is what makes every subsequent AI feature trivial to add. Without it, each AI feature is a bespoke SQL-string-glued-to-an-LLM hack that drifts as the schema changes. The semantic layer is the platform.

### v1 — ship at launch

**Semantic-layer architecture.** Shipped in v1 even though the AI features depending on it ship in v1.5 or v2. dbt or equivalent over the operational PostgreSQL warehouse, with stable definitions of every metric and entity. This is the platform the next ten AI features sit on; building it later means rebuilding all of them.

### v1.5 — extends shortly after v1 stabilises

**AI member-communications drafting.** Direct LLM call against the operator's outline. Operator types intent, LLM produces draft, operator edits and sends. Templates feed in tone and style from previous club communications, so the drafted message sounds like the club, not like ChatGPT.

**No-show prediction at booking time.** Bridge logic: cannot ship this in v1 because there is no training data yet. **v1.5 unlocks once a club has eight to twelve weeks of bookings recorded.** Features: lead time, weather forecast at tee-off, member's no-show history, day of week, slot value, member tenure. Risk score surfaced on the booking confirmation and on the night-before dashboard.

**Operations Q&A over PostgreSQL.** Bridge logic: depends on semantic layer being live and stable, plus enough operational data to make queries meaningful. **v1.5 once the first club has been running thirty days.** LLM-to-SQL with row caps and result caching. Read-only.

### v2 — extends after second and third clubs are live

**WhatsApp conversational booking.** Bridge logic: v1 has no SMS, no WhatsApp. **v2 introduces conversational AI on the Meta Cloud API.** Requires business verification, requires the LLM intent layer, requires careful UX so misunderstandings don't lose bookings.

**Handicap trend narration.** Direct LLM call against structured handicap data with a templated prompt. v2 once HNA read-side integration is live (Section 6 item 2 reaches v2).

**Find-a-fourth via buddy graph and handicap proximity.** Three signals: who they've played with, who's close on handicap, who's eyeing the same slot. v2 once member usage data has accumulated to make matches meaningful.

**Anomaly detection in daily financials.** Statistical, not deep. Tipping, refund frequency, void patterns, batch-settlement drift, cash variance trend. Gentle anomalies on the close-day dashboard, never accusations. v2 once a club has a baseline of normal transaction patterns to anomalise against.

**Course recommendation across multi-club affiliations.** Activates once multi-club is live (Section 6 item 6 reaches v2).

### v3 — extends after platform breadth grows

**Tee-sheet gap retroactive optimisation.** Queue of one-click accept-or-reject suggestions to the starter. UX-sensitive; needs careful design. v3 after operational rhythm at multiple clubs is well understood.

**AI staff onboarding via RAG over club documents.** Jonas IRIS pattern. Clubs upload their own SOPs, dress code, halfway-house procedures. New staff ask the bot, get the club's actual answer. v3 because it requires clubs to have curated their documentation.

**Score-verification / handicap-manipulation detection.** Pattern detection for sandbagging. Flag for human review by the handicap committee, never automated discipline. v3 with care.

### Out of scope

Generative AI on course conditioning, voice tee-sheet operation, AI tournament pairings.

### Architecture commitment

FastAPI + PostgreSQL + semantic layer (dbt) + LLM router pattern. The router lets GreenLink mix OpenAI for chat surfaces, Anthropic for longer-context reasoning, and small fine-tuned models for classification work (no-show prediction). Costs stay under control because most queries route to the cheap models; only the open-ended chat queries hit the expensive ones. **Build the semantic layer in v1 even if only no-show prediction and Operations Q&A ship in v1.5.** It compounds across every AI feature that follows.

---

## 8. Risks and threats

Six risks the research identified, plus two self-imposed risks worth flagging. Each has a watch metric and an early-warning trigger.

**Risk 1: BRS Premier (formerly Albatros) actively marketing into South Africa.** Backed by NBC Sports / Versant capital that Clubmaster does not have. They have a proven cross-border playbook from the UK, EU, and AU markets. Their albatrosgolf.com/home-za/ landing page is live. They are a more capitalised, more capable threat than Clubmaster. **Watch metric**: BRS Premier customer announcements at SA clubs, particularly the larger CMASA-member clubs. **Trigger**: any BRS Premier deployment at a CMASA-member club is the signal that the competitive window is closing. **Response**: accelerate v1 launch, lock in the design-partner club, prioritise the Sage Pastel integration as the differentiator BRS can't easily replicate.

**Risk 2: Jonas pushing Club Caddie into South Africa via Constellation Software's 20-country distribution network.** Club Caddie was the fastest-growing vendor globally in 2025 (+20% net new courses), is cloud-native with an open API, and has the engineering capacity to localise. Constellation owns the channel. **Watch metric**: Club Caddie hiring or partnership announcements in SA, mentions in CMASA newsletters or events. **Trigger**: Club Caddie SA case study or "Club Caddie now available in ZAR" announcement. **Response**: Sage Pastel integration depth and HNA integration depth are the two specific defences — Club Caddie has the architecture to add both eventually but not the SA market knowledge to do it well immediately.

**Risk 3: GolfNow's tee-time barter model arriving in SA at scale.** Operators love free software in year one and hate the lost tee-time revenue by year three. JJKeegan documented one US municipal course losing $150,000+/year in bartered tee-time value vs. equivalent paid software at a fraction of the cost. Operator NPS for GolfNow sits at -26. The risk to GreenLink isn't that GolfNow wins clubs from us; it's that GolfNow distorts the SA market, suppresses willingness-to-pay for paid SaaS like GreenLink, and conditions operators to expect "free" software. **Watch metric**: GolfNow's NBC Sports Next channel partnerships in SA, any SA club appearing on golfnow.com. **Trigger**: GolfNow signs more than five SA clubs to barter agreements. **Response**: lead with transparent SaaS pricing and the published per-club ROI comparison ("here is what bartered tee times costs you vs. a paid GreenLink subscription"). Honest pricing is itself a differentiator now.

**Risk 4: CMASA / Clubmaster Platinum Partner channel block.** Clubmaster's Platinum Partner status with the Club Management Association of Southern Africa is real channel protection. A frontal go-to-market that ignores CMASA will face headwinds. **Watch metric**: CMASA messaging tone toward GreenLink, response to early CMASA-event outreach. **Trigger**: explicit CMASA pushback or refusal of partnership conversation. **Response**: pursue CMASA partnership pre-launch via the SA moat item 9 (anonymised benchmarking), bring real value to the relationship rather than asking for endorsement. Be patient — earned channel trust beats announced channel trust.

**Risk 5: TAM ceiling on club ops alone.** ~460 SA affiliated clubs × R3–6k/month subscription = R20-35m ARR ceiling. That is not a fund-raising-friendly TAM by itself. The economics require adjacent revenue: payment-rail rev share (1-2% of card volume processed through GreenLink-integrated terminals), B2C golfer subscription (premium handicap tracking, course recommendations), estate/HOA module revenue, multi-club consolidation upsell, eventual expansion into Mauritius and the broader African continent via the HNA footprint. **Watch metric**: average revenue per club, % of revenue from non-subscription sources. **Trigger**: subscription ARR plateaus while club count grows (meaning the adjacent-revenue thesis isn't materialising). **Response**: deliberately staged. v1 proves the subscription model. v2 adds payment-rail revenue. v3 considers the B2C golfer subscription. Geographic expansion is v3+. Don't reach for adjacencies before the core works.

**Risk 6: Continued decline of women's affiliated golf and Gauteng membership.** The addressable market is structurally stagnant. Central Gauteng + Gauteng North + Ekurhuleni affiliated membership fell ~13% over five years; women's affiliated golf is down 1,500 since 2017 with no rebound visible. GreenLink's growth depends on both winning share from Clubmaster *and* helping the underlying market grow — via estate-attached clubs (the only growing segment), society/corporate days, and member-acquisition tools clubs can actually use. **Watch metric**: GolfRSA annual affiliated membership figures, estate-club new openings. **Trigger**: a third consecutive year of declining total affiliated membership. **Response**: explicit GreenLink features for member acquisition and retention — onboarding flows, lapsed-member detection and outreach, junior development tracking, friends-and-family referral mechanics. These need to be real product features by v2, not v3 wishful thinking.

**Risk 7: GreenLink's own scope discipline.** The product is at its strongest when it is the two USPs done excellently and table stakes done competently. The temptation — under pressure from a design partner, or from your own ambition — to add features at the edges will compound. Every "small" feature added in v1 delays the moment when the two USPs are truly excellent. The standards document and this product document exist in large part to protect against this. **Watch metric**: number of v1 features outside the table-stakes list. **Trigger**: more than two scope additions in any month. **Response**: re-read Section 5.

**Risk 8: Single-developer / single-founder dependency.** GreenLink is currently built by you, with AI tooling, with one half-committed design partner club. That is a viable starting position but a fragile one. The technical risks are mitigated by AI-augmented engineering and the discipline of this review process. The commercial risks (sales, customer support, account management, partnership negotiation) are not yet mitigated. **Watch metric**: time spent on commercial vs. technical work per week. **Trigger**: persistent imbalance toward technical work while v1 launch approaches. **Response**: identify the specific commercial role most needed (technical sales? customer success? CMASA partnership lead?) and either bring in a partner or contract help. The product alone does not win the market.

---

## 9. The launch plan

GreenLink launches when v1 is real. v1 is defined in Sections 3 through 7 with bridge logic applied. The launch window the research identifies — the HNA-DotGolf integration fatigue across Clubmaster's installed base — is real and finite, but it is wide enough to accommodate disciplined execution at the right pace. Speed matters; correctness matters more. Shipping a broken v1 to capture a window is how clubs get burned and GreenLink loses its founding reference.

### The strategic window

The HNA-DotGolf transition stabilises through 2026 and into 2027. Every Clubmaster-powered club is currently experiencing some degree of handicap-data friction at check-in. Integration fatigue is high. Switching costs across the SA installed base are lower than they have been at any point in the last five years and lower than they are likely to be for the next five. **The window is open through at least Q4 2026 with high confidence, and likely well into 2027.** The window does not stay open indefinitely — competitors will close their HNA integrations, Clubmaster will eventually patch through the transition pain, BRS Premier may arrive in scale.

### Milestones, not months

GreenLink runs on milestones with explicit done-when criteria. The calendar is a function of the milestones, not the other way around.

**Milestone 1 — Internal alpha.**

*Done when* the founder can sit in front of GreenLink for a full simulated club day — staff side and member side — and the operational rhythm works without surprises. Specifically: rebuilt tee sheet meeting the Section 3.1 standard, member PWA delivering three-tap booking, handicap entry with HandicapsSA link-out, unified POS with charge-to-member by PIN, daily close producing a Pastel-Partner-compatible import file that opens cleanly in a test Pastel installation, audit logs on every state transition.

*Pre-conditions*: Phase 5 (schema integrity) complete. Tee sheet rebuild brief produced with Claude Design. Pastel Partner CSV import format documented. HandicapsSA's public-facing surfaces verified.

**Milestone 2 — Design partner go-live.**

*Done when* the first paying club has been running on GreenLink in production for a full week including a Saturday, daily close is happening cleanly each night, members are booking via the player app, no critical incidents, no manual workarounds in use by staff.

*Pre-conditions*: Milestone 1 complete. Design-partner club configured (tenant, chart-of-accounts mapping with their bookkeeper, member list imported, staff trained on the new tee sheet in a staging environment, members onboarded to the player app). Support process in place — at minimum a direct line from the GM to the founder during the first two weeks of operation. Rollback plan documented if something breaks.

**Milestone 3 — Second wave.**

*Done when* three to five clubs are live on GreenLink, the onboarding flow is a documented product surface rather than a manual founder-executed process, CMASA conversation has begun, and v1.5 features (no-show prediction, Operations Q&A) are shipping from the data accumulated across the live clubs.

*Pre-conditions*: Milestone 2 complete and stable for at least four weeks. Design-partner case study written. Identified pipeline of three to five clubs interested in adopting based on the case study. Onboarding playbook from Milestone 2 generalised into a process.

### What ships in v2 and v3

v2 begins once Milestone 3 is complete and the platform has the data history and customer base to justify deeper investment. The bridges built in v1 — Pastel CSV export, HandicapsSA link-out, manual DebiCheck — are replaced with their full-standard equivalents. Multi-club consolidation activates if a management-group customer is in pipeline. The first AI features dependent on data history (no-show prediction at higher accuracy, anomaly detection) come online.

v3 is the full standard: every integration real-time, multi-club mature, estate/HOA module if the market demand is there, CMASA benchmarking dashboard live, advanced AI features (tee-sheet optimisation, RAG-based staff onboarding, score-verification anti-cheat) shipping. v3 is what GreenLink looks like at ~25 live clubs and beyond.

### The single highest-leverage strategic move

Ship v1 with the bridges. Land the design partner. Run cleanly for a Saturday morning. Publish the case study. Win the second wave on referral from the first. **Then** invest the engineering capital in the real-time Pastel API, the live HNA integration, the conversational WhatsApp AI — funded by paying customers, justified by demonstrated demand, not by promise.

The window is open. The discipline is to ship the right v1 quickly, not to ship the wrong v3 slowly.

---

## 10. Current state — gap analysis

This section grades the GreenLink codebase as of commit `8271b88` (Phase 4 complete, 2026-05-11) against the v1 standard defined in Sections 3 through 7. The v1 standard is "the basic done pristinely, plus the USPs visibly deepened" — not feature-complete, not a list of every research item.

Each requirement gets one of five verdicts:
- **Built** — exists and meets the v1 bar.
- **Partial** — exists but with material gaps.
- **Stub** — file/route exists but is empty or placeholder.
- **Missing** — does not exist in the codebase.
- **Architectural** — depends on an architectural decision, not a feature build.

Verdicts are sourced from Phase 4.5 and Phase 4.6 read-only feature inventory reports.

### 10.1 What's already real

The codebase has substantial foundations:

- Working tee sheet grid (swimlane + classic layouts, density toggle), with three of five drag-drop primitives functional (move flight, split flight, lane change via cross-side flip drop). Optimistic updates work.
- Real pricing engine: 4-dimensional rule matrix (player_type × holes × day_type × season × time_band) with rule-evaluation service that produces `AppliedRuleTrace` and `PricingIgnoredTrace` — backend explainability is built, UI doesn't surface it yet.
- Working finance ledger: append-only `FinanceTransaction` rows, refund flow, five-step close-day wizard (exceptions → batch → reconcile → export → audit), generic CSV export.
- Multi-tenancy at the data layer: 24 models with explicit `club_id`, 9 with transitive tenancy. Consistent pattern. Application-layer enforcement via `TenancyService.resolve_context` in every route.
- Audit log infrastructure: `DomainEventRecord` table in active use with 18 emit sites across 6 services (`pos_service`, `order_service`, `order_settlement_service`, `platform_service`, `people_service`, `superadmin_onboarding_service`). Booking lifecycle and finance transactions do NOT emit — gap to fix in v1.
- Player area: `/player/*` route group with home, book, order, profile pages plus news feed (`usePublishedNewsFeedQuery`). Auth flow with refresh token rotation.

### 10.2 Three real defects (not "needs polish")

1. **Member booking sends `participants: []`** regardless of UI intent (`player-book-page.tsx:193`). A member booking a fourball creates a 1-person booking.
2. **MEMBER_ACCOUNT tender is disabled in POS terminal UI** (`admin-pos-terminal-page.tsx:46`). The whole point of a private club's POS — "charge to my account" — is unavailable at the till.
3. **No receipt generation anywhere.** Not HTML, not PDF, not thermal print. A member buys a sandwich at the halfway house and walks away with no record.

### 10.3 The v1 work list

Applying the discipline of Section 3 (bridges where the standard isn't built) and the principle that v1 deepens the USPs rather than chases feature parity:

**Backend / integration work — 16 items:**

1. Fix member booking party-size defect
2. Enable MEMBER_ACCOUNT at POS terminal
3. Optimistic locking / slot hold on tee sheet
4. Wire booking + finance + pricing services to emit audit events (using existing infrastructure)
5. VAT tagging at transaction level (legal requirement)
6. HNA Player ID field on person model
7. Real transactional email provider integration (booking confirmations, password resets, statements)
8. In-app message list / notifications backend
9. Member consent capture columns + onboarding flow (POPIA — legal)
10. Information Officer field + af-south-1 data residency defaults (POPIA — legal)
11. List-endpoint tenant-scoping audit (~91 endpoints)
12. Multi-tender per-acquirer reconciliation in close-day
13. Cash variance by employee tracking
14. Pastel export format validated against real Pastel installation
15. Daily KPI metrics — RevPATT, F&B per round, effective green fee
16. ErrorBoundary at route + critical-surface level

**Frontend rebuild surfaces — 11 surfaces, all Claude Design ground-up:**

1. Admin shell + navigation (Masters design language baseline)
2. Tee sheet — the headline rebuild, with explainable pricing surfaced
3. Pricing rules management with explainability runs both directions
4. Close-day wizard with multi-tender + cash variance visible
5. Finance / accounting export management with CoA mapping UI
6. Audit log viewer
7. Member directory + statement view (in-app, PDF generation defers to v1.5)
8. Communications composer (rebuilt, AI drafting defers to v1.5)
9. Reports / dashboard with proper KPI metrics
10. Settings + onboarding (including POPIA consent as a first-class moment)
11. Player shell + tab navigation + player surfaces (booking, handicap, statement, profile, score entry with HandicapsSA link-out)

### 10.4 What stays out of v1

Walk-in waitlist (v1.5), marshal-on-phone (v1.5), squeeze-insert drag (v1.5), player-promotion drag (v1.5), multi-course portfolio view (v1.5), recurring booking templates (v1.5), named block templates (v1.5), open-ticket F&B model (v1.5), tournament/society/shotgun mode (v2), AR aging buckets and AR-driven booking block (v1.5), Two-page Board Pack (v2), SMS integration (v1.5+), WhatsApp transactional (v1.5+), push notifications (v1.5), offline-first PWA / service worker / IndexedDB queue (v1.5), card-on-file tokenisation (v1.5), Yoco SDK in-person card (v1.5 — manual card entry in v1), DebiCheck (v2), PayShap (v2), real-time Pastel/Sage 200/Xero APIs (v2/v3), HNA push integration (v2), Tagmarshal integration (v2), Golf Genius integration (v2), multi-club consolidation (v2), estate/HOA module (v2/v3), find-a-fourth (v2), no-show prediction (v1.5+), Operations Q&A NL (v1.5+), anomaly detection (v2), AI member-comms drafting (v1.5), keyboard shortcuts help modal (v1.5), member statement PDF generation (v1.5).

---

## 11. The rebuild plan

This section sequences the v1 work into phases. The output of v1 is one design-partner club running on GreenLink in production. The phases are ordered by dependency and parallelism.

The plan rests on three commitments established in earlier sections:

**One.** The backend foundations stay. FastAPI, Postgres, Alembic, multi-tenancy, pricing engine, finance ledger, audit log infrastructure, read-model pattern — all remain. They get extended where v1 needs new capabilities. They do not get rebuilt.

**Two.** Every customer-facing surface gets rebuilt ground-up by Claude Design. The existing 3,284-line tee sheet, the existing close-day wizard, the existing player area, the existing admin pages — all reference material for what the backend supports, then deleted as the new surfaces land. The Masters of golf is the visual north star.

**Three.** v1 is "the basic done pristinely, plus the USPs visibly deepened." Not feature-complete. The USPs (tee sheet excellence, financial reconciliation with SA accounting) get full v1 attention. Everything else is bridged or deferred.

### Phase structure

Phases run in three tracks that interleave:

- **Foundation track** — schema integrity, design system, architectural decisions.
- **Backend extension track** — 16 items wiring new emissions into the existing audit log, adding fields, integrating providers, validating exports.
- **Frontend rebuild track** — 11 surfaces ground-up rebuilt, with Claude Design producing designs interleaved with Claude Code rebuilds.

Claude Design and Claude Code interleave in three bursts each. Each Claude Design burst is narrower and sharper than one giant upfront design phase would be. Each burst informs the next.

### The phase sequence

**Phase 5 — Schema integrity.**
Fix the `pricing_rules` enum-vs-VARCHAR drift. Switch `backend/tests/conftest.py` from `Base.metadata.create_all()` to actual Alembic migrations. Two days of focused work. Removes a class of error before any rebuild lands. *Claude Code only.*

**Phase 6 — Design system + foundation surfaces design.**
Establish the visual and interaction foundation: design system tokens (Augusta-grade restrained palette, editorial typography, density discipline), spacing scale, component primitives, accessibility rules including deuteranopia-safe palette. Design the admin shell + navigation, plus onboarding/settings. *Claude Design burst 1.*

**Phase 7 — Code foundation surfaces.**
Implement design tokens in CSS/Tailwind. Build admin shell to production quality. Build settings + onboarding (including POPIA consent moment). Build player shell + tab navigation. *Claude Code.*

**Phase 8 — Design USP surfaces.**
Tee sheet, close-day wizard, finance / accounting export, pricing rules management, audit log viewer. Bundled because they share design language and Masters aesthetics carry consistently across them. *Claude Design burst 2.*

**Phase 9 — Backend extension wave.**
Sixteen items, sequenced by dependency, parallelisable in sub-phases:
- *Sub-phase 9A — Legal and foundations:* POPIA fields, VAT tagging, HNA Player ID, tenant-scoping audit.
- *Sub-phase 9B — Audit log expansion:* wire booking + finance + pricing services to emit events. Foundation for both audit USP and AI feature-store.
- *Sub-phase 9C — Tee sheet correctness:* optimistic locking, slot hold model.
- *Sub-phase 9D — Finance USP deepening:* multi-tender per-acquirer reconciliation, cash variance by employee, Pastel export validation, KPI calculations.
- *Sub-phase 9E — Comms foundation:* transactional email provider, in-app notification list.

*Runs in parallel with Phase 8.* *Claude Code.*

**Phase 10 — Code USP surfaces.**
Tee sheet rebuild (with explainable pricing, optimistic locking signals, audit-log visibility built in). Pricing rules management. Close-day wizard rebuild. Finance / accounting export rebuild. Audit log viewer. *Claude Code.*

**Phase 11 — Design player + remaining supporting surfaces.**
Member directory + statement admin view, POS terminal (with MEMBER_ACCOUNT enabled, receipts, charge-to-member with PIN), communications composer, reports / dashboard. Plus all player surfaces — booking (fixing the participants defect), handicap, statement, profile, score entry with HandicapsSA link-out. *Claude Design burst 3.*

**Phase 12 — Code player + supporting surfaces.**
Build everything from Phase 11 to production quality. Old code deletes as new surfaces land. *Claude Code.*

**Phase 13 — ErrorBoundary + integration verification.**
ErrorBoundary at route and critical-surface level. Full simulated club day end-to-end. Performance budget verification. Member journey verification. *This phase complete = Milestone 1 (internal alpha) done.*

**Phase 14 — Design partner onboarding and go-live.**
Configure tenant, import member list, train GM and ops team, onboard membership, soft-launch period, cutover, first week of monitored operation, stabilisation. *This phase complete = Milestone 2 (design partner pilot) done.*

### What runs in parallel

- Phase 6 (design system + foundation surfaces design) runs in parallel with Phase 5 (schema integrity).
- Phase 9 (backend extension wave) runs in parallel with Phase 8 (USP surfaces design).
- Phase 9's sub-phases A through E run in parallel with each other where they don't share files.
- Most of Phase 11's surfaces can be designed in parallel once the language is set.

### What does not happen in v1

See Section 10.4 for the full v1.5 / v2 / v3 deferred list.

### Timeline framing

No calendar dates. Milestone-based per the discipline established in Section 9. Milestone 1 (internal alpha), Milestone 2 (design partner go-live), Milestone 3 (second wave). The strategic window through 2026 into 2027 is wide enough for disciplined execution at the right pace.

---

*End of PRODUCT.md.*
