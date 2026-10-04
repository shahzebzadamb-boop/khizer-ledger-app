import { addDays } from "date-fns";
import { formatDateShort } from "@/lib/dates";
import { flatName, isLive, matchClient, receiverName, stayCollectible, stayPayments, stayRemaining } from "@/lib/ledger";
import { formatPKR, methodLabel } from "@/lib/money";
import type { CorrectionDraft } from "@/lib/parse-correction";
import { canonicalReceiverName, DEFAULT_RECEIVER_NAME } from "@/lib/receivers";
import { createId } from "@/lib/utils";
import type { Expense, LedgerState, Payment, Stay } from "@/types";

export type CorrectionTarget = {
  id: string;
  kind: "payment" | "stay" | "expense" | "security" | "client";
  label: string;
};

export type CorrectionPreview = {
  title: string;
  clientName: string;
  flat: string | null;
  before: { label: string; value: string }[];
  after: { label: string; value: string }[];
};

function livePayments(state: LedgerState): Payment[] {
  return state.payments.filter(isLive);
}

function liveExpenses(state: LedgerState): Expense[] {
  return state.expenses.filter(isLive);
}

function liveStays(state: LedgerState): Stay[] {
  return state.stays.filter(isLive);
}

function flatIdOf(name: string | null): string | null {
  return name ? `flat_${name}` : null;
}

function matchesFlatId(flatId: string | null | undefined, name: string | null): boolean {
  if (!name) return true;
  return flatId === `flat_${name}` || flatId === name;
}

function snapshot(value: unknown): string {
  return JSON.stringify(value);
}

function clientFor(state: LedgerState, draft: CorrectionDraft) {
  if (draft.phone || draft.clientName) {
    return matchClient(state, draft.clientName ?? "", draft.phone);
  }
  return null;
}

function paymentLabel(state: LedgerState, payment: Payment): string {
  const stay = state.stays.find((item) => item.id === payment.stayId);
  const flat = payment.flatId ? flatName(state, payment.flatId) : stay ? flatName(state, stay.flatId) : "";
  return `${flat || "Flat"} · ${formatPKR(payment.amount)} · ${formatDateShort(payment.receivedAt)}`;
}

function expenseLabel(state: LedgerState, expense: Expense): string {
  const flat = expense.flatId ? `Flat ${flatName(state, expense.flatId)}` : "Expense";
  return `${expense.description} · ${flat} · ${formatPKR(expense.amount)}`;
}

function stayLabel(state: LedgerState, stay: Stay): string {
  const client = state.clients.find((item) => item.id === stay.clientId);
  return `${client?.name ?? "Customer"} · ${flatName(state, stay.flatId)} · ${stay.nights} nights`;
}

function findPayments(state: LedgerState, draft: CorrectionDraft): Payment[] {
  const client = clientFor(state, draft);
  return livePayments(state)
    .filter((item) => !client || item.clientId === client.id)
    .filter((item) => matchesFlatId(item.flatId, draft.flat))
    .filter((item) => !draft.amount || item.amount === draft.amount)
    .filter((item) => !draft.method || item.method === draft.method)
    .filter((item) => {
      if (!draft.receivedByName) return true;
      return receiverName(state, item.receivedById).toLowerCase() === draft.receivedByName.toLowerCase();
    })
    .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
}

function findExpenses(state: LedgerState, draft: CorrectionDraft): Expense[] {
  return liveExpenses(state)
    .filter((item) => matchesFlatId(item.flatId, draft.flat))
    .filter((item) => !draft.amount || item.amount === draft.amount)
    .filter((item) => {
      if (!draft.description) return true;
      const hay = `${item.description} ${item.category}`.toLowerCase();
      const needle = draft.description.toLowerCase().split(/\s+/)[0];
      return hay.includes(needle) || (draft.category != null && item.category === draft.category);
    })
    .sort((a, b) => (a.spentAt < b.spentAt ? 1 : -1));
}

function findStays(state: LedgerState, draft: CorrectionDraft): Stay[] {
  const client = clientFor(state, draft);
  return liveStays(state)
    .filter((item) => !client || item.clientId === client.id)
    .filter((item) => matchesFlatId(item.flatId, draft.flat))
    .filter((item) => !draft.nights || item.nights === draft.nights)
    .sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1));
}

