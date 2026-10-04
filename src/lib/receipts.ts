import { formatKarachiDateLong, inKarachiRange, karachiMonthRange, karachiYmd, karachiYmdKey } from "@/lib/dates";
import { flatName, isRentPayment, receiverName, stayCollectible, stayPayments, stayRemaining } from "@/lib/ledger";
import { formatPKR, methodLabel } from "@/lib/money";
import type { DateRange, LedgerState, Payment, Receipt, ReceiptStatus } from "@/types";

export const RECEIPT_CONFIRMATION =
  "This receipt confirms the payment received against the stay detailed above.";
export const RECEIPT_THANK_YOU =
  "Thank you for staying with us. We look forward to welcoming you again.";
export const LETTERHEAD_SRC = "/letterhead/capital-lagoon-letterhead.jpg";

export type ReceiptView = {
  receipt: Receipt;
  dateLabel: string;
  clientName: string;
  flat: string;
  checkInLabel: string;
  checkOutLabel: string;
  nights: number;
  totalStayAmount: number;
  amountReceived: number;
  totalReceivedToDate: number;
  remaining: number;
  paidInFull: boolean;
  paymentMethod: string;
  receivedBy: string;
  confirmation: string;
  thankYou: string;
};

export type ReceiptSyncOp =
  | { type: "create"; paymentId: string }
  | { type: "update"; receiptId: string; paymentId: string }
  | { type: "void"; receiptId: string; paymentId: string };

export function formatReceiptNumber(ymd: string, seq: number): string {
  return `CLL-${ymd}-${String(Math.max(1, Math.trunc(seq))).padStart(4, "0")}`;
}

export function receiptPdfFileName(receiptNumber: string): string {
  return `Capital-Lagoon-Receipt-${receiptNumber}.pdf`;
}

export function paymentEligibleForReceipt(payment: Payment, state: LedgerState): boolean {
  if (!payment.stayId || !payment.clientId || !payment.flatId) return false;
  if (!isRentPayment(payment, state.reviews)) return false;
  const stay = state.stays.find((item) => item.id === payment.stayId);
  return Boolean(stay);
}

export function receiptForPayment(state: LedgerState, paymentId: string): Receipt | null {
  return (state.receipts ?? []).find((item) => item.paymentId === paymentId) ?? null;
}

export type AddedReceiptInfo = { receiptId?: string | null };

export function newestCreatedReceipt(before: LedgerState, after: LedgerState): Receipt | null {
  const previous = new Set((before.receipts ?? []).map((item) => item.id));
  const created = (after.receipts ?? []).filter((item) => !previous.has(item.id));
  if (created.length === 0) return null;
  const oldPays = new Set(before.payments.map((item) => item.id));
  const newPayIds = after.payments.filter((item) => !oldPays.has(item.id)).map((item) => item.id);
  return created.find((item) => newPayIds.includes(item.paymentId)) ?? created[0] ?? null;
}

function paymentFingerprint(payment: Payment): string {
  return [
    payment.amount,
    payment.method,
    payment.receivedAt,
    payment.receivedById ?? "",
    payment.stayId ?? "",
    payment.clientId,
    payment.flatId ?? "",
    payment.voided ? "1" : "0",
  ].join("|");
}

export function planReceiptSync(
  before: LedgerState,
  after: LedgerState,
  action: { type: string; paymentId?: string },
): ReceiptSyncOp[] {
  const ops: ReceiptSyncOp[] = [];
  const byPayment = new Map((before.receipts ?? []).map((item) => [item.paymentId, item]));
  const beforePays = new Map(before.payments.map((item) => [item.id, item]));

  for (const payment of after.payments) {
    const prev = beforePays.get(payment.id);
    const receipt = byPayment.get(payment.id);
    const stayVoided = Boolean(payment.stayId && after.stays.find((stay) => stay.id === payment.stayId)?.voided);
    const shouldVoid = Boolean(payment.voided || stayVoided);

    if (!prev) {
      if (!shouldVoid && paymentEligibleForReceipt(payment, after) && !receipt) {
        ops.push({ type: "create", paymentId: payment.id });
      }
      continue;
    }

    if (!receipt) continue;

    if (shouldVoid) {
      if (receipt.status !== "VOID") {
        ops.push({ type: "void", receiptId: receipt.id, paymentId: payment.id });
      }
      continue;
    }

    if (receipt.status !== "VOID" && paymentFingerprint(prev) !== paymentFingerprint(payment)) {
      ops.push({ type: "update", receiptId: receipt.id, paymentId: payment.id });
    }
  }

  if (action.type === "GENERATE_RECEIPT") {
    const payment = after.payments.find((item) => item.id === action.paymentId);
    const receipt = payment ? byPayment.get(payment.id) : null;
    if (
      payment &&
      !payment.voided &&
      paymentEligibleForReceipt(payment, after) &&
      !receipt &&
      !ops.some((op) => op.type === "create" && op.paymentId === payment.id)
    ) {
      ops.push({ type: "create", paymentId: payment.id });
    }
  }

  return ops;
}

