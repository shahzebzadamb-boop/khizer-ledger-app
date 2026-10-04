import { parseAmountToken } from "@/lib/money";
import { detectFlat } from "@/lib/parse-quick-entry";
import type { PaymentMethod } from "@/types";

export type MigrationPatch = {
  type: "patch";
  stillPending?: boolean;
  alreadyPaid?: boolean;
  ignore?: boolean;
  keepExpense?: boolean;
  settlePending?: boolean;
  receiveAmount?: number;
  remainingAmount?: number;
  rentAmount?: number;
  nights?: number;
  checkInText?: string;
  checkOutText?: string;
  method?: PaymentMethod;
  summary: string;
};

export type MigrationParseResult = MigrationPatch | { type: "ambiguous"; reason: string };

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function moneyTokens(text: string, flat: string | null): number[] {
  const tokens = text.match(/(?:rs\.?\s*)?(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:k|lac|lakh)?/gi) ?? [];
  const nights = text.match(/\b(\d+)\s*(?:night|nights|din|day|days|raat)\b/i)?.[1];
  const flatNumber = flat ? Number(flat.replace(/-[A-Z]$/i, "")) : null;
  return tokens
    .map((token) => parseAmountToken(token.replace(/^rs\.?\s*/i, "")))
    .filter((value): value is number => {
      if (value === null || value <= 0) return false;
      if (nights && value === Number(nights)) return false;
      if (flatNumber && value === flatNumber) return false;
      return true;
    });
}

