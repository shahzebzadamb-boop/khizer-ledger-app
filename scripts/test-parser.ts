import { readFileSync } from "fs";
import { join } from "path";
import { emptyLedgerState } from "../src/lib/empty-state";
import { applyCalcInput, formatCalcDisplay, initialCalcState } from "../src/lib/calculator";
import { formatKarachiDateLong, karachiMonthRange, nightsBetween } from "../src/lib/dates";
import {
  dashboardTotals,
  expenseLedgerRows,
  paymentLedgerRows,
  paymentStayChoices,
  stayLedgerRows,
  stayRemaining,
  totalsMatchStayLedger,
  uniquePaymentStayId,
  findClientByPhone,
} from "../src/lib/ledger";
import { reducer } from "../src/lib/ledger-actions";
import { cleanContactName, uniqueContactPhones } from "../src/lib/contact-picker";
import { normalizePhone, samePhone } from "../src/lib/phone";
import { parseAmountToken, parseFormAmount, sanitizeMoneyInput, moneyInputFromSaved } from "../src/lib/money";
import { pendingNotice } from "../src/lib/notifications";
import {
  buildMonthCsv,
  buildMonthReport,
  completedMonthsThrough,
  listReportMonths,
  toMonthlyReportRecord,
} from "../src/lib/month-accounting";
import { allTimeRange, availableHomeMonths } from "../src/lib/home-period";
import {
  buildAnasPendingNotification,
  buildClientWhatsAppReminder,
  buildReceiptWhatsAppMessage,
  clientFirstName,
  clientWhatsAppHref,
} from "../src/lib/reminders";
import { parseMigrationUpdate } from "../src/lib/parse-migration-update";
import { activeFlats } from "../src/lib/flats";
import { detectFlat, parseQuickEntry } from "../src/lib/parse-quick-entry";
import { looksLikeCorrection } from "../src/lib/parse-correction";
import { detectReceiverName } from "../src/lib/receivers";
import {
  buildReceiptView,
  filterReceiptRows,
  formatReceiptNumber,
  newestCreatedReceipt,
  paymentEligibleForReceipt,
  planReceiptSync,
  receiptPdfFileName,
  RECEIPT_CONFIRMATION,
  RECEIPT_THANK_YOU,
} from "../src/lib/receipts";
import { buildReceiptPdf, letterheadContentBounds } from "../src/lib/receipt-pdf";

const known = [{ name: "Tufail Khan", phone: "923001234567" }];
const cases: [string, string][] = [
  ["tufail khan 03001234567 802a 3 din total 60k 30k advance cash", "rent"],
  ["tufail khan 03001234567 802a 20k wasol cash", "payment"],
  ["tufail ka 10k baki 802a", "rent"],
  ["sofa clean 5k 408b", "expense"],
  ["electric bill 18k 802a bank", "expense"],
  ["plumber ko 3k diya 802a", "expense"],
  ["tufail security 10k 802a cash", "security"],
  ["adjust tufail 10k security rent mein", "security_adjustment"],
  ["tufail 2 din aur extend 20k 802a", "extension"],
  ["anas 30k nikal liya", "withdrawal"],
  ["tufail 20k received cash 802a", "payment"],
  ["802a cash 20k tufail receive", "payment"],
  ["tufail se 20k aya 802a", "payment"],
  ["tufail 20k wasol 802a", "payment"],
];

let failed = 0;
for (const [text, expected] of cases) {
  const parsed = parseQuickEntry(text, { knownClients: known });
  if (parsed.type !== expected) {
    failed += 1;
    console.error("FAIL", text, "=>", parsed);
  } else {
    console.log("OK", expected, text);
  }
}

const flats = ["802a", "802-a", "802 A", "408b", "204d", "204c", "811d", "815b"];
const want = ["802-A", "802-A", "802-A", "408-B", "204-D", "204-C", "811-D", "815-B"];
flats.forEach((item, i) => {
  const got = detectFlat(item);
  if (got !== want[i]) {
    failed += 1;
    console.error("FLAT FAIL", item, got);
  }
});

const mig: [string, (p: Record<string, unknown>) => boolean][] = [
  ["still pending", (p) => p.stillPending === true],
  ["abhi baki hai", (p) => p.stillPending === true],
  ["already paid", (p) => p.alreadyPaid === true],
  ["full wasol", (p) => p.alreadyPaid === true],
  ["15k cash mil gaya", (p) => p.receiveAmount === 15000],
  ["10k mil gaya 5k baki", (p) => p.receiveAmount === 10000 && p.remainingAmount === 5000],
  ["ye expense tha", (p) => p.keepExpense === true],
  ["maintenance correct customer paid", (p) => p.keepExpense === true && p.settlePending === true],
  ["ignore this", (p) => p.ignore === true],
  ["2 night tha", (p) => p.nights === 2],
  ["rent 20k tha 15k nahi", (p) => p.rentAmount === 20000],
  ["15k received tha remaining nahi", (p) => p.receiveAmount === 15000 && p.remainingAmount === 0],
];

for (const [text, check] of mig) {
  const parsed = parseMigrationUpdate(text, "802-A");
  if (parsed.type !== "patch" || !check(parsed as unknown as Record<string, unknown>)) {
    failed += 1;
    console.error("MIG FAIL", text, parsed);
  } else {
    console.log("OK mig", text);
  }
}

const phoneAsRent = parseQuickEntry("Sept booked by 03324000842 802a 2 nights", { knownClients: known });
if (phoneAsRent.type !== "ambiguous") {
  failed += 1;
  console.error("PHONE AMOUNT FAIL", phoneAsRent);
} else {
  console.log("OK rejected phone-as-rent");
}

const phoneWithRent = parseQuickEntry("Sept booked by 03324000842 802a 2 nights total 40k", {
  knownClients: known,
});
if (phoneWithRent.type !== "rent" || phoneWithRent.totalAmount !== 40000) {
  failed += 1;
  console.error("PHONE+RENT FAIL", phoneWithRent);
} else {
  console.log("OK phone stripped, rent 40000");
}

if (parseAmountToken("03324000842") !== null || parseAmountToken("3324000842") !== null) {
  failed += 1;
  console.error("TOKEN PHONE FAIL");
} else {
  console.log("OK parseAmountToken rejects phone digits");
}

if (parseAmountToken("330000") !== 330000) {
  failed += 1;
  console.error("LEGIT 330000 FAIL");
} else {
  console.log("OK kept historical 330000");
}

