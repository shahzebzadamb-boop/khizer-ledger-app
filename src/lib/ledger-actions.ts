import { addDays } from "date-fns";
import {
  availableForWithdrawal,
  clientSecurityHeld,
  paymentStayChoices,
  stayRemaining,
  uniquePaymentStayId,
} from "@/lib/ledger";
import { applyCorrection, syncStayPending, withAudit } from "@/lib/corrections";
import { formatPKR, isPlausibleLedgerAmount, isValidMoneyAmount } from "@/lib/money";
import { nightsBetween } from "@/lib/dates";
import { flatHasHistory, flatIdForName, isFlatActive, normalizeFlatCode } from "@/lib/flats";
import { normalizePhone } from "@/lib/phone";
import type { CorrectionDraft } from "@/lib/parse-correction";
import type { ConfirmableDraft } from "@/lib/parse-quick-entry";
import type { MigrationPatch } from "@/lib/parse-migration-update";
import { canonicalReceiverName, DEFAULT_RECEIVER_NAME, DEFAULT_RECEIVERS } from "@/lib/receivers";
import { createId } from "@/lib/utils";
import type {
  Client,
  Expense,
  ExpenseCategory,
  LedgerState,
  Payment,
  PaymentMethod,
  PendingDecision,
  Receiver,
} from "@/types";

export type RecordPaymentInput = {
  clientId: string;
  stayId?: string | null;
  amount: number;
  method: PaymentMethod;
  receivedById?: string | null;
  receivedByName?: string | null;
  receivedAt?: string;
  notes?: string | null;
};

export type AddStayInput = {
  flat: string;
  clientName: string;
  phone: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  business: number;
  received: number;
  method?: PaymentMethod;
  receivedById?: string | null;
  receivedByName?: string | null;
  security?: number;
  notes?: string | null;
};

export type Action =
  | { type: "HYDRATE"; payload: LedgerState }
  | { type: "RECORD_PAYMENT"; payload: RecordPaymentInput }
  | { type: "ADD_STAY"; payload: AddStayInput }
  | {
      type: "ADD_EXPENSE";
      payload: {
        amount: number;
        category: ExpenseCategory;
        description: string;
        method: PaymentMethod;
        flat?: string | null;
        spentAt?: string;
        notes?: string | null;
      };
    }
  | { type: "APPLY_QUICK_ENTRY"; parsed: ConfirmableDraft }
  | { type: "SET_CLIENT_PHONE"; clientId: string; phone: string }
  | { type: "ADD_CLIENT"; payload: { name: string; phone: string } }
  | { type: "RENAME_FLAT"; flatId: string; name: string }
  | { type: "ADD_FLAT"; payload: { name: string; displayName?: string | null } }
  | { type: "UPDATE_FLAT"; payload: { flatId: string; displayName?: string | null; name?: string } }
  | { type: "ARCHIVE_FLAT"; flatId: string }
  | { type: "RESTORE_FLAT"; flatId: string }
  | { type: "DELETE_FLAT"; flatId: string }
  | { type: "REVIEW_STATUS"; id: string; status: "CONFIRMED" | "IGNORED" }
  | { type: "REVIEW_PENDING"; id: string; decision: PendingDecision }
  | { type: "APPLY_MIGRATION_UPDATE"; id: string; patch: MigrationPatch; correctionText?: string }
  | { type: "SILENCE_CLIENT"; clientId: string; cycleDate: string }
  | { type: "MARK_NIGHT_SUMMARY"; cycleDate: string }
  | { type: "APPLY_CORRECTION"; parsed: CorrectionDraft }
  | {
      type: "UPDATE_STAY";
      payload: {
        stayId: string;
        clientName?: string;
        phone?: string | null;
        flat?: string | null;
        checkIn?: string;
        nights?: number;
        business?: number;
        notes?: string | null;
      };
    }
  | {
      type: "UPDATE_PAYMENT";
      payload: {
        paymentId: string;
        amount?: number;
        method?: PaymentMethod;
        receivedById?: string | null;
        receivedAt?: string;
        stayId?: string | null;
      };
    }
  | {
      type: "UPDATE_EXPENSE";
      payload: {
        expenseId: string;
        amount?: number;
        category?: ExpenseCategory;
        flat?: string | null;
        method?: PaymentMethod;
        description?: string;
        spentAt?: string;
      };
    }
  | {
      type: "UPDATE_SECURITY";
      payload: {
        securityId: string;
        amount?: number;
        flat?: string | null;
        clientId?: string;
        kind?: "RECEIVED" | "ADJUSTED_TO_RENT";
      };
    }
  | { type: "VOID_ENTRY"; payload: { entityType: "Stay" | "Payment" | "Expense" | "Security"; entityId: string } }
  | { type: "GENERATE_RECEIPT"; paymentId: string }
  | { type: "MARK_RECEIPT_SHARE_ATTEMPTED"; receiptId: string }
  | { type: "MARK_RECEIPT_SENT"; receiptId: string };

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function nowISO() {
  return new Date().toISOString();
}

function withActivity(
  state: LedgerState,
  entry: Omit<LedgerState["activityLogs"][number], "id" | "createdAt">,
): LedgerState {
  return {
    ...state,
    activityLogs: [
      { id: createId("act"), createdAt: nowISO(), ...entry },
      ...state.activityLogs,
    ],
  };
}

