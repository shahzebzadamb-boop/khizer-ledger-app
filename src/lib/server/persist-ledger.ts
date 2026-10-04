import type { PoolConnection } from "mysql2/promise";
import type { Action } from "@/lib/ledger-actions";
import { reducer, reviveAction } from "@/lib/ledger-actions";
import { getPool, toSqlDate } from "@/lib/server/db";
import { loadLedgerState } from "@/lib/server/load-ledger";
import { ensureMonthlyReports } from "@/lib/server/monthly-reports";
import { syncReceipts } from "@/lib/server/receipts";
import { isPlausibleLedgerAmount } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { createId } from "@/lib/utils";
import type { LedgerState } from "@/types";

function assertPlausibleAmount(amount: number, label: string): void {
  if (!isPlausibleLedgerAmount(amount)) {
    throw new Error(`${label} amount is not a plausible PKR figure.`);
  }
}

function ids<T extends { id: string }>(items: T[]): Set<string> {
  return new Set(items.map((item) => item.id));
}

function changed<T extends { id: string }>(before: T[], after: T[], id: string): { before: T; after: T } | null {
  const previous = before.find((item) => item.id === id);
  const next = after.find((item) => item.id === id);
  if (!previous || !next) return null;
  if (JSON.stringify(previous) === JSON.stringify(next)) return null;
  return { before: previous, after: next };
}

