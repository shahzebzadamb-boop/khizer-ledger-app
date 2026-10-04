"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DateFilter } from "@/components/dashboard/DateFilter";
import { MonthFilter } from "@/components/dashboard/MonthFilter";
import { StayLedgerCard } from "@/components/dashboard/StayLedgerCard";
import { EntryEditor } from "@/components/dashboard/EntryEditor";
import { AddExpenseSheet } from "@/components/ledger/AddExpenseSheet";
import { AddPaymentSheet } from "@/components/ledger/AddPaymentSheet";
import { AddStaySheet } from "@/components/ledger/AddStaySheet";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/dates";
import { flatsForChips, flatsUsedInRange } from "@/lib/flats";
import {
  currentHomePeriod,
  isHistoricalRange,
  periodFromPreset,
  periodRange,
  toPreset,
  type HomePeriod,
} from "@/lib/home-period";
import {
  dashboardTotals,
  expenseLedgerRows,
  operationalReconciled,
  paymentLedgerRows,
  pendingLedgerRows,
  stayLedgerRows,
} from "@/lib/ledger";
import { ledgerHref, parseLedgerPreset, parseLedgerView, type LedgerView } from "@/lib/ledger-href";
import { formatPKR } from "@/lib/money";
import { useLedger } from "@/lib/store";
import { cn } from "@/lib/utils";
import { PaymentReceiptNotice } from "@/components/receipts/PaymentReceiptNotice";
import type { DateFilterPreset } from "@/types";

const tabs: { view: LedgerView; label: string }[] = [
  { view: "business", label: "Business" },
  { view: "received", label: "Received" },
  { view: "pending", label: "Pending" },
  { view: "expenses", label: "Expenses" },
];