function findReceiver(
  state: LedgerState,
  input: { receivedById?: string | null; receivedByName?: string | null },
): { state: LedgerState; receiver: Receiver } {
  if (input.receivedById) {
    const existing = state.receivers.find((item) => item.id === input.receivedById);
    if (existing) return { state, receiver: existing };
  }
  const name = canonicalReceiverName(input.receivedByName || DEFAULT_RECEIVER_NAME);
  const existing = state.receivers.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (existing) return { state, receiver: existing };
  const seeded = DEFAULT_RECEIVERS.find((item) => item.name === name);
  const receiver: Receiver = {
    id: seeded?.id ?? createId("recv"),
    createdAt: nowISO(),
    name,
    active: true,
  };
  return { state: { ...state, receivers: [...state.receivers, receiver] }, receiver };
}

function findClient(
  state: LedgerState,
  name: string,
  phone: string | null,
): { state: LedgerState; client: Client; isNew: boolean } {
  if (phone) {
    const existing = state.clients.find((client) => normalizePhone(client.phone) === phone);
    if (existing) return { state, client: existing, isNew: false };
  }
  const byName = state.clients.find(
    (client) => client.name.toLowerCase() === name.toLowerCase(),
  );
  if (byName) return { state, client: byName, isNew: false };

  const client: Client = {
    id: createId("client"),
    createdAt: nowISO(),
    name,
    phone,
    phoneMissing: !phone,
    notes: null,
  };
  return { state: { ...state, clients: [client, ...state.clients] }, client, isNew: true };
}

function relatedStayId(state: LedgerState, reviewId: string): string | null {
  const review = state.reviews.find((item) => item.id === reviewId);
  if (!review) return null;
  if (review.stayId) return review.stayId;
  const sibling = state.reviews.find(
    (item) =>
      item.id !== review.id &&
      item.sourceFile === review.sourceFile &&
      item.sourceSheet === review.sourceSheet &&
      item.sourceRow === review.sourceRow &&
      item.stayId,
  );
  return sibling?.stayId ?? null;
}

function setStayPending(state: LedgerState, stayId: string, active: boolean): LedgerState {
  return {
    ...state,
    stays: state.stays.map((stay) =>
      stay.id === stayId ? { ...stay, activePending: active, notifyEnabled: active } : stay,
    ),
  };
}

function addStayDiscount(state: LedgerState, stayId: string, amount: number, note: string): LedgerState {
  if (amount <= 0) return state;
  const stay = state.stays.find((item) => item.id === stayId);
  if (!stay) return state;
  const discount = {
    id: createId("disc"),
    stayId,
    clientId: stay.clientId,
    flatId: stay.flatId,
    amount,
    occurredAt: nowISO(),
    note,
    voided: false,
  };
  return { ...state, discounts: [discount, ...state.discounts] };
}

function addStayRent(state: LedgerState, stayId: string, amount: number, note: string): LedgerState {
  if (amount <= 0) return state;
  const stay = state.stays.find((item) => item.id === stayId);
  if (!stay) return state;
  const rent = {
    id: createId("rent"),
    stayId,
    clientId: stay.clientId,
    flatId: stay.flatId,
    amount,
    occurredAt: nowISO(),
    note,
    voided: false,
  };
  return { ...state, rentEntries: [rent, ...state.rentEntries] };
}

function targetRemaining(state: LedgerState, stayId: string, remaining: number): LedgerState {
  const current = stayRemaining(stayId, state);
  if (current === remaining) return state;
  if (current > remaining) return addStayDiscount(state, stayId, current - remaining, "Migration remaining fix");
  return addStayRent(state, stayId, remaining - current, "Migration remaining fix");
}

