import {
  addDays,
  differenceInCalendarDays,
  format,
  isBefore,
  isSameDay,
  startOfDay,
} from "date-fns";
import type { DateFilterPreset, DateRange } from "@/types";

export const KARACHI = "Asia/Karachi";
const KARACHI_OFFSET = "+05:00";

export function toISO(date: Date): string {
  return date.toISOString();
}

export function fromISO(value: string): Date {
  return new Date(value);
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function karachiYmd(now = new Date()): { year: number; month: number; day: number } {
  const text = new Intl.DateTimeFormat("en-CA", {
    timeZone: KARACHI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = text.split("-").map(Number);
  return { year, month, day };
}

export function karachiWallTime(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): Date {
  return new Date(
    `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}.${String(ms).padStart(3, "0")}${KARACHI_OFFSET}`,
  );
}

export function addCalendarDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

export function karachiStartOfDay(year: number, month: number, day: number): Date {
  return karachiWallTime(year, month, day, 0, 0, 0, 0);
}

export function karachiEndOfDay(year: number, month: number, day: number): Date {
  const next = addCalendarDays(year, month, day, 1);
  return new Date(karachiStartOfDay(next.year, next.month, next.day).getTime() - 1);
}

export function karachiMonthRange(year: number, month: number): DateRange {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    from: karachiStartOfDay(year, month, 1),
    to: new Date(karachiStartOfDay(next.year, next.month, 1).getTime() - 1),
  };
}

export function previousKarachiMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function isCompletedKarachiMonth(year: number, month: number, now = new Date()): boolean {
  const today = karachiYmd(now);
  return year < today.year || (year === today.year && month < today.month);
}

export function formatMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    Date.UTC(year, month - 1, 1),
  );
}

export function periodLabel(preset: DateFilterPreset, range: DateRange): string {
  if (preset === "today") return "Today";
  if (preset === "7days") return "Last 7 days";
  if (preset === "all") return "All Time";
  const from = karachiYmd(range.from);
  const to = karachiYmd(range.to);
  if (preset === "month" || (from.year === to.year && from.month === to.month && from.day === 1 && to.day >= 28)) {
    return formatMonthLabel(from.year, from.month);
  }
  if (from.year === to.year && from.month === to.month && from.day === to.day) {
    return `${from.day} ${formatMonthLabel(from.year, from.month)}`;
  }
  return `${from.day} ${format(Date.UTC(from.year, from.month - 1, 1), "MMM")} – ${to.day} ${format(Date.UTC(to.year, to.month - 1, 1), "MMM yyyy")}`;
}

export function startOfToday(now = new Date()): Date {
  const { year, month, day } = karachiYmd(now);
  return karachiStartOfDay(year, month, day);
}

export function rangeForPreset(
  preset: DateFilterPreset,
  custom: DateRange | null,
  now = new Date(),
): DateRange {
  if (preset === "all") {
    const today = karachiYmd(now);
    return {
      from: karachiStartOfDay(2015, 1, 1),
      to: karachiEndOfDay(today.year, today.month, today.day),
    };
  }

  if (preset === "custom" && custom) {
    const from = karachiYmd(custom.from);
    const to = karachiYmd(custom.to);
    return {
      from: karachiStartOfDay(from.year, from.month, from.day),
      to: karachiEndOfDay(to.year, to.month, to.day),
    };
  }

  const today = karachiYmd(now);
  if (preset === "today") {
    return {
      from: karachiStartOfDay(today.year, today.month, today.day),
      to: karachiEndOfDay(today.year, today.month, today.day),
    };
  }

  if (preset === "7days") {
    const from = addCalendarDays(today.year, today.month, today.day, -6);
    return {
      from: karachiStartOfDay(from.year, from.month, from.day),
      to: karachiEndOfDay(today.year, today.month, today.day),
    };
  }

  return karachiMonthRange(today.year, today.month);
}

export function inRange(isoDate: string, range: DateRange): boolean {
  const date = new Date(isoDate);
  return date >= range.from && date <= range.to;
}

function karachiDateKey(value: string | Date): number {
  const { year, month, day } = karachiYmd(typeof value === "string" ? new Date(value) : value);
  return year * 10000 + month * 100 + day;
}

export function inKarachiRange(isoDate: string, range: DateRange): boolean {
  const key = karachiDateKey(isoDate);
  return key >= karachiDateKey(range.from) && key <= karachiDateKey(range.to);
}

export function formatKarachiDateLong(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KARACHI,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(isoDate));
}

export function formatKarachiDateMedium(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KARACHI,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(isoDate));
}

export function karachiYmdKey(isoDate: string | Date): string {
  const { year, month, day } = karachiYmd(typeof isoDate === "string" ? new Date(isoDate) : isoDate);
  return `${year}${pad2(month)}${pad2(day)}`;
}

export function formatDate(isoDate: string): string {
  return formatKarachiDateMedium(isoDate);
}

export function formatDateShort(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KARACHI,
    day: "numeric",
    month: "short",
  }).format(new Date(isoDate));
}

export function formatStayDates(checkIn: string, checkOut: string): string {
  return `${formatDateShort(checkIn)} – ${formatDateShort(checkOut)}`;
}

export function nightsBetween(checkIn: Date | string, checkOut: Date | string): number {
  return differenceInCalendarDays(startOfDay(new Date(checkOut)), startOfDay(new Date(checkIn)));
}

export function karachiDateInput(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function dateInputToISO(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return karachiStartOfDay(karachiYmd().year, karachiYmd().month, karachiYmd().day).toISOString();
  return karachiStartOfDay(year, month, day).toISOString();
}

export function overdueDays(dueDateISO: string, now = new Date()): number {
  const due = startOfDay(new Date(dueDateISO));
  const today = startOfDay(now);
  if (!isBefore(due, today)) return 0;
  return differenceInCalendarDays(today, due);
}

export function dueLabel(dueDateISO: string, now = new Date()): string {
  const due = startOfDay(new Date(dueDateISO));
  const today = startOfDay(now);
  if (isSameDay(due, today)) return "Due today";
  if (isSameDay(due, addDays(today, 1))) return "Due tomorrow";
  const days = overdueDays(dueDateISO, now);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} overdue`;
  return `Due ${formatDateShort(dueDateISO)}`;
}

export function daysFromToday(days: number, now = new Date()): Date {
  return startOfDay(addDays(now, days));
}
