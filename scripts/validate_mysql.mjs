#!/usr/bin/env node
/**
 * Read-only validation for the three phpMyAdmin files.
 * Always reports counts from the generated SQL/snapshot.
 * If DB_HOST/DB_USER/DB_PASSWORD/DB_NAME are set, also queries MySQL.
 * Does not modify any rows.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = JSON.parse(readFileSync(join(ROOT, "scripts/historical_validation.json"), "utf8"));
const SCHEMA = readFileSync(join(ROOT, "sql/1_schema.sql"), "utf8");
const DATA = readFileSync(join(ROOT, "sql/2_historical_data.sql"), "utf8");
const SETTINGS = readFileSync(join(ROOT, "sql/3_app_settings.sql"), "utf8");

const REQUIRED_TABLES = [
  "users",
  "app_settings",
  "flats",
  "receivers",
  "clients",
  "stays",
  "business_entries",
  "payments",
  "expenses",
  "security_transactions",
  "discounts",
  "withdrawals",
  "notifications",
  "notification_cycles",
  "reminder_silences",
  "activity_logs",
  "audit_logs",
  "migration_records",
];

function isDatabaseConfigured() {
  const host = process.env.DB_HOST?.trim() ?? "";
  const user = process.env.DB_USER?.trim() ?? "";
  const password = process.env.DB_PASSWORD?.trim() ?? "";
  const database = process.env.DB_NAME?.trim() ?? "";
  return Boolean(host && user && password && database);
}

function countInserts(sql, table) {
  const block = sql.match(new RegExp(`INSERT INTO ${table}\\b[\\s\\S]*?;`, "i"));
  if (!block) return 0;
  return (block[0].match(/\n  \(/g) || []).length;
}

function remainingForStay(stayId, business, payments, discounts, security) {
  const revenue = business.filter((row) => row.stayId === stayId).reduce((sum, row) => sum + Number(row.amount), 0);
  const disc = discounts.filter((row) => row.stayId === stayId).reduce((sum, row) => sum + Number(row.amount), 0);
  const paid = payments.filter((row) => row.stayId === stayId).reduce((sum, row) => sum + Number(row.amount), 0);
  const applied = security
    .filter((row) => row.stayId === stayId && row.kind === "ADJUSTED_TO_RENT")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  return Math.max(0, revenue - disc - paid - applied);
}

function flatTotals(flatId, business, payments, expenses, discounts, stays, security) {
  const businessSum = business.filter((row) => row.flatId === flatId).reduce((sum, row) => sum + Number(row.amount), 0);
  const received = payments.filter((row) => row.flatId === flatId).reduce((sum, row) => sum + Number(row.amount), 0);
  const expenseSum = expenses.filter((row) => row.flatId === flatId).reduce((sum, row) => sum + Number(row.amount), 0);
  const pending = stays
    .filter((row) => row.flatId === flatId)
    .reduce((sum, row) => sum + remainingForStay(row.id, business, payments, discounts, security), 0);
  return { business: businessSum, received, pending, expenses: expenseSum };
}

function localChecks() {
  const schemaTables = [...SCHEMA.matchAll(/CREATE TABLE (\w+)/g)].map((match) => match[1]);
  const missingTables = REQUIRED_TABLES.filter((table) => !schemaTables.includes(table));
  const schemaHasInserts = /INSERT INTO/i.test(SCHEMA);
  const dataCreates = /CREATE TABLE/i.test(DATA);
  const settingsFinance = /INSERT INTO (clients|stays|business_entries|payments|expenses)\b/i.test(SETTINGS);
  const withoutComments = [SCHEMA, DATA, SETTINGS]
    .map((sql) => sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))
    .join("\n");
  const secretLike = /password\s*=|secret\s*=|DATABASE_URL/i.test(withoutComments);

  return {
    schemaTables,
    missingTables,
    schemaHasInserts,
    dataCreates,
    settingsFinance,
    secretLike,
    insertCounts: {
      flats: countInserts(DATA, "flats"),
      clients: countInserts(DATA, "clients"),
      stays: countInserts(DATA, "stays"),
      business_entries: countInserts(DATA, "business_entries"),
      payments: countInserts(DATA, "payments"),
      expenses: countInserts(DATA, "expenses"),
      migration_records: countInserts(DATA, "migration_records"),
      app_settings: countInserts(SETTINGS, "app_settings"),
    },
  };
}

async function queryDatabase() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });
  const connection = await pool.getConnection();
  try {
    const [[counts]] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM flats) AS flats,
        (SELECT COUNT(*) FROM clients) AS clients,
        (SELECT COUNT(*) FROM stays) AS stays,
        (SELECT COUNT(*) FROM business_entries) AS business_entries,
        (SELECT COUNT(*) FROM payments) AS payments,
        (SELECT COUNT(*) FROM expenses) AS expenses,
        (SELECT COUNT(*) FROM migration_records) AS migration_review,
        (SELECT COUNT(*) FROM migration_records WHERE proposedType = 'PENDING_BALANCE') AS historical_pending_candidates,
        (SELECT COUNT(*) FROM security_transactions) AS security_transactions,
        (SELECT COUNT(*) FROM discounts) AS discounts,
        (SELECT COUNT(*) FROM app_settings) AS app_settings
    `);
    const [pendingRows] = await connection.query(
      "SELECT customer FROM migration_records WHERE proposedType = 'PENDING_BALANCE' ORDER BY occurredOn ASC, customer ASC",
    );
    const [[activePending]] = await connection.query("SELECT COUNT(*) AS n FROM stays WHERE activePending = 1");
    const [business] = await connection.query("SELECT id, stayId, flatId, amount FROM business_entries");
    const [payments] = await connection.query("SELECT id, stayId, flatId, amount FROM payments");
    const [expenses] = await connection.query("SELECT id, flatId, amount FROM expenses");
    const [discounts] = await connection.query("SELECT stayId, flatId, amount FROM discounts");
    const [security] = await connection.query("SELECT stayId, kind, amount FROM security_transactions");
    const [stays] = await connection.query("SELECT id, flatId FROM stays");
    return {
      counts,
      historicalPendingCandidates: pendingRows.map((row) => row.customer),
      historicalActivePendingStays: Number(activePending.n ?? 0),
      flats: {
        "802-A": flatTotals("flat_802-A", business, payments, expenses, discounts, stays, security),
        "408-B": flatTotals("flat_408-B", business, payments, expenses, discounts, stays, security),
        "204-D": flatTotals("flat_204-D", business, payments, expenses, discounts, stays, security),
        "204-C": flatTotals("flat_204-C", business, payments, expenses, discounts, stays, security),
        "811-D": flatTotals("flat_811-D", business, payments, expenses, discounts, stays, security),
        "815-B": flatTotals("flat_815-B", business, payments, expenses, discounts, stays, security),
      },
    };
  } finally {
    connection.release();
    await pool.end();
  }
}

async function main() {
  const local = localChecks();
  const otherZero = SNAPSHOT.other_flats_zero;
  const report = {
    readOnly: true,
    xlsxRowCounts: SNAPSHOT.xlsx,
    generatedCounts: SNAPSHOT.counts,
    sqlInsertCounts: local.insertCounts,
    stays: SNAPSHOT.counts.stays,
    payments: SNAPSHOT.counts.payments,
    expenses: SNAPSHOT.counts.expenses,
    migrationReviewRows: SNAPSHOT.counts.migration_review,
    pendingCandidates: SNAPSHOT.counts.historical_pending_candidates,
    pendingNames: SNAPSHOT.pending_names,
    totals802A: SNAPSHOT.totals["802-A"],
    totals408B: SNAPSHOT.totals["408-B"],
    otherFourFlatsZero: otherZero,
    otherFlatTotals: {
      "204-D": SNAPSHOT.totals["204-D"],
      "204-C": SNAPSHOT.totals["204-C"],
      "811-D": SNAPSHOT.totals["811-D"],
      "815-B": SNAPSHOT.totals["815-B"],
    },
    schema: {
      requiredTables: REQUIRED_TABLES,
      presentTables: local.schemaTables,
      missingTables: local.missingTables,
      schemaHasNoInserts: !local.schemaHasInserts,
      historicalFileHasNoCreates: !local.dataCreates,
      settingsFileHasNoFinance: !local.settingsFinance,
      filesAvoidSecrets: !local.secretLike,
    },
    previousForcedCounts: {
      note: "Recalculated from XLSX. These old numbers are listed only for comparison, not enforced.",
      rows802: 56,
      rows408: 29,
      stays: 71,
      payments: 63,
      expenses: 23,
      migration_review: 33,
      pending: 8,
    },
    mysql: isDatabaseConfigured() ? await queryDatabase() : "not configured — local SQL snapshot only",
  };

  const failed = [];
  if (local.missingTables.length) failed.push(`schema missing tables: ${local.missingTables.join(", ")}`);
  if (local.schemaHasInserts) failed.push("1_schema.sql contains INSERT statements");
  if (local.dataCreates) failed.push("2_historical_data.sql contains CREATE TABLE");
  if (local.settingsFinance) failed.push("3_app_settings.sql contains finance inserts");
  if (local.secretLike) failed.push("SQL files mention password/secret/DATABASE_URL");
  if (!otherZero) failed.push("other flats are not zero");
  for (const [table, expected] of Object.entries({
    flats: SNAPSHOT.counts.flats,
    clients: SNAPSHOT.counts.clients,
    stays: SNAPSHOT.counts.stays,
    business_entries: SNAPSHOT.counts.business_entries,
    payments: SNAPSHOT.counts.payments,
    expenses: SNAPSHOT.counts.expenses,
    migration_records: SNAPSHOT.counts.migration_review,
  })) {
    if (local.insertCounts[table] !== expected) {
      failed.push(`${table} insert count ${local.insertCounts[table]} != generated ${expected}`);
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (failed.length) {
    console.error("Validation failed:");
    for (const item of failed) console.error("-", item);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Validation failed:", error.message);
  process.exit(1);
});
