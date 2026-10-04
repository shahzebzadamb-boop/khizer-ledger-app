import { addDays, startOfDay } from "date-fns";
import { parseAmountToken } from "@/lib/money";
import { normalizePhone } from "@/lib/phone";
import {
  DEFAULT_RECEIVER_NAME,
  detectReceiverName,
  hasReceiverSignal,
  stripReceiverForNameDetection,
} from "@/lib/receivers";
import { looksLikeCorrection, parseCorrection, type CorrectionDraft } from "@/lib/parse-correction";
import { normalizeFlatCode } from "@/lib/flats";
import type { ExpenseCategory, PaymentMethod } from "@/types";

export type TransactionType =
  | "RENT"
  | "PAYMENT"
  | "EXPENSE"
  | "SECURITY"
  | "SECURITY_ADJUSTMENT"
  | "DISCOUNT"
  | "STAY_EXTENSION"
  | "ANAS_WITHDRAWAL";

export type RentDraft = {
  type: "rent";
  clientName: string;
  phone: string | null;
  needsPhone: boolean;
  flat: string | null;
  nights: number;
  totalAmount: number;
  receivedAmount: number;
  remaining: number;
  method: PaymentMethod;
  receivedByName: string;
  checkIn: Date;
  checkOut: Date;
};

export type PaymentDraft = {
  type: "payment";
  clientName: string;
  phone: string | null;
  flat: string | null;
  amount: number;
  method: PaymentMethod;
  receivedByName: string;
  stayId?: string | null;
  receivedAt?: string;
};

export type ExpenseDraft = {
  type: "expense";
  amount: number;
  method: PaymentMethod;
  description: string;
  category: ExpenseCategory;
  flat: string | null;
  spentAt?: string;
};

export type SecurityDraft = {
  type: "security";
  clientName: string;
  phone: string | null;
  needsPhone: boolean;
  flat: string | null;
  amount: number;
  method: PaymentMethod;
};

export type SecurityAdjustDraft = {
  type: "security_adjustment";
  clientName: string;
  phone: string | null;
  amount: number;
};

export type DiscountDraft = {
  type: "discount";
  clientName: string;
  phone: string | null;
  amount: number;
};

export type ExtensionDraft = {
  type: "extension";
  clientName: string;
  phone: string | null;
  flat: string | null;
  extraNights: number;
  extraRevenue: number;
};

export type WithdrawalDraft = {
  type: "withdrawal";
  amount: number;
  note: string | null;
};

export type ConfirmableDraft =
  | RentDraft
  | PaymentDraft
  | ExpenseDraft
  | SecurityDraft
  | SecurityAdjustDraft
  | DiscountDraft
  | ExtensionDraft
  | WithdrawalDraft
  | CorrectionDraft;

export type ParsedQuickEntry =
  | ConfirmableDraft
  | { type: "ambiguous"; reason: string };

export type ParseContext = {
  knownClients?: { name: string; phone: string | null }[];
  knownFlats?: string[];
  now?: Date;
};

function flatMatchKey(value: string): string {
  return (normalizeFlatCode(value) ?? value).replace(/[\s\-/]+/g, "").toUpperCase();
}

export function normalizeFlatName(value: string): string {
  const canonical = normalizeFlatCode(value);
  if (canonical) return canonical;
  const compact = value.replace(/[\s-]+/g, "").toUpperCase();
  const match = compact.match(/^(\d{3})([A-Z])$/);
  if (match) return `${match[1]}-${match[2]}`;
  return value.replace(/\s+/g, "").replace(/(\d{3})-?([A-Za-z])/i, (_, n, l) => `${n}-${String(l).toUpperCase()}`);
}

export function detectFlat(text: string, knownFlats: string[] = []): string | null {
  const labeled = text.match(/\bflat\s+([A-Za-z0-9/ -]+)/i);
  if (labeled?.[1]) {
    return matchKnownOrPattern(labeled[1], knownFlats);
  }
  const pair = text.match(/\b(\d{3})\s*[/\-]\s*(\d{3})\b/);
  if (pair) {
    return matchKnownOrPattern(`${pair[1]}/${pair[2]}`, knownFlats);
  }
  const loose = text.match(/\b(\d{3})\s*-?\s*([A-Za-z])\b/);
  if (loose) {
    return matchKnownOrPattern(`${loose[1]}${loose[2]}`, knownFlats);
  }
  const compact = flatMatchKey(text);
  for (const name of knownFlats) {
    const needle = flatMatchKey(name);
    if (needle && compact.includes(needle)) return normalizeFlatName(name);
  }
  return null;
}

