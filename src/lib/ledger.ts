import type {
  AttentionItem,
  DashboardTotals,
  DateRange,
  LedgerState,
  Stay,
} from "@/types";
import { inRange, startOfToday } from "@/lib/dates";
import {
  operationalTotals,
  outstandingAsOf,
  stayBalanceAsOf,
  stayCountsTowardClosingPending,
} from "@/lib/month-accounting";
import { formatPKR, isPlausibleLedgerAmount, methodLabel } from "@/lib/money";
import { displayPhone, normalizePhone, samePhone } from "@/lib/phone";

export function isLive<T extends { voided?: boolean }>(item: T): boolean {
  return !item.voided;
}

export function receiverName(state: LedgerState, receiverId: string | null | undefined): string {
  if (!receiverId) return "Anas";
  return state.receivers.find((item) => item.id === receiverId)?.name ?? "Anas";
}

export function flatName(state: LedgerState, flatId: string | null | undefined): string {
  if (!flatId) return "";
  return state.flats.find((item) => item.id === flatId)?.name ?? flatId.replace(/^flat_/, "");
}

export function stayRevenue(stayId: string, state: LedgerState): number {
  return state.rentEntries
    .filter((item) => item.stayId === stayId && isLive(item) && isPlausibleLedgerAmount(item.amount))
    .reduce((sum, item) => sum + item.amount, 0);
}

export function stayDiscounts(stayId: string, state: LedgerState): number {
  return state.discounts
    .filter((item) => item.stayId === stayId && isLive(item))
    .reduce((sum, item) => sum + item.amount, 0);
}

export function stayPayments(stayId: string, state: LedgerState): number {
  return state.payments
    .filter((item) => item.stayId === stayId && isLive(item) && isPlausibleLedgerAmount(item.amount) && isRentPayment(item, state.reviews))
    .reduce((sum, item) => sum + item.amount, 0);
}

export function staySecurityApplied(stayId: string, state: LedgerState): number {
  return state.security
    .filter((item) => item.stayId === stayId && isLive(item) && item.kind === "ADJUSTED_TO_RENT")
    .reduce((sum, item) => sum + item.amount, 0);
}

export function stayCollectible(stayId: string, state: LedgerState): number {
  return Math.max(0, stayRevenue(stayId, state) - stayDiscounts(stayId, state));
}

export function stayRemaining(stayId: string, state: LedgerState): number {
  return Math.max(
    0,
    stayCollectible(stayId, state) - stayPayments(stayId, state) - staySecurityApplied(stayId, state),
  );
}

export function clientSecurityHeld(clientId: string, state: LedgerState): number {
  return state.security
    .filter((item) => item.clientId === clientId && isLive(item))
    .reduce((sum, item) => {
      if (item.kind === "RECEIVED") return sum + item.amount;
      return sum - item.amount;
    }, 0);
}

export function isStayPendingActive(stay: Stay, state: LedgerState): boolean {
  if (stayRemaining(stay.id, state) <= 0) return false;
  if (stay.activePending) return true;
  if (stay.notifyEnabled && stay.importKey === null) return true;
  return state.reviews.some(
    (review) =>
      review.stayId === stay.id &&
      review.pendingDecision === "STILL_PENDING",
  );
}

function matchesFlat(flatId: string | null | undefined, selected: string): boolean {
  if (selected === "all") return true;
  return flatId === `flat_${selected}` || flatId === selected;
}

function stayTouchesRange(stay: Stay, state: LedgerState, range: DateRange): boolean {
  if (inRange(stay.checkIn, range) || inRange(stay.checkOut, range)) return true;
  return state.rentEntries.some((item) => item.stayId === stay.id && isLive(item) && inRange(item.occurredAt, range));
}

function matchesClient(
  state: LedgerState,
  name: string,
  phone: string | null,
): LedgerState["clients"][number] | null {
  if (phone) {
    const byPhone = state.clients.find((client) => samePhone(client.phone, phone));
    if (byPhone) return byPhone;
  }
  return (
    state.clients.find((client) => client.name.toLowerCase() === name.trim().toLowerCase()) ?? null
  );
}

export function findClientByPhone(state: LedgerState, raw: string | null | undefined) {
  const phone = normalizePhone(raw);
  if (!phone) return null;
  return state.clients.find((client) => samePhone(client.phone, phone)) ?? null;
}

