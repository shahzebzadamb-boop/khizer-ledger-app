import type { Flat, LedgerState } from "@/types";

export function normalizeFlatCode(value: string): string | null {
  const raw = value.trim().toUpperCase();
  if (!raw) return null;
  const pair = raw.match(/^(\d{3})[\s/\-]+(\d{3})$/);
  if (pair) return `${pair[1]}/${pair[2]}`;
  const compact = raw.replace(/[\s-]+/g, "");
  const letter = compact.match(/^(\d{3})([A-Z])$/);
  if (!letter) return null;
  return `${letter[1]}-${letter[2]}`;
}

export function flatIdForName(name: string): string {
  return `flat_${name}`;
}

export function isFlatActive(flat: Flat): boolean {
  return flat.active !== false && !flat.archivedAt;
}

export function activeFlats(state: LedgerState): Flat[] {
  return [...state.flats].filter(isFlatActive).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function archivedFlats(state: LedgerState): Flat[] {
  return [...state.flats].filter((flat) => !isFlatActive(flat)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function findFlatByCode(state: LedgerState, raw: string): Flat | null {
  const code = normalizeFlatCode(raw);
  if (!code) return null;
  return state.flats.find((flat) => (normalizeFlatCode(flat.name) ?? flat.name) === code) ?? null;
}

export function flatHasHistory(state: LedgerState, flatId: string): boolean {
  if (state.stays.some((item) => item.flatId === flatId)) return true;
  if (state.rentEntries.some((item) => item.flatId === flatId)) return true;
  if (state.payments.some((item) => item.flatId === flatId)) return true;
  if (state.expenses.some((item) => item.flatId === flatId)) return true;
  if (state.security.some((item) => item.flatId === flatId)) return true;
  if (state.discounts.some((item) => item.flatId === flatId)) return true;
  if (state.receipts.some((item) => item.flatId === flatId)) return true;
  return false;
}

export function defaultFlatName(state: LedgerState): string {
  return activeFlats(state)[0]?.name ?? "";
}

export function knownFlatNames(state: LedgerState): string[] {
  return state.flats.map((flat) => flat.name);
}

export function flatsForSelect(state: LedgerState, currentFlatId?: string | null): Flat[] {
  const active = activeFlats(state);
  if (!currentFlatId) return active;
  const current = state.flats.find((flat) => flat.id === currentFlatId);
  if (!current || active.some((flat) => flat.id === current.id)) return active;
  return [...active, current].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function flatsForChips(state: LedgerState, includeArchivedIds: string[] = []): Flat[] {
  const include = new Set(includeArchivedIds);
  return [...state.flats]
    .filter((flat) => isFlatActive(flat) || include.has(flat.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function flatsUsedInRange(state: LedgerState, from: Date, to: Date): string[] {
  const ids = new Set<string>();
  const inWindow = (iso: string) => {
    const date = new Date(iso);
    return date >= from && date <= to;
  };
  for (const stay of state.stays) {
    if (stay.voided) continue;
    if (inWindow(stay.checkIn) || inWindow(stay.checkOut)) ids.add(stay.flatId);
  }
  for (const item of state.rentEntries) {
    if (!item.voided && inWindow(item.occurredAt)) ids.add(item.flatId);
  }
  for (const item of state.payments) {
    if (!item.voided && item.flatId && inWindow(item.receivedAt)) ids.add(item.flatId);
  }
  for (const item of state.expenses) {
    if (!item.voided && item.flatId && inWindow(item.spentAt)) ids.add(item.flatId);
  }
  return [...ids];
}
