import { formatPKR } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";

function reminderAmount(amount: number): string {
  return formatPKR(amount).replace(/\u00a0/g, " ");
}

export function clientFirstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/).find((part) => part.length > 0) ?? "";
  if (!first || /^(undefined|null)$/i.test(first)) return null;
  return first;
}

export function buildClientWhatsAppReminder(opts: {
  clientName?: string | null;
  pendingAmount: number;
}): string | null {
  if (!Number.isFinite(opts.pendingAmount) || opts.pendingAmount <= 0) return null;
  const amount = reminderAmount(opts.pendingAmount);
  const first = clientFirstName(opts.clientName);
  if (!first) {
    return `Salam Bhai ap ke ye ${amount} pending hay please send screenshot once paid thanks`;
  }
  return `Salam ${first} Bhai ap ke ye ${amount} pending hay please send screenshot once paid thanks`;
}

export function buildAnasPendingNotification(opts: {
  clientName?: string | null;
  pendingAmount: number;
  flat?: string | null;
}): string {
  const first = clientFirstName(opts.clientName) ?? "Customer";
  const amount = reminderAmount(opts.pendingAmount);
  const flat = opts.flat?.trim() ? ` — Flat ${opts.flat.trim()}` : "";
  return `Za kana Anas jan, ${first} na ${amount} rawakhla${flat}`;
}

export function whatsappHref(phone: string | null | undefined, text: string | null | undefined): string | null {
  if (!phone || !text) return null;
  const international = normalizePhone(phone);
  if (!international) return null;
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}

export function clientWhatsAppHref(opts: {
  phone?: string | null;
  clientName?: string | null;
  pendingAmount: number;
}): string | null {
  const text = buildClientWhatsAppReminder({
    clientName: opts.clientName,
    pendingAmount: opts.pendingAmount,
  });
  return whatsappHref(opts.phone, text);
}

export function buildReceiptWhatsAppMessage(opts: { clientName?: string | null }): string {
  const first = clientFirstName(opts.clientName);
  if (!first) return "Salam Bhai payment receipt attached thanks";
  return `Salam ${first} Bhai payment receipt attached thanks`;
}

export function receiptWhatsAppHref(opts: { phone?: string | null; clientName?: string | null }): string | null {
  return whatsappHref(opts.phone, buildReceiptWhatsAppMessage({ clientName: opts.clientName }));
}