export function suggestClients(state: LedgerState, query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, "");
  return state.clients
    .filter((client) => {
      if (client.name.toLowerCase().includes(q)) return true;
      if (digits.length >= 3) {
        const phoneDigits = (client.phone ?? "").replace(/\D/g, "");
        const local = displayPhone(client.phone).replace(/\D/g, "");
        if (phoneDigits.includes(digits) || local.includes(digits)) return true;
      }
      return false;
    })
    .slice(0, 5);
}

export function matchClient(
  state: LedgerState,
  name: string,
  phone: string | null,
): LedgerState["clients"][number] | null {
  return matchesClient(state, name, phone);
}

export type StayChoice = {
  stayId: string;
  flat: string;
  nights: number;
  pending: number;
  checkIn: string;
  checkOut: string;
};

export function paymentStayChoices(
  state: LedgerState,
  clientId: string,
  selectedFlat: string | null,
): StayChoice[] {
  const stays = state.stays
    .filter((stay) => isLive(stay) && stay.clientId === clientId)
    .filter((stay) => !selectedFlat || stay.flatId === `flat_${selectedFlat}` || stay.flatId === selectedFlat);
  const toChoice = (stay: Stay): StayChoice => ({
    stayId: stay.id,
    flat: flatName(state, stay.flatId),
    nights: stay.nights,
    pending: stayRemaining(stay.id, state),
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
  });
  const open = stays.filter((stay) => stayRemaining(stay.id, state) > 0).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  if (open.length > 0) return open.map(toChoice);
  return [...stays].sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1)).map(toChoice);
}

export function uniquePaymentStayId(choices: StayChoice[]): string | null {
  return choices.length === 1 ? choices[0].stayId : null;
}

const SUMMARY_TEXT =
  /\b(total amount|grand total|sheet total|monthly total|anas received\s*\|)\b/i;

export function isSpreadsheetSummaryText(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (/^total amount\b/i.test(trimmed)) return true;
  if (/^anas received\s*\|/i.test(trimmed)) return true;
  return SUMMARY_TEXT.test(trimmed);
}

export function isConfirmedExpense(
  item: LedgerState["expenses"][number],
  reviews: LedgerState["reviews"],
): boolean {
  if (isSpreadsheetSummaryText(item.description) || isSpreadsheetSummaryText(item.notes)) {
    return false;
  }
  const review = reviews.find((row) => row.id === item.id);
  if (!review) return true;
  if (review.proposedType === "SUMMARY" || review.proposedType === "TRANSFER") return false;
  if (review.proposedType === "EXPENSE" && review.status !== "CONFIRMED") return false;
  return true;
}

export function isRentPayment(item: LedgerState["payments"][number], reviews: LedgerState["reviews"]): boolean {
  if (isSpreadsheetSummaryText(item.notes)) return false;
  const review = reviews.find((row) => row.id === item.id);
  if (!review) return true;
  return review.proposedType !== "SUMMARY";
}

export type StayPaymentLine = {
  id: string;
  receivedAt: string;
  amount: number;
  method: string;
  receivedBy: string;
};

export type StayLedgerRow = {
  stayId: string;
  clientId: string;
  clientName: string;
  phone: string | null;
  flat: string;
  nights: number;
  checkIn: string;
  checkOut: string;
  business: number;
  received: number;
  pending: number;
  methods: string[];
  receivedBy: string[];
  status: "Pending" | "Settled";
  payments: StayPaymentLine[];
  security: { id: string; amount: number; kind: string; at: string }[];
  discounts: { id: string; amount: number; at: string; note: string | null }[];
  extensionNotes: string[];
};

export type ExpenseLedgerRow = {
  id: string;
  description: string;
  category: string;
  amount: number;
  flat: string | null;
  method: string;
  spentAt: string;
  notes: string | null;
};

export type PaymentLedgerRow = {
  id: string;
  stayId: string | null;
  clientId: string;
  clientName: string;
  phone: string | null;
  flat: string;
  amount: number;
  method: string;
  receivedBy: string;
  receivedAt: string;
  notes: string | null;
};