function matchKnownOrPattern(raw: string, knownFlats: string[]): string | null {
  const flat = normalizeFlatName(raw);
  if (knownFlats.length === 0) return flat;
  const found = knownFlats.find((name) => flatMatchKey(name) === flatMatchKey(flat));
  return found ?? flat;
}

const RECEIVED_RE =
  /\b(received|receive|recive|recived|wasol|wasool|mila|mil\s+gaya|mil\s+gya|aya|aaya|amount\s+aya|payment\s+aya|paid|full\s+paid|clear|settled|advance|lia|liya)\b/i;
const PENDING_RE =
  /\b(pending|remaining|remain|baki|baqi|reh\s+gaya|reh\s+gya|reh\s+gai|remaining\s+hai|balance|bacha|bacha\s+hua)\b/i;
const EXPENSE_RE =
  /\b(expense|kharcha|bill|diya|pay\s+kia|cleaning|safai|safayi|safyai|sofa\s+clean|plumber|plumbing|maintenance|repair|electric|electricity|gas|ptcl|internet|grocery|groceries|bedsheets?|linen|furniture|water|watar|supplies|staff|commission|cleaner|utility|bought|buy)\b/i;
const DAYS_RE =
  /\b(\d+)\s*(?:more\s+)?(?:days?|din|nights?|night|raat|nigh)\b/i;
const WITHDRAW_RE =
  /\banas\b[\s\S]{0,40}\b(withdraw(?:al)?|nikal(?:a|i)?(?:\s+liya)?|ne\s+liya|liya|nikala)\b|\b(withdraw(?:al)?|nikal(?:a|i)?(?:\s+liya)?|nikala)\b[\s\S]{0,40}\banas\b/i;
const SECURITY_ADJUST_RE =
  /\b(adjust|apply|mein|mai)\b[\s\S]{0,40}\b(security|amanat|deposit)\b|\b(security|amanat|deposit)\b[\s\S]{0,40}\b(rent|adjust|apply|mein|mai)\b/i;
const SECURITY_RE = /\b(security|deposit|amanat)\b/i;
const DISCOUNT_RE = /\bdiscount\b/i;
const EXTEND_RE = /\b(extend|more\s+days|din\s+aur|aur\s+extend)\b/i;
const RENT_RE = /\b(rent|total|booking)\b/i;

const STOP_WORDS = new Set(
  [
    "received", "receive", "recive", "recived", "wasol", "wasool", "mila", "mil", "gaya", "gya",
    "aya", "aaya", "amount", "payment", "paid", "full", "clear", "settled", "advance", "cash",
    "bank", "easypaisa", "easypisa", "jazzcash", "pending", "remaining", "remain", "baki", "baqi",
    "reh", "gai", "balance", "bacha", "hua", "expense", "kharcha", "bill", "diya", "pay", "kia",
    "cleaning", "safai", "safayi", "safyai", "sofa", "clean", "plumber", "plumbing", "maintenance",
    "repair", "electric", "electricity", "gas", "ptcl", "internet", "grocery", "groceries",
    "bedsheet", "bedsheets", "linen", "furniture", "water", "watar", "supplies", "staff",
    "commission", "security", "deposit", "amanat", "adjust", "apply", "rent", "total", "booking",
    "extend", "more", "days", "day", "din", "night", "nights", "raat", "nigh", "anas", "withdraw",
    "withdrawal", "nikal", "nikala", "liya", "lia", "flat", "ko", "ka", "ki", "ke", "se", "mein", "mai",
    "ne", "aur", "tha", "thi", "hai", "the", "and", "for", "from", "to", "with", "another",
    "number", "customer", "guest", "khizer", "khizar", "khizr", "pas", "by",
    "galat", "wrong", "nahi", "nai", "actually", "change", "fix", "correct", "void", "delete",
    "karo", "wala", "ye", "entry",
  ],
);

