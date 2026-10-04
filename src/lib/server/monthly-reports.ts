import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { toIso, toSqlDate } from "@/lib/server/db";
import {
  buildMonthReport,
  completedMonthsThrough,
  earliestActivityYmd,
  recordFingerprint,
  toMonthlyReportRecord,
  totalsFingerprint,
} from "@/lib/month-accounting";
import type { LedgerState, MonthlyReportRecord, MonthlyReportStatus } from "@/types";

type Queryable = Pool | PoolConnection;

export async function ensureMonthlyReportsSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monthly_reports (
      id VARCHAR(191) NOT NULL,
      year SMALLINT NOT NULL,
      month TINYINT NOT NULL,
      period_start DATETIME(3) NOT NULL,
      period_end DATETIME(3) NOT NULL,
      business_total BIGINT NOT NULL DEFAULT 0,
      received_total BIGINT NOT NULL DEFAULT 0,
      expenses_total BIGINT NOT NULL DEFAULT 0,
      ending_pending_total BIGINT NOT NULL DEFAULT 0,
      carried_forward_pending BIGINT NOT NULL DEFAULT 0,
      new_pending_generated BIGINT NOT NULL DEFAULT 0,
      pending_collected BIGINT NOT NULL DEFAULT 0,
      closing_outstanding BIGINT NOT NULL DEFAULT 0,
      total_stays INT NOT NULL DEFAULT 0,
      total_nights INT NOT NULL DEFAULT 0,
      total_clients INT NOT NULL DEFAULT 0,
      status ENUM('FINAL','UPDATED') NOT NULL DEFAULT 'FINAL',
      version INT NOT NULL DEFAULT 1,
      detailsJson LONGTEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      finalized_at DATETIME(3) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY monthly_reports_year_month (year, month),
      KEY monthly_reports_year_idx (year)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export function rowToMonthlyReport(row: RowDataPacket): MonthlyReportRecord {
  const status = String(row.status) === "UPDATED" ? "UPDATED" : "FINAL";
  return {
    id: String(row.id),
    year: Number(row.year),
    month: Number(row.month),
    periodStart: toIso(row.period_start),
    periodEnd: toIso(row.period_end),
    businessTotal: Number(row.business_total),
    receivedTotal: Number(row.received_total),
    expensesTotal: Number(row.expenses_total),
    endingPendingTotal: Number(row.ending_pending_total),
    carriedForwardPending: Number(row.carried_forward_pending),
    newPendingGenerated: Number(row.new_pending_generated),
    pendingCollected: Number(row.pending_collected),
    closingOutstanding: Number(row.closing_outstanding),
    totalStays: Number(row.total_stays),
    totalNights: Number(row.total_nights),
    totalClients: Number(row.total_clients),
    status,
    version: Number(row.version ?? 1),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    finalizedAt: row.finalized_at ? toIso(row.finalized_at) : null,
  };
}

export async function loadMonthlyReports(queryable: Queryable): Promise<MonthlyReportRecord[]> {
  const [rows] = await queryable.query<RowDataPacket[]>(
    "SELECT * FROM monthly_reports ORDER BY year DESC, month DESC",
  );
  return rows.map(rowToMonthlyReport);
}

async function upsertReport(queryable: Queryable, record: MonthlyReportRecord, detailsJson: string | null): Promise<void> {
  try {
    await queryable.execute(
      `INSERT INTO monthly_reports (
         id, year, month, period_start, period_end,
         business_total, received_total, expenses_total, ending_pending_total,
         carried_forward_pending, new_pending_generated, pending_collected, closing_outstanding,
         total_stays, total_nights, total_clients, status, version, detailsJson, created_at, updated_at, finalized_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.year,
        record.month,
        toSqlDate(record.periodStart),
        toSqlDate(record.periodEnd),
        record.businessTotal,
        record.receivedTotal,
        record.expensesTotal,
        record.endingPendingTotal,
        record.carriedForwardPending,
        record.newPendingGenerated,
        record.pendingCollected,
        record.closingOutstanding,
        record.totalStays,
        record.totalNights,
        record.totalClients,
        record.status === "LIVE" ? "FINAL" : record.status,
        record.version,
        detailsJson,
        toSqlDate(record.createdAt),
        toSqlDate(record.updatedAt),
        toSqlDate(record.finalizedAt),
      ],
    );
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
    if (code !== "ER_DUP_ENTRY") throw error;
    await queryable.execute(
      `UPDATE monthly_reports SET
         period_start = ?, period_end = ?,
         business_total = ?, received_total = ?, expenses_total = ?, ending_pending_total = ?,
         carried_forward_pending = ?, new_pending_generated = ?, pending_collected = ?, closing_outstanding = ?,
         total_stays = ?, total_nights = ?, total_clients = ?, status = ?, version = ?, detailsJson = ?,
         updated_at = ?, finalized_at = COALESCE(finalized_at, ?)
       WHERE year = ? AND month = ?`,
      [
        toSqlDate(record.periodStart),
        toSqlDate(record.periodEnd),
        record.businessTotal,
        record.receivedTotal,
        record.expensesTotal,
        record.endingPendingTotal,
        record.carriedForwardPending,
        record.newPendingGenerated,
        record.pendingCollected,
        record.closingOutstanding,
        record.totalStays,
        record.totalNights,
        record.totalClients,
        record.status === "LIVE" ? "UPDATED" : record.status,
        record.version,
        detailsJson,
        toSqlDate(record.updatedAt),
        toSqlDate(record.finalizedAt),
        record.year,
        record.month,
      ],
    );
  }
}

export async function ensureMonthlyReports(
  queryable: Queryable,
  state: LedgerState,
  now = new Date(),
): Promise<MonthlyReportRecord[]> {
  const existing = await loadMonthlyReports(queryable);
  const byKey = new Map(existing.map((item) => [`${item.year}-${item.month}`, item]));
  const months = completedMonthsThrough(now, earliestActivityYmd(state));
  for (const { year, month } of months) {
    const computed = buildMonthReport(state, year, month, now);
    const previous = byKey.get(`${year}-${month}`) ?? null;
    if (previous && recordFingerprint(previous) === totalsFingerprint(computed)) continue;
    const record = toMonthlyReportRecord(computed, previous, now);
    const details = JSON.stringify({
      receivers: computed.receivers,
      flats: computed.flats.map((flat) => ({
        name: flat.name,
        business: flat.business,
        received: flat.received,
        pending: flat.pending,
        expenses: flat.expenses,
        stays: flat.stays,
        occupiedNights: flat.occupiedNights,
      })),
      issues: computed.issues,
    });
    await upsertReport(queryable, record, details);
  }
  return loadMonthlyReports(queryable);
}

export async function ensureMonthlyReportsSafe(pool: Pool, state: LedgerState, now = new Date()): Promise<MonthlyReportRecord[]> {
  try {
    return await ensureMonthlyReports(pool, state, now);
  } catch (error) {
    console.error("MONTHLY_REPORTS_ENSURE_FAILED", error);
    try {
      return await loadMonthlyReports(pool);
    } catch {
      return [];
    }
  }
}

export type { MonthlyReportStatus };
