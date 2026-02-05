-- Supabase / Postgres fixup migration:
-- If `fee_type` was created with lowercase values, add the uppercase values the app inserts.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fee_type') THEN
    BEGIN
      ALTER TYPE fee_type ADD VALUE IF NOT EXISTS 'GOLF';
      ALTER TYPE fee_type ADD VALUE IF NOT EXISTS 'CART';
      ALTER TYPE fee_type ADD VALUE IF NOT EXISTS 'COMPETITION';
      ALTER TYPE fee_type ADD VALUE IF NOT EXISTS 'DRIVING_RANGE';
      ALTER TYPE fee_type ADD VALUE IF NOT EXISTS 'OTHER';
    EXCEPTION
      WHEN duplicate_object THEN
        -- Safe on re-run
        NULL;
    END;
  END IF;
END $$;

