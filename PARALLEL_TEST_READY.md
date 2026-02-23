# 30-Day Parallel (Mirror) Test: CSV Imports

This repo now supports **mirror-only** parallel testing by importing daily CSV exports from upstream systems.

## What “mirror” means

- GreenLink does **not** create bookings in the upstream systems during the trial.
- Instead, GreenLink **imports** tee-sheet bookings and revenue from daily CSV exports and reports on them.

## Admin CSV import endpoints

All endpoints require an **admin** JWT (`Authorization: Bearer <token>`).

### Revenue (pub / bowls / other)

- `POST /api/admin/imports/revenue-csv?stream=pub|bowls|golf|other`
- Body: `multipart/form-data` with a single file field named `file`

Expected columns (header names are flexible; common aliases work):
- Date: `transaction_date` / `date` / `posted_date` / `payment_date`
- Amount: `amount` / `total` / `value` / `gross` / `net_amount`
- Optional ID: `external_id` / `transaction_id` / `id` / `receipt_no` / `reference`
- Optional: `description` / `details` / `memo`
- Optional: `category` / `department` / `type`

### Bookings (tee sheet mirror)

- `POST /api/admin/imports/bookings-csv?provider=golfscape|hna|other`
- Body: `multipart/form-data` with a single file field named `file`

Recommended “one row per player/slot” columns:
- Tee time: `tee_time` (ISO datetime) OR `date` + `time`
- Tee: `tee` / `hole` / `start_tee` (e.g. `1` or `10`)
- Booking group ID: `booking_id` / `reservation_id` / `id` (optional but recommended)
- Player: `player_name` / `name` / `player`
- Optional: `player_email` / `email`
- Optional: `member_number` / `member_no` (for linking to members)
- Optional: `status` (`booked`, `checked_in`, `completed`, `cancelled`, `no_show`)
- Optional: `price` / `amount` / `fee` (per-player amount)
- Optional: `holes` (9/18)
- Optional: `prepaid` (true/false)
- Optional: `line_id` / `player_id` (preferred for stable idempotent imports)

### Members (for pro shop member lookup)

- `POST /api/admin/imports/members-csv`
- Body: `multipart/form-data` with a single file field named `file`

Expected columns:
- `member_number` (recommended)
- `first_name`, `last_name` (or `name`)
- Optional: `email`, `phone`, `handicap_number`, `home_club`

## What to verify during the 30 days

- **Data freshness:** confirm “last import” timestamps on the dashboard match the daily CSV cadence.
- **Reconciliation:** golf paid revenue vs ledger, plus “other revenue” totals from imports.
- **Tee sheet integrity:** imported bookings populate tee times without dropping rows; capacity conflicts are flagged.

## Sample CSVs (for demos)

See `sample_csv/members.csv`, `sample_csv/revenue_pub.csv`, and `sample_csv/bookings_golfscape.csv`.

## Demo seed data (local)

To auto-seed members, tee times, historical + future bookings, payment methods, and imported revenue streams:

```powershell
$env:DEMO_SEED_ADMIN="1"
$env:DEMO_SEED_DATA="1"
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
