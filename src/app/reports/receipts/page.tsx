"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { formatKarachiDateMedium, karachiMonthRange, karachiYmd, pad2, rangeForPreset } from "@/lib/dates";
import { flatName, receiverName } from "@/lib/ledger";
import { formatPKR, methodLabel } from "@/lib/money";
import { buildReceiptView, filterReceiptRows, type ReceiptFilterPreset } from "@/lib/receipts";
import { useLedger } from "@/lib/store";
import { activeFlats } from "@/lib/flats";
import type { DateRange } from "@/types";
import { ReceiptShareButtons } from "@/components/receipts/ReceiptShareButtons";

function ReportsReceiptsInner() {
  const { state, ready } = useLedger();
  const search = useSearchParams();
  const yearParam = Number(search.get("year") ?? "");
  const monthParam = Number(search.get("month") ?? "");
  const linked = Number.isFinite(yearParam) && yearParam > 0 && Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12;
  const today = karachiYmd();
  const [preset, setPreset] = useState<ReceiptFilterPreset>(linked ? "custom" : "month");
  const linkedRange = linked ? karachiMonthRange(yearParam, monthParam) : karachiMonthRange(today.year, today.month);
  const [custom, setCustom] = useState<DateRange>(linkedRange);
  const [flat, setFlat] = useState("all");
  const [receiver, setReceiver] = useState<"all" | "Anas" | "Khizer" | "others">("all");
  const [query, setQuery] = useState("");

  function dateValue(date: Date): string {
    const { year, month, day } = karachiYmd(date);
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const rows = useMemo(
    () =>
      filterReceiptRows(state, {
        preset,
        custom: preset === "custom" ? rangeForPreset("custom", custom) : null,
        flat,
        receiver,
        query,
      }),
    [custom, flat, preset, query, receiver, state],
  );

  if (!ready) {
    return <p className="text-sm font-normal text-muted">Loading receipts…</p>;
  }

  return (
    <div className="space-y-4">
      <Link href="/reports" className="inline-flex min-h-11 items-center text-sm font-medium text-secondary">
        ← Reports
      </Link>
      <PageHeader title="Receipts" subtitle="Capital Lagoon payment receipts" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["month", "This Month"],
            ["previous", "Previous Month"],
            ["custom", "Custom"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`chip ${preset === id ? "chip-active" : ""}`} onClick={() => setPreset(id)}>
            {label}
          </button>
        ))}
      </div>
      {preset === "custom" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-normal text-muted">
            From
            <input
              type="date"
              className="mt-1"
              value={dateValue(custom.from)}
              onChange={(event) => setCustom({ ...custom, from: new Date(`${event.target.value}T00:00:00+05:00`) })}
            />
          </label>
          <label className="text-xs font-normal text-muted">
            To
            <input
              type="date"
              className="mt-1"
              value={dateValue(custom.to)}
              onChange={(event) => setCustom({ ...custom, to: new Date(`${event.target.value}T00:00:00+05:00`) })}
            />
          </label>
        </div>
      ) : null}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" className={`chip ${flat === "all" ? "chip-active" : ""}`} onClick={() => setFlat("all")}>
          All Flats
        </button>
        {activeFlats(state).map((item) => (
          <button key={item.id} type="button" className={`chip ${flat === item.name ? "chip-active" : ""}`} onClick={() => setFlat(item.name)}>
            {item.name}
          </button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["all", "All"],
            ["Anas", "Anas"],
            ["Khizer", "Khizer"],
            ["others", "Others"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`chip ${receiver === id ? "chip-active" : ""}`} onClick={() => setReceiver(id)}>
            {label}
          </button>
        ))}
      </div>
      <input
        className="w-full rounded-xl border border-border bg-input px-3 text-base"
        placeholder="Client or receipt number"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {rows.length === 0 ? (
          <p className="px-3.5 py-3 text-sm font-normal text-muted">No receipts in this period.</p>
        ) : (
          rows.map((receipt) => {
            const view = buildReceiptView(state, receipt);
            const payment = state.payments.find((item) => item.id === receipt.paymentId);
            const client = state.clients.find((item) => item.id === receipt.clientId);
            return (
              <div key={receipt.id} className="space-y-2 border-b border-border px-3.5 py-3 last:border-b-0">
                <p className="text-sm font-medium">{receipt.receiptNumber}</p>
                <p className="text-sm">
                  {client?.name ?? "Customer"}
                  <span className="text-muted"> · {flatName(state, receipt.flatId)}</span>
                </p>
                <p className="text-xs font-normal text-muted">{formatKarachiDateMedium(receipt.paymentDate)}</p>
                <p className="text-sm">
                  <span className="money">{formatPKR(receipt.amountReceived)}</span>
                  <span className="text-muted">
                    {" "}
                    · {payment ? methodLabel(payment.method) : ""} · Received by {receiverName(state, payment?.receivedById)}
                  </span>
                </p>
                <p className="text-[11px] font-medium text-muted">{receipt.status}</p>
                <div className="flex flex-wrap items-center gap-x-4">
                  <Link href={`/receipts/${receipt.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-secondary">
                    View
                  </Link>
                  {view ? <ReceiptShareButtons view={view} phone={client?.phone} compact /> : null}
                </div>
              </div>
            );
          })
        )}
      </div>
      <Card className="p-3">
        <p className="text-xs font-normal text-muted">
          {rows.length} receipt{rows.length === 1 ? "" : "s"}
        </p>
      </Card>
    </div>
  );
}

export default function ReportsReceiptsPage() {
  return (
    <Suspense fallback={<p className="text-sm font-normal text-muted">Loading receipts…</p>}>
      <ReportsReceiptsInner />
    </Suspense>
  );
}
