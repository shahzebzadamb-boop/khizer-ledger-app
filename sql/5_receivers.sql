-- KHIZER LEDGER production schema update: payment receivers.
-- Safe to re-run. Does NOT drop tables. Does NOT delete business history.
-- Seed only Anas and Khizer. Apply on the live KHIZER LEDGER database only.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS receivers (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  name VARCHAR(191) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY receivers_name_key (name),
  KEY receivers_active_idx (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO receivers (id, createdAt, name, active)
VALUES
  ('recv_anas', UTC_TIMESTAMP(3), 'Anas', 1),
  ('recv_khizer', UTC_TIMESTAMP(3), 'Khizer', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  active = 1;

SET @db := DATABASE();
SET @has_received_by := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'payments'
    AND COLUMN_NAME = 'receivedById'
);
SET @sql := IF(
  @has_received_by = 0,
  'ALTER TABLE payments ADD COLUMN receivedById VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_received_by_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'payments'
    AND INDEX_NAME = 'payments_receivedById_idx'
);
SET @sql := IF(
  @has_received_by_idx = 0,
  'ALTER TABLE payments ADD KEY payments_receivedById_idx (receivedById)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_received_by_fk := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'payments'
    AND CONSTRAINT_NAME = 'payments_receivedById_fkey'
);
SET @sql := IF(
  @has_received_by_fk = 0,
  'ALTER TABLE payments ADD CONSTRAINT payments_receivedById_fkey FOREIGN KEY (receivedById) REFERENCES receivers(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