export function LedgerPage() {
  const { state } = useLedger();
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = parseLedgerView(searchParams.get("view"));
  const selectedFlat = searchParams.get("flat") || "all";
  const preset = parseLedgerPreset(searchParams.get("preset"));
  const yearParam = Number(searchParams.get("year") ?? "");
  const monthParam = Number(searchParams.get("month") ?? "");
  const current = currentHomePeriod();
  const [period, setPeriod] = useState<HomePeriod>(() =>
    periodFromPreset(
      preset,
      Number.isFinite(yearParam) ? yearParam : current.year,
      Number.isFinite(monthParam) ? monthParam : current.month,
      {
        from: searchParams.get("from") ? new Date(`${searchParams.get("from")}T00:00:00+05:00`) : current.custom.from,
        to: searchParams.get("to") ? new Date(`${searchParams.get("to")}T00:00:00+05:00`) : current.custom.to,
      },
    ),
  );
  const [sheet, setSheet] = useState<"stay" | "payment" | "expense" | null>(null);
  const [toast, setToast] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const range = useMemo(() => periodRange(period, state), [period, state]);
  const historical = isHistoricalRange(range);
  const asOf = historical ? range.to : undefined;
  const stays = useMemo(() => stayLedgerRows(state, range, selectedFlat, asOf), [asOf, range, selectedFlat, state]);
  const pending = useMemo(() => pendingLedgerRows(state, selectedFlat, asOf), [asOf, selectedFlat, state]);
  const payments = useMemo(() => paymentLedgerRows(state, range, selectedFlat), [range, selectedFlat, state]);
  const expenses = useMemo(() => expenseLedgerRows(state, range, selectedFlat), [range, selectedFlat, state]);
  const totals = useMemo(() => dashboardTotals(state, range, selectedFlat), [range, selectedFlat, state]);
  const reconciled = operationalReconciled(state, range, selectedFlat, totals);
  const chipFlats = useMemo(() => {
    const used = historical ? flatsUsedInRange(state, range.from, range.to) : [];
    return flatsForChips(state, used);
  }, [historical, range.from, range.to, state]);

  function go(next: {
    view?: LedgerView;
    flat?: string;
    period?: HomePeriod;
  }) {
    const nextPeriod = next.period ?? period;
    router.replace(
      ledgerHref({
        view: next.view ?? view,
        flat: next.flat ?? selectedFlat,
        preset: toPreset(nextPeriod),
        from: toInput(nextPeriod.custom.from),
        to: toInput(nextPeriod.custom.to),
        year: nextPeriod.kind === "month" ? nextPeriod.year : undefined,
        month: nextPeriod.kind === "month" ? nextPeriod.month : undefined,
      }),
    );
  }

  function changePeriod(next: HomePeriod) {
    setPeriod(next);
    go({ period: next });
  }

  function added(info?: { receiptId?: string | null }) {
    if (info?.receiptId) {
      setReceiptId(info.receiptId);
      setToast(false);
      return;
    }
    setReceiptId(null);
    setToast(true);
    window.setTimeout(() => setToast(false), 1600);
  }

  function openAdd() {
    if (view === "expenses") setSheet("expense");
    else if (view === "received") setSheet("payment");
    else setSheet("stay");
  }

  return (
    <div className="space-y-3.5">
      {receiptId ? (
        <PaymentReceiptNotice receiptId={receiptId} onDismiss={() => setReceiptId(null)} />
      ) : toast ? (
        <p className="toast-ok">✓ Added</p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="min-h-11 inline-flex items-center text-sm font-medium text-secondary">
          ← Back
        </Link>
        <Button variant="primary" onClick={openAdd}>
          + Add
        </Button>
      </div>
      <h1 className="page-title">Ledger</h1>
      <div className="kh-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.view}
            type="button"
            className={cn("kh-tab", view === tab.view && "is-active")}
            onClick={() => go({ view: tab.view })}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <MonthFilter period={period} onChange={changePeriod} state={state} />
      <DateFilter
        flats={chipFlats}
        selectedFlat={selectedFlat}
        onFlat={(value) => go({ flat: value })}
        preset={toPreset(period)}
        custom={period.custom}
        onPreset={(value: DateFilterPreset) => changePeriod(periodFromPreset(value, period.year, period.month, period.custom))}
        onCustom={(value) => changePeriod({ ...period, kind: "custom", custom: value })}
        hidePresets
      />
      {!reconciled ? (
        <p className="text-sm font-normal text-warning">Totals do not match this ledger. Check the filters.</p>
      ) : null}

      {view === "business" ? (
        stays.length === 0 ? (
          <Empty label="No business entries yet" action="+ Add Stay" onAction={() => setSheet("stay")} />
        ) : (
          <List>
            {stays.map((row) => (
              <StayLedgerCard key={row.stayId} row={row} showFlat showDates showActions />
            ))}
          </List>
        )
      ) : null}

      {view === "received" ? (
        payments.length === 0 ? (
          <Empty label="No payments yet" action="+ Add Payment" onAction={() => setSheet("payment")} />
        ) : (
          <PaymentList rows={payments} />
        )
      ) : null}

      {view === "pending" ? (
        pending.length === 0 ? (
          <Empty label="No pending balances" />
        ) : (
          <List>
            {pending.map((row) => (
              <StayLedgerCard key={row.stayId} row={row} showFlat showDates showPhone showWhatsApp showActions />
            ))}
          </List>
        )
      ) : null}

      {view === "expenses" ? (
        expenses.length === 0 ? (
          <Empty label="No expenses yet" action="+ Add Expense" onAction={() => setSheet("expense")} />
        ) : (
          <ExpenseList rows={expenses} />
        )
      ) : null}

      {sheet === "stay" ? (
        <AddStaySheet defaultFlat={selectedFlat} onClose={() => setSheet(null)} onAdded={added} />
      ) : null}
      {sheet === "payment" ? (
        <AddPaymentSheet onClose={() => setSheet(null)} onAdded={added} />
      ) : null}
      {sheet === "expense" ? (
        <AddExpenseSheet defaultFlat={selectedFlat} onClose={() => setSheet(null)} onAdded={added} />
      ) : null}
    </div>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <div className="kh-feed">{children}</div>;
}

function Empty({ label, action, onAction }: { label: string; action?: string; onAction?: () => void }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface px-3.5 py-4">
      <p className="text-sm font-normal text-muted">{label}</p>
      {action && onAction ? (
        <Button variant="primary" onClick={onAction}>
          {action}
        </Button>
      ) : null}
    </div>
  );
}

function PaymentList({
  rows,
}: {
  rows: ReturnType<typeof paymentLedgerRows>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  return (
    <>
      <List>
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className="block w-full border-b border-border px-3.5 py-3 text-left last:border-b-0"
            onClick={() => setEditId(row.id)}
          >
            <p className="text-sm font-medium">{row.clientName}</p>
            <p className="mt-0.5 text-xs font-normal text-muted">{row.flat}</p>
            <p className="money mt-1 text-right text-base text-success">{formatPKR(row.amount)}</p>
            <p className="mt-1 text-xs font-normal text-muted">
              {row.method} · Received by {row.receivedBy}
            </p>
            <p className="mt-0.5 text-xs font-normal text-muted">{formatDate(row.receivedAt)}</p>
          </button>
        ))}
      </List>
      {editId ? <EntryEditor kind="payment" id={editId} onClose={() => setEditId(null)} /> : null}
    </>
  );
}

function ExpenseList({
  rows,
}: {
  rows: ReturnType<typeof expenseLedgerRows>;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  return (
    <>
      <List>
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className="block w-full border-b border-border px-3.5 py-3 text-left last:border-b-0"
            onClick={() => setEditId(row.id)}
          >
            <p className="text-sm font-medium">{row.description || row.category}</p>
            <p className="mt-0.5 text-xs font-normal text-muted">{row.flat ?? "—"}</p>
            <p className="money mt-2 text-base">{formatPKR(row.amount)}</p>
            <p className="mt-1 text-xs font-normal text-muted">
              {formatDate(row.spentAt)} · {row.method}
            </p>
          </button>
        ))}
      </List>
      {editId ? <EntryEditor kind="expense" id={editId} onClose={() => setEditId(null)} /> : null}
    </>
  );
}

function toInput(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
