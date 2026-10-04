import type { Pool } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

const BAD_RENT_ID = "b2603fcd-470c-4512-ae20-bfdec9717353";
const BAD_STAY_ID = "55faa77e-362c-437c-9030-3ae4d52e3558";
const INT_MAX = 2147483647;
const MONEY_TABLES = [
  "business_entries",
  "payments",
  "expenses",
  "security_transactions",
  "discounts",
  "withdrawals",
  "migration_records",
] as const;

const SOURCE_NOTE =
  "Quick Entry 2026-09-18 for Sept Booked By / 802-A / 2 nights. Activity kept: Rent Rs 3,324,000,842. Parser used phone 03324000842 as rent; MySQL INT stored 2147483647. Amount removed. Re-enter the real rent.";

let ran = false;

async function widenMoneyColumns(pool: Pool): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TABLE_NAME AS tableName, DATA_TYPE AS dataType
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND COLUMN_NAME = 'amount'
       AND TABLE_NAME IN (${MONEY_TABLES.map(() => "?").join(",")})`,
    [...MONEY_TABLES],
  );
  for (const row of rows) {
    if (String(row.dataType).toLowerCase() !== "int") continue;
    const table = String(row.tableName);
    const nullable = table === "migration_records" ? "NULL" : "NOT NULL";
    await pool.query(`ALTER TABLE \`${table}\` MODIFY amount BIGINT ${nullable}`);
  }
}

async function removeClampedPhoneRent(pool: Pool): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, amount, stayId FROM business_entries WHERE id = ? AND amount = ? AND stayId = ?",
    [BAD_RENT_ID, INT_MAX, BAD_STAY_ID],
  );
  if (rows.length === 0) return;

  await pool.execute(
    "DELETE FROM business_entries WHERE id = ? AND amount = ? AND stayId = ?",
    [BAD_RENT_ID, INT_MAX, BAD_STAY_ID],
  );
  await pool.execute(
    `UPDATE stays
     SET activePending = 0, notifyEnabled = 0, legacyNote = ?
     WHERE id = ?`,
    [SOURCE_NOTE, BAD_STAY_ID],
  );
  await ensurePhoneRentAudit(pool);
}

async function ensurePhoneRentAudit(pool: Pool): Promise<void> {
  const auditId = `audit_intmax_${BAD_RENT_ID.slice(0, 8)}`;
  const [existing] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM audit_logs WHERE id = ? OR (entityId = ? AND action = 'PHONE_AS_RENT_REMOVED') LIMIT 1",
    [auditId, BAD_RENT_ID],
  );
  if (existing.length) return;
  const [stay] = await pool.query<RowDataPacket[]>("SELECT id FROM stays WHERE id = ? LIMIT 1", [BAD_STAY_ID]);
  if (stay.length === 0) return;
  await pool.execute(
    `INSERT INTO audit_logs (id, createdAt, action, entityType, entityId, originalValue, newValue, reason)
     VALUES (?, UTC_TIMESTAMP(3), 'PHONE_AS_RENT_REMOVED', 'business_entries', ?, ?, 'removed', ?)`,
    [auditId, BAD_RENT_ID, String(INT_MAX), SOURCE_NOTE],
  );
}

export async function repairKnownIntMaxRow(pool: Pool): Promise<void> {
  if (ran) return;
  try {
    await widenMoneyColumns(pool);
  } catch {
    // App DB users may lack ALTER. Parser/persist already reject phone-sized amounts.
  }
  await removeClampedPhoneRent(pool);
  await ensurePhoneRentAudit(pool);
  ran = true;
}