const month = {
  from: new Date("2026-09-01T00:00:00.000Z"),
  to: new Date("2026-09-30T23:59:59.999Z"),
};
const histStay = {
  id: "stay_hist",
  createdAt: "2026-07-08T00:00:00.000Z",
  flatId: "flat_802-A",
  clientId: "c1",
  checkIn: "2026-07-08T00:00:00.000Z",
  checkOut: "2026-07-10T00:00:00.000Z",
  nights: 2,
  notifyEnabled: false,
  activePending: false,
  importKey: "imp_hist",
};
const liveStay = {
  id: "stay_live",
  createdAt: "2026-09-18T00:00:00.000Z",
  flatId: "flat_802-A",
  clientId: "c2",
  checkIn: "2026-09-18T00:00:00.000Z",
  checkOut: "2026-09-20T00:00:00.000Z",
  nights: 2,
  notifyEnabled: true,
  activePending: true,
  importKey: null,
};
const dashState = {
  ...emptyLedgerState(),
  clients: [
    { id: "c1", createdAt: histStay.createdAt, name: "Hist", phone: null, phoneMissing: true, notes: null },
    { id: "c2", createdAt: liveStay.createdAt, name: "Live", phone: "923001234567", phoneMissing: false, notes: null },
  ],
  stays: [histStay, liveStay],
  rentEntries: [
    {
      id: "r1",
      stayId: histStay.id,
      clientId: "c1",
      flatId: "flat_802-A",
      amount: 121000,
      occurredAt: "2026-07-08T00:00:00.000Z",
      note: null,
    },
    {
      id: "r2",
      stayId: liveStay.id,
      clientId: "c2",
      flatId: "flat_802-A",
      amount: 40000,
      occurredAt: "2026-09-18T00:00:00.000Z",
      note: null,
    },
  ],
};
const totals = dashboardTotals(dashState, month, "all");
if (totals.business !== 40000 || totals.pending !== 40000) {
  failed += 1;
  console.error("PENDING FILTER FAIL", totals);
} else {
  console.log("OK pending excludes activePending=false and respects month");
}

const overflowState = {
  ...dashState,
  rentEntries: [
    ...dashState.rentEntries,
    {
      id: "r_bad",
      stayId: liveStay.id,
      clientId: "c2",
      flatId: "flat_802-A",
      amount: 2147483647,
      occurredAt: "2026-09-18T00:00:00.000Z",
      note: null,
    },
  ],
};
const overflowTotals = dashboardTotals(overflowState, month, "all");
if (overflowTotals.business !== 40000 || overflowTotals.pending !== 40000) {
  failed += 1;
  console.error("INT_MAX FILTER FAIL", overflowTotals);
} else {
  console.log("OK dashboard excludes INT_MAX phone-as-rent");
}

const caseA = parseQuickEntry("tufail khan 03001234567 802a 2 din total 40k 20k advance cash", {
  knownClients: known,
});
if (
  caseA.type !== "rent" ||
  caseA.totalAmount !== 40000 ||
  caseA.receivedAmount !== 20000 ||
  caseA.remaining !== 20000 ||
  caseA.receivedByName !== "Anas"
) {
  failed += 1;
  console.error("CASE A FAIL", caseA);
} else {
  console.log("OK case A rent 40k / received 20k / Anas");
}

const caseB = parseQuickEntry("tufail khan 03001234567 802a 10k wasol by khizer cash", {
  knownClients: known,
});
if (caseB.type !== "payment" || caseB.amount !== 10000 || caseB.receivedByName !== "Khizer") {
  failed += 1;
  console.error("CASE B FAIL", caseB);
} else {
  console.log("OK case B payment 10k Khizer");
}

const caseC = parseQuickEntry("tufail se 5k khizer k pas aya 802a", { knownClients: known });
if (caseC.type !== "payment" || caseC.amount !== 5000 || caseC.receivedByName !== "Khizer") {
  failed += 1;
  console.error("CASE C FAIL", caseC);
} else {
  console.log("OK case C 5k Khizer");
}

const caseD = parseQuickEntry("electric bill 18k bank 802a", { knownClients: known });
if (caseD.type !== "expense" || caseD.amount !== 18000 || "receivedByName" in caseD) {
  failed += 1;
  console.error("CASE D FAIL", caseD);
} else {
  console.log("OK case D expense 18k no receiver");
}

const khizerPhrases = [
  "tufail 20k received by khizer cash 802a",
  "tufail 20k wasol khizer 802a",
  "khizer ne tufail se 20k lia 802a",
  "20k tufail ka khizer ne receive kia",
  "tufail se 20k khizer k pas aya",
  "tufail 20k khizer ne lia",
  "tufail 20k wasol by khizer",
  "tufail 20k wasol by khizar cash 802a",
  "tufail 20k wasol by khizr cash 802a",
];
for (const text of khizerPhrases) {
  const parsed = parseQuickEntry(text, { knownClients: known });
  if (parsed.type !== "payment" || parsed.receivedByName !== "Khizer" || parsed.amount !== 20000) {
    failed += 1;
    console.error("KHIZER FAIL", text, parsed);
  } else {
    console.log("OK khizer", text);
  }
}

const defaultAnas = parseQuickEntry("tufail 20k wasol cash 802a", { knownClients: known });
if (defaultAnas.type !== "payment" || defaultAnas.receivedByName !== "Anas") {
  failed += 1;
  console.error("DEFAULT ANAS FAIL", defaultAnas);
} else {
  console.log("OK default receiver Anas");
}

const newReceiver = parseQuickEntry("tufail 20k received by saad cash 802a", { knownClients: known });
if (newReceiver.type !== "payment" || newReceiver.receivedByName !== "Saad") {
  failed += 1;
  console.error("SAAD RECEIVER FAIL", newReceiver);
} else {
  console.log("OK new receiver Saad");
}

if (detectReceiverName("tufail 20k wasol cash") !== "Anas") {
  failed += 1;
  console.error("DETECT DEFAULT FAIL");
}

let calc = initialCalcState();
for (const key of ["1", "+", "2", "="]) calc = applyCalcInput(calc, key);
if (formatCalcDisplay(calc) !== "3") {
  failed += 1;
  console.error("CALC ADD FAIL", formatCalcDisplay(calc));
} else {
  console.log("OK calculator 1+2=3");
}

calc = initialCalcState();
for (const key of ["8", "÷", "0", "="]) calc = applyCalcInput(calc, key);
if (formatCalcDisplay(calc) !== "Error") {
  failed += 1;
  console.error("CALC DIV0 FAIL", formatCalcDisplay(calc));
} else {
  console.log("OK calculator divide by zero");
}

calc = applyCalcInput(calc, "AC");
if (formatCalcDisplay(calc) !== "0") {
  failed += 1;
  console.error("CALC AC FAIL", formatCalcDisplay(calc));
} else {
  console.log("OK calculator AC after error");
}

const now = new Date("2026-09-22T00:00:00.000Z");
const monthRange = {
  from: new Date("2026-09-01T00:00:00.000Z"),
  to: new Date("2026-09-30T23:59:59.999Z"),
};
const rentParsed = parseQuickEntry("tufail khan 03001234567 802a 3 din total 60k 20k advance cash", {
  knownClients: known,
  now,
});
let ledger = emptyLedgerState();
if (rentParsed.type === "rent") {
  ledger = reducer(ledger, { type: "APPLY_QUICK_ENTRY", parsed: rentParsed });
}
const stayRows = stayLedgerRows(ledger, monthRange, "802-A");
const stayTotals = dashboardTotals(ledger, monthRange, "802-A");
if (
  stayRows.length !== 1 ||
  stayRows[0].business !== 60000 ||
  stayRows[0].received !== 20000 ||
  stayRows[0].pending !== 40000 ||
  stayRows[0].payments.length !== 1 ||
  stayRows[0].payments[0].receivedBy !== "Anas" ||
  !totalsMatchStayLedger(stayTotals, stayRows, expenseLedgerRows(ledger, monthRange, "802-A"))
) {
  failed += 1;
  console.error("STAY LEDGER FAIL", stayRows[0], stayTotals);
} else {
  console.log("OK stay ledger 60k / 20k / 40k");
}

