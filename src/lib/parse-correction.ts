import { parseAmountToken } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import { detectFlat, normalizeFlatName } from "@/lib/parse-quick-entry";
import { canonicalReceiverName, detectReceiverName, DEFAULT_RECEIVER_NAME } from "@/lib/receivers";
import type { ExpenseCategory, PaymentMethod } from "@/types";

export type CorrectionKind =
  | "void_payment"
  | "mark_received"
  | "set_pending"
  | "change_method"
  | "change_receiver"
  | "change_nights"
  | "change_business"
  | "change_expense_amount"
  | "change_expense_flat"
  | "change_client"
  | "void_entry";

export type CorrectionDraft = {
  type: "correction";
  kind: CorrectionKind;
  raw: string;
  clientName: string | null;
  phone: string | null;
  flat: string | null;
  amount: number | null;
  newAmount: number | null;
  nights: number | null;
  newNights: number | null;
  method: PaymentMethod | null;
  newMethod: PaymentMethod | null;
  receivedByName: string | null;
  newReceivedByName: string | null;
  newFlat: string | null;
  newClientName: string | null;
  description: string | null;
  category: ExpenseCategory | null;
  targetId?: string | null;
  targetKind?: "payment" | "stay" | "expense" | "security" | "client";
  newClientId?: string | null;
};

const METHOD_PATTERNS: { pattern: RegExp; method: PaymentMethod }[] = [
  { pattern: /easy\s*paisa|easypisa/i, method: "EASYPAISA" },
  { pattern: /jazz\s*cash/i, method: "JAZZCASH" },
  { pattern: /bank\s*transfer|\bbank\b|alfalah/i, method: "BANK_TRANSFER" },
  { pattern: /\bcash\b/i, method: "CASH" },
];

const NAME_STOP = new Set([
  "received", "receive", "wasol", "wasool", "pending", "baki", "baqi", "galat", "wrong",
  "nahi", "nai", "tha", "thi", "hai", "actually", "change", "fix", "correct", "void",
  "delete", "karo", "wala", "ye", "entry", "payment", "rent", "cash", "easypaisa",
  "jazzcash", "bank", "anas", "khizer", "khizar", "khizr", "flat", "night", "nights",
  "din", "day", "days", "ka", "ki", "ke", "ne", "se", "mein", "mai", "full", "paid",
  "amount", "bill", "expense", "electric", "sofa", "cleaning", "clean", "ho", "gaya",
  "lia", "liya", "by", "and", "for", "from", "to", "with", "the", "this", "that",
]);

function detectMethods(text: string): PaymentMethod[] {
  return METHOD_PATTERNS.filter((item) => item.pattern.test(text)).map((item) => item.method);
}

function detectPhone(text: string): string | null {
  const match = text.match(/\b(?:\+?92|0)?3\d{9}\b/);
  return match ? normalizePhone(match[0]) : null;
}

function detectFlats(text: string): string[] {
  const found: string[] = [];
  const labeled = [...text.matchAll(/\bflat\s+([A-Za-z0-9-]+)/gi)];
  for (const match of labeled) {
    if (match[1]) found.push(normalizeFlatName(match[1]));
  }
  const loose = [...text.matchAll(/\b(\d{3})\s*-?\s*([A-Za-z])\b/g)];
  for (const match of loose) {
    found.push(normalizeFlatName(`${match[1]}${match[2]}`));
  }
  return [...new Set(found)];
}

function stripPhones(text: string): string {
  return text.replace(/\b(?:\+?92|0)?3\d{9}\b/g, " ");
}

function amountList(text: string, flats: string[]): number[] {
  const tokens =
    stripPhones(text).match(/(?:rs\.?\s*)?(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:k|lac|lakh)?(?![A-Za-z0-9])/gi) ?? [];
  const skip = new Set(
    flats
      .map((flat) => Number(flat.replace(/-[A-Z]$/i, "")))
      .concat(
        [...text.matchAll(/\b(\d+)\s*(?:days?|din|nights?|night|raat)\b/gi)].map((match) => Number(match[1])),
      )
      .filter((value) => value > 0),
  );
  return tokens
    .map((token) => parseAmountToken(token.replace(/^rs\.?\s*/i, "")))
    .filter((value): value is number => value !== null && value > 0 && !skip.has(value));
}