export async function applyLedgerAction(action: Action): Promise<LedgerState> {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const before = await loadLedgerState();
    const after = reducer(before, reviveAction(action));
    await persistDiff(connection, before, after);
    const receipts = await syncReceipts(connection, before, after, action);
    const monthlyReports = await ensureMonthlyReports(connection, after);
    await connection.commit();
    return { ...after, monthlyReports, receipts };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function persistDiff(connection: PoolConnection, before: LedgerState, after: LedgerState): Promise<void> {
  const beforeReceivers = ids(before.receivers);
  for (const receiver of after.receivers) {
    if (beforeReceivers.has(receiver.id)) continue;
    await connection.execute(
      "INSERT INTO receivers (id, createdAt, name, active) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), active = VALUES(active)",
      [receiver.id, toSqlDate(receiver.createdAt), receiver.name, receiver.active ? 1 : 0],
    );
  }

  const beforeClients = ids(before.clients);
  for (const client of after.clients) {
    const phone = client.phone ? normalizePhone(client.phone) : null;
    if (!beforeClients.has(client.id)) {
      await connection.execute(
        `INSERT INTO clients (id, createdAt, name, phone, phoneNormalized, phoneMissing, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [client.id, toSqlDate(client.createdAt), client.name, phone, phone, client.phoneMissing ? 1 : 0, client.notes],
      );
      continue;
    }
    const delta = changed(before.clients, after.clients, client.id);
    if (!delta) continue;
    await connection.execute(
      "UPDATE clients SET phone = ?, phoneNormalized = ?, phoneMissing = ?, name = ? WHERE id = ?",
      [phone, phone, client.phoneMissing ? 1 : 0, client.name, client.id],
    );
  }

  const beforeFlats = ids(before.flats);
  for (const flat of after.flats) {
    if (!beforeFlats.has(flat.id)) {
      await connection.execute(
        `INSERT INTO flats (id, createdAt, name, sortOrder, displayName, active, archivedAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), sortOrder = VALUES(sortOrder), displayName = VALUES(displayName),
           active = VALUES(active), archivedAt = VALUES(archivedAt), updatedAt = VALUES(updatedAt)`,
        [
          flat.id,
          toSqlDate(flat.createdAt),
          flat.name,
          flat.sortOrder,
          flat.displayName,
          flat.active ? 1 : 0,
          toSqlDate(flat.archivedAt),
          toSqlDate(flat.updatedAt),
        ],
      );
      continue;
    }
    const delta = changed(before.flats, after.flats, flat.id);
    if (!delta) continue;
    await connection.execute(
      "UPDATE flats SET name = ?, sortOrder = ?, displayName = ?, active = ?, archivedAt = ?, updatedAt = ? WHERE id = ?",
      [
        flat.name,
        flat.sortOrder,
        flat.displayName,
        flat.active ? 1 : 0,
        toSqlDate(flat.archivedAt),
        toSqlDate(flat.updatedAt),
        flat.id,
      ],
    );
  }
  for (const flat of before.flats) {
    if (after.flats.some((item) => item.id === flat.id)) continue;
    await connection.execute("DELETE FROM flats WHERE id = ?", [flat.id]);
  }

  const beforeStays = ids(before.stays);
  for (const stay of after.stays) {
    if (!beforeStays.has(stay.id)) {
      await connection.execute(
        `INSERT INTO stays (id, createdAt, flatId, clientId, checkIn, checkOut, nights, notifyEnabled, activePending, importKey, voided)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stay.id,
          toSqlDate(stay.createdAt),
          stay.flatId,
          stay.clientId,
          toSqlDate(stay.checkIn),
          toSqlDate(stay.checkOut),
          stay.nights,
          stay.notifyEnabled ? 1 : 0,
          stay.activePending ? 1 : 0,
          stay.importKey,
          stay.voided ? 1 : 0,
        ],
      );
      continue;
    }
    const delta = changed(before.stays, after.stays, stay.id);
    if (!delta) continue;
    await connection.execute(
      `UPDATE stays SET checkIn = ?, checkOut = ?, nights = ?, notifyEnabled = ?, activePending = ?, clientId = ?, flatId = ?, voided = ?
       WHERE id = ?`,
      [
        toSqlDate(stay.checkIn),
        toSqlDate(stay.checkOut),
        stay.nights,
        stay.notifyEnabled ? 1 : 0,
        stay.activePending ? 1 : 0,
        stay.clientId,
        stay.flatId,
        stay.voided ? 1 : 0,
        stay.id,
      ],
    );
  }

  const beforeRent = ids(before.rentEntries);
  for (const item of after.rentEntries) {
    if (!beforeRent.has(item.id)) {
      assertPlausibleAmount(item.amount, "Rent");
      await connection.execute(
        `INSERT INTO business_entries (id, createdAt, stayId, clientId, flatId, amount, occurredAt, importKey, note, voided)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          toSqlDate(item.occurredAt),
          item.stayId,
          item.clientId,
          item.flatId,
          item.amount,
          toSqlDate(item.occurredAt),
          null,
          item.note,
          item.voided ? 1 : 0,
        ],
      );
      continue;
    }
    const delta = changed(before.rentEntries, after.rentEntries, item.id);
    if (!delta) continue;
    assertPlausibleAmount(item.amount, "Rent");
    await connection.execute(
      "UPDATE business_entries SET amount = ?, note = ?, clientId = ?, flatId = ?, voided = ? WHERE id = ?",
      [item.amount, item.note, item.clientId, item.flatId, item.voided ? 1 : 0, item.id],
    );
  }

  const beforePayments = ids(before.payments);
  for (const payment of after.payments) {
    if (!beforePayments.has(payment.id)) {
      assertPlausibleAmount(payment.amount, "Payment");
      await connection.execute(
        `INSERT INTO payments (id, createdAt, stayId, clientId, flatId, amount, method, receivedAt, notes, importKey, receivedById, voided)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payment.id,
          toSqlDate(payment.createdAt),
          payment.stayId,
          payment.clientId,
          payment.flatId,
          payment.amount,
          payment.method,
          toSqlDate(payment.receivedAt),
          payment.notes,
          null,
          payment.receivedById,
          payment.voided ? 1 : 0,
        ],
      );
      continue;
    }
    const delta = changed(before.payments, after.payments, payment.id);
    if (!delta) continue;
    assertPlausibleAmount(payment.amount, "Payment");
    await connection.execute(
      `UPDATE payments
       SET stayId = ?, clientId = ?, flatId = ?, amount = ?, method = ?, receivedAt = ?, notes = ?, receivedById = ?, voided = ?
       WHERE id = ?`,
      [
        payment.stayId,
        payment.clientId,
        payment.flatId,
        payment.amount,
        payment.method,
        toSqlDate(payment.receivedAt),
        payment.notes,
        payment.receivedById,
        payment.voided ? 1 : 0,
        payment.id,
      ],
    );
  }

  const beforeExpenses = ids(before.expenses);
  for (const expense of after.expenses) {
    if (!beforeExpenses.has(expense.id)) {
      assertPlausibleAmount(expense.amount, "Expense");
      await connection.execute(
        `INSERT INTO expenses (id, createdAt, flatId, amount, category, description, method, spentAt, notes, importKey, voided)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          expense.id,
          toSqlDate(expense.createdAt),
          expense.flatId,
          expense.amount,
          expense.category,
          expense.description,
          expense.method,
          toSqlDate(expense.spentAt),
          expense.notes,
          null,
          expense.voided ? 1 : 0,
        ],
      );
      continue;
    }
    const delta = changed(before.expenses, after.expenses, expense.id);
    if (!delta) continue;
    assertPlausibleAmount(expense.amount, "Expense");
    await connection.execute(
      `UPDATE expenses
       SET flatId = ?, amount = ?, category = ?, description = ?, method = ?, spentAt = ?, notes = ?, voided = ?
       WHERE id = ?`,
      [
        expense.flatId,
        expense.amount,
        expense.category,
        expense.description,
        expense.method,
        toSqlDate(expense.spentAt),
        expense.notes,
        expense.voided ? 1 : 0,
        expense.id,
      ],
    );
  }

  const beforeSecurity = ids(before.security);
  for (const item of after.security) {
    if (!beforeSecurity.has(item.id)) {
      assertPlausibleAmount(item.amount, "Security");
      await connection.execute(
        `INSERT INTO security_transactions (id, createdAt, clientId, stayId, flatId, kind, amount, occurredAt, notes, voided)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          toSqlDate(item.occurredAt),
          item.clientId,
          item.stayId,
          item.flatId,
          item.kind,
          item.amount,
          toSqlDate(item.occurredAt),
          item.notes,
          item.voided ? 1 : 0,
        ],
      );
      continue;
    }
    const delta = changed(before.security, after.security, item.id);
    if (!delta) continue;
    assertPlausibleAmount(item.amount, "Security");
    await connection.execute(
      `UPDATE security_transactions
       SET clientId = ?, stayId = ?, flatId = ?, kind = ?, amount = ?, notes = ?, voided = ?
       WHERE id = ?`,
      [item.clientId, item.stayId, item.flatId, item.kind, item.amount, item.notes, item.voided ? 1 : 0, item.id],
    );
  }

  const beforeDiscounts = ids(before.discounts);
  for (const item of after.discounts) {
    if (!beforeDiscounts.has(item.id)) {
      assertPlausibleAmount(item.amount, "Discount");
      await connection.execute(
        `INSERT INTO discounts (id, createdAt, stayId, clientId, flatId, amount, occurredAt, note, voided)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          toSqlDate(item.occurredAt),
          item.stayId,
          item.clientId,
          item.flatId,
          item.amount,
          toSqlDate(item.occurredAt),
          item.note,
          item.voided ? 1 : 0,
        ],
      );
      continue;
    }
    const delta = changed(before.discounts, after.discounts, item.id);
    if (!delta) continue;
    await connection.execute("UPDATE discounts SET amount = ?, note = ?, voided = ? WHERE id = ?", [
      item.amount,
      item.note,
      item.voided ? 1 : 0,
      item.id,
    ]);
  }

  const beforeWithdrawals = ids(before.withdrawals);
  for (const item of after.withdrawals) {
    if (!beforeWithdrawals.has(item.id)) {
      assertPlausibleAmount(item.amount, "Withdrawal");
      await connection.execute(
        "INSERT INTO withdrawals (id, createdAt, amount, occurredAt, note, voided) VALUES (?, ?, ?, ?, ?, ?)",
        [item.id, toSqlDate(item.occurredAt), item.amount, toSqlDate(item.occurredAt), item.note, item.voided ? 1 : 0],
      );
      continue;
    }
    const delta = changed(before.withdrawals, after.withdrawals, item.id);
    if (!delta) continue;
    await connection.execute("UPDATE withdrawals SET amount = ?, note = ?, voided = ? WHERE id = ?", [
      item.amount,
      item.note,
      item.voided ? 1 : 0,
      item.id,
    ]);
  }

  const beforeReviews = ids(before.reviews);
  for (const review of after.reviews) {
    if (!beforeReviews.has(review.id)) {
      await connection.execute(
        `INSERT INTO migration_records (
           id, createdAt, sourceFile, sourceSheet, sourceRow, sourceText, flatName, customer, occurredOn,
           proposedType, amount, reason, status, pendingDecision, stayId, monthLabel, currentInterpretation,
           previousInterpretation, lastQuickUpdate, originalValue, correctionText, importedAt, updatedAt, importKey
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          review.id,
          toSqlDate(review.importedAt ?? new Date().toISOString()),
          review.sourceFile,
          review.sourceSheet,
          review.sourceRow,
          review.sourceText,
          review.flatName,
          review.customer,
          toSqlDate(review.date),
          review.proposedType,
          review.amount,
          review.reason,
          review.status,
          review.pendingDecision,
          review.stayId,
          review.month,
          review.currentInterpretation,
          review.previousInterpretation,
          review.lastQuickUpdate,
          review.originalValue ?? review.sourceText,
          review.correctionText,
          toSqlDate(review.importedAt),
          toSqlDate(review.updatedAt),
          review.id,
        ],
      );
      continue;
    }
    const delta = changed(before.reviews, after.reviews, review.id);
    if (!delta) continue;
    await connection.execute(
      `UPDATE migration_records
       SET status = ?, pendingDecision = ?, stayId = ?, currentInterpretation = ?, previousInterpretation = ?,
           lastQuickUpdate = ?, originalValue = ?, correctionText = ?, updatedAt = ?
       WHERE id = ?`,
      [
        review.status,
        review.pendingDecision,
        review.stayId,
        review.currentInterpretation,
        review.previousInterpretation,
        review.lastQuickUpdate,
        review.originalValue ?? review.sourceText,
        review.correctionText,
        toSqlDate(review.updatedAt ?? new Date().toISOString()),
        review.id,
      ],
    );
  }

  const beforeActivity = ids(before.activityLogs);
  for (const item of after.activityLogs) {
    if (beforeActivity.has(item.id)) continue;
    await connection.execute(
      "INSERT INTO activity_logs (id, createdAt, action, entityType, entityId, summary) VALUES (?, ?, ?, ?, ?, ?)",
      [item.id, toSqlDate(item.createdAt), item.action, item.entityType, item.entityId, item.summary],
    );
  }

  const beforeAudit = ids(before.auditLogs);
  for (const item of after.auditLogs) {
    if (beforeAudit.has(item.id)) continue;
    await connection.execute(
      `INSERT INTO audit_logs (id, createdAt, action, entityType, entityId, originalValue, newValue, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        toSqlDate(item.createdAt),
        item.action,
        item.entityType,
        item.entityId,
        item.originalValue,
        item.newValue,
        item.reason,
      ],
    );
  }

  const beforeSilence = new Set(before.reminderSilences.map((item) => `${item.clientId}|${item.cycleDate}`));
  for (const item of after.reminderSilences) {
    const key = `${item.clientId}|${item.cycleDate}`;
    if (beforeSilence.has(key)) continue;
    await connection.execute("INSERT INTO reminder_silences (id, clientId, cycleDate) VALUES (?, ?, ?)", [
      createId("silence"),
      item.clientId,
      item.cycleDate,
    ]);
  }

  const beforeCycles = new Set(before.nightSummaryDates);
  for (const cycleDate of after.nightSummaryDates) {
    if (beforeCycles.has(cycleDate)) continue;
    await connection.execute(
      "INSERT INTO notification_cycles (id, cycleDate, summarySentAt) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE summarySentAt = VALUES(summarySentAt)",
      [createId("cycle"), cycleDate, toSqlDate(new Date().toISOString())],
    );
  }
}