export function correctionTargets(state: LedgerState, draft: CorrectionDraft): CorrectionTarget[] {
  if (draft.targetId) {
    return [{ id: draft.targetId, kind: draft.targetKind ?? "payment", label: "Selected" }];
  }
  if (draft.kind === "change_client" && draft.newClientName && !draft.newClientId) {
    const matches = state.clients.filter(
      (client) => client.name.toLowerCase() === draft.newClientName!.toLowerCase(),
    );
    if (matches.length > 1) {
      return matches.map((client) => ({
        id: client.id,
        kind: "client" as const,
        label: `${client.name}${client.phone ? ` · ${client.phone}` : ""}`,
      }));
    }
  }
  if (
    draft.kind === "void_payment" ||
    draft.kind === "change_method" ||
    draft.kind === "change_receiver" ||
    draft.kind === "mark_received"
  ) {
    if (draft.kind === "mark_received") {
      return findStays(state, draft).map((stay) => ({ id: stay.id, kind: "stay" as const, label: stayLabel(state, stay) }));
    }
    return findPayments(state, {
      ...draft,
      method: draft.method && draft.method !== draft.newMethod ? draft.method : null,
    }).map((item) => ({ id: item.id, kind: "payment" as const, label: paymentLabel(state, item) }));
  }
  if (draft.kind === "change_expense_amount" || draft.kind === "change_expense_flat") {
    return findExpenses(state, draft).map((item) => ({
      id: item.id,
      kind: "expense" as const,
      label: expenseLabel(state, item),
    }));
  }
  if (draft.kind === "change_nights" || draft.kind === "change_business" || draft.kind === "set_pending") {
    return findStays(state, draft).map((stay) => ({ id: stay.id, kind: "stay" as const, label: stayLabel(state, stay) }));
  }
  if (draft.kind === "change_client") {
    const payments = findPayments(state, draft);
    if (payments.length) {
      return payments.map((item) => ({ id: item.id, kind: "payment" as const, label: paymentLabel(state, item) }));
    }
    return findStays(state, draft).map((stay) => ({ id: stay.id, kind: "stay" as const, label: stayLabel(state, stay) }));
  }
  if (draft.kind === "void_entry") {
    const payments = findPayments(state, draft);
    const expenses = findExpenses(state, draft);
    const stays = findStays(state, draft);
    const rows: CorrectionTarget[] = [
      ...payments.map((item) => ({ id: item.id, kind: "payment" as const, label: paymentLabel(state, item) })),
      ...expenses.map((item) => ({ id: item.id, kind: "expense" as const, label: expenseLabel(state, item) })),
      ...stays.map((item) => ({ id: item.id, kind: "stay" as const, label: stayLabel(state, item) })),
    ];
    if (rows.length) return rows;
    const latestPay = livePayments(state)[0];
    const latestExp = liveExpenses(state)[0];
    const latestStay = liveStays(state)[0];
    const extra: CorrectionTarget[] = [];
    if (latestPay) extra.push({ id: latestPay.id, kind: "payment", label: paymentLabel(state, latestPay) });
    if (latestExp) extra.push({ id: latestExp.id, kind: "expense", label: expenseLabel(state, latestExp) });
    if (latestStay) extra.push({ id: latestStay.id, kind: "stay", label: stayLabel(state, latestStay) });
    return extra;
  }
  return [];
}

function stayMoney(state: LedgerState, stayId: string) {
  return {
    business: stayCollectible(stayId, state),
    received: stayPayments(stayId, state),
    pending: stayRemaining(stayId, state),
  };
}