function parseDayMonth(text: string, kind: "checkin" | "checkout"): string | undefined {
  const labeled =
    kind === "checkin"
      ? text.match(/\b(?:date|check[\s-]?in)\s+(\d{1,2})(?:\s+|\/|-)([A-Za-z]+|\d{1,2})/i)
      : text.match(/\b(?:checkout|check[\s-]?out)\s+(\d{1,2})(?:\s+|\/|-)([A-Za-z]+|\d{1,2})/i);
  const loose =
    labeled ??
    (kind === "checkin"
      ? text.match(/\b(\d{1,2})\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/i)
      : null);
  if (!loose) return undefined;
  const day = Number(loose[1]);
  const monthRaw = loose[2].toLowerCase();
  const month = MONTHS[monthRaw] ?? Number(monthRaw);
  if (!day || !month) return undefined;
  return `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function humanBits(money: number[], flat: string | null): string {
  const bits: string[] = [];
  if (money[0]) bits.push(`Rs ${money[0].toLocaleString("en-PK")}`);
  if (flat) bits.push(`Flat ${flat}`);
  return bits.join(" and ");
}

export function parseMigrationUpdate(raw: string, hintFlat?: string | null): MigrationParseResult {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return { type: "ambiguous", reason: "Yahan likho kya fix karna hai." };

  const flat = detectFlat(text) ?? hintFlat ?? null;
  const money = moneyTokens(text, flat);
  const method: PaymentMethod = /easy\s*paisa|easypisa/i.test(text)
    ? "EASYPAISA"
    : /jazz/i.test(text)
      ? "JAZZCASH"
      : /bank|alfalah/i.test(text)
        ? "BANK_TRANSFER"
        : /cash/i.test(text)
          ? "CASH"
          : "CASH";

  const patch: MigrationPatch = { type: "patch", method, summary: "" };
  const parts: string[] = [];

  if (/\b(ignore this|ignore karo|skip this)\b/i.test(text)) {
    patch.ignore = true;
    parts.push("Ignore this row");
  }

  if (/\b(still pending|abhi baki|abhi baqi|abhi pending|active pending)\b/i.test(text)) {
    patch.stillPending = true;
    parts.push("Keep as still pending and start reminders");
  }

  if (/\b(already paid|full wasol|full paid|poora wasol|complete paid|settled|clear ho gaya)\b/i.test(text)) {
    patch.alreadyPaid = true;
    parts.push("Mark fully paid and stop reminders");
  }

  if (/\b(ye expense tha|this was expense|expense tha|kharcha tha)\b/i.test(text)) {
    patch.keepExpense = true;
    parts.push("Keep as expense, no rent");
  }

  if (/\b(maintenance correct|customer paid|expense sahi|expense theek)\b/i.test(text)) {
    patch.keepExpense = true;
    patch.settlePending = true;
    parts.push("Keep expense and settle pending");
  }

  const receivedHit = text.match(
    /\b(\d+(?:\.\d+)?k|\d{1,3}(?:,\d{3})+|\d+)\s*(?:cash\s+)?(?:mil\s+gaya|mil\s+gya|mila|wasol|wasool|received|receive|recive|recived|aya|aaya|paid)\b/i,
  );
  const receivedLead = text.match(
    /\b(?:mil\s+gaya|mil\s+gya|mila|wasol|wasool|received|receive|aya)\s+(\d+(?:\.\d+)?k|\d{1,3}(?:,\d{3})+|\d+)\b/i,
  );
  if (receivedHit || receivedLead) {
    const token = receivedHit?.[1] ?? receivedLead?.[1];
    const amount = token ? parseAmountToken(token) : money[0];
    if (amount) {
      patch.receiveAmount = amount;
      parts.push(`Received Rs ${amount.toLocaleString("en-PK")}`);
    }
  }

  const remainingHit = text.match(
    /\b(\d+(?:\.\d+)?k|\d{1,3}(?:,\d{3})+|\d+)\s*(?:baki|baqi|pending|remaining|remain)\b/i,
  );
  if (remainingHit) {
    const amount = parseAmountToken(remainingHit[1]);
    if (amount !== null) {
      patch.remainingAmount = amount;
      parts.push(`Pending Rs ${amount.toLocaleString("en-PK")}`);
    }
  }

  if (/\b(remaining nahi|no remaining|baki nahi|pending nahi)\b/i.test(text)) {
    patch.remainingAmount = 0;
    parts.push("No remaining");
  }

  const rentHit = text.match(/\brent\s+(\d+(?:\.\d+)?k|\d{1,3}(?:,\d{3})+|\d+)\s*tha\b/i);
  if (rentHit) {
    const amount = parseAmountToken(rentHit[1]);
    if (amount) {
      patch.rentAmount = amount;
      parts.push(`Rent Rs ${amount.toLocaleString("en-PK")}`);
    }
  }

  const nightsHit = text.match(/\b(\d+)\s*(?:night|nights|din|day|days|raat)\s*(?:tha|thi|the)?\b/i);
  if (nightsHit && !/\bextend\b/i.test(text)) {
    patch.nights = Number(nightsHit[1]);
    parts.push(`${patch.nights} night${patch.nights === 1 ? "" : "s"}`);
  }

  const checkIn = parseDayMonth(text, "checkin");
  if (checkIn) {
    patch.checkInText = checkIn;
    parts.push(`Check-in ${checkIn}`);
  }
  const checkOut = parseDayMonth(text, "checkout");
  if (checkOut) {
    patch.checkOutText = checkOut;
    parts.push(`Checkout ${checkOut}`);
  }

  if (/\b(\d+k|\d+)\s+received tha\b/i.test(text)) {
    const token = text.match(/\b(\d+(?:\.\d+)?k|\d+)\s+received tha\b/i)?.[1];
    const amount = token ? parseAmountToken(token) : null;
    if (amount) {
      patch.receiveAmount = amount;
      if (!parts.includes(`Received Rs ${amount.toLocaleString("en-PK")}`)) {
        parts.push(`Received Rs ${amount.toLocaleString("en-PK")}`);
      }
    }
  }

  const hasChange = Boolean(
    patch.stillPending ||
      patch.alreadyPaid ||
      patch.ignore ||
      patch.keepExpense ||
      patch.settlePending ||
      patch.receiveAmount ||
      patch.remainingAmount !== undefined ||
      patch.rentAmount ||
      patch.nights ||
      patch.checkInText ||
      patch.checkOutText,
  );

  if (!hasChange) {
    const understood = humanBits(money, flat);
    if (understood) return { type: "ambiguous", reason: `I understood ${understood}. Received or Expense?` };
    return { type: "ambiguous", reason: "I could not tell what to change on this row." };
  }

  patch.summary = parts.join(" · ");
  return patch;
}
