-- KHIZER LEDGER phpMyAdmin file 3 of 3: app config only.
-- Import after 1_schema.sql and 2_historical_data.sql.
-- No finance rows. No passwords or secrets.
-- The running app currently also hardcodes Asia/Karachi and 21:00-05:00 in src/lib/notifications.ts.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

INSERT INTO app_settings (id, settingKey, settingValue) VALUES
  ('set_timezone', 'timezone', 'Asia/Karachi'),
  ('set_currency', 'currency', 'PKR'),
  ('set_app_name', 'appName', 'KHIZER LEDGER'),
  ('set_owner', 'ownerName', 'Anas'),
  ('set_reminder_start', 'reminderWindowStart', '21:00'),
  ('set_reminder_end', 'reminderWindowEnd', '05:00'),
  ('set_reminder_hours', 'reminderHours', '21,22,23,0,1,2,3,4,5'),
  ('set_historical_pending', 'historicalPendingActive', '0');
