-- Monthly report snapshots. Safe to re-run. Does NOT drop tables or financial rows.
-- Unique (year, month) prevents duplicate September 2026 reports.
-- Apply on the live KHIZER LEDGER database only.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS monthly_reports (
  id VARCHAR(191) NOT NULL,
  year SMALLINT NOT NULL,
  month TINYINT NOT NULL,
  period_start DATETIME(3) NOT NULL,
  period_end DATETIME(3) NOT NULL,
  business_total BIGINT NOT NULL DEFAULT 0,
  received_total BIGINT NOT NULL DEFAULT 0,
  expenses_total BIGINT NOT NULL DEFAULT 0,
  ending_pending_total BIGINT NOT NULL DEFAULT 0,
  carried_forward_pending BIGINT NOT NULL DEFAULT 0,
  new_pending_generated BIGINT NOT NULL DEFAULT 0,
  pending_collected BIGINT NOT NULL DEFAULT 0,
  closing_outstanding BIGINT NOT NULL DEFAULT 0,
  total_stays INT NOT NULL DEFAULT 0,
  total_nights INT NOT NULL DEFAULT 0,
  total_clients INT NOT NULL DEFAULT 0,
  status ENUM('FINAL','UPDATED') NOT NULL DEFAULT 'FINAL',
  version INT NOT NULL DEFAULT 1,
  detailsJson LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  finalized_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY monthly_reports_year_month (year, month),
  KEY monthly_reports_year_idx (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
