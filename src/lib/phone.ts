export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 10) return null;
  if (digits.startsWith("92") && digits.length >= 12) return digits.slice(0, 12);
  if (digits.startsWith("0") && digits.length === 11) return `92${digits.slice(1)}`;
  if (digits.length === 10) return `92${digits}`;
  return digits;
}

export function displayPhone(raw: string | null | undefined): string {
  const normalized = normalizePhone(raw);
  if (!normalized) return "No phone";
  if (normalized.startsWith("92")) return `0${normalized.slice(2)}`;
  return normalized;
}

export function displayPhoneSpaced(raw: string | null | undefined): string {
  const local = displayPhone(raw);
  if (local.startsWith("03") && local.length === 11) return `${local.slice(0, 4)} ${local.slice(4)}`;
  return local;
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  return Boolean(left && right && left === right);
}
