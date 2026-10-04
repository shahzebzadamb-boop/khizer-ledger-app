import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { asBool, toIso, toSqlDate } from "@/lib/server/db";
import { createId } from "@/lib/utils";
import {
  buildReceiptView,
  formatReceiptNumber,
  isValidReceiptStatus,
  paymentEligibleForReceipt,
  planReceiptSync,
  receiptSequenceYmd,
  receiptSnapshot,
} from "@/lib/receipts";
import type { LedgerState, Receipt, ReceiptStatus } from "@/types";

type Queryable = Pool | PoolConnection;

async function tableExists(queryable: Queryable, name: string): Promise<boolean> {
  const [rows] = await queryable.query<RowDataPacket[]>(
    "SELECT 1 AS ok FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1",
    [name],
  );
  return rows.length > 0;
}

async function constraintExists(queryable: Queryable, table: string, name: string): Promise<boolean> {
  const [rows] = await queryable.query<RowDataPacket[]>(
    `SELECT 1 AS ok
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
     LIMIT 1`,
    [table, name],
  );
  return rows.length > 0;
}

export async function ensureReceiptsSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS receipt_sequences (
      ymd CHAR(8) NOT NULL,
      last_seq INT NOT NULL,
      PRIMARY KEY (ymd)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS receipts (
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
      KEY receipts_created_idx (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS receipt_versions (
      id VARCHAR(191) NOT NULL,
      receipt_id VARCHAR(191) NOT NULL,
      version INT NOT NULL,
      status ENUM('GENERATED','UPDATED','VOID') NOT NULL,
      snapshot_json LONGTEXT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY receipt_versions_receipt_version (receipt_id, version),
      KEY receipt_versions_receipt_idx (receipt_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (await tableExists(pool, "payments") && !(await constraintExists(pool, "receipts", "receipts_payment_fkey"))) {
    try {
      await pool.query(
        "ALTER TABLE receipts ADD CONSTRAINT receipts_payment_fkey FOREIGN KEY (payment_id) REFERENCES payments(id)",
      );
    } catch {
      // Keep receipts usable even if an older payments engine cannot accept the FK.
    }
  }
  if (await tableExists(pool, "receipts") && !(await constraintExists(pool, "receipt_versions", "receipt_versions_receipt_fkey"))) {
    try {
      await pool.query(
        "ALTER TABLE receipt_versions ADD CONSTRAINT receipt_versions_receipt_fkey FOREIGN KEY (receipt_id) REFERENCES receipts(id)",
      );
    } catch {
      // Audit rows still persist without the FK.
    }
  }
}

function rowToReceipt(row: RowDataPacket): Receipt {
  const status = isValidReceiptStatus(String(row.status)) ? (String(row.status) as ReceiptStatus) : "GENERATED";
  return {
    id: String(row.id),
    receiptNumber: String(row.receipt_number),
    paymentId: String(row.payment_id),
    clientId: String(row.client_id),
    stayId: String(row.stay_id),
    flatId: String(row.flat_id),
    paymentDate: toIso(row.payment_date),
    amountReceived: Number(row.amount_received),
    status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    sharedAt: row.shared_at ? toIso(row.shared_at) : null,
    shareAttemptedAt: row.share_attempted_at ? toIso(row.share_attempted_at) : null,
    version: Number(row.version ?? 1),
    voidedAt: row.voided_at ? toIso(row.voided_at) : null,
  };
}

export async function loadReceipts(queryable: Queryable): Promise<Receipt[]> {
  if (!(await tableExists(queryable, "receipts"))) return [];
  const [rows] = await queryable.query<RowDataPacket[]>(
    "SELECT * FROM receipts ORDER BY created_at DESC, receipt_number DESC",
  );
  return rows.map(rowToReceipt);
}

async function nextReceiptNumber(connection: PoolConnection, paymentDate: string): Promise<string> {
  const ymd = receiptSequenceYmd(paymentDate);
  await connection.execute(
    "INSERT INTO receipt_sequences (ymd, last_seq) VALUES (?, 1) ON DUPLICATE KEY UPDATE last_seq = last_seq + 1",
    [ymd],
  );
  const [rows] = await connection.execute<RowDataPacket[]>("SELECT last_seq FROM receipt_sequences WHERE ymd = ?", [ymd]);
  return formatReceiptNumber(ymd, Number(rows[0]?.last_seq ?? 1));
}

async function insertVersion(
  connection: PoolConnection,
  receiptId: string,
  version: number,
  status: ReceiptStatus,
  snapshot: unknown,
): Promise<void> {
  await connection.execute(
    `INSERT INTO receipt_versions (id, receipt_id, version, status, snapshot_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [createId("rcptv"), receiptId, version, status, JSON.stringify(snapshot), toSqlDate(new Date().toISOString())],
  );
}

async function loadReceiptByPayment(connection: PoolConnection, paymentId: string): Promise<Receipt | null> {
  const [rows] = await connection.execute<RowDataPacket[]>("SELECT * FROM receipts WHERE payment_id = ? LIMIT 1", [
    paymentId,
  ]);
  return rows[0] ? rowToReceipt(rows[0]) : null;
}

function draftReceipt(state: LedgerState, paymentId: string, existing: Receipt): Receipt | null {
  const payment = state.payments.find((item) => item.id === paymentId);
  if (!payment || !payment.stayId || !payment.flatId) return null;
  return {
    ...existing,
    clientId: payment.clientId,
    stayId: payment.stayId,
    flatId: payment.flatId,
    paymentDate: payment.receivedAt,
    amountReceived: payment.voided ? 0 : payment.amount,
  };
}

export async function syncReceipts(
  connection: PoolConnection,
  before: LedgerState,
  after: LedgerState,
  action: { type: string; paymentId?: string; receiptId?: string },
): Promise<Receipt[]> {
  const existing = await loadReceipts(connection);
  const planned = planReceiptSync({ ...before, receipts: existing }, after, action);

  for (const op of planned) {
    if (op.type === "create") {
      const payment = after.payments.find((item) => item.id === op.paymentId);
      if (!payment || payment.voided || !paymentEligibleForReceipt(payment, after) || !payment.stayId || !payment.flatId) {
        continue;
      }
      const duplicate = await loadReceiptByPayment(connection, payment.id);
      if (duplicate) continue;
      const now = new Date().toISOString();
      const receipt: Receipt = {
        id: createId("rcpt"),
        receiptNumber: await nextReceiptNumber(connection, payment.receivedAt),
        paymentId: payment.id,
        clientId: payment.clientId,
        stayId: payment.stayId,
        flatId: payment.flatId,
        paymentDate: payment.receivedAt,
        amountReceived: payment.amount,
        status: "GENERATED",
        createdAt: now,
        updatedAt: now,
        sharedAt: null,
        shareAttemptedAt: null,
        version: 1,
        voidedAt: null,
      };
      const view = buildReceiptView({ ...after, receipts: [...existing, receipt] }, receipt);
      const snapshot = view ? receiptSnapshot(view) : { paymentId: payment.id, amount: payment.amount };
      try {
        await connection.execute(
          `INSERT INTO receipts (
             id, receipt_number, payment_id, client_id, stay_id, flat_id, payment_date, amount_received,
             status, created_at, updated_at, shared_at, share_attempted_at, version, voided_at, snapshot_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, NULL, ?)`,
          [
            receipt.id,
            receipt.receiptNumber,
            receipt.paymentId,
            receipt.clientId,
            receipt.stayId,
            receipt.flatId,
            toSqlDate(receipt.paymentDate),
            receipt.amountReceived,
            receipt.status,
            toSqlDate(receipt.createdAt),
            toSqlDate(receipt.updatedAt),
            JSON.stringify(snapshot),
          ],
        );
        await insertVersion(connection, receipt.id, 1, "GENERATED", snapshot);
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
        if (code !== "ER_DUP_ENTRY") throw error;
      }
      continue;
    }

    const current = await loadReceiptByPayment(connection, op.paymentId);
    if (!current) continue;
    const draft = draftReceipt(after, op.paymentId, current);
    if (!draft) continue;
    const now = new Date().toISOString();
    const nextStatus: ReceiptStatus = op.type === "void" ? "VOID" : "UPDATED";
    const nextVersion = current.version + 1;
    const next: Receipt = {
      ...draft,
      status: nextStatus,
      version: nextVersion,
      updatedAt: now,
      voidedAt: nextStatus === "VOID" ? now : current.voidedAt,
    };
    const view = buildReceiptView({ ...after, receipts: (after.receipts ?? []).map((item) => (item.id === next.id ? next : item)).concat(after.receipts?.some((item) => item.id === next.id) ? [] : [next]) }, next);
    const snapshot = view ? receiptSnapshot(view) : { paymentId: next.paymentId, status: nextStatus };
    await connection.execute(
      `UPDATE receipts
       SET client_id = ?, stay_id = ?, flat_id = ?, payment_date = ?, amount_received = ?,
           status = ?, updated_at = ?, version = ?, voided_at = ?, snapshot_json = ?
       WHERE id = ?`,
      [
        next.clientId,
        next.stayId,
        next.flatId,
        toSqlDate(next.paymentDate),
        next.amountReceived,
        next.status,
        toSqlDate(next.updatedAt),
        next.version,
        toSqlDate(next.voidedAt),
        JSON.stringify(snapshot),
        next.id,
      ],
    );
    await insertVersion(connection, next.id, next.version, next.status, snapshot);
  }

  if (action.type === "MARK_RECEIPT_SHARE_ATTEMPTED" && action.receiptId) {
    await connection.execute(
      "UPDATE receipts SET share_attempted_at = COALESCE(share_attempted_at, ?), updated_at = ? WHERE id = ?",
      [toSqlDate(new Date().toISOString()), toSqlDate(new Date().toISOString()), action.receiptId],
    );
  }
  if (action.type === "MARK_RECEIPT_SENT" && action.receiptId) {
    await connection.execute("UPDATE receipts SET shared_at = ?, updated_at = ? WHERE id = ?", [
      toSqlDate(new Date().toISOString()),
      toSqlDate(new Date().toISOString()),
      action.receiptId,
    ]);
  }

  return loadReceipts(connection);
}
