"use client";

import Link from "next/link";
import { formatPKR } from "@/lib/money";
import { ledgerHref, type LedgerView } from "@/lib/ledger-href";
import type { DashboardTotals, DateFilterPreset } from "@/types";

const cards: { key: LedgerView; label: string; amountClass: string }[] = [
  { key: "business", label: "Business", amountClass: "text-foreground" },
  { key: "received", label: "Received", amountClass: "text-primary" },
  { key: "pending", label: "Pending", amountClass: "text-warning" },
  { key: "expenses", label: "Expenses", amountClass: "text-foreground" },
];

export function SummaryCards({
  totals,
  flat,
  preset,
  from,
  to,
  year,
  month,
  periodLabel,
  showCarryForward,
}: {
  totals: DashboardTotals;
  flat: string;
  preset: DateFilterPreset;
  from?: string;
  to?: string;
  year?: number;
  month?: number;
  periodLabel?: string;
  showCarryForward?: boolean;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title">Money summary</h2>
        {periodLabel ? <p className="text-xs font-normal text-muted">{periodLabel}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={ledgerHref({ view: card.key, flat, preset, from, to, year, month })}
            className="rounded-2xl border border-border bg-surface p-3"
          >
            <p className="card-label">{card.label}</p>
            <p className={`money mt-1.5 text-lg ${card.amountClass}`}>{formatPKR(totals[card.key])}</p>
            {card.key === "pending" && showCarryForward && totals.carriedForward > 0 ? (
              <p className="mt-1 text-[11px] font-normal text-muted">{formatPKR(totals.carriedForward)} carried forward</p>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
