-- KHIZER LEDGER clean install.
-- Import into a NEW EMPTY MySQL database.
-- Schema only, plus system settings and the default receiver Khizer.
-- No apartments. No clients, stays, payments, expenses, receipts, or history.

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE users (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  name VARCHAR(191) NOT NULL,
  role VARCHAR(191) NOT NULL DEFAULT 'owner',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_settings (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  settingKey VARCHAR(191) NOT NULL,
  settingValue TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY app_settings_settingKey (settingKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE flats (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  name VARCHAR(191) NOT NULL,
  sortOrder INT NOT NULL DEFAULT 0,
  displayName VARCHAR(191) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  archivedAt DATETIME(3) NULL,
  updatedAt DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY flats_name_key (name),
  KEY flats_sortOrder_idx (sortOrder)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE receivers (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  name VARCHAR(191) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY receivers_name_key (name),
  KEY receivers_active_idx (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE clients (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  name VARCHAR(191) NOT NULL,
  phone VARCHAR(191) NULL,
  phoneNormalized VARCHAR(191) NULL,
  phoneMissing TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY clients_phoneNormalized_key (phoneNormalized),
  KEY clients_name_idx (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stays (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  flatId VARCHAR(191) NOT NULL,
  clientId VARCHAR(191) NOT NULL,
  checkIn DATETIME(3) NOT NULL,
  checkOut DATETIME(3) NOT NULL,
  nights INT NOT NULL,
  notifyEnabled TINYINT(1) NOT NULL DEFAULT 0,
  activePending TINYINT(1) NOT NULL DEFAULT 0,
  importKey VARCHAR(191) NULL,
  legacyNote TEXT NULL,
  voided TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY stays_importKey_key (importKey),
  KEY stays_flatId_idx (flatId),
  KEY stays_clientId_idx (clientId),
  KEY stays_checkIn_idx (checkIn),
  KEY stays_activePending_idx (activePending),
  CONSTRAINT stays_flatId_fkey FOREIGN KEY (flatId) REFERENCES flats(id),
  CONSTRAINT stays_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE business_entries (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  stayId VARCHAR(191) NOT NULL,
  clientId VARCHAR(191) NOT NULL,
  flatId VARCHAR(191) NOT NULL,
  amount BIGINT NOT NULL,
  occurredAt DATETIME(3) NOT NULL,
  importKey VARCHAR(191) NULL,
  note TEXT NULL,
  voided TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY business_entries_importKey_key (importKey),
  KEY business_entries_stayId_idx (stayId),
  KEY business_entries_flatId_idx (flatId),
  KEY business_entries_occurredAt_idx (occurredAt),
  KEY business_entries_flat_occurred_idx (flatId, occurredAt),
  CONSTRAINT business_entries_stayId_fkey FOREIGN KEY (stayId) REFERENCES stays(id) ON DELETE CASCADE,
  CONSTRAINT business_entries_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id),
  CONSTRAINT business_entries_flatId_fkey FOREIGN KEY (flatId) REFERENCES flats(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  stayId VARCHAR(191) NULL,
  clientId VARCHAR(191) NOT NULL,
  flatId VARCHAR(191) NULL,
  amount BIGINT NOT NULL,
  method ENUM('CASH','EASYPAISA','BANK_TRANSFER','JAZZCASH','OTHER') NOT NULL,
  receivedAt DATETIME(3) NOT NULL,
  notes TEXT NULL,
  importKey VARCHAR(191) NULL,
  receivedById VARCHAR(191) NULL,
  voided TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY payments_importKey_key (importKey),
  KEY payments_clientId_idx (clientId),
  KEY payments_stayId_idx (stayId),
  KEY payments_flatId_idx (flatId),
  KEY payments_receivedAt_idx (receivedAt),
  KEY payments_flat_received_idx (flatId, receivedAt),
  KEY payments_receivedById_idx (receivedById),
  CONSTRAINT payments_stayId_fkey FOREIGN KEY (stayId) REFERENCES stays(id) ON DELETE SET NULL,
  CONSTRAINT payments_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id),
  CONSTRAINT payments_flatId_fkey FOREIGN KEY (flatId) REFERENCES flats(id),
  CONSTRAINT payments_receivedById_fkey FOREIGN KEY (receivedById) REFERENCES receivers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expenses (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  flatId VARCHAR(191) NULL,
  amount BIGINT NOT NULL,
  category ENUM('CLEANING','GROCERIES','ELECTRICITY','GAS','INTERNET','MAINTENANCE','PLUMBING','REPAIRS','FURNITURE','BEDSHEETS_LINEN','SUPPLIES','STAFF','COMMISSION','WATER','OTHER') NOT NULL,
  description VARCHAR(191) NOT NULL,
  method ENUM('CASH','EASYPAISA','BANK_TRANSFER','JAZZCASH','OTHER') NOT NULL,
  spentAt DATETIME(3) NOT NULL,
  notes TEXT NULL,
  importKey VARCHAR(191) NULL,
  voided TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY expenses_importKey_key (importKey),
  KEY expenses_spentAt_idx (spentAt),
  KEY expenses_flatId_idx (flatId),
  KEY expenses_flat_spent_idx (flatId, spentAt),
  CONSTRAINT expenses_flatId_fkey FOREIGN KEY (flatId) REFERENCES flats(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE security_transactions (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  clientId VARCHAR(191) NOT NULL,
  stayId VARCHAR(191) NULL,
  flatId VARCHAR(191) NULL,
  kind ENUM('RECEIVED','ADJUSTED_TO_RENT') NOT NULL,
  amount BIGINT NOT NULL,
  occurredAt DATETIME(3) NOT NULL,
  notes TEXT NULL,
  voided TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY security_clientId_idx (clientId),
  KEY security_occurredAt_idx (occurredAt),
  CONSTRAINT security_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id),
  CONSTRAINT security_stayId_fkey FOREIGN KEY (stayId) REFERENCES stays(id) ON DELETE SET NULL,
  CONSTRAINT security_flatId_fkey FOREIGN KEY (flatId) REFERENCES flats(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE discounts (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  stayId VARCHAR(191) NOT NULL,
  clientId VARCHAR(191) NOT NULL,
  flatId VARCHAR(191) NOT NULL,
  amount BIGINT NOT NULL,
  occurredAt DATETIME(3) NOT NULL,
  note TEXT NULL,
  voided TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY discounts_stayId_idx (stayId),
  KEY discounts_occurredAt_idx (occurredAt),
  CONSTRAINT discounts_stayId_fkey FOREIGN KEY (stayId) REFERENCES stays(id) ON DELETE CASCADE,
  CONSTRAINT discounts_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id),
  CONSTRAINT discounts_flatId_fkey FOREIGN KEY (flatId) REFERENCES flats(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE withdrawals (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  amount BIGINT NOT NULL,
  occurredAt DATETIME(3) NOT NULL,
  note TEXT NULL,
  voided TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY withdrawals_occurredAt_idx (occurredAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  kind ENUM('CLIENT_PENDING','NIGHT_SUMMARY') NOT NULL,
  title VARCHAR(191) NOT NULL,
  body TEXT NOT NULL,
  scheduledFor DATETIME(3) NOT NULL,
  sentAt DATETIME(3) NULL,
  clientId VARCHAR(191) NULL,
  stayId VARCHAR(191) NULL,
  cycleDate VARCHAR(191) NOT NULL,
  hour INT NOT NULL,
  PRIMARY KEY (id),
  KEY notifications_scheduledFor_idx (scheduledFor),
  KEY notifications_cycle_idx (cycleDate, hour),
  CONSTRAINT notifications_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_cycles (
  id VARCHAR(191) NOT NULL,
  cycleDate VARCHAR(191) NOT NULL,
  summarySentAt DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY notification_cycles_cycleDate_key (cycleDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reminder_silences (
  id VARCHAR(191) NOT NULL,
  clientId VARCHAR(191) NOT NULL,
  cycleDate VARCHAR(191) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY reminder_silences_client_cycle (clientId, cycleDate),
  CONSTRAINT reminder_silences_clientId_fkey FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activity_logs (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  action VARCHAR(191) NOT NULL,
  entityType VARCHAR(191) NOT NULL,
  entityId VARCHAR(191) NOT NULL,
  summary TEXT NOT NULL,
  PRIMARY KEY (id),
  KEY activity_logs_createdAt_idx (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  action VARCHAR(191) NOT NULL,
  entityType VARCHAR(191) NOT NULL,
  entityId VARCHAR(191) NOT NULL,
  originalValue TEXT NULL,
  newValue TEXT NULL,
  reason TEXT NULL,
  PRIMARY KEY (id),
  KEY audit_logs_createdAt_idx (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE migration_records (
  id VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sourceFile VARCHAR(191) NOT NULL,
  sourceSheet VARCHAR(191) NOT NULL,
  sourceRow INT NOT NULL,
  sourceText TEXT NOT NULL,
  flatName VARCHAR(191) NOT NULL,
  customer VARCHAR(191) NULL,
  occurredOn DATETIME(3) NULL,
  proposedType VARCHAR(191) NOT NULL,
  amount BIGINT NULL,
  reason TEXT NOT NULL,
  status ENUM('NEEDS_REVIEW','CONFIRMED','IGNORED') NOT NULL DEFAULT 'NEEDS_REVIEW',
  pendingDecision ENUM('UNDECIDED','STILL_PENDING','ALREADY_PAID','IGNORE') NOT NULL DEFAULT 'UNDECIDED',
  stayId VARCHAR(191) NULL,
  monthLabel VARCHAR(191) NULL,
  currentInterpretation TEXT NULL,
  previousInterpretation TEXT NULL,
  lastQuickUpdate TEXT NULL,
  originalValue TEXT NULL,
  correctionText TEXT NULL,
  importedAt DATETIME(3) NULL,
  updatedAt DATETIME(3) NULL,
  importKey VARCHAR(191) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY migration_records_importKey_key (importKey),
  KEY migration_records_status_idx (status),
  KEY migration_records_stayId_idx (stayId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE monthly_reports (
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

CREATE TABLE receipt_sequences (
  ymd CHAR(8) NOT NULL,
  last_seq INT NOT NULL,
  PRIMARY KEY (ymd)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE receipts (
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
  KEY receipts_created_idx (created_at),
  CONSTRAINT receipts_payment_fkey FOREIGN KEY (payment_id) REFERENCES payments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE receipt_versions (
  id VARCHAR(191) NOT NULL,
  receipt_id VARCHAR(191) NOT NULL,
  version INT NOT NULL,
  status ENUM('GENERATED','UPDATED','VOID') NOT NULL,
  snapshot_json LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY receipt_versions_receipt_version (receipt_id, version),
  KEY receipt_versions_receipt_idx (receipt_id),
  CONSTRAINT receipt_versions_receipt_fkey FOREIGN KEY (receipt_id) REFERENCES receipts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO receivers (id, createdAt, name, active)
VALUES ('recv_khizer', UTC_TIMESTAMP(3), 'Khizer', 1);

INSERT INTO app_settings (id, settingKey, settingValue) VALUES
  ('set_timezone', 'timezone', 'Asia/Karachi'),
  ('set_currency', 'currency', 'PKR'),
  ('set_app_name', 'appName', 'KHIZER LEDGER'),
  ('set_owner', 'ownerName', 'Khizer'),
  ('set_reminder_start', 'reminderWindowStart', '21:00'),
  ('set_reminder_end', 'reminderWindowEnd', '05:00'),
  ('set_reminder_hours', 'reminderHours', '21,22,23,0,1,2,3,4,5');