export function correctionPreview(
  state: LedgerState,
  draft: CorrectionDraft,
  target: CorrectionTarget,
): CorrectionPreview | null {
  const stayFromPayment = (payment: Payment | undefined) =>
    payment?.stayId ? state.stays.find((item) => item.id === payment.stayId) : undefined;

  if (target.kind === "payment") {
    const payment = state.payments.find((item) => item.id === target.id);
    if (!payment) return null;
    const stay = stayFromPayment(payment);
    const client = state.clients.find((item) => item.id === payment.clientId);
    const beforeMoney = stay ? stayMoney(state, stay.id) : null;
    const afterState = applyCorrection(state, { ...draft, targetId: target.id, targetKind: "payment" });
    const afterMoney = stay ? stayMoney(afterState, stay.id) : null;
    const afterPay = afterState.payments.find((item) => item.id === payment.id);
    const rows = (label: string, before: string, after: string) =>
      before === after ? [] : [{ label, before, after }];
    const changed = [
      ...rows("Amount", formatPKR(payment.amount), formatPKR(afterPay?.amount ?? 0)),
      ...rows("Method", methodLabel(payment.method), methodLabel(afterPay?.method ?? payment.method)),
      ...rows(
        "Received By",
        receiverName(state, payment.receivedById),
        receiverName(afterState, afterPay?.receivedById),
      ),
      ...(afterPay?.voided
        ? [
            { label: "Received", before: formatPKR(beforeMoney?.received ?? payment.amount), after: formatPKR(afterMoney?.received ?? 0) },
            { label: "Pending", before: formatPKR(beforeMoney?.pending ?? 0), after: formatPKR(afterMoney?.pending ?? 0) },
          ]
        : beforeMoney && afterMoney
          ? [
              ...rows("Received", formatPKR(beforeMoney.received), formatPKR(afterMoney.received)),
              ...rows("Pending", formatPKR(beforeMoney.pending), formatPKR(afterMoney.pending)),
            ]
          : []),
    ];
    return {
      title: "CORRECTION",
      clientName: client?.name ?? "Customer",
      flat: payment.flatId ? flatName(state, payment.flatId) : stay ? flatName(state, stay.flatId) : null,
      before: changed.map((item) => ({ label: item.label, value: item.before })),
      after: changed.map((item) => ({ label: item.label, value: item.after })),
    };
  }

  if (target.kind === "stay") {
    const stay = state.stays.find((item) => item.id === target.id);
    if (!stay) return null;
    const client = state.clients.find((item) => item.id === stay.clientId);
    const before = stayMoney(state, stay.id);
    const afterState = applyCorrection(state, { ...draft, targetId: stay.id, targetKind: "stay" });
    const afterStay = afterState.stays.find((item) => item.id === stay.id) ?? stay;
    const after = stayMoney(afterState, stay.id);
    const changed = [
      stay.nights !== afterStay.nights ? { label: "Nights", before: String(stay.nights), after: String(afterStay.nights) } : null,
      before.business !== after.business
        ? { label: "Business", before: formatPKR(before.business), after: formatPKR(after.business) }
        : null,
      before.received !== after.received
        ? { label: "Received", before: formatPKR(before.received), after: formatPKR(after.received) }
        : null,
      before.pending !== after.pending
        ? { label: "Pending", before: formatPKR(before.pending), after: formatPKR(after.pending) }
        : null,
    ].filter((item): item is { label: string; before: string; after: string } => Boolean(item));
    return {
      title: "CORRECTION",
      clientName: client?.name ?? "Customer",
      flat: flatName(state, stay.flatId),
      before: changed.length
        ? changed.map((item) => ({ label: item.label, value: item.before }))
        : [
            { label: "Business", value: formatPKR(before.business) },
            { label: "Received", value: formatPKR(before.received) },
            { label: "Pending", value: formatPKR(before.pending) },
          ],
      after: changed.length
        ? changed.map((item) => ({ label: item.label, value: item.after }))
        : [
            { label: "Business", value: formatPKR(after.business) },
            { label: "Received", value: formatPKR(after.received) },
            { label: "Pending", value: formatPKR(after.pending) },
          ],
    };
  }

  if (target.kind === "expense") {
    const expense = state.expenses.find((item) => item.id === target.id);
    if (!expense) return null;
    const afterState = applyCorrection(state, { ...draft, targetId: expense.id, targetKind: "expense" });
    const after = afterState.expenses.find((item) => item.id === expense.id);
    return {
      title: "CORRECTION",
      clientName: expense.description,
      flat: expense.flatId ? flatName(state, expense.flatId) : null,
      before: [
        { label: "Amount", value: formatPKR(expense.amount) },
        { label: "Flat", value: expense.flatId ? flatName(state, expense.flatId) : "—" },
      ],
      after: [
        { label: "Amount", value: formatPKR(after?.amount ?? expense.amount) },
        { label: "Flat", value: after?.flatId ? flatName(afterState, after.flatId) : "—" },
      ],
    };
  }

  if (target.kind === "client") {
    return {
      title: "CORRECTION",
      clientName: state.clients.find((item) => item.id === target.id)?.name ?? "Customer",
      flat: draft.flat,
      before: [{ label: "Customer", value: draft.clientName ?? "—" }],
      after: [{ label: "Customer", value: state.clients.find((item) => item.id === target.id)?.name ?? "—" }],
    };
  }

  return null;
}