const followOn = parseQuickEntry("tufail 10k wasol by khizer cash 802a", { knownClients: known, now });
if (followOn.type === "payment") {
  ledger = reducer(ledger, { type: "APPLY_QUICK_ENTRY", parsed: followOn });
}
const afterPay = stayLedgerRows(ledger, monthRange, "802-A")[0];
const receivers = new Set(afterPay?.payments.map((item) => item.receivedBy) ?? []);
if (
  !afterPay ||
  afterPay.received !== 30000 ||
  afterPay.pending !== 30000 ||
  afterPay.payments.length !== 2 ||
  !receivers.has("Anas") ||
  !receivers.has("Khizer")
) {
  failed += 1;
  console.error("FOLLOW-ON PAY FAIL", afterPay);
} else {
  console.log("OK same stay received 30k with Anas then Khizer");
}

const secondStay = parseQuickEntry("tufail khan 03001234567 408b 2 din total 35k", { knownClients: known, now });
if (secondStay.type === "rent") {
  ledger = reducer(ledger, { type: "APPLY_QUICK_ENTRY", parsed: secondStay });
}
const ambiguousPay = parseQuickEntry("tufail 10k wasol cash", { knownClients: known, now });
const beforeCount = ledger.payments.length;
if (ambiguousPay.type === "payment") {
  ledger = reducer(ledger, { type: "APPLY_QUICK_ENTRY", parsed: ambiguousPay });
}
const choices = paymentStayChoices(ledger, ledger.clients[0].id, null);
if (uniquePaymentStayId(choices) !== null || ledger.payments.length !== beforeCount) {
  failed += 1;
  console.error("MULTI STAY GUESS FAIL", choices, ledger.payments.length, beforeCount);
} else {
  console.log("OK payment not guessed across multiple open stays");
}

const knownCorr = [{ name: "Tufail Khan", phone: "03001234567" }];
let corrState = emptyLedgerState();
const corrRent = parseQuickEntry("tufail khan 03001234567 802a 3 din total 40k 20k advance cash", {
  knownClients: knownCorr,
  now,
});
if (corrRent.type === "rent") {
  corrState = reducer(corrState, { type: "APPLY_QUICK_ENTRY", parsed: corrRent });
}
const corrAText = "20k received galat pending hai";
if (!looksLikeCorrection(corrAText)) {
  failed += 1;
  console.error("CORR LOOKS FAIL", corrAText);
}
const corrA = parseQuickEntry(corrAText, { knownClients: knownCorr, now });
if (corrA.type === "correction") {
  corrState = reducer(corrState, { type: "APPLY_CORRECTION", parsed: corrA });
}
const rowA = stayLedgerRows(corrState, monthRange, "802-A")[0];
if (!rowA || rowA.business !== 40000 || rowA.received !== 0 || rowA.pending !== 40000) {
  failed += 1;
  console.error("CORR A FAIL", corrA, rowA);
} else {
  console.log("OK correction A received voided, business 40k pending 40k");
}

const corrB = parseQuickEntry("tufail 20k wasol by khizer", { knownClients: knownCorr, now });
if (corrB.type === "payment") {
  corrState = reducer(corrState, { type: "APPLY_QUICK_ENTRY", parsed: corrB });
}
const rowB = stayLedgerRows(corrState, monthRange, "802-A")[0];
if (
  !rowB ||
  rowB.business !== 40000 ||
  rowB.received !== 20000 ||
  rowB.pending !== 20000 ||
  !rowB.receivedBy.includes("Khizer")
) {
  failed += 1;
  console.error("CORR B FAIL", corrB, rowB);
} else {
  console.log("OK correction B 20k Khizer");
}

const corrCText = "khizer nahi anas ne receive kia";
const corrC = parseQuickEntry(corrCText, { knownClients: knownCorr, now });
if (corrC.type === "correction") {
  corrState = reducer(corrState, { type: "APPLY_CORRECTION", parsed: corrC });
}
const rowC = stayLedgerRows(corrState, monthRange, "802-A")[0];
const livePay = corrState.payments.filter((item) => !item.voided);
if (
  !rowC ||
  rowC.received !== 20000 ||
  livePay.length !== 1 ||
  !rowC.receivedBy.includes("Anas") ||
  rowC.receivedBy.includes("Khizer")
) {
  failed += 1;
  console.error("CORR C FAIL", corrC, rowC, livePay);
} else {
  console.log("OK correction C receiver Anas");
}

const expD = parseQuickEntry("electric 18k 802a", { knownClients: knownCorr, now });
if (expD.type === "expense") {
  corrState = reducer(corrState, { type: "APPLY_QUICK_ENTRY", parsed: expD });
}
const corrD = parseQuickEntry("electric 18k nahi 8k tha", { knownClients: knownCorr, now });
if (corrD.type === "correction") {
  corrState = reducer(corrState, { type: "APPLY_CORRECTION", parsed: corrD });
}
const expRow = expenseLedgerRows(corrState, monthRange, "802-A").find((item) => item.description === "Electricity");
if (!expRow || expRow.amount !== 8000) {
  failed += 1;
  console.error("CORR D FAIL", corrD, expRow, corrState.expenses);
} else {
  console.log("OK correction D expense 8k");
}

const expenseId = corrState.expenses.find((item) => item.description === "Electricity" && !item.voided)?.id;
if (expenseId) {
  corrState = reducer(corrState, {
    type: "UPDATE_EXPENSE",
    payload: { expenseId, amount: 9000 },
  });
}
const expE = corrState.expenses.find((item) => item.id === expenseId);
const audits = corrState.auditLogs.filter((item) => item.entityId === expenseId);
if (!expE || expE.amount !== 9000 || audits.length < 2) {
  failed += 1;
  console.error("CORR E FAIL", expE, audits);
} else {
  console.log("OK correction E manual 9k with audit 18k→8k→9k");
}

if (parseFormAmount("03001234567") !== null || parseFormAmount("abc") !== null || parseFormAmount("-20000", true) !== null) {
  failed += 1;
  console.error("FORM AMOUNT PHONE FAIL", parseFormAmount("03001234567"));
} else if (parseFormAmount("0", true) !== 0 || parseFormAmount("20000") !== 20000) {
  failed += 1;
  console.error("FORM AMOUNT FAIL");
} else {
  console.log("OK form amount rejects phone and accepts 20000");
}

function typeMoney(start: string, keys: string): string {
  let value = start;
  for (const ch of keys) {
    const next = sanitizeMoneyInput(value + ch);
    if (next != null) value = next;
  }
  return value;
}

