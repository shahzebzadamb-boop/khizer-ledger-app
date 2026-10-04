export const DEFAULT_RECEIVER_NAME = "Anas";
export const KHIZER_NAME = "Khizer";

export const DEFAULT_RECEIVERS = [
  { id: "recv_anas", name: DEFAULT_RECEIVER_NAME, active: true, createdAt: "2026-09-23T00:00:00.000Z" },
  { id: "recv_khizer", name: KHIZER_NAME, active: true, createdAt: "2026-09-23T00:00:00.000Z" },
] as const;

const KHIZER_RE = /\bkhiz[ae]?r\b/i;
const RECEIVER_JUNK = new Set([
  "cash",
  "bank",
  "easypaisa",
  "easypisa",
  "jazzcash",
  "transfer",
  "advance",
  "total",
  "rent",
  "flat",
  "din",
  "day",
  "days",
  "night",
  "nights",
  "tufail",
  "customer",
  "guest",
]);

export function isKhizerAlias(value: string): boolean {
  return KHIZER_RE.test(value.trim());
}

export function canonicalReceiverName(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return DEFAULT_RECEIVER_NAME;
  if (isKhizerAlias(value)) return KHIZER_NAME;
  if (/^anas$/i.test(value)) return DEFAULT_RECEIVER_NAME;
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function usableReceiverToken(token: string | undefined): string | null {
  if (!token) return null;
  if (RECEIVER_JUNK.has(token.toLowerCase())) return null;
  if (token.length < 2) return null;
  return canonicalReceiverName(token);
}

export function detectReceiverName(text: string): string {
  const byMatch = text.match(
    /\b(?:received|receive|recived|recive|wasol|wasool)\s+by\s+([A-Za-z]+)\b/i,
  );
  const byName = usableReceiverToken(byMatch?.[1]);
  if (byName) return byName;

  const pasMatch = text.match(/\b([A-Za-z]+)\s+k(?:e)?\s+pas\b/i);
  const pasName = usableReceiverToken(pasMatch?.[1]);
  if (pasName) return pasName;

  const neMatch = text.match(/\b([A-Za-z]+)\s+ne\b/i);
  if (neMatch?.[1] && (isKhizerAlias(neMatch[1]) || /\bne[\s\S]{0,48}\b(?:lia|liya|receive|recive|recived)\b/i.test(text))) {
    const neName = usableReceiverToken(neMatch[1]);
    if (neName) return neName;
  }

  const afterReceived = text.match(
    /\b(?:wasol|wasool|received|receive|recived|recive)\s+([A-Za-z]+)\b/i,
  );
  const afterName = usableReceiverToken(afterReceived?.[1]);
  if (afterName && afterName !== DEFAULT_RECEIVER_NAME) return afterName;

  if (KHIZER_RE.test(text)) return KHIZER_NAME;
  return DEFAULT_RECEIVER_NAME;
}

export function hasReceiverSignal(text: string): boolean {
  if (KHIZER_RE.test(text)) return true;
  if (/\b(?:received|receive|recived|recive|wasol|wasool)\s+by\s+[A-Za-z]+\b/i.test(text)) return true;
  if (/\b[A-Za-z]+\s+k(?:e)?\s+pas\b/i.test(text)) return true;
  if (/\b[A-Za-z]+\s+ne\b[\s\S]{0,48}\b(?:lia|liya|receive|recive|recived)\b/i.test(text)) return true;
  return false;
}

export function stripReceiverForNameDetection(text: string): string {
  return text
    .replace(/\b(?:received|receive|recived|recive|wasol|wasool)\s+by\s+[A-Za-z]+\b/gi, " ")
    .replace(/\bkhiz[ae]?r(?:\s+ne)?\b/gi, " ")
    .replace(/\b[A-Za-z]+\s+k(?:e)?\s+pas\b/gi, " ")
    .replace(/\b[A-Za-z]+\s+ne\b/gi, (match) => (/\banas\s+ne\b/i.test(match) ? match : " "))
    .replace(/\bby\s+[A-Za-z]+\b/gi, " ");
}
