-- Accounting settings for cashbook export mappings
CREATE TABLE IF NOT EXISTS accounting_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    green_fees_gl VARCHAR(50) DEFAULT '1000-000',
    vat_rate FLOAT DEFAULT 0.15,
    tax_type INT DEFAULT 1,
    cashbook_name VARCHAR(120) DEFAULT 'Main Bank',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed a single settings row if empty
INSERT INTO accounting_settings (green_fees_gl, vat_rate, tax_type, cashbook_name)
SELECT '1000-000', 0.15, 1, 'Main Bank'
WHERE NOT EXISTS (SELECT 1 FROM accounting_settings);
