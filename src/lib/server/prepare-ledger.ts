import type { Pool, RowDataPacket } from "mysql2/promise";
import { ensureMonthlyReportsSchema } from "@/lib/server/monthly-reports";
import { ensureReceiptsSchema } from "@/lib/server/receipts";
import { repairAccidental204DRename } from "@/lib/server/repair-204d-rename";

export const CLEAN_START_KEY = "clean_start_20260923";

const BUSINESS_TABLES = [
  "receipt_versions",
  "receipts",
  "notifications",
  "reminder_silences",
  "security_transactions",
  "discounts",
  "payments",
  "business_entries",
  "expenses",
  "withdrawals",
  "activity_logs",
  "audit_logs",
  "migration_records",
  "notification_cycles",
  "stays",
  "clients",
] as const;

export type CleanStartResult = {
  ran: boolean;
  deleted: Record<string, number>;
  flatsKept: string[];
};

async function tableExists(pool: Pool, name: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 AS ok FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1",
    [name],
  );
  return rows.length > 0;
}

async function columnExists(pool: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function indexExists(pool: Pool, table: string, index: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [table, index],
  );
  return rows.length > 0;
}

async function constraintExists(pool: Pool, table: string, name: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
     LIMIT 1`,
    [table, name],
  );
  return rows.length > 0;
}

export async function ensureReceiversSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS receivers (
      id VARCHAR(191) NOT NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      name VARCHAR(191) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (id),
      UNIQUE KEY receivers_name_key (name),
      KEY receivers_active_idx (active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(
    `INSERT INTO receivers (id, createdAt, name, active)
     VALUES
       ('recv_anas', UTC_TIMESTAMP(3), 'Anas', 1),
       ('recv_khizer', UTC_TIMESTAMP(3), 'Khizer', 1)
     ON DUPLICATE KEY UPDATE name = VALUES(name), active = 1`,
  );

  if (await tableExists(pool, "payments") && !(await columnExists(pool, "payments", "receivedById"))) {
    await pool.query("ALTER TABLE payments ADD COLUMN receivedById VARCHAR(191) NULL");
  }
  if (await tableExists(pool, "payments") && !(await indexExists(pool, "payments", "payments_receivedById_idx"))) {
    await pool.query("ALTER TABLE payments ADD KEY payments_receivedById_idx (receivedById)");
  }
  if (
    (await tableExists(pool, "payments")) &&
    (await columnExists(pool, "payments", "receivedById")) &&
    !(await constraintExists(pool, "payments", "payments_receivedById_fkey"))
  ) {
    await pool.query(
      "ALTER TABLE payments ADD CONSTRAINT payments_receivedById_fkey FOREIGN KEY (receivedById) REFERENCES receivers(id) ON DELETE SET NULL",
    );
  }
}

async function countTable(pool: Pool, table: string): Promise<number> {
  if (!(await tableExists(pool, table))) return 0;
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${table}\``);
  return Number(rows[0]?.n ?? 0);
}

export async function runCleanStartIfNeeded(pool: Pool): Promise<CleanStartResult> {
  const empty: CleanStartResult = { ran: false, deleted: {}, flatsKept: [] };
  if (!(await tableExists(pool, "app_settings"))) return empty;

  const [existing] = await pool.query<RowDataPacket[]>(
    "SELECT settingValue FROM app_settings WHERE settingKey = ? LIMIT 1",
    [CLEAN_START_KEY],
  );
  if (existing.length > 0) return empty;

  const deleted: Record<string, number> = {};
  for (const table of BUSINESS_TABLES) {
    deleted[table] = await countTable(pool, table);
  }

  const [flatRows] = await pool.query<RowDataPacket[]>("SELECT name FROM flats ORDER BY sortOrder ASC, name ASC");
  const flatsKept = flatRows.map((row) => String(row.name));

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of BUSINESS_TABLES) {
      if (await tableExists(pool, table)) {
        await connection.query(`DELETE FROM \`${table}\``);
      }
    }
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    await connection.query(
      `INSERT INTO receivers (id, createdAt, name, active)
       VALUES
         ('recv_anas', UTC_TIMESTAMP(3), 'Anas', 1),
         ('recv_khizer', UTC_TIMESTAMP(3), 'Khizer', 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), active = 1`,
    );
    await connection.query(
      `INSERT INTO app_settings (id, createdAt, settingKey, settingValue)
       VALUES (?, UTC_TIMESTAMP(3), ?, ?)
       ON DUPLICATE KEY UPDATE settingValue = VALUES(settingValue)`,
      ["set_clean_start_20260923", CLEAN_START_KEY, JSON.stringify({ deleted, flatsKept, at: new Date().toISOString() })],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return { ran: true, deleted, flatsKept };
}

