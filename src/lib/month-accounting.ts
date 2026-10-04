import { differenceInCalendarDays, startOfDay } from "date-fns";
import {
  karachiMonthRange,
  karachiYmd,
  previousKarachiMonth,
  isCompletedKarachiMonth,
  formatMonthLabel,
} from "@/lib/dates";
import {
  flatName,
  isLive,
  isStayPendingActive,
  receiverName,
  stayRemaining,
} from "@/lib/ledger";
import { isPlausibleLedgerAmount, methodLabel } from "@/lib/money";
import type { DateRange, LedgerState, MonthlyReportRecord, Stay } from "@/types";

const SUMMARY_TEXT =
  /\b(total amount|grand total|sheet total|monthly total|anas received\s*\|)\b/i;

function isSpreadsheetSummaryText(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (/^total amount\b/i.test(trimmed)) return true;
  if (/^anas received\s*\|/i.test(trimmed)) return true;
  return SUMMARY_TEXT.test(trimmed);
}

function isConfirmedExpense(item: LedgerState["expenses"][number], reviews: LedgerState["reviews"]): boolean {
  if (isSpreadsheetSummaryText(item.description) || isSpreadsheetSummaryText(item.notes)) return false;
  const review = reviews.find((row) => row.id === item.id);
  if (!review) return true;
  if (review.proposedType === "SUMMARY" || review.proposedType === "TRANSFER") return false;
  if (review.proposedType === "EXPENSE" && review.status !== "CONFIRMED") return false;
  return true;
}

function isRentPayment(item: LedgerState["payments"][number], reviews: LedgerState["reviews"]): boolean {
  if (isSpreadsheetSummaryText(item.notes)) return false;
  const review = reviews.find((row) => row.id === item.id);
  if (!review) return true;
  return review.proposedType !== "SUMMARY";
}

function matchesFlat(flatId: string | null | undefined, selected: string): boolean {
  if (selected === "all") return true;
  return flatId === `flat_${selected}` || flatId === selected;
}

function inRange(isoDate: string, range: DateRange): boolean {
  const date = new Date(isoDate);
  return date >= range.from && date <= range.to;
}

function atOrBefore(isoDate: string, asOf: Date): boolean {
  return new Date(isoDate) <= asOf;
}

export function stayOriginAt(stay: Stay, state: LedgerState): string {
  const firstRent = state.rentEntries
    .filter((item) => item.stayId === stay.id && isLive(item))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))[0];
  return firstRent?.occurredAt ?? stay.checkIn;
}

export function stayBalanceAsOf(stayId: string, state: LedgerState, asOf: Date): number {
  const revenue = state.rentEntries
    .filter(
      (item) =>
        item.stayId === stayId &&
        isLive(item) &&
        isPlausibleLedgerAmount(item.amount) &&
        atOrBefore(item.occurredAt, asOf),
    )
    .reduce((sum, item) => sum + item.amount, 0);
  const discounts = state.discounts
    .filter((item) => item.stayId === stayId && isLive(item) && atOrBefore(item.occurredAt, asOf))
    .reduce((sum, item) => sum + item.amount, 0);
  const payments = state.payments
    .filter(
      (item) =>
        item.stayId === stayId &&
        isLive(item) &&
        isPlausibleLedgerAmount(item.amount) &&
        isRentPayment(item, state.reviews) &&
        atOrBefore(item.receivedAt, asOf),
    )
    .reduce((sum, item) => sum + item.amount, 0);
  const security = state.security
    .filter(
      (item) =>
        item.stayId === stayId &&
        isLive(item) &&
        item.kind === "ADJUSTED_TO_RENT" &&
        atOrBefore(item.occurredAt, asOf),
    )
    .reduce((sum, item) => sum + item.amount, 0);
  return Math.max(0, revenue - discounts - payments - security);
}

