# Supabase (Postgres) Setup

This project currently defaults to **MySQL** (via `MYSQL_*` vars), but it can use **Supabase Postgres** by setting a full SQLAlchemy `DATABASE_URL`.

## Where to run SQL in Supabase

### Option 1: Supabase Dashboard (easiest)
- Supabase Project → **SQL Editor**
- Paste and run: `supabase/migrations/20260204000100_fee_categories.sql`
- If you already ran an earlier version and see an error like `invalid input value for enum fee_type: "GOLF"`, also run: `supabase/migrations/20260204000200_fee_type_uppercase.sql`

### Option 2: Supabase CLI (recommended for teams)
- Put SQL migrations under `supabase/migrations/`
- Apply them with Supabase CLI (exact commands depend on how you link your project)

## App config for Supabase

### 1) Install Postgres driver
From repo root:
```powershell
cd "c:\Users\athom\Documents\Projects\GreenLink\Greenlink"
.\.venv\Scripts\python.exe -m pip install -r ".\requirements.txt"
.\.venv\Scripts\python.exe -m pip install -r ".\requirements.postgres.txt"
```

### 2) Set `DATABASE_URL`
In your `.env` (do not commit secrets), set:
```env
DATABASE_URL=postgresql+psycopg://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres
```

The app prefers `DATABASE_URL` if present; otherwise it uses `MYSQL_*` variables (`app/database.py`).

### 3) Run migrations
Run the SQL in Supabase (SQL Editor) or via Supabase CLI. At minimum, run:
- `supabase/migrations/20260204000100_fee_categories.sql`

## Notes
- `create_fees_table.sql` is **MySQL syntax**; it will not run on Supabase.
- If you want *full* migration to Supabase (all tables, not only `fee_categories`), confirm and we can generate/port the rest of the schema too.