function nightsList(text: string): number[] {
  return [...text.matchAll(/\b(\d+)\s*(?:days?|din|nights?|night|raat)\b/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => value > 0);
}

function detectName(text: string, known: { name: string }[]): string | null {
  const ranked = [...known].sort((a, b) => b.name.length - a.name.length);
  for (const client of ranked) {
    const escaped = client.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) return client.name;
  }
  const tokens = text
    .replace(/\b(?:\+?92|0)?3\d{9}\b/g, " ")
    .replace(/\b\d{3}\s*-?\s*[A-Za-z]\b/gi, " ")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 3 && !NAME_STOP.has(word));
  for (const client of ranked) {
    const first = client.name.split(/\s+/)[0]?.toLowerCase();
    if (first && tokens.includes(first)) {
      const same = ranked.filter((item) => item.name.split(/\s+/)[0]?.toLowerCase() === first);
      if (same.length === 1) return client.name;
    }
  }
  if (tokens[0]) {
    return tokens.slice(0, 2).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
  }
  return null;
}

function namesAroundNahi(text: string): { from: string | null; to: string | null } {
  const match = text.match(
    /\b([A-Za-z]{3,})\s+(?:ka\s+|ki\s+)?(?:nahi|nai)\s+([A-Za-z]{3,})\s*(?:ka|ki|ne|tha|thi)?/i,
  );
  if (!match) return { from: null, to: null };
  const from = match[1];
  const to = match[2];
  if (!from || !to) return { from: null, to: null };
  if (NAME_STOP.has(from.toLowerCase()) || NAME_STOP.has(to.toLowerCase())) {
    return { from: null, to: null };
  }
  if (/anas|khiz/i.test(from) || /anas|khiz/i.test(to)) return { from: null, to: null };
  return {
    from: from[0].toUpperCase() + from.slice(1).toLowerCase(),
    to: to[0].toUpperCase() + to.slice(1).toLowerCase(),
  };
}

function receiversAroundNahi(text: string): { from: string | null; to: string | null } {
  const names: string[] = [];
  if (/\banas\b/i.test(text)) names.push("Anas");
  if (/\bkhiz[ae]?r\b/i.test(text)) names.push("Khizer");
  if (names.length >= 2 && /\b(nahi|nai)\b/i.test(text)) {
    const anasFirst = text.toLowerCase().indexOf("anas") < text.toLowerCase().search(/khiz[ae]?r/);
    return anasFirst ? { from: "Anas", to: "Khizer" } : { from: "Khizer", to: "Anas" };
  }
  if (names.length === 1 && /\b(nahi|nai)\b/i.test(text)) {
    const other = names[0] === "Anas" ? "Khizer" : "Anas";
    if (/\b(nahi|nai)\s+(?:anas|khiz)/i.test(text)) return { from: names[0], to: other };
    return { from: other, to: names[0] };
  }
  return { from: null, to: null };
}

function expenseHint(text: string): { label: string; category: ExpenseCategory } | null {
  if (/sofa/i.test(text)) return { label: "Sofa cleaning", category: "CLEANING" };
  if (/clean|safai/i.test(text)) return { label: "Cleaning", category: "CLEANING" };
  if (/electric/i.test(text)) return { label: "Electricity", category: "ELECTRICITY" };
  if (/\bgas\b/i.test(text)) return { label: "Gas", category: "GAS" };
  if (/plumb/i.test(text)) return { label: "Plumbing", category: "PLUMBING" };
  if (/internet|ptcl/i.test(text)) return { label: "Internet", category: "INTERNET" };
  if (/bill|expense|kharcha/i.test(text) && !/\b(rent|received|wasol|payment)\b/i.test(text)) {
    return { label: "Expense", category: "OTHER" };
  }
  return null;
}

export function looksLikeCorrection(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  if (/\b(galat|wrong|actually|change|fix|correct|void|delete)\b/i.test(value)) return true;
  if (/\b(nahi|nai)\b/i.test(value)) return true;
  if (/\b(full\s+)?paid\s+(nahi|nai)\b/i.test(value)) return true;
  if (/\b(received|wasol|wasool|paid).{0,40}\b(pending|baki|baqi)\b/i.test(value) && /\b(galat|wrong|wala|hai)\b/i.test(value)) {
    return true;
  }
  if (/\b(pending|baki|baqi).{0,24}\b(nahi|nai).{0,24}\b(received|wasol|wasool|paid)\b/i.test(value)) {
    return true;
  }
  return false;
}

