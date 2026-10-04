export type PaymentMethod =
  | "CASH"
  | "EASYPAISA"
  | "BANK_TRANSFER"
  | "JAZZCASH"
  | "OTHER";

export type ExpenseCategory =
  | "CLEANING"
  | "GROCERIES"
  | "ELECTRICITY"
  | "GAS"
  | "INTERNET"
  | "MAINTENANCE"
  | "PLUMBING"
  | "REPAIRS"
  | "FURNITURE"
  | "BEDSHEETS_LINEN"
  | "SUPPLIES"
  | "STAFF"
  | "COMMISSION"
  | "WATER"
  | "OTHER";

export type DateFilterPreset = "today" | "7days" | "month" | "custom" | "all";

export type DateRange = {
  from: Date;
  to: Date;
};

export type Flat = {
  id: string;
  name: string;
  displayName: string | null;
  sortOrder: number;
  active: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Client = {
  id: string;
  createdAt: string;
  name: string;
  phone: string | null;
  phoneMissing: boolean;
  notes: string | null;
};

export type Stay = {
  id: string;
  createdAt: string;
  flatId: string;
  clientId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  notifyEnabled: boolean;
  activePending: boolean;
  importKey: string | null;
  voided?: boolean;
};

export type RentEntry = {
  id: string;
  stayId: string;
  clientId: string;
  flatId: string;
  amount: number;
  occurredAt: string;
  note: string | null;
  voided?: boolean;
};

export type Receiver = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
};

export type Payment = {
  id: string;
  createdAt: string;
  stayId: string | null;
  clientId: string;
  flatId: string | null;
  amount: number;
  method: PaymentMethod;
  receivedAt: string;
  notes: string | null;
  receivedById: string | null;
  voided?: boolean;
};

export type Expense = {
  id: string;
  createdAt: string;
  flatId: string | null;
  amount: number;
  category: ExpenseCategory;
  description: string;
  method: PaymentMethod;
  spentAt: string;
  notes: string | null;
  voided?: boolean;
};

export type SecurityTransaction = {
  id: string;
  clientId: string;
  stayId: string | null;
  flatId: string | null;
  kind: "RECEIVED" | "ADJUSTED_TO_RENT";
  amount: number;
  occurredAt: string;
  notes: string | null;
  voided?: boolean;
};

export type Discount = {
  id: string;
  stayId: string;
  clientId: string;
  flatId: string;
  amount: number;
  occurredAt: string;
  note: string | null;
  voided?: boolean;
};

export type Withdrawal = {
  id: string;
  amount: number;
  occurredAt: string;
  note: string | null;
  voided?: boolean;
};

export type ActivityLog = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
};

export type AuditLog = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string;
  originalValue: string | null;
  newValue: string | null;
  reason: string | null;
};

export type MigrationStatus = "NEEDS_REVIEW" | "CONFIRMED" | "IGNORED";
export type PendingDecision = "UNDECIDED" | "STILL_PENDING" | "ALREADY_PAID" | "IGNORE";

export type MigrationRecord = {
  id: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
  sourceText: string;
  flatName: string;
  customer: string | null;
  date: string | null;
  month: string | null;
  proposedType: string;
  amount: number | null;
  reason: string;
  status: MigrationStatus;
  pendingDecision: PendingDecision;
  stayId: string | null;
  currentInterpretation: string;
  previousInterpretation: string | null;
  lastQuickUpdate: string | null;
  originalValue: string | null;
  correctionText: string | null;
  importedAt: string | null;
  updatedAt: string | null;
};

export type ReminderSilence = {
  clientId: string;
  cycleDate: string;
};

export type ReceiptStatus = "GENERATED" | "UPDATED" | "VOID";

export type Receipt = {
  id: string;
  receiptNumber: string;
  paymentId: string;
  clientId: string;
  stayId: string;
  flatId: string;
  paymentDate: string;
  amountReceived: number;
  status: ReceiptStatus;
  createdAt: string;
  updatedAt: string;
  sharedAt: string | null;
  shareAttemptedAt: string | null;
  version: number;
  voidedAt: string | null;
};

export type MonthlyReportStatus = "FINAL" | "UPDATED" | "LIVE";

export type MonthlyReportRecord = {
  id: string;
  year: number;
  month: number;
  periodStart: string;
  periodEnd: string;
  businessTotal: number;
  receivedTotal: number;
  expensesTotal: number;
  endingPendingTotal: number;
  carriedForwardPending: number;
  newPendingGenerated: number;
  pendingCollected: number;
  closingOutstanding: number;
  totalStays: number;
  totalNights: number;
  totalClients: number;
  status: MonthlyReportStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
};

export type LedgerState = {
  flats: Flat[];
  receivers: Receiver[];
  clients: Client[];
  stays: Stay[];
  rentEntries: RentEntry[];
  payments: Payment[];
  expenses: Expense[];
  security: SecurityTransaction[];
  discounts: Discount[];
  withdrawals: Withdrawal[];
  reviews: MigrationRecord[];
  activityLogs: ActivityLog[];
  auditLogs: AuditLog[];
  reminderSilences: ReminderSilence[];
  nightSummaryDates: string[];
  monthlyReports: MonthlyReportRecord[];
  receipts: Receipt[];
};

export type DashboardTotals = {
  business: number;
  received: number;
  pending: number;
  expenses: number;
  carriedForward: number;
};

export type AttentionItem = {
  stayId: string;
  clientId: string;
  clientName: string;
  phone: string | null;
  remaining: number;
  flat: string;
  checkOut: string;
};

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "EASYPAISA", label: "Easypaisa" },
  { value: "BANK_TRANSFER", label: "Bank" },
  { value: "JAZZCASH", label: "JazzCash" },
  { value: "OTHER", label: "Other" },
];

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "CLEANING", label: "Cleaning" },
  { value: "GROCERIES", label: "Groceries" },
  { value: "ELECTRICITY", label: "Electricity" },
  { value: "GAS", label: "Gas" },
  { value: "INTERNET", label: "Internet" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "PLUMBING", label: "Plumbing" },
  { value: "REPAIRS", label: "Repairs" },
  { value: "FURNITURE", label: "Furniture" },
  { value: "BEDSHEETS_LINEN", label: "Bedsheets / Linen" },
  { value: "SUPPLIES", label: "Supplies" },
  { value: "STAFF", label: "Staff" },
  { value: "COMMISSION", label: "Commission" },
  { value: "WATER", label: "Water" },
  { value: "OTHER", label: "Other" },
];

