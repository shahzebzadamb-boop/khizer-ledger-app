-- Safe apartment management columns for the existing flats table.
-- sql/8 is monthly reports; this is the next numbered migration.
-- Do not drop flats. Do not reset data. Applied automatically on app boot.

ALTER TABLE flats
  ADD COLUMN IF NOT EXISTS displayName VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archivedAt DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS updatedAt DATETIME(3) NULL;

ALTER TABLE payments ADD INDEX IF NOT EXISTS payments_receivedAt_idx (receivedAt);
ALTER TABLE payments ADD INDEX IF NOT EXISTS payments_flatId_idx (flatId);
ALTER TABLE expenses ADD INDEX IF NOT EXISTS expenses_spentAt_idx (spentAt);
ALTER TABLE expenses ADD INDEX IF NOT EXISTS expenses_flatId_idx (flatId);
ALTER TABLE business_entries ADD INDEX IF NOT EXISTS business_entries_flatId_idx (flatId);
ALTER TABLE business_entries ADD INDEX IF NOT EXISTS business_entries_occurredAt_idx (occurredAt);
