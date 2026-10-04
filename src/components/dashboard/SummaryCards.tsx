"use client";

import Link from "next/link";
import { formatPKR } from "@/lib/money";
import { ledgerHref, type LedgerView } from "@/lib/ledger-href";
import type { DashboardTotals, DateFilterPreset } from "@/types";

const cards: { key: LedgerView; label: string; tone: string }[] = [
  { key: "business", label: "Business", tone: "kh-metric-business" },
  { key: "received", label: "Received", tone: "kh-metric-received" },
  { key: "pending", label: "Pending", tone: "kh-metric-pending" },
  { key: "expenses", label: "Expenses", tone: "kh-metric-expenses" },
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
    <section className="kh-hero">
      <div className="flex items-baseline justify-between gap-3 px-3.5 pb-2.5 pt-3">
        <h2 className="section-title">{periodLabel ?? "This month"}</h2>
        <p className="card-label">Overview</p>
      </div>
      <div className="kh-metrics">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={ledgerHref({ view: card.key, flat, preset, from, to, year, month })}
            className={`kh-metric kh-press ${card.tone}`}
          >
            <span className="kh-metric-kicker">
              <span className="kh-metric-mark" />
              <span className="card-label">{card.label}</span>
            </span>
            <strong className="money">{formatPKR(totals[card.key])}</strong>
            {card.key === "pending" && showCarryForward && totals.carriedForward > 0 ? (
              <span className="text-[11px] font-normal text-muted">{formatPKR(totals.carriedForward)} carried forward</span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
