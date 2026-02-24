# GreenLink Operations Dashboard Standards (2026)

This guide maps each GreenLink operation to practical dashboard KPIs and workflow expectations using current industry references.

## Sources used

- Lightspeed Golf report types and tee-sheet utilization metrics:
  - https://x-series-support.lightspeedhq.com/hc/en-us/articles/25533668262043-Custom-report-builder
  - https://www.golfmanager.com/en/blog/golf-club-management-indicators-kpi
- Retail/pro-shop inventory and sales KPI references:
  - https://www.shopify.com/ie/retail/inventory-management
  - https://squareup.com/ie/en/townsquare/restaurant-inventory-management-best-practices
- Food-and-beverage revenue and transaction context:
  - https://restaurant.org/research-and-media/research/economists-notebook/analysis-commentary/restaurant-sales-highlights-july-2024/
  - https://squareup.com/us/en/the-bottom-line/operating-your-business/how-to-calculate-inventory-turnover-for-your-retail-business
- Consumer-level golf demand context:
  - https://www.ngf.org/new-ngf-research-shows-golf-gained-3-4-million-beginners-in-2023/
- Hospitality operations and forecasting context:
  - https://www.hoteltechreport.com/news/hotel-occupancy-rate
  - https://kb.7shifts.com/hc/en-us/articles/23974158604275-Optimal-Labor

## Recommended KPI split by tab

## `Dashboard (All)`
- Revenue today by stream: Golf, Pro Shop, and non-golf imported streams.
- Keep one combined executive view, then drill into stream dashboards.

## `Golf Dashboard`
- Tee utilization (occupied slots / available slots).
- Bookings today, paid rounds today, and no-shows today.
- Keep targets-vs-actual and golf revenue trend visible here.

## `Pro Shop Dashboard`
- Sales today, transactions today, average basket value.
- Low-stock item count and active SKU count.
- Top sellers by revenue/units over rolling 30 days.

## `Pub Dashboard` / `Bowls Dashboard` / `Other Dashboard`
- Revenue today, transactions today.
- Revenue last 7 days and average ticket last 7 days.
- Top categories by value (from imported data categories).

## What was implemented in this round

- Stream split now includes `golf` and `pro_shop` as separate dashboard streams.
- Sidebar now has separate `Golf` and `Pro Shop` groups with dedicated dashboard links.
- Dashboard cards are stream-aware and now prioritize operational KPIs:
  - All: revenue today, transactions today, avg ticket (7d), 7d trend vs prior week.
  - Golf: tee occupancy, paid rounds, revenue per paid round, no-show rate.
  - Pro Shop: sales today, transactions today, avg basket (7d), low-stock rate.
  - Pub/Bowls/Other: revenue today, transactions today, avg ticket (7d), 7d trend.
- Golf-only sections (targets + monthly golf trend + booking-status card) hide automatically on non-golf dashboards.
- Added operational highlights table:
  - All: revenue-mix split by operation.
  - Golf: tee-sheet and conversion signals.
  - Pro Shop: inventory health + top sellers.
  - Pub/Bowls/Other: top imported categories + transaction context.
- Dashboard stream switching is always available (no lock mode), including when entering from individual operation dashboard links.
- Revenue import stream options now include `pro_shop`.

## AI quick wins (low-effort, high-value)

1. **Reorder assistant (Pro Shop)**  
   Compute days-of-cover using last 30-day sales velocity and flag SKUs below threshold.

2. **Revenue anomaly alerts (Pub/Bowls/Other)**  
   Detect daily revenue outliers vs rolling 7-day baseline and show “check import/source” prompts.

3. **Smart categorization for imported revenue**  
   Auto-suggest category mapping for uncategorized rows, then learn accepted mappings.

4. **Staffing guidance from booking/sales load**  
   Suggest staffing bands by hour from tee-sheet load + POS transaction curves.
