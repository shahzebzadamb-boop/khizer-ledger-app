-- One-time live repair. Safe to re-run. Does not drop tables or re-import history.
-- Widens money columns so a future overflow cannot clamp to 2147483647.
-- Removes only the 2026-09-18 Quick Entry that stored a phone number as rent.

ALTER TABLE business_entries MODIFY amount BIGINT NOT NULL;
ALTER TABLE payments MODIFY amount BIGINT NOT NULL;
ALTER TABLE expenses MODIFY amount BIGINT NOT NULL;
ALTER TABLE security_transactions MODIFY amount BIGINT NOT NULL;
ALTER TABLE discounts MODIFY amount BIGINT NOT NULL;
ALTER TABLE withdrawals MODIFY amount BIGINT NOT NULL;
ALTER TABLE migration_records MODIFY amount BIGINT NULL;

DELETE FROM business_entries
WHERE id = 'b2603fcd-470c-4512-ae20-bfdec9717353'
  AND amount = 2147483647
  AND stayId = '55faa77e-362c-437c-9030-3ae4d52e3558';

UPDATE stays
SET activePending = 0,
    notifyEnabled = 0,
    legacyNote = 'Quick Entry 2026-09-18 for Sept Booked By / 802-A / 2 nights. Activity kept: Rent Rs 3,324,000,842. Parser used phone 03324000842 as rent; MySQL INT stored 2147483647. Amount removed. Re-enter the real rent.'
WHERE id = '55faa77e-362c-437c-9030-3ae4d52e3558';

INSERT INTO audit_logs (id, createdAt, action, entityType, entityId, originalValue, newValue, reason)
VALUES (
  'audit_intmax_b2603fcd',
  UTC_TIMESTAMP(3),
  'PHONE_AS_RENT_REMOVED',
  'business_entries',
  'b2603fcd-470c-4512-ae20-bfdec9717353',
  '2147483647',
  'removed',
  'Quick Entry 2026-09-18 for Sept Booked By / 802-A / 2 nights. Activity kept: Rent Rs 3,324,000,842. Parser used phone 03324000842 as rent; MySQL INT stored 2147483647. Amount removed. Re-enter the real rent.'
);
