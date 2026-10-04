"use client";

import type { DateFilterPreset, DateRange, Flat } from "@/types";
import { cn } from "@/lib/utils";

const presets: { value: DateFilterPreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7days", label: "7 Days" },
  { value: "month", label: "This Month" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom" },
];

export function DateFilter({
  flats,
  selectedFlat,
  onFlat,
  preset,
  custom,
  onPreset,
  onCustom,
  hidePresets = false,
}: {
  flats: Flat[];
  selectedFlat: string;
  onFlat: (value: string) => void;
  preset: DateFilterPreset;
  custom: DateRange;
  onPreset: (value: DateFilterPreset) => void;
  onCustom: (value: DateRange) => void;
  hidePresets?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-2.5">
      <div className="flex flex-wrap gap-2">
        <Chip active={selectedFlat === "all"} onClick={() => onFlat("all")}>
          All Flats
        </Chip>
        {flats.map((flat) => (
          <Chip key={flat.id} active={selectedFlat === flat.name} onClick={() => onFlat(flat.name)}>
            {flat.name}
          </Chip>
        ))}
      </div>
      {hidePresets ? null : (
        <>
          <div className="flex flex-wrap gap-2">
            {presets.map((item) => (
              <Chip key={item.value} active={preset === item.value} onClick={() => onPreset(item.value)}>
                {item.label}
              </Chip>
            ))}
          </div>
          {preset === "custom" ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                className="rounded-xl border border-border bg-input px-3 text-base"
                value={toInput(custom.from)}
                onChange={(event) => onCustom({ ...custom, from: new Date(event.target.value) })}
              />
              <input
                type="date"
                className="rounded-xl border border-border bg-input px-3 text-base"
                value={toInput(custom.to)}
                onChange={(event) => onCustom({ ...custom, to: new Date(event.target.value) })}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("chip", active && "chip-active")}
    >
      {children}
    </button>
  );
}

function toInput(date: Date) {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return ymd;
}
