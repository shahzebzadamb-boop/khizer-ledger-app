import { seedFlat, SEED_FLAT_NAMES } from "@/lib/flats";
import { DEFAULT_RECEIVERS } from "@/lib/receivers";
import type { LedgerState } from "@/types";

export function emptyLedgerState(): LedgerState {
  return {
    flats: SEED_FLAT_NAMES.map((name, index) => seedFlat(name, index)),
    receivers: DEFAULT_RECEIVERS.map((item) => ({ ...item })),
    clients: [],
    stays: [],
    rentEntries: [],
    payments: [],
    expenses: [],
    security: [],
    discounts: [],
    withdrawals: [],
    reviews: [],
    activityLogs: [],
    auditLogs: [],
    reminderSilences: [],
    nightSummaryDates: [],
    monthlyReports: [],
    receipts: [],
  };
}