export function periodBusiness(state: LedgerState, range: DateRange, selectedFlat = "all"): number {
  const rent = state.rentEntries
    .filter(
      (item) =>
        isLive(item) &&
        matchesFlat(item.flatId, selectedFlat) &&
        inRange(item.occurredAt, range) &&
        isPlausibleLedgerAmount(item.amount),
    )
    .reduce((sum, item) => sum + item.amount, 0);
  const discounts = state.discounts
    .filter((item) => isLive(item) && matchesFlat(item.flatId, selectedFlat) && inRange(item.occurredAt, range))
    .reduce((sum, item) => sum + item.amount, 0);
  return Math.max(0, rent - discounts);
}

export function periodReceived(state: LedgerState, range: DateRange, selectedFlat = "all"): number {
  return state.payments
    .filter(
      (item) =>
        isLive(item) &&
        matchesFlat(item.flatId, selectedFlat) &&
        inRange(item.receivedAt, range) &&
        isPlausibleLedgerAmount(item.amount) &&
        isRentPayment(item, state.reviews),
    )
    .reduce((sum, item) => sum + item.amount, 0);
}

export function periodExpenses(state: LedgerState, range: DateRange, selectedFlat = "all"): number {
  return state.expenses
    .filter(
      (item) =>
        isLive(item) &&
        matchesFlat(item.flatId, selectedFlat) &&
        inRange(item.spentAt, range) &&
        isPlausibleLedgerAmount(item.amount) &&
        isConfirmedExpense(item, state.reviews),
    )
    .reduce((sum, item) => sum + item.amount, 0);
}

export function currentOutstanding(state: LedgerState, selectedFlat = "all"): number {
  return state.stays
    .filter((stay) => isLive(stay) && matchesFlat(stay.flatId, selectedFlat) && isStayPendingActive(stay, state))
    .reduce((sum, stay) => sum + stayRemaining(stay.id, state), 0);
}

export function carriedForwardPending(state: LedgerState, range: DateRange, selectedFlat = "all"): number {
  return state.stays
    .filter((stay) => isLive(stay) && matchesFlat(stay.flatId, selectedFlat) && isStayPendingActive(stay, state))
    .filter((stay) => new Date(stayOriginAt(stay, state)) < range.from)
    .reduce((sum, stay) => sum + stayRemaining(stay.id, state), 0);
}

export function stayCountsTowardClosingPending(stay: Stay, state: LedgerState, asOf: Date): boolean {
  if (!isLive(stay) || new Date(stay.checkIn) > asOf) return false;
  if (stayBalanceAsOf(stay.id, state, asOf) <= 0) return false;
  if (isStayPendingActive(stay, state)) return true;
  // Fully collected later: still count the balance that existed at asOf.
  return stayRemaining(stay.id, state) === 0;
}

export function outstandingAsOf(state: LedgerState, asOf: Date, selectedFlat = "all"): number {
  return state.stays
    .filter((stay) => matchesFlat(stay.flatId, selectedFlat) && stayCountsTowardClosingPending(stay, state, asOf))
    .reduce((sum, stay) => sum + stayBalanceAsOf(stay.id, state, asOf), 0);
}

export function occupiedNightsInRange(checkIn: string, checkOut: string, range: DateRange): number {
  const start = startOfDay(new Date(checkIn));
  const end = startOfDay(new Date(checkOut));
  const from = startOfDay(range.from);
  const to = startOfDay(new Date(range.to.getTime() + 1));
  const overlapStart = start > from ? start : from;
  const overlapEnd = end < to ? end : to;
  return Math.max(0, differenceInCalendarDays(overlapEnd, overlapStart));
}

export type PeriodTotals = {
  business: number;
  received: number;
  expenses: number;
  pending: number;
  carriedForward: number;
  newPending: number;
};

export function periodTotals(state: LedgerState, range: DateRange, selectedFlat = "all"): PeriodTotals {
  const pending = currentOutstanding(state, selectedFlat);
  const carriedForward = carriedForwardPending(state, range, selectedFlat);
  return {
    business: periodBusiness(state, range, selectedFlat),
    received: periodReceived(state, range, selectedFlat),
    expenses: periodExpenses(state, range, selectedFlat),
    pending,
    carriedForward,
    newPending: Math.max(0, pending - carriedForward),
  };
}

