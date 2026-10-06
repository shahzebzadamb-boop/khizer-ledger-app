"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { availableForWithdrawal, matchClient, paymentStayChoices, uniquePaymentStayId } from "@/lib/ledger";
import { activeFlats, knownFlatNames } from "@/lib/flats";
import {
  correctionPreview,
  correctionQuestion,
  correctionTargets,
  uniqueTarget,
  type CorrectionPreview,
  type CorrectionTarget,
} from "@/lib/corrections";
import { formatPKR, methodLabel } from "@/lib/money";
import {
  isConfirmable,
  parseQuickEntry,
  type ConfirmableDraft,
  type ParsedQuickEntry,
  type TransactionType,
} from "@/lib/parse-quick-entry";
import type { CorrectionDraft } from "@/lib/parse-correction";
import { ClientIdentityFields } from "@/components/clients/ClientIdentityFields";
import { useLedger } from "@/lib/store";
import { newestCreatedReceipt, type AddedReceiptInfo } from "@/lib/receipts";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "Yahan likho kya hua...";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      {label ? <p className="text-sm text-muted">{label}</p> : <span />}
      <p className="text-right text-sm font-medium">{value}</p>
    </div>
  );
}

function ConfirmBody({ parsed }: { parsed: ConfirmableDraft }) {
  if (parsed.type === "correction") return null;
  if (parsed.type === "rent") {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Flat rent</p>
        <Field label="Customer" value={parsed.clientName} />
        {parsed.flat ? <Field label="Flat" value={parsed.flat} /> : null}
        <Field label="Stay" value={`${parsed.nights} days`} />
        <Field label="Revenue" value={formatPKR(parsed.totalAmount)} />
        <Field label="Received" value={formatPKR(parsed.receivedAmount)} />
        <Field label="Pending" value={formatPKR(parsed.remaining)} />
        <Field label="Method" value={methodLabel(parsed.method)} />
        {parsed.receivedAmount > 0 ? <Field label="Received By" value={parsed.receivedByName} /> : null}
      </>
    );
  }
  if (parsed.type === "payment") {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payment</p>
        <p className="pt-1 text-sm font-medium">{parsed.clientName}</p>
        {parsed.flat ? <p className="text-sm text-muted">Flat {parsed.flat}</p> : null}
        <Field label="Received" value={formatPKR(parsed.amount)} />
        <Field label="Method" value={methodLabel(parsed.method)} />
        <Field label="Received By" value={parsed.receivedByName} />
      </>
    );
  }
  if (parsed.type === "expense") {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Expense</p>
        <Field label="Item" value={parsed.description} />
        {parsed.flat ? <Field label="Flat" value={parsed.flat} /> : null}
        <Field label="Amount" value={formatPKR(parsed.amount)} />
        <Field label="Method" value={methodLabel(parsed.method)} />
      </>
    );
  }
  if (parsed.type === "security") {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Security</p>
        <Field label="Customer" value={parsed.clientName} />
        {parsed.flat ? <Field label="Flat" value={parsed.flat} /> : null}
        <Field label="Held" value={formatPKR(parsed.amount)} />
      </>
    );
  }
  if (parsed.type === "security_adjustment") {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Security adjustment</p>
        <Field label="Customer" value={parsed.clientName} />
        <Field label="Applied to rent" value={formatPKR(parsed.amount)} />
        <p className="pt-2 text-sm text-muted">No new cash. This only moves security into rent.</p>
      </>
    );
  }
  if (parsed.type === "discount") {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Discount</p>
        <Field label="Customer" value={parsed.clientName} />
        <Field label="Amount" value={formatPKR(parsed.amount)} />
      </>
    );
  }
  if (parsed.type === "extension") {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Stay extension</p>
        <Field label="Customer" value={parsed.clientName} />
        {parsed.flat ? <Field label="Flat" value={parsed.flat} /> : null}
        <Field label="Extra days" value={String(parsed.extraNights)} />
        <Field label="Added revenue" value={formatPKR(parsed.extraRevenue)} />
      </>
    );
  }
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Withdrawal</p>
      <Field label="Amount" value={formatPKR(parsed.amount)} />
    </>
  );
}

function CorrectionBody({ preview }: { preview: CorrectionPreview }) {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{preview.title}</p>
      <p className="text-sm font-medium">{preview.clientName}</p>
      {preview.flat ? <p className="text-sm text-muted">Flat {preview.flat}</p> : null}
      <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Before</p>
      {preview.before.map((row) => (
        <Field key={`b-${row.label}`} label={row.label} value={row.value} />
      ))}
      <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">After</p>
      {preview.after.map((row) => (
        <Field key={`a-${row.label}`} label={row.label} value={row.value} />
      ))}
    </>
  );
}

