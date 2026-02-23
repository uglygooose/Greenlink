# Club Onboarding (30‑Day Parallel / Mirror Test)

This doc is a **club-agnostic** intake checklist for running GreenLink in a **mirror-only** 30‑day parallel test.

Mirror-only means:
- GreenLink does **not** create bookings in the club’s upstream system during the trial.
- GreenLink **imports daily CSV exports** (bookings + revenue + members) and reports/reconciles from that data.

---

## 1) Club Profile Settings (required once)

These settings make the UI/labels and “member vs visitor” logic adapt per club without code changes.

Provide:
- `club_name` (display name)
- `club_slug` (short identifier; optional)
- `logo_url` (recommended: keep `/frontend/assets/logo.png`, or provide a club-specific path)
- `currency_symbol` (e.g. `R`)
- Player-type labels (optional, but recommended):
  - `member_label` (e.g. “Member” / “Club Member”)
  - `visitor_label` (e.g. “Affiliated Visitor”)
  - `non_affiliated_label` (e.g. “Visitor (No HNA)”)
- `home_club_keywords` (required): list of strings that identify **this** club in a player’s “home club” field.
  - Example: `["umhlali", "umhlali country club", "umhlali cc"]`
  - This drives: “If a user signs up as ‘Member’, are they a member of *this* club or actually a visitor?”
- `suggested_home_clubs` (optional): a list used to populate the signup/profile “Home club” dropdown.

How to set:
- Admin API:
  - `GET  /api/admin/club-profile`
  - `PUT  /api/admin/club-profile` (JSON body; stores values in `club_settings`)
- Or environment variables (deployment-time):
  - `CLUB_NAME`, `CLUB_SLUG`, `CLUB_LOGO_URL`, `CLUB_CURRENCY_SYMBOL`, `CLUB_HOME_CLUB_KEYWORDS`, etc.

---

## 2) Daily CSV Imports (required for the 30 days)

You need a daily cadence (usually “end of day”) for:
1) Tee sheet bookings (mirror)
2) Other revenue streams (pub/bowls/other) (mirror)
3) Members list (initial load, then updates as needed)

General CSV requirements:
- Encoding: UTF‑8 (UTF‑8‑SIG also works)
- One header row
- Dates/times should be **club-local** (avoid timezone suffixes unless you’re consistent)
- File should be “idempotent-friendly”: stable IDs so re-importing does not duplicate rows

### A) Bookings CSV (tee sheet mirror)

Endpoint:
- `POST /api/admin/imports/bookings-csv?provider=golfscape|hna|other`

Strongly recommended (for clean de-dupe / idempotency):
- `booking_id` (upstream booking/group identifier)
- `line_id` (unique per player/line within the booking)

Minimum required:
- Tee time (one of):
  - `tee_time` (ISO datetime like `2026-02-20T06:30:00`)
  - OR `date` + `time` (e.g. `2026-02-20` + `06:30`)
- `tee` / `hole` / `start_tee` (e.g. `1` or `10`)
- `player_name` (or `name` / `player`)

Optional but recommended:
- `player_email`
- `member_number` (links to members)
- `status` (supported: `booked`, `checked_in`, `completed`, `cancelled`, `no_show`)
- `price` (per player)
- `holes` (9/18)
- `prepaid` (`true/false`, `1/0`, `yes/no`)

If `booking_id` + `line_id` are missing:
- GreenLink will generate a deterministic `external_row_id` from provider + booking_id + tee_time + name/email.
- If names/emails change between exports, duplicates can occur. That’s why stable IDs matter.

### B) Revenue CSV (pub / bowls / other)

Endpoint:
- `POST /api/admin/imports/revenue-csv?stream=pub|bowls|golf|other`

Minimum required:
- `transaction_date` (or `date` / `posted_date` / `payment_date`)
- `amount` (or `total` / `value` / `gross` / `net_amount`)

Strongly recommended:
- `external_id` (or `transaction_id` / `receipt_no` / `reference`)

Optional:
- `description` / `memo` / `narration`
- `category` / `department` / `type`
- If you want one combined file: include `stream`/`department` and GreenLink can split it.

If `external_id` is missing:
- GreenLink generates an `auto:` ID from row content. This can still duplicate if two rows are identical.

### C) Members CSV (member lookup)

Endpoint:
- `POST /api/admin/imports/members-csv`

Minimum required:
- `first_name` + `last_name` (or `name`)

Strongly recommended:
- `member_number`
- `email`

Optional:
- `phone`
- `handicap_number`
- `home_club`
- `handicap_sa_id`
- `handicap_index`
- `gender`, `player_category`

Notes:
- `member_number` and `email` are treated as unique identifiers where possible; confirm how the club wants duplicates handled.

---

## 3) What to Request From Any Club (copy/paste checklist)

1) Club profile values:
   - Club name:
   - Home-club keywords (list):
   - Currency symbol:
   - Logo file (PNG preferred) OR hosted URL:
   - Labels for Member / Affiliated Visitor / Non-affiliated Visitor:

2) For bookings mirror CSV export:
   - Booking system/provider name:
   - Export frequency (daily at what time?):
   - Confirm the export includes `booking_id` and per-player `line_id` (or equivalent):
   - Confirm the export includes tee time + tee (1/10) + player name:

3) For revenue mirror CSV export:
   - Which non-golf revenue streams are in scope? (pub / bowls / halfway / shop / other)
   - Export includes `transaction_date`, `amount`, and a stable `external_id`:

4) Member list:
   - Initial full member list CSV (and update cadence):
   - Confirm fields: member_number, name, email, phone:

5) Trial operations:
   - Who uploads files daily (name + email)?
   - Who is the GreenLink admin (name + email)?