export function withAudit(
  state: LedgerState,
  entry: {
    action: "QUICK_ENTRY" | "MANUAL_EDIT" | "VOID";
    entityType: string;
    entityId: string;
    originalValue: unknown;
    newValue: unknown;
    reason: string | null;
  },
): LedgerState {
  return {
    ...state,
    auditLogs: [
      {
        id: createId("audit"),
        createdAt: new Date().toISOString(),
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        originalValue: snapshot(entry.originalValue),
        newValue: snapshot(entry.newValue),
        reason: entry.reason,
      },
      ...state.auditLogs,
    ],
  };
}

export function syncStayPending(state: LedgerState, stayId: string | null | undefined): LedgerState {
  if (!stayId) return state;
  const remaining = stayRemaining(stayId, state);
  const active = remaining > 0;
  return {
    ...state,
    stays: state.stays.map((stay) =>
      stay.id === stayId ? { ...stay, activePending: active, notifyEnabled: active } : stay,
    ),
  };
}

function voidPayment(state: LedgerState, paymentId: string, reason: string, method: "QUICK_ENTRY" | "MANUAL_EDIT" | "VOID"): LedgerState {
  const payment = state.payments.find((item) => item.id === paymentId);
  if (!payment || payment.voided) return state;
  let next: LedgerState = {
    ...state,
    payments: state.payments.map((item) => (item.id === paymentId ? { ...item, voided: true } : item)),
  };
  next = withAudit(next, {
    action: method,
    entityType: "Payment",
    entityId: paymentId,
    originalValue: payment,
    newValue: { ...payment, voided: true },
    reason,
  });
  return syncStayPending(next, payment.stayId);
}

function findReceiverId(state: LedgerState, name: string | null): { state: LedgerState; id: string } {
  const canonical = canonicalReceiverName(name || DEFAULT_RECEIVER_NAME);
  const existing = state.receivers.find((item) => item.name.toLowerCase() === canonical.toLowerCase());
  if (existing) return { state, id: existing.id };
  const receiver = {
    id: createId("recv"),
    createdAt: new Date().toISOString(),
    name: canonical,
    active: true,
  };
  return { state: { ...state, receivers: [...state.receivers, receiver] }, id: receiver.id };
}

