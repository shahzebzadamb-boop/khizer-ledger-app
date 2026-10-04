"use client";

import { useMemo, useState } from "react";
import {
  availableHomeMonths,
  canGoNextMonth,
  canGoPrevMonth,
  periodLabelForHome,
  stepHomeMonth,
  type HomePeriod,
} from "@/lib/home-period";
import { formatMonthLabel, karachiDateInput, karachiYmd } from "@/lib/dates";
import type { DateRange, LedgerState } from "@/types";

export function MonthFilter({
  period,
  onChange,
  state,
}: {
  period: HomePeriod;
  onChange: (next: HomePeriod) => void;
  state: LedgerState;
}) {
  const [open, setOpen] = useState(false);
  const months = useMemo(() => availableHomeMonths(state), [state]);
  const label = periodLabelForHome(period);

  function pickMonth(year: number, month: number) {
    onChange({ ...period, kind: "month", year, month });
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="chip px-3"
          disabled={!canGoPrevMonth(period, months)}
          onClick={() => onChange(stepHomeMonth(period, months, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <button type="button" className="chip chip-active min-w-0 flex-1 justify-center" onClick={() => setOpen((value) => !value)}>
          {label} ▾
        </button>
        <button
          type="button"
          className="chip px-3"
          disabled={!canGoNextMonth(period, months)}
          onClick={() => onChange(stepHomeMonth(period, months, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      {open ? (
        <div className="max-h-64 overflow-y-auto rounded-2xl border border-border bg-surface p-2">
          <button type="button" className={`chip mb-1 w-full justify-center ${period.kind === "all" ? "chip-active" : ""}`} onClick={() => { onChange({ ...period, kind: "all" }); setOpen(false); }}>
            All Time
          </button>
          <button type="button" className={`chip mb-2 w-full justify-center ${period.kind === "custom" ? "chip-active" : ""}`} onClick={() => { onChange({ ...period, kind: "custom" }); setOpen(false); }}>
            Custom
          </button>
          {months.map((item) => {
            const active = period.kind === "month" && period.year === item.year && period.month === item.month;
            const text = formatMonthLabel(item.year, item.month);
            return (
              <button
                key={`${item.year}-${item.month}`}
                type="button"
                className={`chip mb-1 w-full justify-center ${active ? "chip-active" : ""}`}
                onClick={() => pickMonth(item.year, item.month)}
              >
                {text}
              </button>
            );
          })}
        </div>
      ) : null}
      {period.kind === "custom" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-normal text-muted">
            From
            <input
              type="date"
              className="mt-1"
              value={toInput(period.custom.from)}
              max={karachiDateInput()}
              onChange={(event) =>
                onChange({
                  ...period,
                  kind: "custom",
                  custom: { ...period.custom, from: fromInput(event.target.value, period.custom.from) },
                })
              }
            />
          </label>
          <label className="text-xs font-normal text-muted">
            To
            <input
              type="date"
              className="mt-1"
              value={toInput(period.custom.to)}
              max={karachiDateInput()}
              onChange={(event) =>
                onChange({
                  ...period,
                  kind: "custom",
                  custom: { ...period.custom, to: fromInput(event.target.value, period.custom.to) },
                })
              }
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function toInput(date: Date) {
  const { year, month, day } = karachiYmd(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fromInput(value: string, fallback: Date): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return fallback;
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+05:00`);
}