function applyMigrationPatch(
  state: LedgerState,
  reviewId: string,
  patch: MigrationPatch,
  correctionText?: string,
): LedgerState {
  const review = state.reviews.find((item) => item.id === reviewId);
  if (!review) return state;
  const stayId = relatedStayId(state, reviewId);
  const stay = stayId ? state.stays.find((item) => item.id === stayId) ?? null : null;
  let next = state;

  if (patch.ignore) {
    next = {
      ...next,
      reviews: next.reviews.map((item) =>
        item.id === reviewId
          ? {
              ...item,
              status: "IGNORED",
              lastQuickUpdate: patch.summary,
              currentInterpretation: "Ignored.",
              previousInterpretation: item.currentInterpretation,
              correctionText: correctionText ?? patch.summary,
              originalValue: item.originalValue ?? item.sourceText,
              updatedAt: nowISO(),
            }
          : item,
      ),
    };
    return withActivity(next, {
      action: "MIGRATION_UPDATED",
      entityType: "MigrationRecord",
      entityId: reviewId,
      summary: `Ignored ${review.customer ?? "row"} · ${review.flatName}`,
    });
  }

  if (patch.keepExpense && review.amount && review.proposedType !== "SUMMARY") {
    const already = next.expenses.some(
      (item) => item.notes === review.sourceText || item.description === review.sourceText,
    );
    if (!already) {
      const expense: Expense = {
        id: createId("exp"),
        createdAt: nowISO(),
        flatId: `flat_${review.flatName}`,
        amount: review.amount,
        category: "OTHER",
        description: review.customer ? `${review.customer} expense` : "Confirmed expense",
        method: patch.method ?? "OTHER",
        spentAt: review.date ? `${review.date}T00:00:00.000Z` : nowISO(),
        notes: review.sourceText,
      };
      next = { ...next, expenses: [expense, ...next.expenses] };
    }
  }

  if (stay) {
    if (patch.checkInText) {
      next = {
        ...next,
        stays: next.stays.map((item) =>
          item.id === stay.id ? { ...item, checkIn: `${patch.checkInText}T00:00:00.000Z` } : item,
        ),
      };
    }
    if (patch.checkOutText) {
      next = {
        ...next,
        stays: next.stays.map((item) =>
          item.id === stay.id ? { ...item, checkOut: `${patch.checkOutText}T00:00:00.000Z` } : item,
        ),
      };
    }
    if (patch.nights) {
      next = {
        ...next,
        stays: next.stays.map((item) => (item.id === stay.id ? { ...item, nights: patch.nights ?? item.nights } : item)),
      };
    }
    if (patch.rentAmount) {
      const existing = next.rentEntries.find((item) => item.stayId === stay.id);
      if (existing) {
        next = {
          ...next,
          rentEntries: next.rentEntries.map((item) =>
            item.id === existing.id ? { ...item, amount: patch.rentAmount ?? item.amount } : item,
          ),
        };
      } else {
        next = addStayRent(next, stay.id, patch.rentAmount, "Migration rent fix");
      }
    }
    if (patch.receiveAmount) {
      next = applyPayment(next, {
        clientId: stay.clientId,
        stayId: stay.id,
        amount: patch.receiveAmount,
        method: patch.method ?? "CASH",
      });
    }
    if (patch.alreadyPaid || patch.settlePending) {
      const leftover = stayRemaining(stay.id, next);
      if (leftover > 0) {
        next = applyPayment(next, {
          clientId: stay.clientId,
          stayId: stay.id,
          amount: leftover,
          method: patch.method ?? "OTHER",
        });
      }
      next = setStayPending(next, stay.id, false);
    }
    if (patch.remainingAmount !== undefined) {
      next = targetRemaining(next, stay.id, patch.remainingAmount);
      next = setStayPending(next, stay.id, patch.remainingAmount > 0 && (patch.stillPending ?? stay.activePending));
    }
    if (patch.stillPending) {
      next = setStayPending(next, stay.id, stayRemaining(stay.id, next) > 0);
    }
    if (patch.alreadyPaid || (patch.remainingAmount === 0 && !patch.stillPending)) {
      next = setStayPending(next, stay.id, false);
    }
  }

  const interpretation = [
    patch.summary,
    stay ? `Pending now ${formatPKR(stayRemaining(stay.id, next))}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  next = {
    ...next,
    reviews: next.reviews.map((item) =>
      item.id === reviewId
        ? {
            ...item,
            status: "CONFIRMED",
            lastQuickUpdate: patch.summary,
            currentInterpretation: interpretation,
            previousInterpretation: item.currentInterpretation,
            correctionText: correctionText ?? patch.summary,
            originalValue: item.originalValue ?? item.sourceText,
            updatedAt: nowISO(),
            pendingDecision: patch.stillPending
              ? "STILL_PENDING"
              : patch.alreadyPaid
                ? "ALREADY_PAID"
                : item.pendingDecision,
          }
        : item,
    ),
    auditLogs: [
      {
        id: createId("audit"),
        createdAt: nowISO(),
        action: "MIGRATION_QUICK_UPDATE",
        entityType: "MigrationRecord",
        entityId: reviewId,
        originalValue: review.sourceText,
        newValue: patch.summary,
        reason: "Migration Quick Update",
      },
      ...next.auditLogs,
    ],
  };

  return withActivity(next, {
    action: "MIGRATION_UPDATED",
    entityType: "MigrationRecord",
    entityId: reviewId,
    summary: `Updated ${review.customer ?? "row"} · Flat ${review.flatName}`,
  });
}

function openStayFor(state: LedgerState, clientId: string, flatName: string | null) {
  const open = state.stays
    .filter((stay) => !stay.voided && stay.clientId === clientId && stayRemaining(stay.id, state) > 0)
    .filter((stay) => !flatName || stay.flatId === `flat_${flatName}`)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
  return open ?? null;
}

function applyAddStay(state: LedgerState, input: AddStayInput): LedgerState {
  const phone = normalizePhone(input.phone);
  const name = input.clientName.trim();
  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (!phone || !name || nights < 1) return state;
  if (!isPlausibleLedgerAmount(input.business)) return state;
  if (!isValidMoneyAmount(input.received, true)) return state;
  const security = input.security ?? 0;
  if (security > 0 && !isPlausibleLedgerAmount(security)) return state;

  const found = findClient(state, name, phone);
  let next = found.state;
  const client = found.client;
  const flatName = normalizeFlatCode(input.flat) ?? input.flat;
  const existingFlat = next.flats.find((item) => item.id === flatIdForName(flatName) || item.name === flatName);
  if (!existingFlat || !isFlatActive(existingFlat)) return next;
  const flatId = existingFlat.id;

  const stayId = createId("stay");
  const stay = {
    id: stayId,
    createdAt: nowISO(),
    flatId,
    clientId: client.id,
    checkIn: asDate(input.checkIn).toISOString(),
    checkOut: asDate(input.checkOut).toISOString(),
    nights,
    notifyEnabled: input.business - input.received > 0,
    activePending: input.business - input.received > 0,
    importKey: null,
    voided: false,
  };
  const rent = {
    id: createId("rent"),
    stayId,
    clientId: client.id,
    flatId,
    amount: input.business,
    occurredAt: asDate(input.checkIn).toISOString(),
    note: input.notes?.trim() || null,
    voided: false,
  };
  next = {
    ...next,
    stays: [stay, ...next.stays],
    rentEntries: [rent, ...next.rentEntries],
  };
  next = withActivity(next, {
    action: "RENT_CREATED",
    entityType: "Stay",
    entityId: stayId,
    summary: `Rent ${formatPKR(input.business)} for ${client.name}.`,
  });
  if (input.received > 0) {
    next = applyPayment(next, {
      clientId: client.id,
      stayId,
      amount: input.received,
      method: input.method ?? "CASH",
      receivedById: input.receivedById,
      receivedByName: input.receivedByName,
      receivedAt: asDate(input.checkIn).toISOString(),
    });
  }
  if (security > 0) {
    const row = {
      id: createId("sec"),
      clientId: client.id,
      stayId,
      flatId,
      kind: "RECEIVED" as const,
      amount: security,
      occurredAt: asDate(input.checkIn).toISOString(),
      notes: null,
      voided: false,
    };
    next = withActivity(
      { ...next, security: [row, ...next.security] },
      {
        action: "SECURITY_RECEIVED",
        entityType: "Security",
        entityId: row.id,
        summary: `Security ${formatPKR(security)} from ${client.name}.`,
      },
    );
  }
  return syncStayPending(next, stayId);
}

function applyPayment(state: LedgerState, input: RecordPaymentInput): LedgerState {
  if (!isPlausibleLedgerAmount(input.amount)) return state;
  const foundReceiver = findReceiver(state, input);
  let next = foundReceiver.state;
  const receiver = foundReceiver.receiver;
  const stayId =
    input.stayId && next.stays.some((item) => item.id === input.stayId)
      ? input.stayId
      : uniquePaymentStayId(paymentStayChoices(next, input.clientId, null));
  if (!stayId) return next;
  const stay = next.stays.find((item) => item.id === stayId);
  const payment: Payment = {
    id: createId("pay"),
    createdAt: nowISO(),
    stayId,
    clientId: input.clientId,
    flatId: stay?.flatId ?? null,
    amount: input.amount,
    method: input.method,
    receivedAt: input.receivedAt ?? nowISO(),
    notes: input.notes ?? null,
    receivedById: receiver.id,
    voided: false,
  };
  const client = next.clients.find((item) => item.id === input.clientId);
  const cycleDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
  next = withActivity(
    {
      ...next,
      payments: [payment, ...next.payments],
      reminderSilences: [
        { clientId: input.clientId, cycleDate },
        ...next.reminderSilences.filter(
          (item) => !(item.clientId === input.clientId && item.cycleDate === cycleDate),
        ),
      ],
    },
    {
      action: "PAYMENT_RECEIVED",
      entityType: "Payment",
      entityId: payment.id,
      summary: `Received ${formatPKR(input.amount)} from ${client?.name ?? "customer"}.`,
    },
  );
  return syncStayPending(next, stayId);
}

function withDefaultReceivers(state: LedgerState): LedgerState {
  const receivers = [...(state.receivers ?? [])];
  for (const seed of DEFAULT_RECEIVERS) {
    const exists = receivers.some(
      (item) => item.id === seed.id || item.name.toLowerCase() === seed.name.toLowerCase(),
    );
    if (!exists) receivers.push({ ...seed });
  }
  return { ...state, receivers };
}

function normalizeState(state: LedgerState): LedgerState {
  return withDefaultReceivers({
    ...state,
    flats: (state.flats ?? []).map((flat, index) => ({
      ...flat,
      displayName: flat.displayName ?? null,
      active: flat.active !== false && !flat.archivedAt,
      archivedAt: flat.archivedAt ?? null,
      createdAt: flat.createdAt ?? "2026-01-01T00:00:00.000Z",
      updatedAt: flat.updatedAt ?? flat.createdAt ?? "2026-01-01T00:00:00.000Z",
      sortOrder: Number.isFinite(flat.sortOrder) ? flat.sortOrder : index + 1,
    })),
    stays: state.stays.map((stay) => ({
      ...stay,
      activePending: stay.activePending ?? false,
      notifyEnabled: stay.notifyEnabled ?? false,
      voided: stay.voided ?? false,
    })),
    rentEntries: (state.rentEntries ?? []).map((item) => ({ ...item, voided: item.voided ?? false })),
    payments: state.payments.map((item) => ({
      ...item,
      receivedById: item.receivedById ?? "recv_anas",
      voided: item.voided ?? false,
    })),
    expenses: (state.expenses ?? []).map((item) => ({ ...item, voided: item.voided ?? false })),
    security: (state.security ?? []).map((item) => ({ ...item, voided: item.voided ?? false })),
    discounts: (state.discounts ?? []).map((item) => ({ ...item, voided: item.voided ?? false })),
    withdrawals: (state.withdrawals ?? []).map((item) => ({ ...item, voided: item.voided ?? false })),
    monthlyReports: state.monthlyReports ?? [],
    receipts: state.receipts ?? [],
    reviews: state.reviews.map((item) => ({
      ...item,
      month: item.month ?? item.sourceSheet,
      currentInterpretation: item.currentInterpretation ?? item.reason,
      lastQuickUpdate: item.lastQuickUpdate ?? null,
      originalValue: item.originalValue ?? item.sourceText,
      correctionText: item.correctionText ?? null,
      previousInterpretation: item.previousInterpretation ?? null,
      importedAt: item.importedAt ?? null,
      updatedAt: item.updatedAt ?? null,
    })),
  });
}

function reducer(state: LedgerState, action: Action): LedgerState {
  switch (action.type) {
    case "HYDRATE":
      return normalizeState(action.payload);
    case "RECORD_PAYMENT":
      return applyPayment(state, action.payload);
    case "ADD_STAY":
      return applyAddStay(state, action.payload);
    case "ADD_EXPENSE": {
      const expense: Expense = {
        id: createId("exp"),
        createdAt: nowISO(),
        flatId: action.payload.flat ? `flat_${action.payload.flat}` : null,
        amount: action.payload.amount,
        category: action.payload.category,
        description: action.payload.description,
        method: action.payload.method,
        spentAt: action.payload.spentAt ?? nowISO(),
        notes: action.payload.notes ?? null,
        voided: false,
      };
      return withActivity(
        { ...state, expenses: [expense, ...state.expenses] },
        {
          action: "EXPENSE_CREATED",
          entityType: "Expense",
          entityId: expense.id,
          summary: `${formatPKR(expense.amount)} expense · ${expense.description}`,
        },
      );
    }
    case "SET_CLIENT_PHONE":
      return {
        ...state,
        clients: state.clients.map((client) =>
          client.id === action.clientId
            ? {
                ...client,
                phone: normalizePhone(action.phone),
                phoneMissing: false,
              }
            : client,
        ),
      };
    case "ADD_CLIENT": {
      const name = action.payload.name.trim();
      const phone = normalizePhone(action.payload.phone);
      if (!name || !phone) return state;
      const existing = state.clients.find((client) => normalizePhone(client.phone) === phone);
      if (existing) return state;
      const client: Client = {
        id: createId("client"),
        createdAt: nowISO(),
        name,
        phone,
        phoneMissing: false,
        notes: null,
      };
      return { ...state, clients: [client, ...state.clients] };
    }
    case "RENAME_FLAT": {
      const nextName = normalizeFlatCode(action.name) ?? action.name.trim();
      const current = state.flats.find((flat) => flat.id === action.flatId);
      if (!current || !nextName) return state;
      if (state.flats.some((flat) => flat.id !== action.flatId && (normalizeFlatCode(flat.name) ?? flat.name) === nextName)) {
        return state;
      }
      if (flatHasHistory(state, action.flatId) && nextName !== current.name) {
        return state;
      }
      return {
        ...state,
        flats: state.flats.map((flat) =>
          flat.id === action.flatId ? { ...flat, name: nextName, updatedAt: nowISO() } : flat,
        ),
      };
    }
    case "ADD_FLAT": {
      const name = normalizeFlatCode(action.payload.name);
      if (!name) return state;
      if (state.flats.some((flat) => (normalizeFlatCode(flat.name) ?? flat.name) === name)) return state;
      const now = nowISO();
      const sortOrder = state.flats.reduce((max, flat) => Math.max(max, flat.sortOrder), 0) + 1;
      const displayName = action.payload.displayName?.trim() || null;
      return {
        ...state,
        flats: [
          ...state.flats,
          {
            id: flatIdForName(name),
            name,
            displayName,
            sortOrder,
            active: true,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
    }
    case "UPDATE_FLAT": {
      const current = state.flats.find((flat) => flat.id === action.payload.flatId);
      if (!current) return state;
      const displayName =
        action.payload.displayName === undefined ? current.displayName : action.payload.displayName?.trim() || null;
      let name = current.name;
      if (action.payload.name) {
        const nextName = normalizeFlatCode(action.payload.name);
        if (nextName && !flatHasHistory(state, current.id) && !state.flats.some((flat) => flat.id !== current.id && (normalizeFlatCode(flat.name) ?? flat.name) === nextName)) {
          name = nextName;
        }
      }
      return {
        ...state,
        flats: state.flats.map((flat) =>
          flat.id === current.id ? { ...flat, name, displayName, updatedAt: nowISO() } : flat,
        ),
      };
    }
    case "ARCHIVE_FLAT":
      return {
        ...state,
        flats: state.flats.map((flat) =>
          flat.id === action.flatId
            ? { ...flat, active: false, archivedAt: nowISO(), updatedAt: nowISO() }
            : flat,
        ),
      };
    case "RESTORE_FLAT":
      return {
        ...state,
        flats: state.flats.map((flat) =>
          flat.id === action.flatId ? { ...flat, active: true, archivedAt: null, updatedAt: nowISO() } : flat,
        ),
      };
    case "DELETE_FLAT": {
      if (flatHasHistory(state, action.flatId)) return state;
      return { ...state, flats: state.flats.filter((flat) => flat.id !== action.flatId) };
    }
    case "APPLY_MIGRATION_UPDATE":
      return applyMigrationPatch(state, action.id, action.patch, action.correctionText);
    case "REVIEW_STATUS":
      return {
        ...state,
        reviews: state.reviews.map((item) =>
          item.id === action.id ? { ...item, status: action.status } : item,
        ),
      };
    case "REVIEW_PENDING": {
      const review = state.reviews.find((item) => item.id === action.id);
      let next: LedgerState = {
        ...state,
        reviews: state.reviews.map((item) =>
          item.id === action.id
            ? { ...item, pendingDecision: action.decision, status: "CONFIRMED" }
            : item,
        ),
        stays: state.stays.map((stay) => {
          if (!review || review.stayId !== stay.id) return stay;
          return {
            ...stay,
            notifyEnabled: action.decision === "STILL_PENDING",
            activePending: action.decision === "STILL_PENDING",
          };
        }),
      };
      if (action.decision === "ALREADY_PAID" && review?.stayId && review.amount) {
        const stay = next.stays.find((item) => item.id === review.stayId);
        if (stay) {
          next = applyPayment(next, {
            clientId: stay.clientId,
            stayId: stay.id,
            amount: review.amount,
            method: "OTHER",
          });
          next = {
            ...next,
            auditLogs: [
              {
                id: createId("audit"),
                createdAt: nowISO(),
                action: "TRANSACTION_CORRECTED",
                entityType: "Stay",
                entityId: stay.id,
                originalValue: "pending",
                newValue: "already_paid",
                reason: "Migration review: already paid",
              },
              ...next.auditLogs,
            ],
          };
        }
      }
      return next;
    }
    case "SILENCE_CLIENT":
      return {
        ...state,
        reminderSilences: [
          { clientId: action.clientId, cycleDate: action.cycleDate },
          ...state.reminderSilences.filter(
            (item) => !(item.clientId === action.clientId && item.cycleDate === action.cycleDate),
          ),
        ],
      };
    case "MARK_NIGHT_SUMMARY":
      return {
        ...state,
        nightSummaryDates: Array.from(new Set([...state.nightSummaryDates, action.cycleDate])),
      };
    case "APPLY_CORRECTION":
      return applyCorrection(state, action.parsed, "QUICK_ENTRY");
    case "UPDATE_STAY": {
      const stay = state.stays.find((item) => item.id === action.payload.stayId);
      if (!stay) return state;
      let next = state;
      if (action.payload.clientName || action.payload.phone !== undefined) {
        next = {
          ...next,
          clients: next.clients.map((client) =>
            client.id === stay.clientId
              ? {
                  ...client,
                  name: action.payload.clientName?.trim() || client.name,
                  phone: action.payload.phone !== undefined ? (action.payload.phone ? normalizePhone(action.payload.phone) : null) : client.phone,
                  phoneMissing: action.payload.phone !== undefined ? !action.payload.phone : client.phoneMissing,
                }
              : client,
          ),
        };
      }
      const nights = action.payload.nights ?? stay.nights;
      const checkIn = action.payload.checkIn ?? stay.checkIn;
      const nextStay = {
        ...stay,
        flatId: action.payload.flat ? `flat_${action.payload.flat}` : stay.flatId,
        checkIn,
        nights,
        checkOut: addDays(new Date(checkIn), nights).toISOString(),
      };
      next = { ...next, stays: next.stays.map((item) => (item.id === stay.id ? nextStay : item)) };
      if (action.payload.flat) {
        const flatId = `flat_${action.payload.flat}`;
        next = {
          ...next,
          rentEntries: next.rentEntries.map((item) => (item.stayId === stay.id ? { ...item, flatId } : item)),
          payments: next.payments.map((item) => (item.stayId === stay.id ? { ...item, flatId } : item)),
        };
      }
      if (action.payload.business != null) {
        const rents = next.rentEntries.filter((item) => item.stayId === stay.id && !item.voided);
        const row = rents[0];
        if (row) {
          next = {
            ...next,
            rentEntries: next.rentEntries.map((item) => (item.id === row.id ? { ...item, amount: action.payload.business as number } : item)),
          };
        }
      }
      if (action.payload.notes !== undefined) {
        const row = next.rentEntries.find((item) => item.stayId === stay.id);
        if (row) {
          next = {
            ...next,
            rentEntries: next.rentEntries.map((item) => (item.id === row.id ? { ...item, note: action.payload.notes ?? null } : item)),
          };
        }
      }
      next = withAudit(next, {
        action: "MANUAL_EDIT",
        entityType: "Stay",
        entityId: stay.id,
        originalValue: stay,
        newValue: nextStay,
        reason: "Manual edit",
      });
      return syncStayPending(next, stay.id);
    }
    case "UPDATE_PAYMENT": {
      const payment = state.payments.find((item) => item.id === action.payload.paymentId);
      if (!payment) return state;
      const stay = action.payload.stayId
        ? state.stays.find((item) => item.id === action.payload.stayId)
        : state.stays.find((item) => item.id === payment.stayId);
      const nextPay: Payment = {
        ...payment,
        amount: action.payload.amount ?? payment.amount,
        method: action.payload.method ?? payment.method,
        receivedById: action.payload.receivedById ?? payment.receivedById,
        receivedAt: action.payload.receivedAt ?? payment.receivedAt,
        stayId: action.payload.stayId ?? payment.stayId,
        flatId: stay?.flatId ?? payment.flatId,
        clientId: stay?.clientId ?? payment.clientId,
      };
      let next: LedgerState = {
        ...state,
        payments: state.payments.map((item) => (item.id === payment.id ? nextPay : item)),
      };
      next = withAudit(next, {
        action: "MANUAL_EDIT",
        entityType: "Payment",
        entityId: payment.id,
        originalValue: payment,
        newValue: nextPay,
        reason: "Manual edit",
      });
      next = syncStayPending(next, payment.stayId);
      return syncStayPending(next, nextPay.stayId);
    }
    case "UPDATE_EXPENSE": {
      const expense = state.expenses.find((item) => item.id === action.payload.expenseId);
      if (!expense) return state;
      const nextExp: Expense = {
        ...expense,
        amount: action.payload.amount ?? expense.amount,
        category: action.payload.category ?? expense.category,
        flatId: action.payload.flat !== undefined ? (action.payload.flat ? `flat_${action.payload.flat}` : null) : expense.flatId,
        method: action.payload.method ?? expense.method,
        description: action.payload.description ?? expense.description,
        spentAt: action.payload.spentAt ?? expense.spentAt,
      };
      return withAudit(
        { ...state, expenses: state.expenses.map((item) => (item.id === expense.id ? nextExp : item)) },
        {
          action: "MANUAL_EDIT",
          entityType: "Expense",
          entityId: expense.id,
          originalValue: expense,
          newValue: nextExp,
          reason: "Manual edit",
        },
      );
    }
    case "UPDATE_SECURITY": {
      const row = state.security.find((item) => item.id === action.payload.securityId);
      if (!row) return state;
      const nextRow = {
        ...row,
        amount: action.payload.amount ?? row.amount,
        flatId: action.payload.flat !== undefined ? (action.payload.flat ? `flat_${action.payload.flat}` : null) : row.flatId,
        clientId: action.payload.clientId ?? row.clientId,
        kind: action.payload.kind ?? row.kind,
      };
      let next: LedgerState = {
        ...state,
        security: state.security.map((item) => (item.id === row.id ? nextRow : item)),
      };
      next = withAudit(next, {
        action: "MANUAL_EDIT",
        entityType: "Security",
        entityId: row.id,
        originalValue: row,
        newValue: nextRow,
        reason: "Manual edit",
      });
      return syncStayPending(next, row.stayId);
    }
    case "VOID_ENTRY":
      return applyCorrection(
        state,
        {
          type: "correction",
          kind: "void_entry",
          raw: "Void this entry?",
          clientName: null,
          phone: null,
          flat: null,
          amount: null,
          newAmount: null,
          nights: null,
          newNights: null,
          method: null,
          newMethod: null,
          receivedByName: null,
          newReceivedByName: null,
          newFlat: null,
          newClientName: null,
          description: null,
          category: null,
          targetId: action.payload.entityId,
          targetKind:
            action.payload.entityType === "Stay"
              ? "stay"
              : action.payload.entityType === "Expense"
                ? "expense"
                : action.payload.entityType === "Security"
                  ? "security"
                  : "payment",
        },
        "MANUAL_EDIT",
      );
    case "GENERATE_RECEIPT":
    case "MARK_RECEIPT_SHARE_ATTEMPTED":
    case "MARK_RECEIPT_SENT":
      return state;
    case "APPLY_QUICK_ENTRY": {
      const parsed = action.parsed;
      if (parsed.type === "correction") {
        return applyCorrection(state, parsed, "QUICK_ENTRY");
      }
      if (parsed.type === "expense") {
        return reducer(state, {
          type: "ADD_EXPENSE",
          payload: parsed,
        });
      }
      if (parsed.type === "withdrawal") {
        const available = availableForWithdrawal(state);
        if (parsed.amount > available) return state;
        const withdrawal = {
          id: createId("wd"),
          amount: parsed.amount,
          occurredAt: nowISO(),
          note: parsed.note,
          voided: false,
        };
        return withActivity(
          { ...state, withdrawals: [withdrawal, ...state.withdrawals] },
          {
            action: "ANAS_WITHDRAWAL",
            entityType: "Withdrawal",
            entityId: withdrawal.id,
            summary: `Anas withdrew ${formatPKR(parsed.amount)}.`,
          },
        );
      }

      const phone = parsed.type === "payment" || parsed.type === "rent" || parsed.type === "security"
        ? parsed.phone
        : "phone" in parsed
          ? parsed.phone
          : null;
      const name = "clientName" in parsed && parsed.clientName ? parsed.clientName : "";
      const found = findClient(state, name, phone);
      let next = found.state;
      const client = found.client;

      if (parsed.type === "payment") {
        const stayId =
          parsed.stayId ?? uniquePaymentStayId(paymentStayChoices(next, client.id, parsed.flat));
        if (!stayId) return next;
        return applyPayment(next, {
          clientId: client.id,
          stayId,
          amount: parsed.amount,
          method: parsed.method,
          receivedByName: parsed.receivedByName,
          receivedAt: parsed.receivedAt,
        });
      }

      if (parsed.type === "security") {
        const stay = openStayFor(next, client.id, parsed.flat);
        const row = {
          id: createId("sec"),
          clientId: client.id,
          stayId: stay?.id ?? null,
          flatId: stay?.flatId ?? (parsed.flat ? `flat_${parsed.flat}` : null),
          kind: "RECEIVED" as const,
          amount: parsed.amount,
          occurredAt: nowISO(),
          notes: null,
          voided: false,
        };
        return withActivity(
          { ...next, security: [row, ...next.security] },
          {
            action: "SECURITY_RECEIVED",
            entityType: "Security",
            entityId: row.id,
            summary: `Security ${formatPKR(parsed.amount)} from ${client.name}.`,
          },
        );
      }

      if (parsed.type === "security_adjustment") {
        const held = clientSecurityHeld(client.id, next);
        const amount = Math.min(parsed.amount, held);
        const stay = openStayFor(next, client.id, null);
        const row = {
          id: createId("sec"),
          clientId: client.id,
          stayId: stay?.id ?? null,
          flatId: stay?.flatId ?? null,
          kind: "ADJUSTED_TO_RENT" as const,
          amount,
          occurredAt: nowISO(),
          notes: "Security applied to rent. No new cash.",
          voided: false,
        };
        return withActivity(
          { ...next, security: [row, ...next.security] },
          {
            action: "SECURITY_ADJUSTED",
            entityType: "Security",
            entityId: row.id,
            summary: `Applied ${formatPKR(amount)} security to rent for ${client.name}.`,
          },
        );
      }

      if (parsed.type === "discount") {
        const stay = openStayFor(next, client.id, null);
        if (!stay) return next;
        const discount = {
          id: createId("disc"),
          stayId: stay.id,
          clientId: client.id,
          flatId: stay.flatId,
          amount: parsed.amount,
          occurredAt: nowISO(),
          note: null,
          voided: false,
        };
        return withActivity(
          { ...next, discounts: [discount, ...next.discounts] },
          {
            action: "DISCOUNT_ADDED",
            entityType: "Discount",
            entityId: discount.id,
            summary: `Discount ${formatPKR(parsed.amount)} for ${client.name}.`,
          },
        );
      }

      if (parsed.type === "extension") {
        const stay = openStayFor(next, client.id, parsed.flat);
        if (!stay) return next;
        const rent = {
          id: createId("rent"),
          stayId: stay.id,
          clientId: client.id,
          flatId: stay.flatId,
          amount: parsed.extraRevenue,
          occurredAt: nowISO(),
          note: `Extended ${parsed.extraNights} days`,
          voided: false,
        };
        return withActivity(
          {
            ...next,
            stays: next.stays.map((item) =>
              item.id === stay.id
                ? {
                    ...item,
                    nights: item.nights + parsed.extraNights,
                    checkOut: addDays(new Date(item.checkOut), parsed.extraNights).toISOString(),
                  }
                : item,
            ),
            rentEntries: [rent, ...next.rentEntries],
          },
          {
            action: "STAY_EXTENDED",
            entityType: "Stay",
            entityId: stay.id,
            summary: `Extended ${client.name} by ${parsed.extraNights} days.`,
          },
        );
      }

      if (parsed.type === "rent") {
        const stayId = createId("stay");
        const code = parsed.flat ? normalizeFlatCode(parsed.flat) ?? parsed.flat : null;
        const existingFlat = code
          ? next.flats.find((item) => item.id === flatIdForName(code) || item.name === code)
          : next.flats.find(isFlatActive);
        if (!existingFlat || !isFlatActive(existingFlat)) return next;
        const flatId = existingFlat.id;
        const stay = {
          id: stayId,
          createdAt: nowISO(),
          flatId,
          clientId: client.id,
          checkIn: asDate(parsed.checkIn).toISOString(),
          checkOut: asDate(parsed.checkOut).toISOString(),
          nights: parsed.nights,
          notifyEnabled: parsed.remaining > 0,
          activePending: parsed.remaining > 0,
          importKey: null,
          voided: false,
        };
        const rent = {
          id: createId("rent"),
          stayId,
          clientId: client.id,
          flatId,
          amount: parsed.totalAmount,
          occurredAt: asDate(parsed.checkIn).toISOString(),
          note: null,
          voided: false,
        };
        next = {
          ...next,
          stays: [stay, ...next.stays],
          rentEntries: [rent, ...next.rentEntries],
        };
        next = withActivity(next, {
          action: "RENT_CREATED",
          entityType: "Stay",
          entityId: stayId,
          summary: `Rent ${formatPKR(parsed.totalAmount)} for ${client.name}.`,
        });
        if (parsed.receivedAmount > 0) {
          next = applyPayment(next, {
            clientId: client.id,
            stayId,
            amount: parsed.receivedAmount,
            method: parsed.method,
            receivedByName: parsed.receivedByName,
            receivedAt: asDate(parsed.checkIn).toISOString(),
          });
        }
        return next;
      }

      return next;
    }
    default:
      return state;
  }
}

export function reviveAction(action: Action): Action {
  if (action.type !== "APPLY_QUICK_ENTRY" || action.parsed.type !== "rent") return action;
  return {
    ...action,
    parsed: {
      ...action.parsed,
      checkIn: asDate(action.parsed.checkIn),
      checkOut: asDate(action.parsed.checkOut),
    },
  };
}

export { normalizeState, reducer };