export async function ensureCorrectionsSchema(pool: Pool): Promise<void> {
  const tables = [
    "stays",
    "business_entries",
    "payments",
    "expenses",
    "security_transactions",
    "discounts",
    "withdrawals",
  ] as const;
  for (const table of tables) {
    if (!(await tableExists(pool, table))) continue;
    if (await columnExists(pool, table, "voided")) continue;
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN voided TINYINT(1) NOT NULL DEFAULT 0`);
  }
}

export async function ensureFlatManagementSchema(pool: Pool): Promise<void> {
  if (!(await tableExists(pool, "flats"))) return;
  if (!(await columnExists(pool, "flats", "displayName"))) {
    await pool.query("ALTER TABLE flats ADD COLUMN displayName VARCHAR(191) NULL");
  }
  if (!(await columnExists(pool, "flats", "active"))) {
    await pool.query("ALTER TABLE flats ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1");
  }
  if (!(await columnExists(pool, "flats", "archivedAt"))) {
    await pool.query("ALTER TABLE flats ADD COLUMN archivedAt DATETIME(3) NULL");
  }
  if (!(await columnExists(pool, "flats", "updatedAt"))) {
    await pool.query("ALTER TABLE flats ADD COLUMN updatedAt DATETIME(3) NULL");
  }
  if (await tableExists(pool, "payments") && !(await indexExists(pool, "payments", "payments_receivedAt_idx"))) {
    await pool.query("ALTER TABLE payments ADD KEY payments_receivedAt_idx (receivedAt)");
  }
  if (await tableExists(pool, "expenses") && !(await indexExists(pool, "expenses", "expenses_spentAt_idx"))) {
    await pool.query("ALTER TABLE expenses ADD KEY expenses_spentAt_idx (spentAt)");
  }
  if (await tableExists(pool, "business_entries") && !(await indexExists(pool, "business_entries", "business_entries_flatId_idx"))) {
    await pool.query("ALTER TABLE business_entries ADD KEY business_entries_flatId_idx (flatId)");
  }
  if (await tableExists(pool, "business_entries") && !(await indexExists(pool, "business_entries", "business_entries_occurredAt_idx"))) {
    await pool.query("ALTER TABLE business_entries ADD KEY business_entries_occurredAt_idx (occurredAt)");
  }
  if (await tableExists(pool, "payments") && !(await indexExists(pool, "payments", "payments_flatId_idx"))) {
    await pool.query("ALTER TABLE payments ADD KEY payments_flatId_idx (flatId)");
  }
  if (await tableExists(pool, "expenses") && !(await indexExists(pool, "expenses", "expenses_flatId_idx"))) {
    await pool.query("ALTER TABLE expenses ADD KEY expenses_flatId_idx (flatId)");
  }
}

export async function prepareLedgerDatabase(pool: Pool): Promise<CleanStartResult> {
  await ensureReceiversSchema(pool);
  await ensureCorrectionsSchema(pool);
  await ensureMonthlyReportsSchema(pool);
  await ensureReceiptsSchema(pool);
  await ensureFlatManagementSchema(pool);
  await repairAccidental204DRename(pool);
  const result = await runCleanStartIfNeeded(pool);
  if (result.ran) {
    console.info("ANAS_CLEAN_START", JSON.stringify(result));
  }
  return result;
}
