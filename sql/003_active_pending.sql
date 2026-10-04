-- Updates for an existing KHIZER LEDGER database.
-- Historical stays stay quiet until Anas confirms still pending.
-- Skip any statement if that column already exists.

ALTER TABLE stays
  ADD COLUMN activePending TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE migration_records
  ADD COLUMN monthLabel VARCHAR(191) NULL;

ALTER TABLE migration_records
  ADD COLUMN currentInterpretation TEXT NULL;

ALTER TABLE migration_records
  ADD COLUMN lastQuickUpdate TEXT NULL;

ALTER TABLE migration_records
  ADD COLUMN importedAt DATETIME(3) NULL;