function toStayLedgerRow(stay: Stay, state: LedgerState, asOf?: Date): StayLedgerRow {
  const payments = state.payments
    .filter(
      (item) =>
        item.stayId === stay.id &&
        isLive(item) &&
        isPlausibleLedgerAmount(item.amount) &&
        isRentPayment(item, state.reviews) &&
        (!asOf || new Date(item.receivedAt) <= asOf),
    )
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const pending = asOf ? stayBalanceAsOf(stay.id, state, asOf) : stayRemaining(stay.id, state);
  const business = asOf
    ? Math.max(
        0,
        state.rentEntries
          .filter((item) => item.stayId === stay.id && isLive(item) && isPlausibleLedgerAmount(item.amount) && new Date(item.occurredAt) <= asOf)
          .reduce((sum, item) => sum + item.amount, 0) -
          state.discounts
            .filter((item) => item.stayId === stay.id && isLive(item) && new Date(item.occurredAt) <= asOf)
            .reduce((sum, item) => sum + item.amount, 0),
      )
    : stayCollectible(stay.id, state);
  const received = asOf
    ? payments.reduce((sum, item) => sum + item.amount, 0)
    : stayPayments(stay.id, state);
  return {
    stayId: stay.id,
    clientId: stay.clientId,
    clientName: state.clients.find((client) => client.id === stay.clientId)?.name ?? "Customer",
    phone: state.clients.find((client) => client.id === stay.clientId)?.phone ?? null,
    flat: flatName(state, stay.flatId),
    nights: stay.nights,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    business,
    received,
    pending,
    methods: [...new Set(payments.map((item) => methodLabel(item.method)))],
    receivedBy: [...new Set(payments.map((item) => receiverName(state, item.receivedById)))],
    status: pending > 0 ? ("Pending" as const) : ("Settled" as const),
    payments: payments.map((item) => ({
      id: item.id,
      receivedAt: item.receivedAt,
      amount: item.amount,
      method: methodLabel(item.method),
      receivedBy: receiverName(state, item.receivedById),
    })),
    security: state.security
      .filter((item) => item.stayId === stay.id && isLive(item))
      .map((item) => ({ id: item.id, amount: item.amount, kind: item.kind, at: item.occurredAt })),
    discounts: state.discounts
      .filter((item) => item.stayId === stay.id && isLive(item))
      .map((item) => ({ id: item.id, amount: item.amount, at: item.occurredAt, note: item.note })),
    extensionNotes: state.rentEntries
      .filter((item) => item.stayId === stay.id && isLive(item) && item.note)
      .map((item) => item.note as string),
  };
}

export function stayLedgerRows(state: LedgerState, range: DateRange, selectedFlat: string, asOf?: Date): StayLedgerRow[] {
  return state.stays
    .filter((stay) => isLive(stay) && matchesFlat(stay.flatId, selectedFlat) && stayTouchesRange(stay, state, range))
    .map((stay) => toStayLedgerRow(stay, state, asOf))
    .sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1));
}

export function expenseLedgerRows(
  state: LedgerState,
  range: DateRange,
  selectedFlat: string,
): ExpenseLedgerRow[] {
  return state.expenses
    .filter(
      (item) =>
        isLive(item) &&
        matchesFlat(item.flatId, selectedFlat) &&
        inRange(item.spentAt, range) &&
        isPlausibleLedgerAmount(item.amount) &&
        isConfirmedExpense(item, state.reviews),
    )
    .sort((a, b) => (a.spentAt < b.spentAt ? 1 : -1))
    .map((item) => ({
      id: item.id,
      description: item.description,
      category: item.category,
      amount: item.amount,
      flat: item.flatId ? flatName(state, item.flatId) : null,
      method: methodLabel(item.method),
      spentAt: item.spentAt,
      notes: item.notes,
    }));
}

export function paymentLedgerRows(
  state: LedgerState,
  range: DateRange,
  selectedFlat: string,
): PaymentLedgerRow[] {
  return state.payments
    .filter(
      (item) =>
        isLive(item) &&
        matchesFlat(item.flatId, selectedFlat) &&
        inRange(item.receivedAt, range) &&
        isPlausibleLedgerAmount(item.amount) &&
        isRentPayment(item, state.reviews),
    )
    .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
    .map((item) => {
      const stay = item.stayId ? state.stays.find((row) => row.id === item.stayId) : null;
      return {
        id: item.id,
        stayId: item.stayId,
        clientId: item.clientId,
        clientName: state.clients.find((client) => client.id === item.clientId)?.name ?? "Customer",
        phone: state.clients.find((client) => client.id === item.clientId)?.phone ?? null,
        flat: stay ? flatName(state, stay.flatId) : item.flatId ? flatName(state, item.flatId) : "—",
        amount: item.amount,
        method: methodLabel(item.method),
        receivedBy: receiverName(state, item.receivedById),
        receivedAt: item.receivedAt,
        notes: item.notes,
      };
    });
}

