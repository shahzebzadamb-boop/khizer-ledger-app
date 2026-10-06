import type { RowDataPacket } from "mysql2";
import { emptyLedgerState } from "@/lib/empty-state";
import { normalizeState } from "@/lib/ledger-actions";
import { asBool, getPool, toIso } from "@/lib/server/db";
import { prepareLedgerDatabase } from "@/lib/server/prepare-ledger";
import { ensureMonthlyReportsSafe } from "@/lib/server/monthly-reports";
import { loadReceipts } from "@/lib/server/receipts";
import { repairKnownIntMaxRow } from "@/lib/server/repair-known-intmax";
import type {
  ExpenseCategory,
  LedgerState,
  MigrationStatus,
  PaymentMethod,
  PendingDecision,
} from "@/types";

export async function loadLedgerState(): Promise<LedgerState> {
  const pool = getPool();
  await repairKnownIntMaxRow(pool);
  await prepareLedgerDatabase(pool);
  const [
    [flats],
    [receivers],
    [clients],
    [stays],
    [business],
    [payments],
    [expenses],
    [security],
    [discounts],
    [withdrawals],
    [reviews],
    [activityLogs],
    [auditLogs],
    [silences],
    [cycles],
  ] = await Promise.all([
    pool.query<RowDataPacket[]>(
      "SELECT id, name, sortOrder, displayName, active, archivedAt, createdAt, updatedAt FROM flats ORDER BY sortOrder ASC, name ASC",
    ),
    pool.query<RowDataPacket[]>("SELECT id, createdAt, name, active FROM receivers ORDER BY createdAt ASC"),
    pool.query<RowDataPacket[]>(
      "SELECT id, createdAt, name, phone, phoneNormalized, phoneMissing, notes FROM clients ORDER BY name ASC",
    ),
    pool.query<RowDataPacket[]>(
      "SELECT id, createdAt, flatId, clientId, checkIn, checkOut, nights, notifyEnabled, activePending, importKey, voided FROM stays ORDER BY checkIn DESC",
    ),
    pool.query<RowDataPacket[]>(
      "SELECT id, stayId, clientId, flatId, amount, occurredAt, note, voided FROM business_entries ORDER BY occurredAt DESC",
    ),
    pool.query<RowDataPacket[]>(
      "SELECT id, createdAt, stayId, clientId, flatId, amount, method, receivedAt, notes, receivedById, voided FROM payments ORDER BY receivedAt DESC",
    ),
    pool.query<RowDataPacket[]>(
      "SELECT id, createdAt, flatId, amount, category, description, method, spentAt, notes, voided FROM expenses ORDER BY spentAt DESC",
    ),
    pool.query<RowDataPacket[]>(
      "SELECT id, clientId, stayId, flatId, kind, amount, occurredAt, notes, voided FROM security_transactions ORDER BY occurredAt DESC",
    ),
    pool.query<RowDataPacket[]>(
      "SELECT id, stayId, clientId, flatId, amount, occurredAt, note, voided FROM discounts ORDER BY occurredAt DESC",
    ),
    pool.query<RowDataPacket[]>("SELECT id, amount, occurredAt, note, voided FROM withdrawals ORDER BY occurredAt DESC"),
    pool.query<RowDataPacket[]>(
      `SELECT id, sourceFile, sourceSheet, sourceRow, sourceText, flatName, customer, occurredOn,
              proposedType, amount, reason, status, pendingDecision, stayId, monthLabel,
              currentInterpretation, previousInterpretation, lastQuickUpdate, originalValue,
              correctionText, importedAt, updatedAt
       FROM migration_records
       ORDER BY sourceFile ASC, sourceSheet ASC, sourceRow ASC`,
    ),
    pool.query<RowDataPacket[]>(
      "SELECT id, createdAt, action, entityType, entityId, summary FROM activity_logs ORDER BY createdAt DESC LIMIT 200",
    ),
    pool.query<RowDataPacket[]>(
      "SELECT id, createdAt, action, entityType, entityId, originalValue, newValue, reason FROM audit_logs ORDER BY createdAt DESC LIMIT 200",
    ),
    pool.query<RowDataPacket[]>("SELECT clientId, cycleDate FROM reminder_silences"),
    pool.query<RowDataPacket[]>("SELECT cycleDate FROM notification_cycles WHERE summarySentAt IS NOT NULL"),
  ]);

  const empty = emptyLedgerState();
  const state = normalizeState({
    flats: flats.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      displayName: row.displayName ? String(row.displayName) : null,
      sortOrder: Number(row.sortOrder),
      active: row.active == null ? true : asBool(row.active),
      archivedAt: row.archivedAt ? toIso(row.archivedAt) : null,
      createdAt: row.createdAt ? toIso(row.createdAt) : "2026-01-01T00:00:00.000Z",
      updatedAt: row.updatedAt ? toIso(row.updatedAt) : row.createdAt ? toIso(row.createdAt) : "2026-01-01T00:00:00.000Z",
    })),
    receivers: receivers.length
      ? receivers.map((row) => ({
          id: String(row.id),
          createdAt: toIso(row.createdAt),
          name: String(row.name),
          active: asBool(row.active),
        }))
      : empty.receivers,
    clients: clients.map((row) => ({
      id: String(row.id),
      createdAt: toIso(row.createdAt),
      name: String(row.name),
      phone: row.phone ? String(row.phone) : row.phoneNormalized ? String(row.phoneNormalized) : null,
      phoneMissing: asBool(row.phoneMissing),
      notes: row.notes ? String(row.notes) : null,
    })),
    stays: stays.map((row) => ({
      id: String(row.id),
      createdAt: toIso(row.createdAt),
      flatId: String(row.flatId),
      clientId: String(row.clientId),
      checkIn: toIso(row.checkIn),
      checkOut: toIso(row.checkOut),
      nights: Number(row.nights),
      notifyEnabled: asBool(row.notifyEnabled),
      activePending: asBool(row.activePending),
      importKey: row.importKey ? String(row.importKey) : null,
      voided: asBool(row.voided),
    })),
    rentEntries: business.map((row) => ({
      id: String(row.id),
      stayId: String(row.stayId),
      clientId: String(row.clientId),
      flatId: String(row.flatId),
      amount: Number(row.amount),
      occurredAt: toIso(row.occurredAt),
      note: row.note ? String(row.note) : null,
      voided: asBool(row.voided),
    })),
    payments: payments.map((row) => ({
      id: String(row.id),
      createdAt: toIso(row.createdAt),
      stayId: row.stayId ? String(row.stayId) : null,
      clientId: String(row.clientId),
      flatId: row.flatId ? String(row.flatId) : null,
      amount: Number(row.amount),
      method: String(row.method) as PaymentMethod,
      receivedAt: toIso(row.receivedAt),
      notes: row.notes ? String(row.notes) : null,
      receivedById: row.receivedById ? String(row.receivedById) : "recv_anas",
      voided: asBool(row.voided),
    })),
    expenses: expenses.map((row) => ({
      id: String(row.id),
      createdAt: toIso(row.createdAt),
      flatId: row.flatId ? String(row.flatId) : null,
      amount: Number(row.amount),
      category: String(row.category) as ExpenseCategory,
      description: String(row.description),
      method: String(row.method) as PaymentMethod,
      spentAt: toIso(row.spentAt),
      notes: row.notes ? String(row.notes) : null,
      voided: asBool(row.voided),
    })),
    security: security.map((row) => ({
      id: String(row.id),
      clientId: String(row.clientId),
      stayId: row.stayId ? String(row.stayId) : null,
      flatId: row.flatId ? String(row.flatId) : null,
      kind: row.kind === "ADJUSTED_TO_RENT" ? "ADJUSTED_TO_RENT" : "RECEIVED",
      amount: Number(row.amount),
      occurredAt: toIso(row.occurredAt),
      notes: row.notes ? String(row.notes) : null,
      voided: asBool(row.voided),
    })),
    discounts: discounts.map((row) => ({
      id: String(row.id),
      stayId: String(row.stayId),
      clientId: String(row.clientId),
      flatId: String(row.flatId),
      amount: Number(row.amount),
      occurredAt: toIso(row.occurredAt),
      note: row.note ? String(row.note) : null,
      voided: asBool(row.voided),
    })),
    withdrawals: withdrawals.map((row) => ({
      id: String(row.id),
      amount: Number(row.amount),
      occurredAt: toIso(row.occurredAt),
      note: row.note ? String(row.note) : null,
      voided: asBool(row.voided),
    })),
    reviews: reviews.map((row) => ({
      id: String(row.id),
      sourceFile: String(row.sourceFile),
      sourceSheet: String(row.sourceSheet),
      sourceRow: Number(row.sourceRow),
      sourceText: String(row.sourceText),
      flatName: String(row.flatName),
      customer: row.customer ? String(row.customer) : null,
      date: row.occurredOn ? toIso(row.occurredOn).slice(0, 10) : null,
      month: row.monthLabel ? String(row.monthLabel) : String(row.sourceSheet),
      proposedType: String(row.proposedType),
      amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
      reason: String(row.reason),
      status: String(row.status) as MigrationStatus,
      pendingDecision: String(row.pendingDecision) as PendingDecision,
      stayId: row.stayId ? String(row.stayId) : null,
      currentInterpretation: row.currentInterpretation ? String(row.currentInterpretation) : String(row.reason),
      previousInterpretation: row.previousInterpretation ? String(row.previousInterpretation) : null,
      lastQuickUpdate: row.lastQuickUpdate ? String(row.lastQuickUpdate) : null,
      originalValue: row.originalValue ? String(row.originalValue) : String(row.sourceText),
      correctionText: row.correctionText ? String(row.correctionText) : null,
      importedAt: row.importedAt ? toIso(row.importedAt) : null,
      updatedAt: row.updatedAt ? toIso(row.updatedAt) : null,
    })),
    activityLogs: activityLogs.map((row) => ({
      id: String(row.id),
      createdAt: toIso(row.createdAt),
      action: String(row.action),
      entityType: String(row.entityType),
      entityId: String(row.entityId),
      summary: String(row.summary),
    })),
    auditLogs: auditLogs.map((row) => ({
      id: String(row.id),
      createdAt: toIso(row.createdAt),
      action: String(row.action),
      entityType: String(row.entityType),
      entityId: String(row.entityId),
      originalValue: row.originalValue ? String(row.originalValue) : null,
      newValue: row.newValue ? String(row.newValue) : null,
      reason: row.reason ? String(row.reason) : null,
    })),
    reminderSilences: silences.map((row) => ({
      clientId: String(row.clientId),
      cycleDate: String(row.cycleDate),
    })),
    nightSummaryDates: cycles.map((row) => String(row.cycleDate)),
    monthlyReports: [],
    receipts: [],
  });
  const [monthlyReports, receipts] = await Promise.all([ensureMonthlyReportsSafe(pool, state), loadReceipts(pool)]);
  return { ...state, monthlyReports, receipts };
}