export function monthHasActivity(state: LedgerState, year: number, month: number): boolean {
  const range = karachiMonthRange(year, month);
  const hits = (iso: string) => inRange(iso, range);
  if (state.rentEntries.some((item) => isLive(item) && hits(item.occurredAt))) return true;
  if (state.payments.some((item) => isLive(item) && hits(item.receivedAt))) return true;
  if (state.expenses.some((item) => isLive(item) && hits(item.spentAt))) return true;
  if (state.stays.some((stay) => isLive(stay) && (hits(stay.checkIn) || hits(stay.checkOut)))) return true;
  return false;
}

export type ReceiverMonthRow = { name: string; amount: number };

export function monthReceiverBreakdown(state: LedgerState, range: DateRange, selectedFlat = "all"): ReceiverMonthRow[] {
  const counts = new Map<string, number>();
  for (const payment of state.payments) {
    if (!isLive(payment) || !matchesFlat(payment.flatId, selectedFlat)) continue;
    if (!inRange(payment.receivedAt, range) || !isPlausibleLedgerAmount(payment.amount)) continue;
    if (!isRentPayment(payment, state.reviews)) continue;
    const name = receiverName(state, payment.receivedById);
    counts.set(name, (counts.get(name) ?? 0) + payment.amount);
  }
  return [...counts.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

export type FlatMonthRow = {
  name: string;
  business: number;
  received: number;
  pending: number;
  expenses: number;
  stays: number;
  occupiedNights: number;
};

export function monthFlatPerformance(
  state: LedgerState,
  range: DateRange,
  asOf: Date,
  selectedFlat = "all",
): FlatMonthRow[] {
  return state.flats
    .filter((flat) => selectedFlat === "all" || flat.name === selectedFlat)
    .map((flat) => {
      const stays = state.stays.filter(
        (stay) =>
          isLive(stay) &&
          stay.flatId === flat.id &&
          (inRange(stay.checkIn, range) ||
            inRange(stay.checkOut, range) ||
            state.rentEntries.some((item) => item.stayId === stay.id && isLive(item) && inRange(item.occurredAt, range))),
      );
      return {
        name: flat.name,
        business: periodBusiness(state, range, flat.name),
        received: periodReceived(state, range, flat.name),
        pending: outstandingAsOf(state, asOf, flat.name),
        expenses: periodExpenses(state, range, flat.name),
        stays: stays.length,
        occupiedNights: stays.reduce((sum, stay) => sum + occupiedNightsInRange(stay.checkIn, stay.checkOut, range), 0),
      };
    });
}

export type MonthStayLine = {
  stayId: string;
  clientName: string;
  phone: string | null;
  flat: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  business: number;
  received: number;
  closingPending: number;
};

export function monthStayBreakdown(state: LedgerState, range: DateRange, asOf: Date, selectedFlat = "all"): MonthStayLine[] {
  return state.stays
    .filter((stay) => isLive(stay) && matchesFlat(stay.flatId, selectedFlat))
    .filter((stay) => {
      if (inRange(stay.checkIn, range) || inRange(stay.checkOut, range)) return true;
      return state.rentEntries.some((item) => item.stayId === stay.id && isLive(item) && inRange(item.occurredAt, range));
    })
    .map((stay) => {
      const client = state.clients.find((item) => item.id === stay.clientId);
      const business = state.rentEntries
        .filter(
          (item) =>
            item.stayId === stay.id &&
            isLive(item) &&
            inRange(item.occurredAt, range) &&
            isPlausibleLedgerAmount(item.amount),
        )
        .reduce((sum, item) => sum + item.amount, 0);
      const discounts = state.discounts
        .filter((item) => item.stayId === stay.id && isLive(item) && inRange(item.occurredAt, range))
        .reduce((sum, item) => sum + item.amount, 0);
      const received = state.payments
        .filter(
          (item) =>
            item.stayId === stay.id &&
            isLive(item) &&
            inRange(item.receivedAt, range) &&
            isPlausibleLedgerAmount(item.amount) &&
            isRentPayment(item, state.reviews),
        )
        .reduce((sum, item) => sum + item.amount, 0);
      return {
        stayId: stay.id,
        clientName: client?.name ?? "Customer",
        phone: client?.phone ?? null,
        flat: flatName(state, stay.flatId),
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        nights: stay.nights,
        business: Math.max(0, business - discounts),
        received,
        closingPending: stayBalanceAsOf(stay.id, state, asOf),
      };
    })
    .sort((a, b) => (a.checkIn < b.checkIn ? 1 : -1));
}

export type MonthPaymentLine = {
  id: string;
  clientName: string;
  amount: number;
  method: string;
  receivedBy: string;
  receivedAt: string;
  flat: string;
};

export function monthPaymentBreakdown(state: LedgerState, range: DateRange, selectedFlat = "all"): MonthPaymentLine[] {
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
    .map((item) => ({
      id: item.id,
      clientName: state.clients.find((client) => client.id === item.clientId)?.name ?? "Customer",
      amount: item.amount,
      method: methodLabel(item.method),
      receivedBy: receiverName(state, item.receivedById),
      receivedAt: item.receivedAt,
      flat: item.flatId ? flatName(state, item.flatId) : "—",
    }));
}

export type MonthExpenseLine = {
  id: string;
  description: string;
  amount: number;
  flat: string | null;
  method: string;
  spentAt: string;
};

export function monthExpenseBreakdown(state: LedgerState, range: DateRange, selectedFlat = "all"): MonthExpenseLine[] {
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
      amount: item.amount,
      flat: item.flatId ? flatName(state, item.flatId) : null,
      method: methodLabel(item.method),
      spentAt: item.spentAt,
    }));
}

