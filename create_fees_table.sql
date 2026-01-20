-- Create fee_categories table for 2026 pricing
CREATE TABLE IF NOT EXISTS fee_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code INT UNIQUE NOT NULL,
    description VARCHAR(500) NOT NULL,
    price FLOAT NOT NULL,
    fee_type ENUM('GOLF', 'CART', 'COMPETITION', 'DRIVING_RANGE', 'OTHER') DEFAULT 'GOLF',
    active INT DEFAULT 1,
    INDEX idx_code (code),
    INDEX idx_fee_type (fee_type)
);

-- Add fee_category_id to bookings table
ALTER TABLE bookings ADD COLUMN fee_category_id INT NULL;
ALTER TABLE bookings ADD FOREIGN KEY (fee_category_id) REFERENCES fee_categories(id);
