-- Fix fee_type values from lowercase to uppercase

UPDATE fee_categories SET fee_type = 'GOLF' WHERE fee_type = 'golf';
UPDATE fee_categories SET fee_type = 'CART' WHERE fee_type = 'cart';
UPDATE fee_categories SET fee_type = 'COMPETITION' WHERE fee_type = 'competition';
UPDATE fee_categories SET fee_type = 'DRIVING_RANGE' WHERE fee_type = 'driving_range';
UPDATE fee_categories SET fee_type = 'OTHER' WHERE fee_type = 'other';

-- Verify the update
SELECT fee_type, COUNT(*) as count FROM fee_categories GROUP BY fee_type;