export function buildReceiptView(state: LedgerState, receipt: Receipt): ReceiptView | null {
  const payment = state.payments.find((item) => item.id === receipt.paymentId);
  const stay = state.stays.find((item) => item.id === receipt.stayId) ?? (payment?.stayId ? state.stays.find((item) => item.id === payment.stayId) : null);
  if (!payment || !stay) return null;
  const client = state.clients.find((item) => item.id === payment.clientId);
  const remaining = stayRemaining(stay.id, state);
  const totalReceived = stayPayments(stay.id, state);
  return {
    receipt,
    dateLabel: formatKarachiDateLong(payment.receivedAt),
    clientName: client?.name ?? "Customer",
    flat: flatName(state, stay.flatId || payment.flatId),
    checkInLabel: formatKarachiDateLong(stay.checkIn),
    checkOutLabel: formatKarachiDateLong(stay.checkOut),
    nights: stay.nights,
    totalStayAmount: stayCollectible(stay.id, state),
    amountReceived: payment.amount,
    totalReceivedToDate: totalReceived,
    remaining,
    paidInFull: remaining === 0,
    paymentMethod: methodLabel(payment.method),
    receivedBy: receiverName(state, payment.receivedById),
    confirmation: RECEIPT_CONFIRMATION,
    thankYou: RECEIPT_THANK_YOU,
  };
}

export function receiptSnapshot(view: ReceiptView): Record<string, unknown> {
  return {
    receiptNumber: view.receipt.receiptNumber,
    status: view.receipt.status,
    version: view.receipt.version,
    dateLabel: view.dateLabel,
    clientName: view.clientName,
    flat: view.flat,
    checkIn: view.checkInLabel,
    checkOut: view.checkOutLabel,
    nights: view.nights,
    totalStayAmount: view.totalStayAmount,
    amountReceived: view.amountReceived,
    totalReceivedToDate: view.totalReceivedToDate,
    remaining: view.remaining,
    paidInFull: view.paidInFull,
    paymentMethod: view.paymentMethod,
    receivedBy: view.receivedBy,
  };
}

export type ReceiptFilterPreset = "month" | "previous" | "custom";

export type ReceiptListFilters = {
  preset: ReceiptFilterPreset;
  custom?: DateRange | null;
  year?: number;
  month?: number;
  flat: string;
  receiver: "all" | "Anas" | "Khizer" | "others";
  query: string;
};

export function receiptsInRange(state: LedgerState, range: DateRange, flat = "all"): Receipt[] {
  return (state.receipts ?? []).filter((item) => {
    if (flat !== "all") {
      const name = flatName(state, item.flatId);
      if (name !== flat) return false;
    }
    return inKarachiRange(item.paymentDate, range);
  });
}

export function countReceiptsGenerated(state: LedgerState, year: number, month: number): number {
  const range = karachiMonthRange(year, month);
  return receiptsInRange(state, range).filter((item) => item.status !== "VOID").length;
}

export function filterReceiptRows(state: LedgerState, filters: ReceiptListFilters): Receipt[] {
  const today = karachiYmd();
  const range =
    filters.year && filters.month
      ? karachiMonthRange(filters.year, filters.month)
      : filters.preset === "previous"
        ? karachiMonthRange(today.month === 1 ? today.year - 1 : today.year, today.month === 1 ? 12 : today.month - 1)
        : filters.preset === "custom" && filters.custom
          ? filters.custom
          : karachiMonthRange(today.year, today.month);

  const query = filters.query.trim().toLowerCase();
  return (state.receipts ?? [])
    .filter((item) => {
      if (!inKarachiRange(item.paymentDate, range)) return false;
      if (filters.flat !== "all" && flatName(state, item.flatId) !== filters.flat) return false;
      const payment = state.payments.find((row) => row.id === item.paymentId);
      const receivedBy = receiverName(state, payment?.receivedById);
      if (filters.receiver === "Anas" && receivedBy !== "Anas") return false;
      if (filters.receiver === "Khizer" && receivedBy !== "Khizer") return false;
      if (filters.receiver === "others" && (receivedBy === "Anas" || receivedBy === "Khizer")) return false;
      if (query) {
        const client = state.clients.find((row) => row.id === item.clientId)?.name ?? "";
        const hay = `${item.receiptNumber} ${client}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.receiptNumber.localeCompare(a.receiptNumber)));
}

export function formatReceiptAmount(amount: number): string {
  return formatPKR(amount);
}

export function receiptSequenceYmd(paymentDate: string): string {
  return karachiYmdKey(paymentDate);
}

export function isValidReceiptStatus(value: string): value is ReceiptStatus {
  return value === "GENERATED" || value === "UPDATED" || value === "VOID";
}
