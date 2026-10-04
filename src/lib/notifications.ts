import {
  dashboardTotals,
  isStayPendingActive,
  stayRemaining,
} from "@/lib/ledger";
import { inRange, rangeForPreset } from "@/lib/dates";
import { formatPKR } from "@/lib/money";
import { buildAnasPendingNotification } from "@/lib/reminders";
import type { AttentionItem, LedgerState } from "@/types";

export const KARACHI = "Asia/Karachi";
export const REMINDER_HOURS = [21, 22, 23, 0, 1, 2, 3, 4, 5];

export function karachiNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: KARACHI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    cycleDate: `${read("year")}-${String(read("month")).padStart(2, "0")}-${String(read("day")).padStart(2, "0")}`,
  };
}

export function reminderWindowOpen(now = new Date()): boolean {
  const { hour } = karachiNow(now);
  return REMINDER_HOURS.includes(hour);
}

export function dueReminders(state: LedgerState, now = new Date()): AttentionItem[] {
  const stamp = karachiNow(now);
  if (!REMINDER_HOURS.includes(stamp.hour)) return [];
  return state.stays
    .filter((stay) => !stay.voided && isStayPendingActive(stay, state))
    .filter((stay) => stayRemaining(stay.id, state) > 0)
    .filter(
      (stay) =>
        !state.reminderSilences.some(
          (item) => item.clientId === stay.clientId && item.cycleDate === stamp.cycleDate,
        ),
    )
    .map((stay) => {
      const client = state.clients.find((item) => item.id === stay.clientId);
      return {
        stayId: stay.id,
        clientId: stay.clientId,
        clientName: client?.name ?? "Customer",
        phone: client?.phone ?? null,
        remaining: stayRemaining(stay.id, state),
        flat: state.flats.find((flat) => flat.id === stay.flatId)?.name ?? "",
        checkOut: stay.checkOut,
      };
    });
}

export function nightSummaryText(state: LedgerState, now = new Date()): string {
  const today = rangeForPreset("today", null, now);
  const totals = dashboardTotals(state, today, "all");
  const pendingAdded = state.stays
    .filter(
      (stay) =>
        isStayPendingActive(stay, state) &&
        state.rentEntries.some((item) => item.stayId === stay.id && inRange(item.occurredAt, today)),
    )
    .reduce((sum, stay) => sum + stayRemaining(stay.id, state), 0);
  const owing = state.stays.filter((stay) => isStayPendingActive(stay, state)).length;
  return [
    `Business Added ${formatPKR(totals.business)}`,
    `Received ${formatPKR(totals.received)}`,
    `Expenses ${formatPKR(totals.expenses)}`,
    `Pending Added ${formatPKR(pendingAdded)}`,
    `${owing} clients still owe`,
  ].join(" · ");
}

export function canUseBrowserNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifyBrowser(title: string, body: string) {
  if (!canUseBrowserNotifications()) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body, tag: body.slice(0, 40), icon: "/icons/icon-192.png" });
}

export function pendingNotice(item: AttentionItem): string {
  return buildAnasPendingNotification({
    clientName: item.clientName,
    pendingAmount: item.remaining,
    flat: item.flat,
  });
}
