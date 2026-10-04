"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/dates";
import { formatPKR } from "@/lib/money";
import {
  buildMonthCsv,
  buildMonthReport,
  listReportMonths,
  type MonthReportComputed,
} from "@/lib/month-accounting";
import type { LedgerState, MonthlyReportRecord } from "@/types";
import { countReceiptsGenerated } from "@/lib/receipts";

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="font-normal text-muted">{label}</span>
      <span className={`money ${accent ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
}

async function monthPdf(report: MonthReportComputed) {
  const { buildReportPdf } = await import("@/lib/pdf");
  const blob = buildReportPdf({
    periodLabel: report.label,
    totals: {
      business: report.business,
      received: report.received,
      pending: report.closingOutstanding,
      expenses: report.expenses,
      carriedForward: report.carriedForward,
    },
    flats: report.flats,
    stays: report.totalStays,
    occupiedNights: report.totalNights,
  });
  return new File([blob], `khizer-ledger-${report.year}-${String(report.month).padStart(2, "0")}.pdf`, {
    type: "application/pdf",
  });
}

export function MonthlyReports({ state }: { state: LedgerState }) {
  const months = useMemo(() => listReportMonths(state), [state]);
  const years = useMemo(() => [...new Set(months.map((item) => item.year))], [months]);
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = months.filter((item) => item.year === year);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title">Monthly reports</h2>
        {years.length > 1 ? (
          <select
            className="rounded-xl border border-border bg-input px-2 py-1 text-sm"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs font-normal text-muted">{year}</p>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-3.5 py-3 text-sm font-normal text-muted">
          Monthly reports appear after the first completed month.
        </p>
      ) : (
        visible.map((item) => {
          const key = `${item.year}-${item.month}`;
          const snapshot = state.monthlyReports.find((row) => row.year === item.year && row.month === item.month) ?? null;
          return (
            <MonthCard
              key={key}
              state={state}
              year={item.year}
              month={item.month}
              live={item.live}
              snapshot={snapshot}
              open={openKey === key}
              busy={busy}
              onToggle={() => setOpenKey(openKey === key ? null : key)}
              onBusy={setBusy}
            />
          );
        })
      )}
    </section>
  );
}

function MonthCard({
  state,
  year,
  month,
  live,
  snapshot,
  open,
  busy,
  onToggle,
  onBusy,
}: {
  state: LedgerState;
  year: number;
  month: number;
  live: boolean;
  snapshot: MonthlyReportRecord | null;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onBusy: (value: boolean) => void;
}) {
  const report = useMemo(() => buildMonthReport(state, year, month), [month, state, year]);
  const status = live ? "LIVE" : snapshot?.status ?? (report.complete ? "FINAL" : "LIVE");
  const updated = snapshot?.updatedAt ?? null;

  async function shareOrDownload(mode: "share" | "download" | "preview-pdf") {
    onBusy(true);
    try {
      const file = await monthPdf(report);
      if (mode === "preview-pdf") {
        window.open(URL.createObjectURL(file), "_blank");
        return;
      }
      if (mode === "share") {
        const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
        if (nav.canShare?.({ files: [file] }) && nav.share) {
          await nav.share({ files: [file], title: `${report.label} report` });
          return;
        }
      }
      downloadBlob(file, file.name);
    } finally {
      onBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{report.label}</p>
          <p className="mt-0.5 text-[11px] font-normal text-muted">
            {status === "UPDATED" && updated ? `Updated ${formatDate(updated)}` : status === "LIVE" ? "Live month" : "Final"}
          </p>
        </div>
      </div>
      <Row label="Business" value={formatPKR(report.business)} />
      <Row label="Received" value={formatPKR(report.received)} accent="text-primary" />
      <Row label="Expenses" value={formatPKR(report.expenses)} />
      <Row label="Closing pending" value={formatPKR(report.closingOutstanding)} accent="text-warning" />
      <Row label="Receipts generated" value={String(countReceiptsGenerated(state, year, month))} />
      <Link href={`/reports/receipts?year=${year}&month=${month}`} className="inline-flex min-h-11 items-center text-sm font-medium text-secondary">
        View Receipts
      </Link>
      <div className="grid grid-cols-3 gap-2">
        <Button onClick={onToggle} disabled={busy}>
          Preview
        </Button>
        <Button disabled={busy} onClick={() => void shareOrDownload("share")}>
          Share
        </Button>
        <Button disabled={busy} onClick={() => void shareOrDownload("download")}>
          Download
        </Button>
      </div>
      {open ? (
        <InternalPreview
          report={report}
          receiptsGenerated={countReceiptsGenerated(state, year, month)}
          receiptsHref={`/reports/receipts?year=${year}&month=${month}`}
          onExport={() =>
            downloadBlob(
              new Blob([buildMonthCsv(report)], { type: "text/csv" }),
              `khizer-ledger-${report.year}-${String(report.month).padStart(2, "0")}.csv`,
            )
          }
        />
      ) : null}
    </Card>
  );
}

function InternalPreview({
  report,
  receiptsGenerated,
  receiptsHref,
  onExport,
}: {
  report: MonthReportComputed;
  receiptsGenerated: number;
  receiptsHref: string;
  onExport: () => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, typeof report.stays>();
    for (const stay of report.stays) {
      const list = map.get(stay.flat) ?? [];
      list.push(stay);
      map.set(stay.flat, list);
    }
    return [...map.entries()];
  }, [report.stays]);

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <p className="text-xs font-normal text-muted">Internal preview. Shared PDF stays privacy-safe.</p>
      {!report.reconciled ? (
        <p className="text-sm text-warning">{report.issues.join(" ")}</p>
      ) : (
        <p className="text-xs font-normal text-muted">Totals match the underlying ledger.</p>
      )}
      <Row label="New pending generated" value={formatPKR(report.newPendingGenerated)} />
      <Row label="Pending collected" value={formatPKR(report.pendingCollected)} />
      <Row label="Carried forward outstanding" value={formatPKR(report.carriedForward)} />
      <Row label="Closing outstanding" value={formatPKR(report.closingOutstanding)} />
      <Row label="Stays" value={String(report.totalStays)} />
      <Row label="Occupied nights" value={String(report.totalNights)} />
      <Row label="Average stay" value={`${report.averageStayLength} nights`} />
      <Row label="Receipts generated" value={String(receiptsGenerated)} />
      <Link href={receiptsHref} className="inline-flex min-h-11 items-center text-sm font-medium text-secondary">
        View Receipts
      </Link>

      <p className="section-title">Received by</p>
      {report.receivers.map((item) => (
        <Row key={item.name} label={item.name} value={formatPKR(item.amount)} />
      ))}
      <Row label="Total" value={formatPKR(report.received)} />

      <p className="section-title">Flat performance</p>
      {report.flats.map((flat) => (
        <div key={flat.name} className="space-y-1 border-t border-border pt-2 first:border-t-0 first:pt-0">
          <p className="text-sm font-medium">{flat.name}</p>
          <Row label="Business" value={formatPKR(flat.business)} />
          <Row label="Received" value={formatPKR(flat.received)} />
          <Row label="Closing pending" value={formatPKR(flat.pending)} />
          <Row label="Expenses" value={formatPKR(flat.expenses)} />
          <Row label="Stays" value={String(flat.stays)} />
          <Row label="Occupied nights" value={String(flat.occupiedNights)} />
        </div>
      ))}

      {groups.map(([flat, stays]) => (
        <div key={flat} className="space-y-2">
          <p className="section-title">Flat {flat}</p>
          {stays.map((stay) => (
            <div key={stay.stayId} className="space-y-1 border-t border-border pt-2">
              <p className="text-sm font-medium">{stay.clientName}</p>
              <p className="text-xs font-normal text-muted">
                {formatDate(stay.checkIn)} → {formatDate(stay.checkOut)} · {stay.nights} nights
              </p>
              <Row label="Business" value={formatPKR(stay.business)} />
              <Row label="Received" value={formatPKR(stay.received)} />
              <Row label="Closing pending" value={formatPKR(stay.closingPending)} />
            </div>
          ))}
        </div>
      ))}

      <p className="section-title">Payments received — {report.label}</p>
      {report.payments.length === 0 ? <p className="text-sm text-muted">No payments this month.</p> : null}
      {report.payments.map((item) => (
        <div key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 truncate font-normal text-muted">
            {item.clientName}
            <span className="block text-xs">
              {formatPKR(item.amount)} · {item.method} · Received by {item.receivedBy}
            </span>
          </span>
        </div>
      ))}

      {report.expensesList.length > 0 ? (
        <>
          <p className="section-title">Expenses</p>
          {report.expensesList.map((item) => (
            <div key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-normal text-muted">
                {item.description}
                {item.flat ? ` · ${item.flat}` : ""}
              </span>
              <span className="money shrink-0">{formatPKR(item.amount)}</span>
            </div>
          ))}
        </>
      ) : null}

      <Button onClick={onExport} className="w-full">
        Export data
      </Button>
    </div>
  );
}