export function applyCorrection(
  state: LedgerState,
  draft: CorrectionDraft,
  method: "QUICK_ENTRY" | "MANUAL_EDIT" = "QUICK_ENTRY",
): LedgerState {
  const reason = draft.raw;
  const targets = draft.targetId
    ? [{ id: draft.targetId, kind: draft.targetKind ?? inferKind(draft), label: "" }]
    : correctionTargets(state, draft);
  if (targets.length !== 1 && !(draft.kind === "change_client" && draft.newClientId && targets.length === 1)) {
    if (targets.length !== 1) return state;
  }
  const target = targets[0];
  if (!target) return state;

  if (draft.kind === "void_payment" && target.kind === "payment") {
    return voidPayment(state, target.id, reason, "VOID");
  }

  if (draft.kind === "void_entry") {
    if (target.kind === "payment") return voidPayment(state, target.id, reason, "VOID");
    if (target.kind === "expense") {
      const expense = state.expenses.find((item) => item.id === target.id);
      if (!expense) return state;
      return withAudit(
        { ...state, expenses: state.expenses.map((item) => (item.id === target.id ? { ...item, voided: true } : item)) },
        { action: "VOID", entityType: "Expense", entityId: target.id, originalValue: expense, newValue: { ...expense, voided: true }, reason },
      );
    }
    if (target.kind === "stay") {
      const stay = state.stays.find((item) => item.id === target.id);
      if (!stay) return state;
      let next: LedgerState = {
        ...state,
        stays: state.stays.map((item) => (item.id === target.id ? { ...item, voided: true, activePending: false, notifyEnabled: false } : item)),
        rentEntries: state.rentEntries.map((item) => (item.stayId === target.id ? { ...item, voided: true } : item)),
        payments: state.payments.map((item) => (item.stayId === target.id ? { ...item, voided: true } : item)),
      };
      next = withAudit(next, {
        action: "VOID",
        entityType: "Stay",
        entityId: target.id,
        originalValue: stay,
        newValue: { ...stay, voided: true },
        reason,
      });
      return next;
    }
  }

  if (draft.kind === "change_method" && target.kind === "payment") {
    const payment = state.payments.find((item) => item.id === target.id);
    if (!payment || !draft.newMethod) return state;
    const nextPay = { ...payment, method: draft.newMethod };
    return withAudit(
      { ...state, payments: state.payments.map((item) => (item.id === payment.id ? nextPay : item)) },
      { action: method, entityType: "Payment", entityId: payment.id, originalValue: payment, newValue: nextPay, reason },
    );
  }

  if (draft.kind === "change_receiver" && target.kind === "payment") {
    const payment = state.payments.find((item) => item.id === target.id);
    if (!payment) return state;
    const found = findReceiverId(state, draft.newReceivedByName);
    const nextPay = { ...payment, receivedById: found.id };
    return withAudit(
      { ...found.state, payments: found.state.payments.map((item) => (item.id === payment.id ? nextPay : item)) },
      { action: method, entityType: "Payment", entityId: payment.id, originalValue: payment, newValue: nextPay, reason },
    );
  }

  if (draft.kind === "mark_received" && target.kind === "stay") {
    const stay = state.stays.find((item) => item.id === target.id);
    if (!stay) return state;
    const amount = draft.amount ?? stayRemaining(stay.id, state);
    if (amount <= 0) return state;
    const found = findReceiverId(state, draft.newReceivedByName);
    const payment: Payment = {
      id: createId("pay"),
      createdAt: new Date().toISOString(),
      stayId: stay.id,
      clientId: stay.clientId,
      flatId: stay.flatId,
      amount,
      method: draft.newMethod ?? draft.method ?? "CASH",
      receivedAt: new Date().toISOString(),
      notes: null,
      receivedById: found.id,
      voided: false,
    };
    let next: LedgerState = { ...found.state, payments: [payment, ...found.state.payments] };
    next = withAudit(next, {
      action: method,
      entityType: "Payment",
      entityId: payment.id,
      originalValue: { pending: stayRemaining(stay.id, state) },
      newValue: payment,
      reason,
    });
    return syncStayPending(next, stay.id);
  }

  if (draft.kind === "change_nights" && target.kind === "stay") {
    const stay = state.stays.find((item) => item.id === target.id);
    const nights = draft.newNights;
    if (!stay || !nights) return state;
    const nextStay = {
      ...stay,
      nights,
      checkOut: addDays(new Date(stay.checkIn), nights).toISOString(),
    };
    return withAudit(
      { ...state, stays: state.stays.map((item) => (item.id === stay.id ? nextStay : item)) },
      { action: method, entityType: "Stay", entityId: stay.id, originalValue: stay, newValue: nextStay, reason },
    );
  }

  if (draft.kind === "change_business" && target.kind === "stay") {
    const stay = state.stays.find((item) => item.id === target.id);
    if (!stay || draft.newAmount == null) return state;
    const rents = state.rentEntries.filter((item) => item.stayId === stay.id && isLive(item));
    const row = rents.find((item) => draft.amount != null && item.amount === draft.amount) ?? rents[0];
    if (!row) return state;
    const nextRow = { ...row, amount: draft.newAmount };
    let next: LedgerState = {
      ...state,
      rentEntries: state.rentEntries.map((item) => (item.id === row.id ? nextRow : item)),
    };
    next = withAudit(next, {
      action: method,
      entityType: "Stay",
      entityId: stay.id,
      originalValue: row,
      newValue: nextRow,
      reason,
    });
    return syncStayPending(next, stay.id);
  }

  if (draft.kind === "set_pending" && target.kind === "stay") {
    const stay = state.stays.find((item) => item.id === target.id);
    if (!stay || draft.newAmount == null) return state;
    const targetPending = draft.newAmount;
    const current = stayRemaining(stay.id, state);
    let next = state;
    if (targetPending > current) {
      let excess = targetPending - current;
      const pays = livePayments(next)
        .filter((item) => item.stayId === stay.id)
        .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
      for (const payment of pays) {
        if (excess <= 0) break;
        if (payment.amount <= excess) {
          next = voidPayment(next, payment.id, reason, method === "QUICK_ENTRY" ? "VOID" : "VOID");
          excess -= payment.amount;
        } else {
          const updated = { ...payment, amount: payment.amount - excess };
          next = withAudit(
            { ...next, payments: next.payments.map((item) => (item.id === payment.id ? updated : item)) },
            { action: method, entityType: "Payment", entityId: payment.id, originalValue: payment, newValue: updated, reason },
          );
          excess = 0;
        }
      }
    } else if (targetPending < current) {
      const amount = current - targetPending;
      const found = findReceiverId(next, draft.newReceivedByName);
      const payment: Payment = {
        id: createId("pay"),
        createdAt: new Date().toISOString(),
        stayId: stay.id,
        clientId: stay.clientId,
        flatId: stay.flatId,
        amount,
        method: draft.method ?? "CASH",
        receivedAt: new Date().toISOString(),
        notes: null,
        receivedById: found.id,
        voided: false,
      };
      next = { ...found.state, payments: [payment, ...found.state.payments] };
      next = withAudit(next, {
        action: method,
        entityType: "Payment",
        entityId: payment.id,
        originalValue: { pending: current },
        newValue: payment,
        reason,
      });
    }
    return syncStayPending(next, stay.id);
  }

  if (draft.kind === "change_expense_amount" && target.kind === "expense") {
    const expense = state.expenses.find((item) => item.id === target.id);
    if (!expense || draft.newAmount == null) return state;
    const nextExp = { ...expense, amount: draft.newAmount };
    return withAudit(
      { ...state, expenses: state.expenses.map((item) => (item.id === expense.id ? nextExp : item)) },
      { action: method, entityType: "Expense", entityId: expense.id, originalValue: expense, newValue: nextExp, reason },
    );
  }

  if (draft.kind === "change_expense_flat" && target.kind === "expense") {
    const expense = state.expenses.find((item) => item.id === target.id);
    if (!expense || !draft.newFlat) return state;
    const nextExp = { ...expense, flatId: flatIdOf(draft.newFlat) };
    return withAudit(
      { ...state, expenses: state.expenses.map((item) => (item.id === expense.id ? nextExp : item)) },
      { action: method, entityType: "Expense", entityId: expense.id, originalValue: expense, newValue: nextExp, reason },
    );
  }

  if (draft.kind === "change_client") {
    const newClientId = draft.newClientId ?? state.clients.find((item) => item.name.toLowerCase() === (draft.newClientName ?? "").toLowerCase())?.id;
    if (!newClientId) return state;
    if (target.kind === "payment") {
      const payment = state.payments.find((item) => item.id === target.id);
      if (!payment) return state;
      const nextPay = { ...payment, clientId: newClientId };
      let next: LedgerState = {
        ...state,
        payments: state.payments.map((item) => (item.id === payment.id ? nextPay : item)),
      };
      if (payment.stayId) {
        next = {
          ...next,
          stays: next.stays.map((item) => (item.id === payment.stayId ? { ...item, clientId: newClientId } : item)),
          rentEntries: next.rentEntries.map((item) => (item.stayId === payment.stayId ? { ...item, clientId: newClientId } : item)),
        };
      }
      return withAudit(next, {
        action: method,
        entityType: "Payment",
        entityId: payment.id,
        originalValue: payment,
        newValue: nextPay,
        reason,
      });
    }
    if (target.kind === "stay") {
      const stay = state.stays.find((item) => item.id === target.id);
      if (!stay) return state;
      const nextStay = { ...stay, clientId: newClientId };
      const next: LedgerState = {
        ...state,
        stays: state.stays.map((item) => (item.id === stay.id ? nextStay : item)),
        rentEntries: state.rentEntries.map((item) => (item.stayId === stay.id ? { ...item, clientId: newClientId } : item)),
        payments: state.payments.map((item) => (item.stayId === stay.id ? { ...item, clientId: newClientId } : item)),
      };
      return withAudit(next, {
        action: method,
        entityType: "Stay",
        entityId: stay.id,
        originalValue: stay,
        newValue: nextStay,
        reason,
      });
    }
  }

  return state;
}

function inferKind(draft: CorrectionDraft): CorrectionTarget["kind"] {
  if (draft.kind === "change_expense_amount" || draft.kind === "change_expense_flat") return "expense";
  if (
    draft.kind === "change_nights" ||
    draft.kind === "change_business" ||
    draft.kind === "set_pending" ||
    draft.kind === "mark_received"
  ) {
    return "stay";
  }
  return "payment";
}

export function uniqueTarget(targets: CorrectionTarget[]): CorrectionTarget | null {
  return targets.length === 1 ? targets[0] : null;
}

export function correctionQuestion(draft: CorrectionDraft): string {
  if (draft.kind === "change_expense_amount" || draft.kind === "change_expense_flat") return "Which expense?";
  if (draft.kind === "change_nights" || draft.kind === "change_business" || draft.kind === "set_pending") {
    return "Which stay?";
  }
  if (draft.kind === "change_client" && draft.newClientName) return `Which ${draft.newClientName}?`;
  const name = draft.clientName ?? "this";
  return `Which ${name} payment?`;
}