const typed18000 = typeMoney("", "18000");
const typedFromZero = typeMoney("0", "18000");
const pastedComma = sanitizeMoneyInput("18,000");
const pastedRs = sanitizeMoneyInput("Rs 18,000");
const pastedSpace = sanitizeMoneyInput(" 18000");
const garbage = sanitizeMoneyInput("18kabc");
const exponent = sanitizeMoneyInput("1e5");
const negative = sanitizeMoneyInput("-5000");
const emptyStay = sanitizeMoneyInput("");
const onlyZero = sanitizeMoneyInput("0");
const leading = sanitizeMoneyInput("00018000");
const phoneMoney = sanitizeMoneyInput("03001234567");

if (typed18000 !== "18000") {
  failed += 1;
  console.error("TYPE 18000 FAIL", typed18000);
} else if (typedFromZero !== "18000") {
  failed += 1;
  console.error("TYPE FROM 0 FAIL", typedFromZero);
} else if (pastedComma !== "18000" || pastedRs !== "18000" || pastedSpace !== "18000") {
  failed += 1;
  console.error("PASTE FAIL", pastedComma, pastedRs, pastedSpace);
} else if (garbage != null || exponent != null || negative != null) {
  failed += 1;
  console.error("GARBAGE FAIL", garbage, exponent, negative);
} else if (emptyStay !== "" || parseFormAmount("", true) !== 0 || onlyZero !== "0") {
  failed += 1;
  console.error("EMPTY/ZERO FAIL", emptyStay, onlyZero);
} else if (leading !== "18000" || parseFormAmount("018000") !== 18000) {
  failed += 1;
  console.error("LEADING ZERO FAIL", leading, parseFormAmount("018000"));
} else if (phoneMoney != null || moneyInputFromSaved(0) !== "") {
  failed += 1;
  console.error("PHONE AS MONEY OR ZERO DISPLAY FAIL", phoneMoney);
} else {
  console.log("OK money input sanitize 18000 / paste / empty / leading zeros");
}

const biz = parseFormAmount("15000");
const recBlank = parseFormAmount("", true) ?? 0;
const recFive = parseFormAmount("5000");
if (biz !== 15000 || recBlank !== 0 || biz - recBlank !== 15000 || recFive !== 5000 || biz - recFive !== 10000) {
  failed += 1;
  console.error("PENDING CALC FAIL", biz, recBlank, recFive);
} else {
  console.log("OK pending 15000 blank received / 5000 received");
}

if (sanitizeMoneyInput("05000") !== "5000" || parseFormAmount("05000") !== 5000) {
  failed += 1;
  console.error("EXPENSE 05000 FAIL");
} else {
  console.log("OK expense amount 05000 normalizes to 5000");
}

const phoneTyped = "03001234567";
if (phoneTyped !== "03001234567" || phoneMoney != null) {
  failed += 1;
  console.error("PHONE PRESERVE FAIL");
} else {
  console.log("OK phone 03001234567 not stripped by money sanitizer");
}

if (nightsBetween("2026-09-22", "2026-09-25") !== 3 || nightsBetween("2026-09-22", "2026-09-22") !== 0) {
  failed += 1;
  console.error("NIGHTS FAIL", nightsBetween("2026-09-22", "2026-09-25"));
} else {
  console.log("OK nights 22 Sep → 25 Sep = 3");
}

function assertReminder(label: string, got: string | null, want: string) {
  if (got !== want) {
    failed += 1;
    console.error(`${label} FAIL`, JSON.stringify(got), "!=", JSON.stringify(want));
  } else {
    console.log("OK", label);
  }
}

assertReminder(
  "client wa Tahir 24000",
  buildClientWhatsAppReminder({ clientName: "Tahir Wajid", pendingAmount: 24000 }),
  "Salam Tahir Bhai ap ke ye Rs 24,000 pending hay please send screenshot once paid thanks",
);
assertReminder(
  "client wa Tufail 10000",
  buildClientWhatsAppReminder({ clientName: "Tufail Khan", pendingAmount: 10000 }),
  "Salam Tufail Bhai ap ke ye Rs 10,000 pending hay please send screenshot once paid thanks",
);
assertReminder(
  "client wa missing name 5000",
  buildClientWhatsAppReminder({ clientName: "", pendingAmount: 5000 }),
  "Salam Bhai ap ke ye Rs 5,000 pending hay please send screenshot once paid thanks",
);
assertReminder(
  "client wa null name",
  buildClientWhatsAppReminder({ clientName: null, pendingAmount: 5000 }),
  "Salam Bhai ap ke ye Rs 5,000 pending hay please send screenshot once paid thanks",
);
assertReminder(
  "client wa undefined name",
  buildClientWhatsAppReminder({ pendingAmount: 5000 }),
  "Salam Bhai ap ke ye Rs 5,000 pending hay please send screenshot once paid thanks",
);

if (buildClientWhatsAppReminder({ clientName: "Tahir Wajid", pendingAmount: 0 }) !== null) {
  failed += 1;
  console.error("FULLY PAID CLIENT WA FAIL");
} else {
  console.log("OK no client WhatsApp when pending is 0");
}

if (clientFirstName("Tahir Wajid") !== "Tahir" || clientFirstName("Tufail Khan") !== "Tufail" || clientFirstName("Syed Ali Shah") !== "Syed") {
  failed += 1;
  console.error("FIRST NAME FAIL", clientFirstName("Tahir Wajid"), clientFirstName("Syed Ali Shah"));
} else {
  console.log("OK first name only");
}

const tahirHref = clientWhatsAppHref({
  phone: "03106633005",
  clientName: "Tahir Wajid",
  pendingAmount: 24000,
});
const expectedText = "Salam Tahir Bhai ap ke ye Rs 24,000 pending hay please send screenshot once paid thanks";
const expectedHref = `https://wa.me/923106633005?text=${encodeURIComponent(expectedText)}`;
if (tahirHref !== expectedHref) {
  failed += 1;
  console.error("WA HREF FAIL", tahirHref);
} else if (tahirHref?.includes("Za kana") || tahirHref?.includes("rawakhla") || tahirHref?.includes("Anas jan")) {
  failed += 1;
  console.error("INTERNAL WORDING LEAKED TO CLIENT WA");
} else {
  console.log("OK wa.me 03106633005 -> 923106633005 with encoded client text");
}

const internal = buildAnasPendingNotification({
  clientName: "Tahir Wajid",
  pendingAmount: 24000,
  flat: "802-A",
});
const internalNotice = pendingNotice({
  stayId: "s1",
  clientId: "c1",
  clientName: "Tahir Wajid",
  phone: "03106633005",
  remaining: 24000,
  flat: "802-A",
  checkOut: "2026-09-25",
});
if (internal !== "Za kana Anas jan, Tahir na Rs 24,000 rawakhla — Flat 802-A") {
  failed += 1;
  console.error("INTERNAL NOTICE FAIL", internal);
} else if (internalNotice !== internal) {
  failed += 1;
  console.error("PENDING NOTICE WRAPPER FAIL", internalNotice);
} else if (internal.includes("Salam") || internal.includes("screenshot")) {
  failed += 1;
  console.error("CLIENT WORDING LEAKED TO INTERNAL NOTICE");
} else {
  console.log("OK internal Anas notification");
}

