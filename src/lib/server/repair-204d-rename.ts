import type { Pool, RowDataPacket } from "mysql2/promise";

const HISTORICAL_ID = "flat_204-D";
const RESTORED_NAME = "204-D";
const WRONG_NAME = "703/704";
const NEW_ID = "flat_703/704";
const AUDIT_ID = "audit_restore_204d_from_703704";
const AUDIT_REASON = "Restore accidentally renamed historical apartment";

let ran = false;

export async function repairAccidental204DRename(pool: Pool): Promise<void> {
  if (ran) return;

  const [flats] = await pool.query<RowDataPacket[]>("SELECT id, name FROM flats");
  const historical = flats.find((row) => String(row.id) === HISTORICAL_ID);
  if (!historical) {
    ran = true;
    return;
  }

  const extra204 = flats.some((row) => String(row.name) === RESTORED_NAME && String(row.id) !== HISTORICAL_ID);
  if (extra204) {
    ran = true;
    return;
  }

  const currentName = String(historical.name);
  if (currentName === WRONG_NAME) {
    await pool.execute(
      "UPDATE flats SET name = ?, displayName = NULL, updatedAt = UTC_TIMESTAMP(3) WHERE id = ? AND name = ?",
      [RESTORED_NAME, HISTORICAL_ID, WRONG_NAME],
    );
    await ensureRestoreAudit(pool);
    await restoreReceiptSnapshots(pool);
  }

  const [after] = await pool.query<RowDataPacket[]>("SELECT id, name FROM flats WHERE name = ? OR id = ?", [
    WRONG_NAME,
    NEW_ID,
  ]);
  const existingNew = after.find((row) => String(row.name) === WRONG_NAME || String(row.id) === NEW_ID);
  if (!existingNew) {
    const [sortRows] = await pool.query<RowDataPacket[]>("SELECT COALESCE(MAX(sortOrder), 0) AS maxSort FROM flats");
    const sortOrder = Number(sortRows[0]?.maxSort ?? 0) + 1;
    await pool.execute(
      `INSERT INTO flats (id, createdAt, name, sortOrder, displayName, active, archivedAt, updatedAt)
       VALUES (?, UTC_TIMESTAMP(3), ?, ?, NULL, 1, NULL, UTC_TIMESTAMP(3))`,
      [NEW_ID, WRONG_NAME, sortOrder],
    );
  }

  ran = true;
}

async function ensureRestoreAudit(pool: Pool): Promise<void> {
  const [existing] = await pool.query<RowDataPacket[]>("SELECT id FROM audit_logs WHERE id = ? LIMIT 1", [AUDIT_ID]);
  if (existing.length) return;
  await pool.execute(
    `INSERT INTO audit_logs (id, createdAt, action, entityType, entityId, originalValue, newValue, reason)
     VALUES (?, UTC_TIMESTAMP(3), 'MANUAL_EDIT', 'Flat', ?, ?, ?, ?)`,
    [AUDIT_ID, HISTORICAL_ID, WRONG_NAME, RESTORED_NAME, AUDIT_REASON],
  );
}

async function restoreReceiptSnapshots(pool: Pool): Promise<void> {
  const [receiptTable] = await pool.query<RowDataPacket[]>(
    "SELECT 1 AS ok FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receipts' LIMIT 1",
  );
  if (!receiptTable.length) return;
  await pool.execute(
    `UPDATE receipts
     SET snapshot_json = REPLACE(snapshot_json, ?, ?)
     WHERE flat_id = ? AND snapshot_json LIKE ?`,
    ['"flat":"703/704"', '"flat":"204-D"', HISTORICAL_ID, "%703/704%"],
  );
  const [versionTable] = await pool.query<RowDataPacket[]>(
    "SELECT 1 AS ok FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receipt_versions' LIMIT 1",
  );
  if (!versionTable.length) return;
  await pool.execute(
    `UPDATE receipt_versions v
     INNER JOIN receipts r ON r.id = v.receipt_id
     SET v.snapshot_json = REPLACE(v.snapshot_json, ?, ?)
     WHERE r.flat_id = ? AND v.snapshot_json LIKE ?`,
    ['"flat":"703/704"', '"flat":"204-D"', HISTORICAL_ID, "%703/704%"],
  );
}