function base(raw: string, known: { name: string }[]): Omit<CorrectionDraft, "kind"> & { kind?: CorrectionKind } {
  const flats = detectFlats(raw);
  const money = amountList(raw, flats);
  const nights = nightsList(raw);
  const methods = detectMethods(raw);
  const receivers = receiversAroundNahi(raw);
  const clients = namesAroundNahi(raw);
  const expense = expenseHint(raw);
  return {
    type: "correction",
    raw,
    clientName: detectName(raw, known),
    phone: detectPhone(raw),
    flat: flats[0] ?? detectFlat(raw),
    amount: money[0] ?? null,
    newAmount: money[1] ?? null,
    nights: nights[0] ?? null,
    newNights: nights[1] ?? null,
    method: methods[0] ?? null,
    newMethod: methods[1] ?? null,
    receivedByName: receivers.from,
    newReceivedByName: receivers.to,
    newFlat: flats[1] ?? null,
    newClientName: clients.to,
    description: expense?.label ?? null,
    category: expense?.category ?? null,
  };
}

export function parseCorrection(
  raw: string,
  ctx: { knownClients?: { name: string; phone: string | null }[] } = {},
): CorrectionDraft | { type: "ambiguous"; reason: string } {
  const text = raw.trim().replace(/\s+/g, " ");
  const known = ctx.knownClients ?? [];
  const draft = base(text, known);
  const expense = expenseHint(text);
  const flats = detectFlats(text);
  const money = amountList(text, flats);
  const nights = nightsList(text);
  const methods = detectMethods(text);

  if (/\b(delete|void)\b/i.test(text) && /\b(entry|ye|this|galat)\b/i.test(text)) {
    return { ...draft, kind: "void_entry" };
  }

  if (expense && flats.length >= 2) {
    return { ...draft, kind: "change_expense_flat", flat: flats[0], newFlat: flats[1], description: expense.label, category: expense.category };
  }

  if (expense && money.length >= 2) {
    return {
      ...draft,
      kind: "change_expense_amount",
      amount: money[0],
      newAmount: money[1],
      description: expense.label,
      category: expense.category,
    };
  }

  if (expense && /\bgalat\b/i.test(text) && money.length === 1 && draft.newAmount == null) {
    return { ...draft, kind: "change_expense_amount", description: expense.label, category: expense.category };
  }

  if (draft.newClientName && /\b(payment|rent|stay|ka nahi|ki nahi)\b/i.test(text)) {
    return { ...draft, kind: "change_client", clientName: namesAroundNahi(text).from ?? draft.clientName };
  }

  if (nights.length >= 2) {
    return { ...draft, kind: "change_nights", nights: nights[0], newNights: nights[1] };
  }

  if (/\brent\b/i.test(text) && money.length >= 2) {
    return { ...draft, kind: "change_business", amount: money[0], newAmount: money[1] };
  }

  if (methods.length >= 2 || (methods.length === 1 && /\b(nahi|nai)\b/i.test(text) && !expense)) {
    return {
      ...draft,
      kind: "change_method",
      method: methods[0] ?? null,
      newMethod: methods[1] ?? methods[0] ?? null,
    };
  }

  if (draft.newReceivedByName || (/\b(receive|lia|liya|wasol|received)\b/i.test(text) && /\b(nahi|nai)\b/i.test(text) && /\b(anas|khiz)/i.test(text))) {
    const pair = receiversAroundNahi(text);
    const to = pair.to ?? canonicalReceiverName(detectReceiverName(text));
    return {
      ...draft,
      kind: "change_receiver",
      receivedByName: pair.from,
      newReceivedByName: to === pair.from ? (pair.from === "Anas" ? "Khizer" : "Anas") : to,
    };
  }

  if (/\b(pending|baki|baqi).{0,32}\b(nahi|nai).{0,32}\b(received|wasol|wasool|paid)\b/i.test(text)) {
    return { ...draft, kind: "mark_received", newReceivedByName: detectReceiverName(text) };
  }

  if (
    /\b(received|wasol|wasool|paid).{0,48}\b(galat|wrong|pending|baki)\b/i.test(text) ||
    /\b(galat|wrong).{0,24}\b(pending|baki)\b/i.test(text) ||
    /\breceived wala galat\b/i.test(text)
  ) {
    return { ...draft, kind: "void_payment" };
  }

  if (/\b(full\s+)?paid\s+(nahi|nai)\b/i.test(text) || /\b\d+[k]?\s*(baki|pending)\s*(hai|tha|thi)?\b/i.test(text)) {
    return { ...draft, kind: "set_pending", newAmount: money.at(-1) ?? draft.amount };
  }

  if (flats.length >= 2 && !expense) {
    return { ...draft, kind: "change_expense_flat", flat: flats[0], newFlat: flats[1] };
  }

  if (money.length >= 2 && /\brent\b/i.test(text)) {
    return { ...draft, kind: "change_business" };
  }

  return { type: "ambiguous", reason: "I understood a correction, but not what to change." };
}

export function defaultReceiverFallback(name: string | null): string {
  return name || DEFAULT_RECEIVER_NAME;
}