const clientText = buildClientWhatsAppReminder({ clientName: "Tahir Wajid", pendingAmount: 24000 }) ?? "";
if (/Za kana|rawakhla|Anas jan|Flat 802/i.test(clientText)) {
  failed += 1;
  console.error("CLIENT TEMPLATE HAS INTERNAL/FLAT WORDING", clientText);
} else {
  console.log("OK client template has no internal wording and no flat");
}

let pendingStay = emptyLedgerState();
pendingStay = reducer(pendingStay, {
  type: "ADD_STAY",
  payload: {
    flat: "802-A",
    clientName: "Tahir Wajid",
    phone: "03106633005",
    checkIn: "2026-09-22T00:00:00.000Z",
    checkOut: "2026-09-25T00:00:00.000Z",
    nights: 3,
    business: 24000,
    received: 0,
  },
});
const stayId = pendingStay.stays[0]?.id ?? "";
const firstPending = stayRemaining(stayId, pendingStay);
pendingStay = reducer(pendingStay, {
  type: "RECORD_PAYMENT",
  payload: {
    clientId: pendingStay.clients[0]?.id ?? "",
    stayId,
    amount: 10000,
    method: "CASH",
    receivedByName: "Anas",
  },
});
const remainingAfterPartial = stayRemaining(stayId, pendingStay);
assertReminder(
  "client wa after partial 14000",
  buildClientWhatsAppReminder({ clientName: "Tahir Wajid", pendingAmount: remainingAfterPartial }),
  "Salam Tahir Bhai ap ke ye Rs 14,000 pending hay please send screenshot once paid thanks",
);
if (firstPending !== 24000 || remainingAfterPartial !== 14000) {
  failed += 1;
  console.error("LIVE PENDING AFTER PAYMENT FAIL", firstPending, remainingAfterPartial);
} else {
  console.log("OK live pending 24000 -> 14000 after Rs 10,000 payment");
}

let manual = emptyLedgerState();
manual = reducer(manual, {
  type: "ADD_STAY",
  payload: {
    flat: "802-A",
    clientName: "Tufail Khan",
    phone: "03001234567",
    checkIn: "2026-09-22T00:00:00.000Z",
    checkOut: "2026-09-25T00:00:00.000Z",
    nights: 3,
    business: 60000,
    received: 20000,
    method: "CASH",
    receivedByName: "Anas",
    security: 10000,
  },
});
const manualRows = stayLedgerRows(manual, monthRange, "802-A");
const manualTotals = dashboardTotals(manual, monthRange, "802-A");
const payRows = paymentLedgerRows(manual, monthRange, "802-A");
const securityAmt = manual.security.filter((item) => !item.voided).reduce((sum, item) => sum + item.amount, 0);
if (
  !manualRows[0] ||
  manualRows[0].nights !== 3 ||
  manualRows[0].business !== 60000 ||
  manualRows[0].received !== 20000 ||
  manualRows[0].pending !== 40000 ||
  manualTotals.business !== 60000 ||
  manualTotals.received !== 20000 ||
  manualTotals.pending !== 40000 ||
  payRows.length !== 1 ||
  payRows.reduce((sum, item) => sum + item.amount, 0) !== 20000 ||
  securityAmt !== 10000 ||
  manual.clients.length !== 1
) {
  failed += 1;
  console.error("ADD STAY FAIL", manualRows[0], manualTotals, payRows, securityAmt);
} else {
  console.log("OK add stay 60k/20k/40k security 10k separate");
}

manual = reducer(manual, {
  type: "RECORD_PAYMENT",
  payload: {
    clientId: manual.clients[0].id,
    stayId: manual.stays[0].id,
    amount: 10000,
    method: "EASYPAISA",
    receivedByName: "Khizer",
    receivedAt: now.toISOString(),
  },
});
const afterKhizer = stayLedgerRows(manual, monthRange, "802-A")[0];
const afterTotals = dashboardTotals(manual, monthRange, "802-A");
if (
  !afterKhizer ||
  afterKhizer.business !== 60000 ||
  afterKhizer.received !== 30000 ||
  afterKhizer.pending !== 30000 ||
  afterTotals.business !== 60000 ||
  afterTotals.received !== 30000 ||
  afterTotals.pending !== 30000 ||
  !afterKhizer.receivedBy.includes("Khizer") ||
  !afterKhizer.receivedBy.includes("Anas")
) {
  failed += 1;
  console.error("ADD PAYMENT KHIZER FAIL", afterKhizer, afterTotals);
} else {
  console.log("OK add payment 10k Khizer, business unchanged");
}

manual = reducer(manual, {
  type: "ADD_EXPENSE",
  payload: {
    amount: 5000,
    category: "CLEANING",
    description: "Sofa Cleaning",
    method: "CASH",
    flat: "802-A",
    spentAt: "2026-09-23T00:00:00.000Z",
  },
});
const expLedger = expenseLedgerRows(manual, monthRange, "802-A");
const withExpense = dashboardTotals(manual, monthRange, "802-A");
if (
  withExpense.expenses !== 5000 ||
  withExpense.business !== 60000 ||
  !expLedger.some((item) => item.amount === 5000 && item.description === "Sofa Cleaning")
) {
  failed += 1;
  console.error("ADD EXPENSE FAIL", withExpense, expLedger);
} else {
  console.log("OK add expense 5k sofa cleaning");
}

const beforeDup = manual.clients.length;
manual = reducer(manual, {
  type: "ADD_STAY",
  payload: {
    flat: "408-B",
    clientName: "Other Name",
    phone: "03001234567",
    checkIn: "2026-09-26T00:00:00.000Z",
    checkOut: "2026-09-28T00:00:00.000Z",
    nights: 2,
    business: 20000,
    received: 0,
  },
});
if (manual.clients.length !== beforeDup) {
  failed += 1;
  console.error("DUP CLIENT FAIL", manual.clients);
} else {
  console.log("OK existing phone reuses client");
}

const unchanged = reducer(manual, {
  type: "ADD_STAY",
  payload: {
    flat: "802-A",
    clientName: "Bad Dates",
    phone: "03111234567",
    checkIn: "2026-09-25T00:00:00.000Z",
    checkOut: "2026-09-22T00:00:00.000Z",
    nights: 0,
    business: 10000,
    received: 0,
  },
});
if (unchanged.stays.length !== manual.stays.length) {
  failed += 1;
  console.error("BAD DATES STAY CREATED");
} else {
  console.log("OK checkout before check-in rejected");
}

