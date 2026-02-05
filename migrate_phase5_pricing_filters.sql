-- Phase 5: Pricing filters for automatic fee selection
--
-- Adds optional columns to `fee_categories` used to automatically pick a fee based on booking details.
-- Run once.

ALTER TABLE fee_categories
  ADD COLUMN audience VARCHAR(30) NULL,
  ADD COLUMN gender VARCHAR(10) NULL,
  ADD COLUMN day_kind VARCHAR(10) NULL,
  ADD COLUMN weekday TINYINT NULL,
  ADD COLUMN holes TINYINT NULL,
  ADD COLUMN min_age INT NULL,
  ADD COLUMN max_age INT NULL,
  ADD COLUMN priority INT DEFAULT 0;

CREATE INDEX idx_audience ON fee_categories (audience);
CREATE INDEX idx_day_kind ON fee_categories (day_kind);
CREATE INDEX idx_weekday ON fee_categories (weekday);
CREATE INDEX idx_holes ON fee_categories (holes);
CREATE INDEX idx_gender ON fee_categories (gender);
CREATE INDEX idx_min_age ON fee_categories (min_age);
CREATE INDEX idx_max_age ON fee_categories (max_age);
CREATE INDEX idx_priority ON fee_categories (priority);

