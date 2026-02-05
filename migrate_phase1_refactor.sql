-- Phase 1 refactor migration (tee sheet authority + booking metadata)

-- Members table
CREATE TABLE IF NOT EXISTS members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_number VARCHAR(50) UNIQUE NULL,
    first_name VARCHAR(120) NOT NULL,
    last_name VARCHAR(120) NOT NULL,
    email VARCHAR(200) UNIQUE NULL,
    phone VARCHAR(50) NULL,
    handicap_number VARCHAR(50) NULL,
    home_club VARCHAR(120) NULL,
    active INT DEFAULT 1
);

-- Tee times: capacity + status
ALTER TABLE tee_times
    ADD COLUMN capacity INT DEFAULT 4,
    ADD COLUMN status VARCHAR(20) DEFAULT 'open';

-- Bookings: member link + source metadata + party size + notes
ALTER TABLE bookings
    ADD COLUMN member_id INT NULL,
    ADD COLUMN created_by_user_id INT NULL,
    ADD COLUMN source ENUM('proshop','member','external') DEFAULT 'proshop',
    ADD COLUMN external_provider VARCHAR(50) NULL,
    ADD COLUMN external_booking_id VARCHAR(100) NULL,
    ADD COLUMN party_size INT DEFAULT 1,
    ADD COLUMN notes TEXT NULL;

-- Booking status: add no_show
ALTER TABLE bookings
    MODIFY COLUMN status ENUM('booked','checked_in','completed','cancelled','no_show') DEFAULT 'booked';

-- Foreign keys
ALTER TABLE bookings
    ADD CONSTRAINT fk_bookings_member_id FOREIGN KEY (member_id) REFERENCES members(id),
    ADD CONSTRAINT fk_bookings_created_by_user_id FOREIGN KEY (created_by_user_id) REFERENCES users(id);

-- Helpful index for external sync
CREATE INDEX idx_bookings_external ON bookings(external_provider, external_booking_id);
