-- Run this SQL to update your database with new fields

-- Add new columns to users table
ALTER TABLE users 
ADD COLUMN role ENUM('admin', 'club_staff', 'player') DEFAULT 'player',
ADD COLUMN handicap_number VARCHAR(50),
ADD COLUMN greenlink_id VARCHAR(50) UNIQUE;

-- Add new columns to bookings table
ALTER TABLE bookings 
ADD COLUMN handicap_number VARCHAR(50),
ADD COLUMN greenlink_id VARCHAR(50),
ADD COLUMN price FLOAT DEFAULT 350.0;

-- Add new column to rounds table
ALTER TABLE rounds 
ADD COLUMN handicap_sa_round_id VARCHAR(100);

-- Add new columns to ledger_entries table
ALTER TABLE ledger_entries 
ADD COLUMN pastel_synced INT DEFAULT 0,
ADD COLUMN pastel_transaction_id VARCHAR(100);
