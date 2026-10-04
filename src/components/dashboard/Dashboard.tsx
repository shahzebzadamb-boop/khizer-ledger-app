"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DateFilter } from "@/components/dashboard/DateFilter";
import { MonthFilter } from "@/components/dashboard/MonthFilter";
import { NeedsAttention } from "@/components/dashboard/NeedsAttention";
import { QuickEntry } from "@/components/dashboard/QuickEntry";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { PageHeader } from "@/components/layout/PageHeader";
import { karachiYmd, pad2 } from "@/lib/dates";
import { flatsForChips, flatsUsedInRange } from "@/lib/flats";
import {
  currentHomePeriod,
  isHistoricalRange,
  periodLabelForHome,
  periodRange,
  toPreset,
  type HomePeriod,
} from "@/lib/home-period";
import { dashboardTotals, needsAttention, stayLedgerRows } from "@/lib/ledger";
import { canUseBrowserNotifications } from "@/lib/notifications";
import { useLedger } from "@/lib/store";
import { PaymentReceiptNotice } from "@/components/receipts/PaymentReceiptNotice";

export function Dashboard() {
  const { state } = useLedger();
  const [period, setPeriod] = useState<HomePeriod>(() => currentHomePeriod());
  const [selectedFlat, setSelectedFlat] = useState("all");
  const [toast, setToast] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const range = useMemo(() => periodRange(period, state), [period, state]);
  const historical = isHistoricalRange(range);
  const asOf = historical ? range.to : undefined;
  const attention = useMemo(() => needsAttention(state, selectedFlat, asOf), [asOf, selectedFlat, state]);
  const stays = useMemo(() => stayLedgerRows(state, range, selectedFlat, asOf), [asOf, range, selectedFlat, state]);
  const totals = useMemo(() => dashboardTotals(state, range, selectedFlat), [range, selectedFlat, state]);
  const reviewCount = state.reviews.filter((item) => item.status === "NEEDS_REVIEW").length;
  const chipFlats = useMemo(() => {
    const used = historical ? flatsUsedInRange(state, range.from, range.to) : [];
    return flatsForChips(state, used);
  }, [historical, range.from, range.to, state]);
  const fromYmd = `${karachiYmd(range.from).year}-${pad2(karachiYmd(range.from).month)}-${pad2(karachiYmd(range.from).day)}`;
  const toYmd = `${karachiYmd(range.to).year}-${pad2(karachiYmd(range.to).month)}-${pad2(karachiYmd(range.to).day)}`;
  const today = karachiYmd();
  const showCarryForward = period.kind === "month" && period.year === today.year && period.month === today.month;

  return (
    <div className="space-y-3.5">
      {receiptId ? (
        <PaymentReceiptNotice receiptId={receiptId} onDismiss={() => setReceiptId(null)} />
      ) : toast ? (
        <p className="toast-ok">✓ Added</p>
      ) : null}
      <PageHeader
        title="KHIZER LEDGER"
        subtitle="Fast mobile cash notebook"
        logo
      />
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        <Link href="/settings" className="chip chip-active">
          Settings
        </Link>
        <Link href="/calculator" className="chip chip-active">
          Calculator
        </Link>
        <Link href="/ledger" className="chip chip-active">
          Ledger
        </Link>
        <Link href="/reports/receipts" className="chip chip-active">
          Receipts
        </Link>
      </div>
      {reviewCount > 0 ? (
        <Link href="/migration" className="chip min-h-11 text-warning">
          Migration review ({reviewCount})
        </Link>
      ) : null}
      {canUseBrowserNotifications() && Notification.permission !== "granted" ? (
        <button type="button" className="chip" onClick={() => Notification.requestPermission()}>
          Enable reminders
        </button>
      ) : null}
      <MonthFilter period={period} onChange={setPeriod} state={state} />
      <SummaryCards
        totals={totals}
        flat={selectedFlat}
        preset={toPreset(period)}
        from={fromYmd}
        to={toYmd}
        year={period.kind === "month" ? period.year : undefined}
        month={period.kind === "month" ? period.month : undefined}
        periodLabel={periodLabelForHome(period)}
        showCarryForward={showCarryForward}
      />
      <DateFilter
        flats={chipFlats}
        selectedFlat={selectedFlat}
        onFlat={setSelectedFlat}
        preset={toPreset(period)}
        custom={period.custom}
        onPreset={() => undefined}
        onCustom={() => undefined}
        hidePresets
      />
      <QuickEntry
        onAdded={(info) => {
          if (info?.receiptId) {
            setReceiptId(info.receiptId);
            setToast(false);
            return;
          }
          setReceiptId(null);
          setToast(true);
          window.setTimeout(() => setToast(false), 1600);
        }}
      />
      <NeedsAttention items={attention} />
      <RecentActivity
        stays={stays}
        showFlat={selectedFlat === "all"}
        emptyLabel={period.kind === "month" ? "No activity for this month." : "No stays yet."}
      />
    </div>
  );
}