const METHOD_PATTERNS: { pattern: RegExp; method: PaymentMethod }[] = [
  { pattern: /easy\s*paisa|easypisa/i, method: "EASYPAISA" },
  { pattern: /jazz\s*cash/i, method: "JAZZCASH" },
  { pattern: /bank\s*transfer|\bbank\b|alfalah/i, method: "BANK_TRANSFER" },
  { pattern: /\bcash\b/i, method: "CASH" },
];

function detectMethod(text: string): PaymentMethod {
  for (const item of METHOD_PATTERNS) {
    if (item.pattern.test(text)) return item.method;
  }
  return "CASH";
}

function detectPhone(text: string): string | null {
  const match = text.match(/\b(?:\+?92|0)?3\d{9}\b/);
  return match ? normalizePhone(match[0]) : null;
}

function titleCase(words: string[]): string {
  return words.map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(" ");
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
    .filter(Boolean);

  for (const client of ranked) {
    const first = client.name.split(/\s+/)[0]?.toLowerCase();
    if (first && first.length >= 3 && tokens.includes(first)) {
      const sameFirst = ranked.filter((item) => item.name.split(/\s+/)[0]?.toLowerCase() === first);
      if (sameFirst.length === 1) return client.name;
    }
  }

  const cleaned = text
    .replace(/\b(?:\+?92|0)?3\d{9}\b/g, " ")
    .replace(/\b\d{3}\s*-?\s*[A-Za-z]\b/gi, " ")
    .replace(/\bflat\b/gi, " ")
    .replace(/(?:rs\.?\s*)?(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:k|lac|lakh)?/gi, " ")
    .replace(/[^A-Za-z\s.'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned
    .split(" ")
    .filter((word) => /^[A-Za-z][A-Za-z.'-]*$/.test(word) && !STOP_WORDS.has(word.toLowerCase()));
  if (words.length === 0) return null;
  return titleCase(words.slice(0, 3));
}

function stripPhones(text: string): string {
  return text
    .replace(/\b(?:\+?92|0)?3\d{9}\b/g, " ")
    .replace(/\b(?:\+?92|0)?3\d{2}[\s-]+\d{7}\b/g, " ");
}

function amountCandidates(snippet: string): number[] {
  const tokens =
    snippet.match(/(?:rs\.?\s*)?(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:k|lac|lakh)?(?![A-Za-z0-9])/gi) ?? [];
  return tokens
    .map((token) => parseAmountToken(token.replace(/^rs\.?\s*/i, "")))
    .filter((value): value is number => value !== null && value > 0);
}

function amounts(text: string, flat: string | null): number[] {
  const dayCount = text.match(DAYS_RE)?.[1] ?? null;
  const flatNumber = flat ? Number(flat.replace(/-[A-Z]$/i, "")) : null;
  return amountCandidates(stripPhones(text)).filter((value) => {
    if (dayCount && value === Number(dayCount)) return false;
    if (flatNumber && value === flatNumber) return false;
    return true;
  });
}

function amountAfter(text: string, keyword: RegExp, knownFlats: string[] = []): number | null {
  const match = text.match(keyword);
  if (!match || match.index === undefined) return null;
  const flat = detectFlat(text, knownFlats);
  const flatNumber = flat ? Number(flat.replace(/-[A-Z]$/i, "")) : null;
  const dayCount = Number(text.match(DAYS_RE)?.[1] ?? 0) || null;
  const skip = (value: number) =>
    Boolean((flatNumber && value === flatNumber) || (dayCount && value === dayCount));
  const after = amountCandidates(stripPhones(text.slice(match.index + match[0].length))).filter((value) => !skip(value));
  if (after[0]) return after[0];
  const before = amountCandidates(stripPhones(text.slice(0, match.index))).filter((value) => !skip(value));
  return before.at(-1) ?? null;
}

function expenseMeta(text: string): { label: string; category: ExpenseCategory } {
  if (/sofa/i.test(text)) return { label: "Sofa cleaning", category: "CLEANING" };
  if (/clean|safai|safayi|safyai/i.test(text)) return { label: "Cleaning", category: "CLEANING" };
  if (/electric/i.test(text)) return { label: "Electricity", category: "ELECTRICITY" };
  if (/\bgas\b/i.test(text)) return { label: "Gas", category: "GAS" };
  if (/ptcl|internet/i.test(text)) return { label: "Internet", category: "INTERNET" };
  if (/plumb/i.test(text)) return { label: "Plumbing", category: "PLUMBING" };
  if (/repair/i.test(text)) return { label: "Repairs", category: "REPAIRS" };
  if (/maintenance/i.test(text)) return { label: "Maintenance", category: "MAINTENANCE" };
  if (/bedsheet|linen/i.test(text)) return { label: "Bedsheets / Linen", category: "BEDSHEETS_LINEN" };
  if (/furniture/i.test(text)) return { label: "Furniture", category: "FURNITURE" };
  if (/groc/i.test(text)) return { label: "Groceries", category: "GROCERIES" };
  if (/staff/i.test(text)) return { label: "Staff", category: "STAFF" };
  if (/commission/i.test(text)) return { label: "Commission", category: "COMMISSION" };
  if (/water|watar/i.test(text)) return { label: "Water", category: "WATER" };
  if (/kharcha|expense|bill/i.test(text)) return { label: "Expense", category: "OTHER" };
  return { label: "Expense", category: "OTHER" };
}

function isWithdrawal(text: string): boolean {
  if (WITHDRAW_RE.test(text)) return true;
  return /\banas\b/i.test(text) && /\b(nikal|nikala|liya|withdraw)\b/i.test(text);
}

function classify(text: string): TransactionType | "AMBIGUOUS" {
  if (isWithdrawal(text)) return "ANAS_WITHDRAWAL";
  if (SECURITY_ADJUST_RE.test(text)) return "SECURITY_ADJUSTMENT";
  if (SECURITY_RE.test(text)) return "SECURITY";
  if (DISCOUNT_RE.test(text)) return "DISCOUNT";
  if (EXTEND_RE.test(text)) return "STAY_EXTENSION";
  if (EXPENSE_RE.test(text) && !RECEIVED_RE.test(text) && !RENT_RE.test(text) && !DAYS_RE.test(text)) {
    return "EXPENSE";
  }
  if (EXPENSE_RE.test(text) && !detectName(text, []) && !/\b(received|wasol|wasool|mila|aya)\b/i.test(text)) {
    return "EXPENSE";
  }
  if (RENT_RE.test(text) || DAYS_RE.test(text)) return "RENT";
  if (RECEIVED_RE.test(text) || hasReceiverSignal(text)) return "PAYMENT";
  if (PENDING_RE.test(text)) return "RENT";
  if (EXPENSE_RE.test(text)) return "EXPENSE";
  return "AMBIGUOUS";
}

export function isConfirmable(parsed: ParsedQuickEntry): parsed is ConfirmableDraft {
  return parsed.type !== "ambiguous";
}

function humanAmbiguous(money: number[], flat: string | null, extra?: string): string {
  const bits: string[] = [];
  if (money[0]) bits.push(`Rs ${money[0].toLocaleString("en-PK")}`);
  if (flat) bits.push(`Flat ${flat}`);
  if (bits.length && extra) return `I understood ${bits.join(" and ")}. ${extra}`;
  if (bits.length) return `I understood ${bits.join(" and ")}. Received or Expense?`;
  return extra ?? "I could not tell if this is rent, a payment, or an expense.";
}

function nightsFrom(text: string): number {
  return Number(text.match(DAYS_RE)?.[1] ?? 0) || 0;
}

export function parseQuickEntry(
  raw: string,
  ctx: ParseContext = {},
  forceType?: TransactionType,
): ParsedQuickEntry {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return { type: "ambiguous", reason: "Yahan likho kya hua." };
  if (!forceType && looksLikeCorrection(text)) {
    return parseCorrection(text, ctx);
  }
  const now = startOfDay(ctx.now ?? new Date());
  const flat = detectFlat(text, ctx.knownFlats ?? []);
  const phone = detectPhone(text);
  const receivedByName = detectReceiverName(text);
  const clientName = detectName(stripReceiverForNameDetection(text), ctx.knownClients ?? []);
  const money = amounts(text, flat);
  const method = detectMethod(text);
  const type = forceType ?? classify(text);
  const nights = nightsFrom(text) || 1;

  if (type === "ANAS_WITHDRAWAL") {
    const amount = money[0];
    if (!amount) return { type: "ambiguous", reason: humanAmbiguous(money, flat, "Add the withdrawal amount.") };
    return { type: "withdrawal", amount, note: "Anas withdrawal" };
  }

  if (type === "EXPENSE") {
    const amount = amountAfter(text, /\b(diya|kharcha|bill|expense|pay\s+kia)\b/i) ?? money[0];
    if (!amount) return { type: "ambiguous", reason: humanAmbiguous(money, flat, "Add the expense amount.") };
    const meta = expenseMeta(text);
    return {
      type: "expense",
      amount,
      method,
      description: meta.label,
      category: meta.category,
      flat,
      spentAt: now.toISOString(),
    };
  }

  if (type === "SECURITY") {
    const amount = money[0];
    if (!clientName || !amount) {
      return { type: "ambiguous", reason: humanAmbiguous(money, flat, "Add the customer and security amount.") };
    }
    return {
      type: "security",
      clientName,
      phone,
      needsPhone: !phone && !(ctx.knownClients ?? []).some((item) => item.name === clientName),
      flat,
      amount,
      method,
    };
  }

  if (type === "SECURITY_ADJUSTMENT") {
    const amount = money[0];
    if (!clientName || !amount) {
      return { type: "ambiguous", reason: humanAmbiguous(money, flat, "Add the customer and security amount.") };
    }
    return { type: "security_adjustment", clientName, phone, amount };
  }

  if (type === "DISCOUNT") {
    const amount = money[0];
    if (!clientName || !amount) {
      return { type: "ambiguous", reason: humanAmbiguous(money, flat, "Add the customer and discount amount.") };
    }
    return { type: "discount", clientName, phone, amount };
  }

  if (type === "STAY_EXTENSION") {
    const extraNights = nightsFrom(text);
    const extraRevenue = amountAfter(text, /\b(?:total|rent|for|extend)\b/i) ?? money[0];
    if (!clientName || !extraNights || !extraRevenue) {
      return { type: "ambiguous", reason: humanAmbiguous(money, flat, "Add customer, extra days, and amount.") };
    }
    return {
      type: "extension",
      clientName,
      phone,
      flat,
      extraNights,
      extraRevenue,
    };
  }

  if (type === "PAYMENT") {
    const amount = amountAfter(text, RECEIVED_RE) ?? money[0];
    if (!clientName || !amount) {
      return { type: "ambiguous", reason: humanAmbiguous(money, flat, "Add the customer and payment amount.") };
    }
    return { type: "payment", clientName, phone, flat, amount, method, receivedByName, receivedAt: now.toISOString() };
  }

  if (type === "RENT") {
    const total =
      amountAfter(text, /\b(total|rent)\b/i) ??
      (PENDING_RE.test(text) && !RECEIVED_RE.test(text) && !RENT_RE.test(text)
        ? money[0]
        : money.length > 1
          ? Math.max(...money)
          : money[0]);
    if (!clientName || !total) {
      return { type: "ambiguous", reason: humanAmbiguous(money, flat, "Add the customer and rent amount.") };
    }
    const received = RECEIVED_RE.test(text)
      ? (amountAfter(text, RECEIVED_RE) ?? (money.length > 1 ? Math.min(...money) : 0))
      : amountAfter(text, /\b(advance)\b/i) ?? (money.length > 1 && RENT_RE.test(text) ? Math.min(...money) : 0);
    const known = (ctx.knownClients ?? []).some((item) => item.name === clientName && item.phone);
    return {
      type: "rent",
      clientName,
      phone,
      needsPhone: !phone && !known,
      flat,
      nights,
      totalAmount: total,
      receivedAmount: received,
      remaining: Math.max(0, total - received),
      method,
      receivedByName: received > 0 ? receivedByName : DEFAULT_RECEIVER_NAME,
      checkIn: now,
      checkOut: addDays(now, nights),
    };
  }

  return { type: "ambiguous", reason: humanAmbiguous(money, flat) };
}