export function pendingLedgerRows(state: LedgerState, selectedFlat: string, asOf?: Date): StayLedgerRow[] {
  return state.stays
    .filter((stay) => {
      if (!isLive(stay) || !matchesFlat(stay.flatId, selectedFlat)) return false;
      if (asOf) return stayCountsTowardClosingPending(stay, state, asOf);
      return isStayPendingActive(stay, state);
    })
    .map((stay) => toStayLedgerRow(stay, state, asOf))
    .sort((a, b) => b.pending - a.pending);
}

export function dashboardTotals(
  state: LedgerState,
  range: DateRange,
  selectedFlat: string,
  now = new Date(),
): DashboardTotals {
  const period = operationalTotals(state, range, selectedFlat);
  const historical = range.to < startOfToday(now);
  if (historical) {
    return {
      business: period.business,
      received: period.received,
      pending: outstandingAsOf(state, range.to, selectedFlat),
      expenses: period.expenses,
      carriedForward: 0,
    };
  }
  return {
    business: period.business,
    received: period.received,
    pending: period.pending,
    expenses: period.expenses,
    carriedForward: period.carriedForward,
  };
}

export function operationalReconciled(
  state: LedgerState,
  range: DateRange,
  selectedFlat: string,
  totals: DashboardTotals,
  now = new Date(),
): boolean {
  const historical = range.to < startOfToday(now);
  const asOf = historical ? range.to : undefined;
  const payments = paymentLedgerRows(state, range, selectedFlat);
  const expenses = expenseLedgerRows(state, range, selectedFlat);
  const pending = pendingLedgerRows(state, selectedFlat, asOf);
  return (
    totals.business === operationalTotals(state, range, selectedFlat).business &&
    totals.received === payments.reduce((sum, item) => sum + item.amount, 0) &&
    totals.pending === pending.reduce((sum, item) => sum + item.pending, 0) &&
    totals.expenses === expenses.reduce((sum, item) => sum + item.amount, 0)
  );
}

export function totalsMatchStayLedger(
  totals: DashboardTotals,
  stays: StayLedgerRow[],
  expenses: ExpenseLedgerRow[],
): boolean {
  const expenseSum = expenses.reduce((sum, item) => sum + item.amount, 0);
  return totals.expenses === expenseSum && totals.carriedForward >= 0;
}

export function availableForWithdrawal(state: LedgerState): number {
  const received = state.payments
    .filter((item) => isLive(item) && isRentPayment(item, state.reviews))
    .reduce((sum, item) => sum + item.amount, 0);
  const expenses = state.expenses
    .filter((item) => isLive(item) && isConfirmedExpense(item, state.reviews))
    .reduce((sum, item) => sum + item.amount, 0);
  const withdrawals = state.withdrawals.filter(isLive).reduce((sum, item) => sum + item.amount, 0);
  return Math.max(0, received - expenses - withdrawals);
}

export function needsAttention(state: LedgerState, selectedFlat = "all", asOf?: Date): AttentionItem[] {
  return state.stays
    .filter((stay) => {
      if (!isLive(stay) || !matchesFlat(stay.flatId, selectedFlat)) return false;
      if (asOf) return stayBalanceAsOf(stay.id, state, asOf) > 0 && new Date(stay.checkIn) <= asOf;
      return isStayPendingActive(stay, state);
    })
    .map((stay) => {
      const client = state.clients.find((item) => item.id === stay.clientId);
      return {
        stayId: stay.id,
        clientId: stay.clientId,
        clientName: client?.name ?? "Customer",
        phone: client?.phone ?? null,
        remaining: asOf ? stayBalanceAsOf(stay.id, state, asOf) : stayRemaining(stay.id, state),
        flat: flatName(state, stay.flatId),
        checkOut: stay.checkOut,
      };
    })
    .sort((a, b) => b.remaining - a.remaining);
}

export function whatsappLink(phone: string, text: string): string {
  const international = normalizePhone(phone) ?? phone.replace(/\D/g, "");
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}

