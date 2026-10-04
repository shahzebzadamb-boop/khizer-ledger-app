"use client";

import { FormEvent, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { currentInterpretation, reviewMonth, stayRemaining } from "@/lib/ledger";
import { formatDate } from "@/lib/dates";
import { formatPKR } from "@/lib/money";
import { parseMigrationUpdate, type MigrationParseResult } from "@/lib/parse-migration-update";
import { useLedger } from "@/lib/store";
import type { MigrationRecord, MigrationStatus } from "@/types";

type Filter = "NEEDS_REVIEW" | "CONFIRMED" | "IGNORED" | "ALL";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "NEEDS_REVIEW", label: "Needs Review" },
  { value: "CONFIRMED", label: "Reviewed" },
  { value: "IGNORED", label: "Ignored" },
  { value: "ALL", label: "All" },
];

function statusLabel(status: MigrationStatus) {
  if (status === "CONFIRMED") return "Reviewed";
  if (status === "IGNORED") return "Ignored";
  return "Needs Review";
}

function stayInfo(item: MigrationRecord, nights?: number) {
  const bits = [
    item.date ? formatDate(item.date.includes("T") ? item.date : `${item.date}T00:00:00`) : "Date missing",
    nights ? `${nights} nights` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

export default function MigrationPage() {
  const { state, dispatch } = useLedger();
  const [filter, setFilter] = useState<Filter>("NEEDS_REVIEW");
  const [toast, setToast] = useState(false);

  const needs = state.reviews.filter((item) => item.status === "NEEDS_REVIEW").length;
  const reviewed = state.reviews.filter((item) => item.status === "CONFIRMED").length;
  const ignored = state.reviews.filter((item) => item.status === "IGNORED").length;

  const rows = useMemo(
    () =>
      state.reviews.filter((item) => (filter === "ALL" ? true : item.status === filter)),
    [filter, state.reviews],
  );

  return (
    <div className="space-y-4">
      {toast ? (
        <p className="toast-ok">✓ Updated</p>
      ) : null}
      <PageHeader
        title="Migration review"
        subtitle="Fix one spreadsheet row at a time. Historical pending stays quiet until you confirm still pending."
      />
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card className="p-3">
          <p className="card-label">Needs Review</p>
          <p className="money mt-1 text-lg">{needs}</p>
        </Card>
        <Card className="p-3">
          <p className="card-label">Reviewed</p>
          <p className="money mt-1 text-lg">{reviewed}</p>
        </Card>
        <Card className="p-3">
          <p className="card-label">Ignored</p>
          <p className="money mt-1 text-lg">{ignored}</p>
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={`chip ${filter === item.value ? "chip-active" : ""}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Nothing in this filter.</p>
        </Card>
      ) : null}
      {rows.map((item) => (
        <ReviewCard
          key={item.id}
          item={item}
          interpretation={currentInterpretation(item, state)}
          remaining={item.stayId ? stayRemaining(item.stayId, state) : null}
          nights={item.stayId ? state.stays.find((stay) => stay.id === item.stayId)?.nights : undefined}
          onUpdated={() => {
            setToast(true);
            window.setTimeout(() => setToast(false), 1600);
          }}
        />
      ))}
    </div>
  );
}

function ReviewCard({
  item,
  interpretation,
  remaining,
  nights,
  onUpdated,
}: {
  item: MigrationRecord;
  interpretation: string;
  remaining: number | null;
  nights?: number;
  onUpdated: () => void;
}) {
  const { persist } = useLedger();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<MigrationParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  function process() {
    setError(null);
    setParsed(parseMigrationUpdate(text, item.flatName));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    process();
  }

  async function confirm() {
    if (!parsed || parsed.type === "ambiguous" || saving) return;
    setSaving(true);
    try {
      await persist({
        type: "APPLY_MIGRATION_UPDATE",
        id: item.id,
        patch: parsed,
        correctionText: text,
      });
      setText("");
      setParsed(null);
      setError(null);
      setSaveFailed(false);
      onUpdated();
    } catch {
      setSaveFailed(true);
      setError("Save failed. Your text is still here.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-2.5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Flat {item.flatName}</p>
          <p className="mt-0.5 text-xs font-normal text-muted">{reviewMonth(item)}</p>
        </div>
        <p className="text-xs font-medium text-secondary">{statusLabel(item.status)}</p>
      </div>
      <p className="text-xs font-normal text-muted">
        {item.sourceFile} · {item.sourceSheet} · row {item.sourceRow}
      </p>
      <p className="text-sm font-semibold">{item.customer ?? "No customer"}</p>
      <p className="text-sm font-normal text-muted">{stayInfo(item, nights)}</p>
      {remaining !== null ? (
        <p className="text-sm">
          Current pending <span className="money text-warning">{formatPKR(remaining)}</span>
        </p>
      ) : null}
      <div className="rounded-xl bg-input p-3">
        <p className="card-label">Original spreadsheet text</p>
        <p className="mt-1 text-sm font-normal text-muted">{item.sourceText}</p>
      </div>
      <div>
        <p className="card-label">Current interpretation</p>
        <p className="mt-1 text-sm">{interpretation}</p>
      </div>
      {item.status === "NEEDS_REVIEW" ? (
        <form onSubmit={onSubmit} className="space-y-2">
          <p className="section-title">Quick Update</p>
          <textarea
            rows={3}
            value={text}
            placeholder="Yahan likho kya fix karna hai..."
            className="w-full resize-none rounded-xl border border-border bg-input px-3 py-3 text-base"
            onChange={(event) => {
              setText(event.target.value);
              setParsed(null);
              setError(null);
            }}
          />
          <Button type="submit" variant="primary" className="w-full" disabled={!text.trim()}>
            Update
          </Button>
          {error ? <p className="text-sm text-warning">{error}</p> : null}
          {parsed?.type === "ambiguous" ? <p className="text-sm">{parsed.reason}</p> : null}
          {parsed && parsed.type === "patch" ? (
            <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
              <p className="text-sm font-medium">{parsed.summary}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="primary" onClick={() => void confirm()} disabled={saving}>
                  {saveFailed ? "Retry" : "Confirm"}
                </Button>
                <Button type="button" onClick={() => setParsed(null)}>
                  Edit
                </Button>
              </div>
            </div>
          ) : null}
        </form>
      ) : item.lastQuickUpdate ? (
        <p className="text-sm font-normal text-muted">Last update: {item.lastQuickUpdate}</p>
      ) : null}
    </Card>
  );
}