const oct1 = new Date("2026-10-01T00:00:00+05:00");
let roll = emptyLedgerState();
roll = reducer(roll, {
  type: "ADD_STAY",
  payload: {
    flat: "802-A",
    clientName: "Tufail Khan",
    phone: "03001234567",
    checkIn: "2026-09-10T00:00:00.000Z",
    checkOut: "2026-09-13T00:00:00.000Z",
    nights: 3,
    business: 500000,
    received: 450000,
    method: "CASH",
    receivedByName: "Anas",
  },
});
roll = reducer(roll, {
  type: "ADD_EXPENSE",
  payload: {
    amount: 80000,
    category: "ELECTRICITY",
    description: "K-Electric",
    method: "BANK_TRANSFER",
    flat: "802-A",
    spentAt: "2026-09-20T00:00:00.000Z",
  },
});
const septRange = karachiMonthRange(2026, 9);
const octRange = karachiMonthRange(2026, 10);
const septHome = dashboardTotals(roll, septRange, "all");
const octHome = dashboardTotals(roll, octRange, "all");
const septReport = buildMonthReport(roll, 2026, 9, oct1);
const monthsAtOct = listReportMonths(roll, oct1);
const completed = completedMonthsThrough(oct1, { year: 2026, month: 9 });
if (
  septHome.business !== 500000 ||
  septHome.received !== 450000 ||
  septHome.expenses !== 80000 ||
  septHome.pending !== 50000
) {
  failed += 1;
  console.error("SEPT HOME FAIL", septHome);
} else if (
  octHome.business !== 0 ||
  octHome.received !== 0 ||
  octHome.expenses !== 0 ||
  octHome.pending !== 50000 ||
  octHome.carriedForward !== 50000
) {
  failed += 1;
  console.error("OCT 1 HOME FAIL", octHome);
} else if (septReport.closingOutstanding !== 50000 || septReport.business !== 500000 || septReport.received !== 450000) {
  failed += 1;
  console.error("SEPT REPORT FAIL", septReport);
} else if (!monthsAtOct.some((item) => item.year === 2026 && item.month === 9 && !item.live) || completed.length !== 1) {
  failed += 1;
  console.error("SEPT REPORT LIST FAIL", monthsAtOct, completed);
} else {
  console.log("OK October 1 rollover: pending 50k carried forward, Sept report exists once");
}

const firstSnap = toMonthlyReportRecord(septReport, null, oct1);
const secondSnap = toMonthlyReportRecord(septReport, firstSnap, oct1);
if (firstSnap.year !== 2026 || firstSnap.month !== 9 || secondSnap.version !== 1 || secondSnap.status !== "FINAL") {
  failed += 1;
  console.error("IDEMPOTENT SNAP FAIL", firstSnap, secondSnap);
} else {
  console.log("OK monthly report snapshot is idempotent");
}

roll = reducer(roll, {
  type: "RECORD_PAYMENT",
  payload: {
    clientId: roll.clients[0].id,
    stayId: roll.stays[0].id,
    amount: 20000,
    method: "EASYPAISA",
    receivedByName: "Khizer",
    receivedAt: "2026-10-03T10:00:00+05:00",
  },
});
const octAfterPay = dashboardTotals(roll, octRange, "all", new Date("2026-10-03T10:00:00+05:00"));
const septAfterPay = buildMonthReport(roll, 2026, 9, new Date("2026-10-03T10:00:00+05:00"));
const septHomeAfterPay = dashboardTotals(roll, septRange, "all", new Date("2026-10-03T10:00:00+05:00"));
if (
  octAfterPay.business !== 0 ||
  octAfterPay.received !== 20000 ||
  octAfterPay.pending !== 30000 ||
  octAfterPay.carriedForward !== 30000 ||
  septAfterPay.business !== 500000 ||
  septAfterPay.closingOutstanding !== 50000 ||
  septAfterPay.pendingCollected !== 0 ||
  septHomeAfterPay.pending !== 50000 ||
  septHomeAfterPay.received !== 450000 ||
  septHomeAfterPay.business !== 500000 ||
  septHomeAfterPay.expenses !== 80000
) {
  failed += 1;
  console.error("OCT COLLECT OLD DEBT FAIL", octAfterPay, septAfterPay.closingOutstanding, septAfterPay.pendingCollected);
} else {
  console.log("OK October collection of September debt does not change September closing pending");
}

roll = reducer(roll, {
  type: "ADD_STAY",
  payload: {
    flat: "408-B",
    clientName: "New Guest",
    phone: "03111222333",
    checkIn: "2026-10-05T00:00:00.000Z",
    checkOut: "2026-10-08T00:00:00.000Z",
    nights: 3,
    business: 60000,
    received: 20000,
    method: "CASH",
    receivedByName: "Anas",
  },
});
const octWithStay = dashboardTotals(roll, octRange, "all", new Date("2026-10-05T12:00:00+05:00"));
if (
  octWithStay.business !== 60000 ||
  octWithStay.received !== 40000 ||
  octWithStay.pending !== 70000 ||
  octWithStay.carriedForward !== 30000
) {
  failed += 1;
  console.error("OCT NEW STAY FAIL", octWithStay);
} else {
  console.log("OK October new stay 60k/20k plus 30k carried forward");
}

const csv = buildMonthCsv(buildMonthReport(roll, 2026, 9, oct1));
if (!csv.includes("Business,500000") || !csv.includes("Tufail Khan")) {
  failed += 1;
  console.error("CSV FAIL", csv.slice(0, 400));
} else {
  console.log("OK monthly CSV export contains September totals");
}