export function reviewMonth(item: { month?: string | null; date?: string | null; sourceSheet: string }): string {
  if (item.month) return item.month;
  if (item.date) {
    const parsed = new Date(item.date.includes("T") ? item.date : `${item.date}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    }
  }
  return item.sourceSheet;
}

export function currentInterpretation(item: LedgerState["reviews"][number], state: LedgerState): string {
  if (item.currentInterpretation && item.status !== "NEEDS_REVIEW") return item.currentInterpretation;
  if (item.proposedType === "PENDING_BALANCE" && item.stayId) {
    const remaining = stayRemaining(item.stayId, state);
    const stay = state.stays.find((row) => row.id === item.stayId);
    if (remaining <= 0) return "Pending is 0. Reminders off.";
    if (stay?.activePending) return `Still pending ${formatPKR(remaining)}. Reminders on.`;
    return `Open balance ${formatPKR(remaining)}. Reminders off until you confirm still pending.`;
  }
  if (item.proposedType === "EXPENSE") {
    return item.amount
      ? `Possible expense ${formatPKR(item.amount)}. Not counted until confirmed.`
      : "Possible expense. Confirm before counting.";
  }
  if (item.proposedType === "SUMMARY") return "Spreadsheet total — not counted in Business or Expenses.";
  if (item.proposedType === "TRANSFER") return "Money sent/transferred — not rent, not an expense.";
  if (item.proposedType === "STAY") {
    return item.amount
      ? `Stay of ${formatPKR(item.amount)} needs a date or clearer payment.`
      : "Stay is missing a date or payment amount.";
  }
  return item.reason;
}

export type RecentActivityItem = {
  id: string;
  at: string;
  title: string;
  detail: string;
  extra?: string;
  amount: number;
};

export function recentActivity(state: LedgerState, limit = 8): RecentActivityItem[] {
  const rows: RecentActivityItem[] = [
    ...state.rentEntries.map((item) => ({
      id: item.id,
      at: item.occurredAt,
      title: state.clients.find((client) => client.id === item.clientId)?.name ?? "Rent",
      detail: `Rent · Flat ${flatName(state, item.flatId)}`,
      amount: item.amount,
    })),
    ...state.payments.map((item) => {
      const flat = item.flatId ? `Flat ${flatName(state, item.flatId)}` : null;
      const receivedBy = receiverName(state, item.receivedById);
      return {
        id: item.id,
        at: item.receivedAt,
        title: state.clients.find((client) => client.id === item.clientId)?.name ?? "Payment",
        detail: `${formatPKR(item.amount)} received · ${methodLabel(item.method)}`,
        extra: [flat, `Received by ${receivedBy}`].filter(Boolean).join(" · "),
        amount: item.amount,
      };
    }),
    ...state.expenses.map((item) => ({
      id: item.id,
      at: item.spentAt,
      title: item.description,
      detail: item.flatId ? `Expense · Flat ${flatName(state, item.flatId)}` : "Expense",
      amount: item.amount,
    })),
    ...state.withdrawals.map((item) => ({
      id: item.id,
      at: item.occurredAt,
      title: "Anas withdrawal",
      detail: "Internal transfer · not in money summary",
      amount: item.amount,
    })),
    ...state.security.map((item) => ({
      id: item.id,
      at: item.occurredAt,
      title: item.kind === "RECEIVED" ? "Security received" : "Security adjusted",
      detail: state.clients.find((client) => client.id === item.clientId)?.name ?? "Security",
      amount: item.amount,
    })),
    ...state.discounts.map((item) => ({
      id: item.id,
      at: item.occurredAt,
      title: "Discount",
      detail: state.clients.find((client) => client.id === item.clientId)?.name ?? "Discount",
      amount: item.amount,
    })),
  ];

  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export function clientProfile(clientId: string, state: LedgerState) {
  const stays = state.stays.filter((item) => item.clientId === clientId && isLive(item));
  const lastStay = [...stays].sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1))[0];
  return {
    totalStays: stays.length,
    lifetimeBusiness: stays.reduce((sum, stay) => sum + stayCollectible(stay.id, state), 0),
    lifetimeRevenue: stays.reduce((sum, stay) => sum + stayCollectible(stay.id, state), 0),
    totalReceived: state.payments
      .filter((item) => item.clientId === clientId && isLive(item))
      .reduce((sum, item) => sum + item.amount, 0),
    currentlyPending: stays
      .filter((stay) => isStayPendingActive(stay, state))
      .reduce((sum, stay) => sum + stayRemaining(stay.id, state), 0),
    securityHeld: clientSecurityHeld(clientId, state),
    lastFlat: lastStay ? flatName(state, lastStay.flatId) : null,
    lastStay: lastStay?.checkIn ?? null,
    stays,
  };
}
