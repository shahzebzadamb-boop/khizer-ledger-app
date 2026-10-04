-- Void flag for corrections. Production also applies this via prepare-ledger.
-- Financial rows are voided, not deleted. Audit stays in audit_logs.

ALTER TABLE stays ADD COLUMN voided TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE business_entries ADD COLUMN voided TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN voided TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN voided TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE security_transactions ADD COLUMN voided TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE discounts ADD COLUMN voided TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE withdrawals ADD COLUMN voided TINYINT(1) NOT NULL DEFAULT 0;
