const pkr = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

/** Largest PKR figure the ledger will store. Phone numbers are 10+ digits. */
export const MAX_LEDGER_AMOUNT = 9_999_999;

export function formatPKR(amount: number): string {
  return pkr.format(amount).replace("PKR", "Rs").trim();
}

export function isPhoneLikeAmount(amount: number): boolean {
  const digits = String(Math.trunc(Math.abs(amount)));
  if (digits.length >= 10) return true;
  return /^(?:92)?3\d{9}$/.test(digits);
}

export function isPlausibleLedgerAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_LEDGER_AMOUNT && !isPhoneLikeAmount(amount);
}

export function isValidMoneyAmount(amount: number, allowZero = false): boolean {
  if (!Number.isFinite(amount) || !Number.isSafeInteger(amount)) return false;
  if (amount < 0 || amount > MAX_LEDGER_AMOUNT) return false;
  if (amount === 0) return allowZero;
  return !isPhoneLikeAmount(amount);
}

/**
 * Sanitize typed/pasted money text for a controlled input.
 * Never use this on phone fields — 03001234567 must stay 03001234567.
 *
 * Returns:
 *   ""     empty field (numeric meaning 0 when allowZero)
 *   "0"    explicit zero
 *   "18000" normalized digits with no leading zeros
 *   null   invalid (ignore; keep previous value)
 */
export function sanitizeMoneyInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return "";

  const cleaned = trimmed
    .replace(/^rs\.?\s*/i, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "");

  if (cleaned === "") return "";
  if (!/^\d+$/.test(cleaned)) return null;
  if (cleaned.length > 12) return null;

  if (/^0+$/.test(cleaned)) return "0";
  const digits = cleaned.replace(/^0+/, "");
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_LEDGER_AMOUNT) return null;
  if (isPhoneLikeAmount(value)) return null;
  return digits;
}

/** Parse a dedicated money input. Never use this on phone fields. */
export function parseFormAmount(raw: string, allowZero = false): number | null {
  const sanitized = sanitizeMoneyInput(raw);
  if (sanitized == null) return null;
  if (sanitized === "") return allowZero ? 0 : null;
  const value = Number(sanitized);
  return isValidMoneyAmount(value, allowZero) ? value : null;
}

/** Display string for an existing saved amount. Zero-as-empty for "nothing entered". */
export function moneyInputFromSaved(amount: number | null | undefined): string {
  if (amount == null || amount === 0) return "";
  return String(amount);
}

export function parseAmountToken(token: string): number | null {
  const cleaned = token
    .replace(/,/g, "")
    .toLowerCase()
    .replace(/^rs\.?/, "")
    .trim();

  const lac = cleaned.match(/^(\d+(?:\.\d+)?)\s*(?:lac|lakh)s?$/);
  if (lac) {
    const value = Math.round(Number(lac[1]) * 100000);
    return isPlausibleLedgerAmount(value) ? value : null;
  }

  const withK = cleaned.match(/^(\d+(?:\.\d+)?)k$/);
  if (withK) {
    const value = Math.round(Number(withK[1]) * 1000);
    return isPlausibleLedgerAmount(value) ? value : null;
  }

  if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
    const value = Math.round(Number(cleaned));
    return isPlausibleLedgerAmount(value) ? value : null;
  }
  return null;
}

export function formatFlat(flat: string | null | undefined): string | null {
  if (!flat) return null;
  return `Flat ${flat}`;
}

export function methodLabel(method: string): string {
  switch (method) {
    case "CASH":
      return "Cash";
    case "EASYPAISA":
      return "Easypaisa";
    case "BANK_TRANSFER":
      return "Bank";
    case "JAZZCASH":
      return "JazzCash";
    default:
      return "Other";
  }
}