export type MonthReportComputed = {
  year: number;
  month: number;
  label: string;
  range: DateRange;
  asOf: Date;
  complete: boolean;
  business: number;
  received: number;
  expenses: number;
  endingPending: number;
  carriedForward: number;
  newPendingGenerated: number;
  pendingCollected: number;
  closingOutstanding: number;
  totalStays: number;
  totalNights: number;
  totalClients: number;
  averageStayLength: number;
  receivers: ReceiverMonthRow[];
  flats: FlatMonthRow[];
  stays: MonthStayLine[];
  payments: MonthPaymentLine[];
  expensesList: MonthExpenseLine[];
  reconciled: boolean;
  issues: string[];
};

export function buildMonthReport(
  state: LedgerState,
  year: number,
  month: number,
  now = new Date(),
): MonthReportComputed {
  const range = karachiMonthRange(year, month);
  const asOf = range.to;
  const complete = isCompletedKarachiMonth(year, month, now);
  const business = periodBusiness(state, range);
  const received = periodReceived(state, range);
  const expenses = periodExpenses(state, range);
  const stays = monthStayBreakdown(state, range, asOf);
  const payments = monthPaymentBreakdown(state, range);
  const expensesList = monthExpenseBreakdown(state, range);
  const receivers = monthReceiverBreakdown(state, range);
  const flats = monthFlatPerformance(state, range, asOf);
  const prev = previousKarachiMonth(year, month);
  const prevEnd = karachiMonthRange(prev.year, prev.month).to;
  const carriedForward = outstandingAsOf(state, prevEnd);
  const closingOutstanding = outstandingAsOf(state, asOf);
  const pendingCollected = pendingCollectedFromRange(state, range);
  const newPendingGenerated = state.stays
    .filter((stay) => isLive(stay) && inRange(stayOriginAt(stay, state), range))
    .reduce((sum, stay) => sum + stayBalanceAsOf(stay.id, state, asOf), 0);
  const totalStays = stays.length;
  const totalNights = stays.reduce((sum, stay) => sum + occupiedNightsInRange(stay.checkIn, stay.checkOut, range), 0);
  const totalClients = new Set(
    stays
      .map((stay) => state.stays.find((row) => row.id === stay.stayId)?.clientId)
      .filter((id): id is string => Boolean(id)),
  ).size;
  const receiverSum = receivers.reduce((sum, item) => sum + item.amount, 0);
  const paymentSum = payments.reduce((sum, item) => sum + item.amount, 0);
  const expenseSum = expensesList.reduce((sum, item) => sum + item.amount, 0);
  const stayBusiness = stays.reduce((sum, item) => sum + item.business, 0);
  const issues: string[] = [];
  if (paymentSum !== received) issues.push("Received does not match payment rows.");
  if (receiverSum !== received) issues.push("Received-by totals do not match Received.");
  if (expenseSum !== expenses) issues.push("Expenses do not match expense rows.");
  if (stayBusiness !== business) issues.push("Business does not match stay rent in this month.");
  return {
    year,
    month,
    label: formatMonthLabel(year, month),
    range,
    asOf,
    complete,
    business,
    received,
    expenses,
    endingPending: closingOutstanding,
    carriedForward,
    newPendingGenerated,
    pendingCollected,
    closingOutstanding,
    totalStays,
    totalNights,
    totalClients,
    averageStayLength: totalStays === 0 ? 0 : Math.round((totalNights / totalStays) * 10) / 10,
    receivers,
    flats,
    stays,
    payments,
    expensesList,
    reconciled: issues.length === 0,
    issues,
  };
}

