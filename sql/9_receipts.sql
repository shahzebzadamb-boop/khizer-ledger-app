-- Capital Lagoon payment receipts. Safe to re-run.
-- Does NOT drop tables or reset production financial data.
-- Apply on the live KHIZER LEDGER database only.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS receipt_sequences (
  ymd CHAR(8) NOT NULL,
  last_seq INT NOT NULL,
  PRIMARY KEY (ymd)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS receipts (
  id VARCHAR(191) NOT NULL,
  receipt_number VARCHAR(32) NOT NULL,
  payment_id VARCHAR(191) NOT NULL,
  client_id VARCHAR(191) NOT NULL,
  stay_id VARCHAR(191) NOT NULL,
  flat_id VARCHAR(191) NOT NULL,
  payment_date DATETIME(3) NOT NULL,
  amount_received INT NOT NULL,
  status ENUM('GENERATED','UPDATED','VOID') NOT NULL DEFAULT 'GENERATED',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  shared_at DATETIME(3) NULL,
  share_attempted_at DATETIME(3) NULL,
  version INT NOT NULL DEFAULT 1,
  voided_at DATETIME(3) NULL,
  snapshot_json LONGTEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY receipts_receipt_number_key (receipt_number),
  UNIQUE KEY receipts_payment_id_key (payment_id),
  KEY receipts_client_idx (client_id),
  KEY receipts_stay_idx (stay_id),
  KEY receipts_flat_idx (flat_id),
  KEY receipts_payment_date_idx (payment_date),
  KEY receipts_status_idx (status),
  KEY receipts_created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS receipt_versions (
  id VARCHAR(191) NOT NULL,
  receipt_id VARCHAR(191) NOT NULL,
  version INT NOT NULL,
  status ENUM('GENERATED','UPDATED','VOID') NOT NULL,
  snapshot_json LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY receipt_versions_receipt_version (receipt_id, version),
  KEY receipt_versions_receipt_idx (receipt_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