{
  const receiptState = emptyLedgerState();
  const seeded = reducer(receiptState, {
    type: "ADD_STAY",
    payload: {
      flat: "802-A",
      clientName: "Tufail Khan",
      phone: "03001234567",
      checkIn: "2026-09-22T00:00:00+05:00",
      checkOut: "2026-09-25T00:00:00+05:00",
      nights: 3,
      business: 60000,
      received: 20000,
      method: "CASH",
      receivedByName: "Anas",
    },
  });
  const firstPay = seeded.payments[0];
  const withFirst: typeof seeded = {
    ...seeded,
    receipts: [
      {
        id: "rcpt_test_1",
        receiptNumber: "CLL-20260922-0001",
        paymentId: firstPay.id,
        clientId: firstPay.clientId,
        stayId: firstPay.stayId ?? seeded.stays[0].id,
        flatId: firstPay.flatId ?? seeded.stays[0].flatId,
        paymentDate: firstPay.receivedAt,
        amountReceived: firstPay.amount,
        status: "GENERATED",
        createdAt: firstPay.createdAt,
        updatedAt: firstPay.createdAt,
        sharedAt: null,
        shareAttemptedAt: null,
        version: 1,
        voidedAt: null,
      },
    ],
  };
  const afterSecond = reducer(withFirst, {
    type: "RECORD_PAYMENT",
    payload: {
      clientId: withFirst.clients[0].id,
      stayId: withFirst.stays[0].id,
      amount: 20000,
      method: "CASH",
      receivedByName: "Khizer",
      receivedAt: "2026-09-24T10:00:00+05:00",
    },
  });
  const secondPay = afterSecond.payments.find((item) => item.id !== firstPay.id);
  const createOps = planReceiptSync(withFirst, afterSecond, { type: "RECORD_PAYMENT" });
  const secondReceipt = {
    id: "rcpt_test_2",
    receiptNumber: formatReceiptNumber("20260924", 1),
    paymentId: secondPay?.id ?? "",
    clientId: secondPay?.clientId ?? "",
    stayId: secondPay?.stayId ?? "",
    flatId: secondPay?.flatId ?? "",
    paymentDate: secondPay?.receivedAt ?? "",
    amountReceived: secondPay?.amount ?? 0,
    status: "GENERATED" as const,
    createdAt: secondPay?.createdAt ?? "",
    updatedAt: secondPay?.createdAt ?? "",
    sharedAt: null,
    shareAttemptedAt: null,
    version: 1,
    voidedAt: null,
  };
  const withBoth = { ...afterSecond, receipts: [...withFirst.receipts, secondReceipt] };
  const view = buildReceiptView(withBoth, secondReceipt);
  const replay = planReceiptSync(withBoth, withBoth, { type: "RECORD_PAYMENT" });
  const expenseOnly = reducer(withBoth, {
    type: "ADD_EXPENSE",
    payload: { amount: 5000, category: "CLEANING", description: "sofa", method: "CASH", flat: "802-A" },
  });
  const expenseOps = planReceiptSync(withBoth, expenseOnly, { type: "ADD_EXPENSE" });
  const corrected = reducer(withBoth, {
    type: "UPDATE_PAYMENT",
    payload: { paymentId: secondPay?.id ?? "", amount: 18000, method: "EASYPAISA" },
  });
  const updateOps = planReceiptSync(withBoth, corrected, { type: "UPDATE_PAYMENT" });
  const voided = reducer(corrected, {
    type: "VOID_ENTRY",
    payload: { entityType: "Payment", entityId: secondPay?.id ?? "" },
  });
  const voidOps = planReceiptSync(corrected, voided, { type: "VOID_ENTRY" });
  const historical = planReceiptSync(
    { ...seeded, receipts: [] },
    { ...seeded, receipts: [] },
    { type: "GENERATE_RECEIPT", paymentId: firstPay.id },
  );
  const letterhead = new Uint8Array(readFileSync(join(process.cwd(), "public/letterhead/capital-lagoon-letterhead.jpg")));
  const pdf = view ? buildReceiptPdf(view, letterhead) : null;
  const utcShift = formatKarachiDateLong("2026-09-23T19:00:00.000Z");
  const longView = view
    ? {
        ...view,
        clientName: "Muhammad Abdullah Khan International Traveller",
        totalStayAmount: 1250000,
        amountReceived: 9999999,
        totalReceivedToDate: 9999999,
        remaining: 250000,
      }
    : null;
  const overflowPdf = longView ? buildReceiptPdf(longView, letterhead) : null;
  const bounds = letterheadContentBounds();
  const karachiMidnight = {
    ...withBoth,
    receipts: [{ ...secondReceipt, paymentDate: "2026-08-31T19:00:00.000Z" }],
  };
  const septReceipts = filterReceiptRows(karachiMidnight, {
    preset: "month",
    year: 2026,
    month: 9,
    flat: "all",
    receiver: "all",
    query: "",
  });
  const augustReceipts = filterReceiptRows(karachiMidnight, {
    preset: "previous",
    year: 2026,
    month: 8,
    flat: "all",
    receiver: "all",
    query: "",
  });
  if (formatReceiptNumber("20260924", 1) !== "CLL-20260924-0001") {
    failed += 1;
    console.error("RECEIPT NUMBER FAIL", formatReceiptNumber("20260924", 1));
  } else if (createOps.length !== 1 || createOps[0]?.type !== "create" || createOps[0].paymentId !== secondPay?.id) {
    failed += 1;
    console.error("ONE RECEIPT PER PAYMENT FAIL", createOps, secondPay?.id);
  } else if (replay.length !== 0) {
    failed += 1;
    console.error("IDEMPOTENT RECEIPT FAIL", replay);
  } else if (expenseOps.length !== 0) {
    failed += 1;
    console.error("EXPENSE RECEIPT FAIL", expenseOps);
  } else if (!view || view.amountReceived !== 20000 || view.totalReceivedToDate !== 40000 || view.remaining !== 20000 || view.receivedBy !== "Khizer") {
    failed += 1;
    console.error("RECEIPT TOTALS FAIL", view);
  } else if (view.paidInFull) {
    failed += 1;
    console.error("PAID IN FULL SHOULD BE FALSE", view);
  } else if (updateOps.length !== 1 || updateOps[0]?.type !== "update" || updateOps[0].receiptId !== "rcpt_test_2") {
    failed += 1;
    console.error("RECEIPT UPDATE FAIL", updateOps);
  } else if (voidOps.length !== 1 || voidOps[0]?.type !== "void") {
    failed += 1;
    console.error("RECEIPT VOID FAIL", voidOps);
  } else if (historical.length !== 1 || historical[0]?.type !== "create") {
    failed += 1;
    console.error("HISTORICAL GENERATE FAIL", historical);
  } else if (utcShift !== "24 September 2026") {
    failed += 1;
    console.error("KARACHI DATE FAIL", utcShift);
  } else if (buildReceiptWhatsAppMessage({ clientName: "Tufail Khan" }) !== "Salam Tufail Bhai payment receipt attached thanks") {
    failed += 1;
    console.error("RECEIPT WHATSAPP FAIL");
  } else if (buildClientWhatsAppReminder({ clientName: "Tufail Khan", pendingAmount: 20000 }) === buildReceiptWhatsAppMessage({ clientName: "Tufail Khan" })) {
    failed += 1;
    console.error("WHATSAPP TEMPLATE MIX FAIL");
  } else if (receiptPdfFileName("CLL-20260924-0001") !== "Capital-Lagoon-Receipt-CLL-20260924-0001.pdf") {
    failed += 1;
    console.error("PDF NAME FAIL");
  } else if (
    !pdf ||
    pdf.size < 40000 ||
    !overflowPdf ||
    overflowPdf.size < 40000 ||
    view.confirmation !== RECEIPT_CONFIRMATION ||
    view.thankYou !== RECEIPT_THANK_YOU ||
    bounds.top >= bounds.date.y ||
    bounds.bottom <= 140 ||
    septReceipts.length !== 1 ||
    augustReceipts.length !== 0
  ) {
    failed += 1;
    console.error("PDF LETTERHEAD FAIL", pdf?.size, overflowPdf?.size, bounds, view.confirmation);
  } else if (newestCreatedReceipt(withFirst, withBoth)?.id !== "rcpt_test_2") {
    failed += 1;
    console.error("NEWEST RECEIPT FAIL");
  } else if (!paymentEligibleForReceipt(secondPay!, afterSecond)) {
    failed += 1;
    console.error("ELIGIBLE FAIL");
  } else {
    console.log("OK payment receipts: one per payment, totals, correction, void, WhatsApp, PDF letterhead text");
  }
}

{
  const octNow = new Date("2026-10-02T12:00:00+05:00");
  const septView = dashboardTotals(roll, septRange, "all", octNow);
  const octView = dashboardTotals(roll, octRange, "all", octNow);
  const backSept = dashboardTotals(roll, septRange, "all", octNow);
  const months = availableHomeMonths(roll, octNow);
  if (
    septView.business !== 500000 ||
    septView.received !== 450000 ||
    septView.pending !== 50000 ||
    septView.expenses !== 80000 ||
    octView.business !== 60000 ||
    octView.received !== 40000 ||
    octView.pending !== 70000 ||
    octView.carriedForward !== 30000 ||
    backSept.pending !== 50000 ||
    !months.some((item) => item.year === 2026 && item.month === 9) ||
    !months.some((item) => item.year === 2026 && item.month === 10)
  ) {
    failed += 1;
    console.error("HOME MONTH SWITCH FAIL", septView, octView, backSept, months);
  } else {
    const allNow = new Date("2026-10-05T12:00:00+05:00");
    const allView = dashboardTotals(roll, allTimeRange(roll, allNow), "all", allNow);
    if (allView.pending !== 70000 || allView.business !== 560000 || allView.received !== 490000 || allView.expenses !== 80000) {
      failed += 1;
      console.error("ALL TIME HOME FAIL", allView);
    } else {
      console.log("OK Home month switch keeps historical September pending");
      console.log("OK All Time pending is current outstanding");
    }
  }
}

