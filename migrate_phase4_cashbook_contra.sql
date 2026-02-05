-- Add cashbook contra account for Sage cashbook imports
ALTER TABLE accounting_settings
ADD COLUMN cashbook_contra_gl VARCHAR(50) DEFAULT '8400/000';

-- Backfill if existing row has no contra account set
UPDATE accounting_settings
SET cashbook_contra_gl = '8400/000'
WHERE cashbook_contra_gl IS NULL OR cashbook_contra_gl = '';
