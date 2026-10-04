-- ONE-TIME KHIZER LEDGER clean launch.
-- Deletes business/historical rows only. Does NOT drop tables or schema.
-- KEEP: users, app_settings, flats, receivers.
-- KEEP flats: 802-A, 408-B, 204-D, 204-C, 811-D, 815-B.
-- Do not run against Finance Flow or any other database.

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM notifications;
DELETE FROM reminder_silences;
DELETE FROM security_transactions;
DELETE FROM discounts;
DELETE FROM payments;
DELETE FROM business_entries;
DELETE FROM expenses;
DELETE FROM withdrawals;
DELETE FROM activity_logs;
DELETE FROM audit_logs;
DELETE FROM migration_records;
DELETE FROM notification_cycles;
DELETE FROM stays;
DELETE FROM clients;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO receivers (id, createdAt, name, active)
VALUES
  ('recv_anas', UTC_TIMESTAMP(3), 'Anas', 1),
  ('recv_khizer', UTC_TIMESTAMP(3), 'Khizer', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  active = 1;

INSERT INTO app_settings (id, createdAt, settingKey, settingValue)
VALUES (
  'set_clean_start_20260923',
  UTC_TIMESTAMP(3),
  'clean_start_20260923',
  'manual_sql'
)
ON DUPLICATE KEY UPDATE settingValue = VALUES(settingValue);