export function earliestActivityYmd(state: LedgerState): { year: number; month: number } | null {
  const stamps = [
    ...state.rentEntries.filter(isLive).map((item) => item.occurredAt),
    ...state.payments.filter(isLive).map((item) => item.receivedAt),
    ...state.expenses.filter(isLive).map((item) => item.spentAt),
    ...state.stays.filter(isLive).map((item) => item.checkIn),
  ];
  if (stamps.length === 0) return null;
  const earliest = stamps.reduce((min, item) => (item < min ? item : min));
  const ymd = karachiYmd(new Date(earliest));
  return { year: ymd.year, month: ymd.month };
}

export function completedMonthsThrough(now = new Date(), from?: { year: number; month: number } | null): { year: number; month: number }[] {
  if (!from) return [];
  const today = karachiYmd(now);
  const last = previousKarachiMonth(today.year, today.month);
  const months: { year: number; month: number }[] = [];
  let year = from.year;
  let month = from.month;
  while (year < last.year || (year === last.year && month <= last.month)) {
    months.push({ year, month });
    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    year = next.year;
    month = next.month;
    if (months.length > 240) break;
  }
  return months;
}

export function monthReportId(year: number, month: number): string {
  return `mr_${year}_${pad2(month)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function totalsFingerprint(report: Pick<
  MonthReportComputed,
  | "business"
  | "received"
  | "expenses"
  | "closingOutstanding"
  | "carriedForward"
  | "newPendingGenerated"
  | "pendingCollected"
  | "totalStays"
  | "totalNights"
  | "totalClients"
>): string {
  return [
    report.business,
    report.received,
    report.expenses,
    report.closingOutstanding,
    report.carriedForward,
    report.newPendingGenerated,
    report.pendingCollected,
    report.totalStays,
    report.totalNights,
    report.totalClients,
  ].join("|");
}

export function recordFingerprint(record: MonthlyReportRecord): string {
  return [
    record.businessTotal,
    record.receivedTotal,
    record.expensesTotal,
    record.closingOutstanding,
    record.carriedForwardPending,
    record.newPendingGenerated,
    record.pendingCollected,
    record.totalStays,
    record.totalNights,
    record.totalClients,
  ].join("|");
}

export function toMonthlyReportRecord(computed: MonthReportComputed, existing?: MonthlyReportRecord | null, now = new Date()): MonthlyReportRecord {
  const changed = existing ? recordFingerprint(existing) !== totalsFingerprint(computed) : false;
  const createdAt = existing?.createdAt ?? now.toISOString();
  const status = !existing ? "FINAL" : changed ? "UPDATED" : existing.status === "LIVE" ? "FINAL" : existing.status;
  return {
    id: existing?.id ?? monthReportId(computed.year, computed.month),
    year: computed.year,
    month: computed.month,
    periodStart: computed.range.from.toISOString(),
    periodEnd: computed.range.to.toISOString(),
    businessTotal: computed.business,
    receivedTotal: computed.received,
    expensesTotal: computed.expenses,
    endingPendingTotal: computed.endingPending,
    carriedForwardPending: computed.carriedForward,
    newPendingGenerated: computed.newPendingGenerated,
    pendingCollected: computed.pendingCollected,
    closingOutstanding: computed.closingOutstanding,
    totalStays: computed.totalStays,
    totalNights: computed.totalNights,
    totalClients: computed.totalClients,
    status,
    version: existing ? existing.version + (changed ? 1 : 0) : 1,
    createdAt,
    updatedAt: changed || !existing ? now.toISOString() : existing.updatedAt,
    finalizedAt: existing?.finalizedAt ?? now.toISOString(),
  };
}

export function pendingCollectedFromRange(state: LedgerState, range: DateRange): number {
  return state.payments
    .filter(
      (item) =>
        isLive(item) &&
        inRange(item.receivedAt, range) &&
        isPlausibleLedgerAmount(item.amount) &&
        isRentPayment(item, state.reviews) &&
        item.stayId != null,
    )
    .filter((item) => {
      const stay = state.stays.find((row) => row.id === item.stayId);
      if (!stay) return false;
      return new Date(stayOriginAt(stay, state)) < range.from;
    })
    .reduce((sum, item) => sum + item.amount, 0);
}

export function buildMonthCsv(report: MonthReportComputed): string {
  const lines = [
    `KHIZER LEDGER,${report.label}`,
    "",
    "Summary",
    "Metric,Amount",
    `Business,${report.business}`,
    `Received,${report.received}`,
    `Expenses,${report.expenses}`,
    `Closing outstanding,${report.closingOutstanding}`,
    `Carried forward,${report.carriedForward}`,
    `New pending generated,${report.newPendingGenerated}`,
    `Pending collected,${report.pendingCollected}`,
    `Total stays,${report.totalStays}`,
    `Occupied nights,${report.totalNights}`,
    "",
    "Stays",
    "Guest,Flat,Check-in,Check-out,Nights,Business,Received,Closing pending",
    ...report.stays.map(
      (stay) =>
        `${csv(stay.clientName)},${csv(stay.flat)},${stay.checkIn.slice(0, 10)},${stay.checkOut.slice(0, 10)},${stay.nights},${stay.business},${stay.received},${stay.closingPending}`,
    ),
    "",
    "Payments",
    "Guest,Flat,Amount,Method,Received by,Date",
    ...report.payments.map(
      (item) =>
        `${csv(item.clientName)},${csv(item.flat)},${item.amount},${csv(item.method)},${csv(item.receivedBy)},${item.receivedAt.slice(0, 10)}`,
    ),
    "",
    "Expenses",
    "Description,Flat,Amount,Method,Date",
    ...report.expensesList.map(
      (item) => `${csv(item.description)},${csv(item.flat ?? "")},${item.amount},${csv(item.method)},${item.spentAt.slice(0, 10)}`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function listReportMonths(state: LedgerState, now = new Date()): { year: number; month: number; live: boolean }[] {
  const today = karachiYmd(now);
  const from = earliestActivityYmd(state) ?? { year: today.year, month: today.month };
  const completed = completedMonthsThrough(now, from);
  const hasCurrent =
    state.stays.length + state.payments.length + state.expenses.length + state.rentEntries.length > 0;
  const months = completed.map((item) => ({ ...item, live: false }));
  if (hasCurrent) {
    const already = months.some((item) => item.year === today.year && item.month === today.month);
    if (!already) months.push({ year: today.year, month: today.month, live: true });
  }
  return months.sort((a, b) => b.year - a.year || b.month - a.month);
}

/** Home / operational totals: period activity + CURRENT outstanding. */
export function operationalTotals(state: LedgerState, range: DateRange, selectedFlat = "all") {
  return periodTotals(state, range, selectedFlat);
}

export function stayBelongsToPeriod(stay: Stay, state: LedgerState, range: DateRange): boolean {
  if (inRange(stay.checkIn, range) || inRange(stay.checkOut, range)) return true;
  return state.rentEntries.some((item) => item.stayId === stay.id && isLive(item) && inRange(item.occurredAt, range));
}
