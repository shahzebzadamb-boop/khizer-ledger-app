"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { startOfMonth } from "date-fns";
import { DateFilter } from "@/components/dashboard/DateFilter";
import { StayLedgerCard } from "@/components/dashboard/StayLedgerCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { MonthlyReports } from "@/components/reports/MonthlyReports";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { inRange, periodLabel, rangeForPreset } from "@/lib/dates";
import {
  dashboardTotals,
  expenseLedgerRows,
  operationalReconciled,
  stayLedgerRows,
} from "@/lib/ledger";
import { formatPKR, methodLabel } from "@/lib/money";
import { useLedger } from "@/lib/store";
import { activeFlats } from "@/lib/flats";
import type { DateFilterPreset, DateRange } from "@/types";

export default function ReportsPage() {
  const { state } = useLedger();
  const [preset, setPreset] = useState<DateFilterPreset>("month");
  const [selectedFlat, setSelectedFlat] = useState("all");
  const [custom, setCustom] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [busy, setBusy] = useState(false);
  const [showMethods, setShowMethods] = useState(false);

  const range = useMemo(() => rangeForPreset(preset, custom), [preset, custom]);
  const stays = useMemo(() => stayLedgerRows(state, range, selectedFlat), [range, selectedFlat, state]);
  const expenses = useMemo(() => expenseLedgerRows(state, range, selectedFlat), [range, selectedFlat, state]);
  const totals = useMemo(() => dashboardTotals(state, range, selectedFlat), [range, selectedFlat, state]);
  const flats = useMemo(
    () =>
      state.flats
        .filter((item) => selectedFlat === "all" || item.name === selectedFlat)
        .map((item) => ({ name: item.name, ...dashboardTotals(state, range, item.name) })),
    [range, selectedFlat, state],
  );
  const matched = operationalReconciled(state, range, selectedFlat, totals);
  const methods = useMemo(() => {
    const counts = new Map<string, number>();
    for (const payment of state.payments) {
      const inFlat = selectedFlat === "all" || payment.flatId === `flat_${selectedFlat}`;
      if (!inFlat) continue;
      if (payment.voided) continue;
      if (!inRange(payment.receivedAt, range)) continue;
      counts.set(payment.method, (counts.get(payment.method) ?? 0) + payment.amount);
    }
    return [...counts.entries()];
  }, [range, selectedFlat, state.payments]);

  async function makePdf() {
    setBusy(true);
    const { buildReportPdf } = await import("@/lib/pdf");
    const blob = buildReportPdf({
      periodLabel: periodLabel(preset, range),
      flatLabel: selectedFlat === "all" ? "All Flats" : `Flat ${selectedFlat}`,
      totals,
      flats,
    });
    setBusy(false);
    return new File([blob], "khizer-ledger-report.pdf", { type: "application/pdf" });
  }

  const staysByFlat = useMemo(() => {
    const groups = new Map<string, typeof stays>();
    for (const stay of stays) {
      const list = groups.get(stay.flat) ?? [];
      list.push(stay);
      groups.set(stay.flat, list);
    }
    return [...groups.entries()];
  }, [stays]);

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle="Monthly performance" />
      <div className="kh-group">
        <Link href="/ledger" className="flex min-h-14 items-center justify-between border-b border-border px-3.5 text-sm font-medium">
          <span>Ledger</span>
          <span className="text-muted">›</span>
        </Link>
        <Link href="/reports/receipts" className="flex min-h-14 items-center justify-between px-3.5 text-sm font-medium">
          <span>Receipts</span>
          <span className="text-muted">›</span>
        </Link>
      </div>
      <MonthlyReports state={state} />
      <DateFilter
        flats={activeFlats(state)}
        selectedFlat={selectedFlat}
        onFlat={setSelectedFlat}
        preset={preset}
        custom={custom}
        onPreset={setPreset}
        onCustom={setCustom}
      />
      <Card className="space-y-2">
        <p className="section-title">Summary</p>
        <Row label="Business" value={formatPKR(totals.business)} />
        <Row label="Received" value={formatPKR(totals.received)} accent="text-primary" />
        <Row label="Pending" value={formatPKR(totals.pending)} accent="text-warning" />
        <Row label="Expenses" value={formatPKR(totals.expenses)} />
      </Card>
      {!matched ? (
        <p className="text-sm text-warning">Totals do not match stay rows. Check this period again.</p>
      ) : null}
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={showMethods} onChange={(event) => setShowMethods(event.target.checked)} />
        Show payment methods
      </label>
      {showMethods ? (
        <Card className="space-y-2">
          <p className="section-title">Payment methods</p>
          {methods.length === 0 ? <p className="text-sm text-muted">No rent payments in this period.</p> : null}
          {methods.map(([method, amount]) => (
            <Row key={method} label={methodLabel(method)} value={formatPKR(amount)} />
          ))}
        </Card>
      ) : null}
      <Card className="space-y-3">
        <p className="section-title">Per flat</p>
        {flats.map((flat) => (
          <div key={flat.name} className="space-y-1 border-t border-border pt-2 first:border-t-0 first:pt-0">
            <p className="text-sm font-medium">{flat.name}</p>
            <Row label="Business" value={formatPKR(flat.business)} />
            <Row label="Received" value={formatPKR(flat.received)} />
            <Row label="Pending" value={formatPKR(flat.pending)} />
            <Row label="Expenses" value={formatPKR(flat.expenses)} />
          </div>
        ))}
      </Card>
      <div className="space-y-2.5">
        <h2 className="section-title">Stay detail</h2>
        <p className="text-xs font-normal text-muted">Internal only. Not included in the shared PDF.</p>
        {stays.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-3.5 py-3 text-sm font-normal text-muted">
            No stays in this period.
          </p>
        ) : (
          staysByFlat.map(([flat, rows]) => (
            <div key={flat} className="overflow-hidden rounded-2xl border border-border bg-surface">
              <p className="border-b border-border px-3.5 py-2.5 text-sm font-medium">{flat}</p>
              {rows.map((row) => (
                <StayLedgerCard key={row.stayId} row={row} showFlat={false} />
              ))}
            </div>
          ))
        )}
      </div>
      {expenses.length > 0 ? (
        <Card className="space-y-2">
          <p className="section-title">Expenses</p>
          {expenses.map((item) => (
            <div key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-normal text-muted">
                {item.description}
                {item.flat ? ` · ${item.flat}` : ""}
              </span>
              <span className="money shrink-0">{formatPKR(item.amount)}</span>
            </div>
          ))}
        </Card>
      ) : null}
      <div className="grid min-w-0 grid-cols-2 gap-2">
        <Button
          onClick={async () => {
            const file = await makePdf();
            const url = URL.createObjectURL(file);
            window.open(url, "_blank");
          }}
          disabled={busy}
        >
          Preview
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            const file = await makePdf();
            const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
            if (nav.canShare?.({ files: [file] }) && nav.share) {
              await nav.share({ files: [file], title: "KHIZER LEDGER report" });
              return;
            }
            download(file);
          }}
        >
          Share
        </Button>
        <Button
          variant="primary"
          className="col-span-2"
          disabled={busy}
          onClick={async () => {
            download(await makePdf());
          }}
        >
          Generate PDF
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="font-normal text-muted">{label}</span>
      <span className={`money ${accent ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
}
