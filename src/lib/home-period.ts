import {
  formatMonthLabel,
  karachiEndOfDay,
  karachiMonthRange,
  karachiStartOfDay,
  karachiYmd,
  previousKarachiMonth,
  rangeForPreset,
  startOfToday,
} from "@/lib/dates";
import { earliestActivityYmd, monthHasActivity } from "@/lib/month-accounting";
import type { DateFilterPreset, DateRange, LedgerState } from "@/types";

export type HomePeriodKind = "month" | "all" | "custom";

export type HomePeriod = {
  kind: HomePeriodKind;
  year: number;
  month: number;
  custom: DateRange;
};

export function currentHomePeriod(now = new Date()): HomePeriod {
  const today = karachiYmd(now);
  const range = karachiMonthRange(today.year, today.month);
  return { kind: "month", year: today.year, month: today.month, custom: range };
}

export function availableHomeMonths(state: LedgerState, now = new Date()): { year: number; month: number }[] {
  const today = karachiYmd(now);
  const from = earliestActivityYmd(state) ?? { year: today.year, month: today.month };
  const months: { year: number; month: number }[] = [];
  let year = from.year;
  let month = from.month;
  while (year < today.year || (year === today.year && month <= today.month)) {
    const isCurrent = year === today.year && month === today.month;
    if (isCurrent || monthHasActivity(state, year, month)) {
      months.push({ year, month });
    }
    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    year = next.year;
    month = next.month;
    if (months.length > 240) break;
  }
  if (!months.some((item) => item.year === today.year && item.month === today.month)) {
    months.push({ year: today.year, month: today.month });
  }
  return months.sort((a, b) => b.year - a.year || b.month - a.month);
}

export function allTimeRange(state: LedgerState, now = new Date()): DateRange {
  const today = karachiYmd(now);
  const earliest = earliestActivityYmd(state) ?? today;
  return {
    from: karachiStartOfDay(earliest.year, earliest.month, 1),
    to: karachiEndOfDay(today.year, today.month, today.day),
  };
}

export function periodRange(period: HomePeriod, state: LedgerState, now = new Date()): DateRange {
  if (period.kind === "all") return allTimeRange(state, now);
  if (period.kind === "custom") return rangeForPreset("custom", period.custom, now);
  return karachiMonthRange(period.year, period.month);
}

export function isHistoricalRange(range: DateRange, now = new Date()): boolean {
  return range.to < startOfToday(now);
}

export function periodLabelForHome(period: HomePeriod): string {
  if (period.kind === "all") return "All Time";
  if (period.kind === "custom") return "Custom";
  return formatMonthLabel(period.year, period.month);
}

export function canGoPrevMonth(period: HomePeriod, months: { year: number; month: number }[]): boolean {
  if (period.kind !== "month" || months.length === 0) return false;
  const index = months.findIndex((item) => item.year === period.year && item.month === period.month);
  return index >= 0 && index < months.length - 1;
}

export function canGoNextMonth(period: HomePeriod, months: { year: number; month: number }[], now = new Date()): boolean {
  if (period.kind !== "month") return false;
  const today = karachiYmd(now);
  if (period.year > today.year || (period.year === today.year && period.month >= today.month)) return false;
  const index = months.findIndex((item) => item.year === period.year && item.month === period.month);
  return index > 0;
}

export function stepHomeMonth(
  period: HomePeriod,
  months: { year: number; month: number }[],
  direction: -1 | 1,
  now = new Date(),
): HomePeriod {
  if (period.kind !== "month") return period;
  const index = months.findIndex((item) => item.year === period.year && item.month === period.month);
  const next = months[index + (direction === 1 ? -1 : 1)];
  if (!next) return period;
  const today = karachiYmd(now);
  if (next.year > today.year || (next.year === today.year && next.month > today.month)) return period;
  return { ...period, kind: "month", year: next.year, month: next.month };
}

export function adjacentMonth(year: number, month: number, direction: -1 | 1): { year: number; month: number } {
  if (direction === -1) return previousKarachiMonth(year, month);
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function toPreset(period: HomePeriod): DateFilterPreset {
  if (period.kind === "all") return "all";
  if (period.kind === "custom") return "custom";
  return "month";
}

export function periodFromPreset(
  preset: DateFilterPreset,
  year: number | null,
  month: number | null,
  custom: DateRange,
  now = new Date(),
): HomePeriod {
  const today = karachiYmd(now);
  if (preset === "all") return { kind: "all", year: today.year, month: today.month, custom };
  if (preset === "custom") return { kind: "custom", year: today.year, month: today.month, custom };
  if (year && month && month >= 1 && month <= 12) {
    return { kind: "month", year, month, custom: karachiMonthRange(year, month) };
  }
  return currentHomePeriod(now);
}