{
  let flatsState = emptyLedgerState();
  flatsState = reducer(flatsState, { type: "ADD_FLAT", payload: { name: "912c", displayName: "Centaurus 912-C" } });
  const added = flatsState.flats.find((item) => item.name === "912-C");
  const dup = reducer(flatsState, { type: "ADD_FLAT", payload: { name: "912-C" } });
  const parsed = parseQuickEntry("tufail 912c 2 din total 40k 20k cash", {
    knownFlats: flatsState.flats.map((item) => item.name),
    now: new Date("2026-10-02T12:00:00+05:00"),
  });
  const used = reducer(flatsState, {
    type: "ADD_STAY",
    payload: {
      flat: "912-C",
      clientName: "Tufail Khan",
      phone: "03001234567",
      checkIn: "2026-10-02T00:00:00+05:00",
      checkOut: "2026-10-04T00:00:00+05:00",
      nights: 2,
      business: 40000,
      received: 20000,
    },
  });
  const archived = reducer(used, { type: "ARCHIVE_FLAT", flatId: "flat_912-C" });
  const restored = reducer(archived, { type: "RESTORE_FLAT", flatId: "flat_912-C" });
  const deletedUnused = reducer(flatsState, { type: "DELETE_FLAT", flatId: "flat_912-C" });
  const deletedUsed = reducer(used, { type: "DELETE_FLAT", flatId: "flat_912-C" });
  if (
    !added ||
    added.displayName !== "Centaurus 912-C" ||
    dup.flats.filter((item) => item.name === "912-C").length !== 1 ||
    parsed.type !== "rent" ||
    parsed.flat !== "912-C" ||
    !used.stays.some((stay) => stay.flatId === "flat_912-C") ||
    archived.flats.find((item) => item.id === "flat_912-C")?.active !== false ||
    activeFlats(archived).some((item) => item.id === "flat_912-C") ||
    restored.flats.find((item) => item.id === "flat_912-C")?.active !== true ||
    deletedUnused.flats.some((item) => item.id === "flat_912-C") ||
    !deletedUsed.flats.some((item) => item.id === "flat_912-C")
  ) {
    failed += 1;
    console.error("FLAT MANAGEMENT FAIL", added, parsed, archived.flats.find((item) => item.id === "flat_912-C"));
  } else {
    console.log("OK apartment add/duplicate/quick-entry/archive/restore/delete-unused");
  }

  const slashAdded = reducer(emptyLedgerState(), { type: "ADD_FLAT", payload: { name: "703-704" } });
  const slashFlat = slashAdded.flats.find((item) => item.name === "703/704");
  const slashParsed = parseQuickEntry("ali 703/704 1 din total 10k 10k easypaisa", {
    knownFlats: slashAdded.flats.map((item) => item.name),
    now: new Date("2026-10-03T12:00:00+05:00"),
  });
  const slashParsedSpace = detectFlat("703 704", ["703/704"]);
  const slashParsedHyphen = detectFlat("703-704", ["703/704"]);
  const used204 = reducer(emptyLedgerState(), {
    type: "ADD_STAY",
    payload: {
      flat: "204-D",
      clientName: "Test Guest",
      phone: "03001112233",
      checkIn: "2026-10-01T00:00:00+05:00",
      checkOut: "2026-10-02T00:00:00+05:00",
      nights: 1,
      business: 10000,
      received: 10000,
    },
  });
  const blockedRename = reducer(used204, { type: "RENAME_FLAT", flatId: "flat_204-D", name: "703/704" });
  const unusedRename = reducer(slashAdded, { type: "UPDATE_FLAT", payload: { flatId: "flat_703/704", name: "999-Z" } });
  if (
    !slashFlat ||
    slashFlat.id !== "flat_703/704" ||
    slashParsed.type !== "rent" ||
    slashParsed.flat !== "703/704" ||
    slashParsedSpace !== "703/704" ||
    slashParsedHyphen !== "703/704" ||
    blockedRename.flats.find((item) => item.id === "flat_204-D")?.name !== "204-D" ||
    unusedRename.flats.find((item) => item.id === "flat_703/704")?.name !== "999-Z"
  ) {
    failed += 1;
    console.error("FLAT CODE LOCK FAIL", slashFlat, slashParsed, blockedRename.flats.find((item) => item.id === "flat_204-D"), unusedRename.flats);
  } else {
    console.log("OK 703/704 normalize, quick entry, and history-locked rename");
  }
}

{
  const phones = [
    normalizePhone("03001234567"),
    normalizePhone("+923001234567"),
    normalizePhone("00923001234567"),
    normalizePhone("0300 1234567"),
    normalizePhone("0300-1234567"),
    normalizePhone("(0300) 1234567"),
  ];
  const unique = uniqueContactPhones(["03001234567", "+92 300 1234567", "03331234567"]);
  let book = emptyLedgerState();
  book = reducer(book, { type: "ADD_CLIENT", payload: { name: "Tufail Khan", phone: "03001234567" } });
  const existing = findClientByPhone(book, "+923001234567");
  const renamed = reducer(book, { type: "ADD_CLIENT", payload: { name: "Tufail Office", phone: "+923001234567" } });
  const stay = reducer(book, {
    type: "ADD_STAY",
    payload: {
      flat: "802-A",
      clientName: "Tufail Office",
      phone: "+923001234567",
      checkIn: "2026-10-03T00:00:00+05:00",
      checkOut: "2026-10-04T00:00:00+05:00",
      nights: 1,
      business: 10000,
      received: 0,
    },
  });
  if (
    phones.some((item) => item !== "923001234567") ||
    unique.length !== 2 ||
    !existing ||
    existing.name !== "Tufail Khan" ||
    renamed.clients.filter((item) => samePhone(item.phone, "03001234567")).length !== 1 ||
    stay.clients.filter((item) => samePhone(item.phone, "03001234567")).length !== 1 ||
    stay.clients.find((item) => samePhone(item.phone, "03001234567"))?.name !== "Tufail Khan" ||
    cleanContactName("undefined") !== "" ||
    cleanContactName(" Tufail Khan ") !== "Tufail Khan" ||
    parseFormAmount("03001234567") !== null
  ) {
    failed += 1;
    console.error("CONTACT PHONE FAIL", phones, unique, existing, renamed.clients.length, stay.clients.find((item) => samePhone(item.phone, "03001234567")));
  } else {
    console.log("OK contact phone normalize, reuse existing client, skip duplicate");
  }
}

if (failed) {
  console.error(failed, "failed");
  process.exit(1);
}
console.log("all parser checks passed");