export function QuickEntry({ onAdded }: { onAdded: (info?: AddedReceiptInfo) => void }) {
  const { state, persist } = useLedger();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedQuickEntry | null>(null);
  const [phonePrompt, setPhonePrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stayId, setStayId] = useState<string | null>(null);
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const knownClients = useMemo(
    () => state.clients.map((client) => ({ name: client.name, phone: client.phone })),
    [state.clients],
  );
  const knownFlats = useMemo(() => knownFlatNames(state), [state]);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener("focus-quick-entry", focus);
    if (new URLSearchParams(window.location.search).get("entry") === "1") focus();
    return () => window.removeEventListener("focus-quick-entry", focus);
  }, []);

  const stayChoices = useMemo(() => {
    if (!parsed || parsed.type !== "payment") return [];
    const client = matchClient(state, parsed.clientName, parsed.phone);
    if (!client) return [];
    return paymentStayChoices(state, client.id, parsed.flat);
  }, [parsed, state]);

  const correctionChoices = useMemo((): CorrectionTarget[] => {
    if (!parsed || parsed.type !== "correction") return [];
    return correctionTargets(state, parsed);
  }, [parsed, state]);

  const selectedCorrection = useMemo(() => {
    if (!parsed || parsed.type !== "correction") return null;
    return correctionChoices.find((item) => item.id === correctionId) ?? uniqueTarget(correctionChoices);
  }, [parsed, correctionChoices, correctionId]);

  const preview = useMemo((): CorrectionPreview | null => {
    if (!parsed || parsed.type !== "correction" || !selectedCorrection) return null;
    return correctionPreview(state, parsed, selectedCorrection);
  }, [parsed, selectedCorrection, state]);

  function process(forceType?: TransactionType) {
    setError(null);
    setStayId(null);
    setCorrectionId(null);
    setParsed(forceType ? parseQuickEntry(text, { knownClients, knownFlats }, forceType) : parseQuickEntry(text, { knownClients, knownFlats }));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    process();
  }

  async function confirm() {
    if (!parsed || !isConfirmable(parsed) || saving) return;
    if (("needsPhone" in parsed && parsed.needsPhone && !phonePrompt.trim())) {
      setError("Add customer number");
      return;
    }
    if (parsed.type === "withdrawal") {
      const available = availableForWithdrawal(state);
      if (parsed.amount > available) {
        setError(`Only ${formatPKR(available)} is currently available.`);
        return;
      }
    }
    let next: ConfirmableDraft =
      "needsPhone" in parsed && parsed.needsPhone
        ? { ...parsed, phone: phonePrompt.trim(), needsPhone: false }
        : parsed;
    if (activeFlats(state).length === 0 && (next.type === "rent" || next.type === "extension" || next.type === "security")) {
      setError("Add apartment first");
      return;
    }
    if (next.type === "correction") {
      const chosen = selectedCorrection ?? uniqueTarget(correctionChoices);
      if (!chosen) {
        setError(correctionChoices.length === 0 ? "Could not find that entry." : correctionQuestion(next));
        return;
      }
      const draft: CorrectionDraft =
        chosen.kind === "client"
          ? { ...next, newClientId: chosen.id, targetId: next.targetId ?? null }
          : { ...next, targetId: chosen.id, targetKind: chosen.kind };
      setSaving(true);
      try {
        const before = state;
        const saved = await persist({ type: "APPLY_CORRECTION", parsed: draft });
        setText("");
        setParsed(null);
        setStayId(null);
        setCorrectionId(null);
        setPhonePrompt("");
        setError(null);
        setSaveFailed(false);
        onAdded({ receiptId: newestCreatedReceipt(before, saved)?.id ?? null });
      } catch {
        setSaveFailed(true);
        setError("Couldn't save. Please try again.");
      } finally {
        setSaving(false);
      }
      return;
    }
    if (next.type === "payment") {
      const chosen = stayId ?? uniquePaymentStayId(stayChoices);
      if (!chosen) {
        setError(stayChoices.length === 0 ? "No stay for this customer. Record rent first." : "Which stay?");
        return;
      }
      next = { ...next, stayId: chosen };
    }
    setSaving(true);
    try {
      const before = state;
      const saved = await persist({ type: "APPLY_QUICK_ENTRY", parsed: next });
      setText("");
      setParsed(null);
      setStayId(null);
      setPhonePrompt("");
      setError(null);
      setSaveFailed(false);
      onAdded({ receiptId: newestCreatedReceipt(before, saved)?.id ?? null });
    } catch {
      setSaveFailed(true);
      setError("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="kh-panel space-y-3">
      <div>
        <h2 className="section-title">Quick Entry</h2>
        <p className="mt-0.5 text-xs font-normal text-muted">Tell Khizer Ledger what happened</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="sr-only" htmlFor="quick-entry">
          Yahan likho kya hua...
        </label>
        <textarea
          id="quick-entry"
          ref={inputRef}
          value={text}
          rows={4}
          placeholder={PLACEHOLDER}
          className="min-h-28 w-full resize-none rounded-2xl border border-border bg-input px-3.5 py-3 text-base"
          onChange={(event) => {
            setText(event.target.value);
            setParsed(null);
            setStayId(null);
            setCorrectionId(null);
            setError(null);
            setSaveFailed(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (text.trim()) process();
            }
          }}
        />
        <div className="kh-seg-scroll">
          {["20k received", "Electric bill 8k", "2 nights 40k"].map((example) => (
            <button
              key={example}
              type="button"
              className="chip"
              onClick={() => {
                setText(example);
                setParsed(null);
                setStayId(null);
                setCorrectionId(null);
                setError(null);
                setSaveFailed(false);
                inputRef.current?.focus();
              }}
            >
              {example}
            </button>
          ))}
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled={!text.trim()}>
          Process
          <ArrowRight size={16} />
        </Button>
      </form>

      {error ? <p className="text-sm text-warning">{error}</p> : null}

      {parsed?.type === "ambiguous" ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
          <p className="text-sm">{parsed.reason}</p>
          <div className="grid grid-cols-3 gap-2">
            <Button onClick={() => process("RENT")}>Rent</Button>
            <Button onClick={() => process("PAYMENT")}>Payment</Button>
            <Button onClick={() => process("EXPENSE")}>Expense</Button>
          </div>
        </div>
      ) : null}

      {parsed && isConfirmable(parsed) ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
          {parsed.type === "correction" ? (
            <>
              {preview ? <CorrectionBody preview={preview} /> : <p className="text-sm font-medium">CORRECTION</p>}
              {correctionChoices.length > 1 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{correctionQuestion(parsed)}</p>
                  {correctionChoices.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      className={cn("chip w-full justify-start", correctionId === choice.id && "chip-active")}
                      onClick={() => setCorrectionId(choice.id)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {correctionChoices.length === 0 ? (
                <p className="text-sm text-warning">Could not find that entry.</p>
              ) : null}
            </>
          ) : (
            <ConfirmBody parsed={parsed} />
          )}
          {parsed.type === "payment" && stayChoices.length > 1 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Which stay?</p>
              {stayChoices.map((choice) => (
                <button
                  key={choice.stayId}
                  type="button"
                  className={cn("chip w-full justify-start", stayId === choice.stayId && "chip-active")}
                  onClick={() => setStayId(choice.stayId)}
                >
                  {choice.flat} · {choice.nights} night{choice.nights === 1 ? "" : "s"} · {formatPKR(choice.pending)} pending
                </button>
              ))}
            </div>
          ) : null}
          {parsed.type === "payment" && stayChoices.length === 0 ? (
            <p className="text-sm text-warning">No stay for this customer. Record rent first.</p>
          ) : null}
          {"needsPhone" in parsed && parsed.needsPhone ? (
            <ClientIdentityFields
              nameId="quick-entry-client-name"
              phoneId="quick-entry-client-phone"
              name={"clientName" in parsed ? parsed.clientName : ""}
              phone={phonePrompt}
              state={state}
              onNameChange={(value) => {
                if ("clientName" in parsed) setParsed({ ...parsed, clientName: value });
              }}
              onPhoneChange={setPhonePrompt}
            />
          ) : null}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              variant="primary"
              onClick={() => void confirm()}
              disabled={
                saving ||
                (parsed.type === "payment" && stayChoices.length !== 1 && !stayId) ||
                (parsed.type === "correction" && !selectedCorrection)
              }
            >
              {saveFailed ? "Retry" : "Confirm"}
            </Button>
            <Button onClick={() => setParsed(null)}>Edit</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
