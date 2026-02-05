-- Create fee_categories table for 2026 pricing
CREATE TABLE IF NOT EXISTS fee_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code INT UNIQUE NOT NULL,
    description VARCHAR(500) NOT NULL,
    price FLOAT NOT NULL,
    fee_type ENUM('GOLF', 'CART', 'COMPETITION', 'DRIVING_RANGE', 'OTHER') DEFAULT 'GOLF',
    active INT DEFAULT 1,
    audience VARCHAR(30) NULL,
    gender VARCHAR(10) NULL,
    day_kind VARCHAR(10) NULL,
    weekday TINYINT NULL,
    holes TINYINT NULL,
    min_age INT NULL,
    max_age INT NULL,
    priority INT DEFAULT 0,
    INDEX idx_code (code),
    INDEX idx_fee_type (fee_type),
    INDEX idx_audience (audience),
    INDEX idx_day_kind (day_kind),
    INDEX idx_weekday (weekday),
    INDEX idx_holes (holes),
    INDEX idx_gender (gender),
    INDEX idx_min_age (min_age),
    INDEX idx_max_age (max_age),
    INDEX idx_priority (priority)
);

-- Add fee_category_id to bookings table
-- Idempotent: avoid failing if the column/foreign key already exists.

SET @col_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'fee_category_id'
);

SET @sql := IF(
    @col_exists = 0,
    'ALTER TABLE bookings ADD COLUMN fee_category_id INT NULL',
    'SELECT \"fee_category_id already exists\"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'fee_category_id'
      AND REFERENCED_TABLE_NAME = 'fee_categories'
);

SET @sql := IF(
    @fk_exists = 0,
    'ALTER TABLE bookings ADD CONSTRAINT fk_bookings_fee_category_id FOREIGN KEY (fee_category_id) REFERENCES fee_categories(id)',
    'SELECT \"fee_category_id foreign key already exists\"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
