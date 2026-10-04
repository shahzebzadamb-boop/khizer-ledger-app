"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Field, Sheet, fieldClass } from "@/components/ui/Sheet";
import { dateInputToISO, formatStayDates, karachiDateInput } from "@/lib/dates";
import { paymentStayChoices, stayRemaining, uniquePaymentStayId } from "@/lib/ledger";
import { formatPKR, parseFormAmount } from "@/lib/money";
import { useLedger } from "@/lib/store";
import { newestCreatedReceipt, type AddedReceiptInfo } from "@/lib/receipts";
import { PAYMENT_METHODS, type PaymentMethod } from "@/types";

export function AddPaymentSheet({
  stayId,
  clientId,
  onClose,
  onAdded,
}: {
  stayId?: string;
  clientId?: string;
  onClose: () => void;
  onAdded?: (info?: AddedReceiptInfo) => void;
}) {
  const { persist, state } = useLedger();
  const lockedStay = stayId ? state.stays.find((item) => item.id === stayId) : null;
  const clients = state.clients.filter((client) =>
    state.stays.some((stay) => stay.clientId === client.id && !stay.voided),
  );
  const lock = useRef(false);
  const [selectedClientId, setSelectedClientId] = useState(clientId ?? lockedStay?.clientId ?? clients[0]?.id ?? "");
  const [selectedStayId, setSelectedStayId] = useState(stayId ?? "");
  const [amountRaw, setAmountRaw] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [receivedById, setReceivedById] = useState(
    state.receivers.find((item) => item.name === "Anas")?.id ?? "recv_anas",
  );
  const [newReceiver, setNewReceiver] = useState("");
  const [date, setDate] = useState(karachiDateInput());
  const [notes, setNotes] = useState("");
  const [overpayOk, setOverpayOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choices = useMemo(
    () => (selectedClientId ? paymentStayChoices(state, selectedClientId, null) : []),
    [selectedClientId, state],
  );
  const autoStayId = uniquePaymentStayId(choices);
  const stayChoiceId = stayId ?? (selectedStayId || autoStayId || "");
  const stay = state.stays.find((item) => item.id === stayChoiceId);
  const remaining = stay ? stayRemaining(stay.id, state) : 0;
  const amount = parseFormAmount(amountRaw, false);
  const extra = amount != null && remaining > 0 && amount > remaining ? amount - remaining : 0;
  const addingReceiver = receivedById === "__new";
  const activeReceivers = state.receivers.filter((item) => item.active);

  async function save() {
    if (!selectedClientId) {
      setError("Choose a customer.");
      return;
    }
    if (!stayChoiceId) {
      setError(choices.length > 1 ? "Choose which stay this payment belongs to." : "No stay found for this customer.");
      return;
    }
    if (amount == null) {
      setError("Enter a valid amount.");
      return;
    }
    if (addingReceiver && !newReceiver.trim()) {
      setError("Enter the receiver name.");
      return;
    }
    if (extra > 0 && !overpayOk) {
      setError(`This is ${formatPKR(extra)} more than the current pending amount.`);
      return;
    }
    if (lock.current || amount <= 0) return;
    lock.current = true;
    setSaving(true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    try {
      const before = state;
      const next = await persist({
        type: "RECORD_PAYMENT",
        payload: {
          clientId: selectedClientId,
          stayId: stayChoiceId,
          amount,
          method,
          receivedById: addingReceiver ? undefined : receivedById,
          receivedByName: addingReceiver ? newReceiver.trim() : undefined,
          receivedAt: dateInputToISO(date),
          notes: notes.trim() || null,
        },
      });
      onAdded?.({ receiptId: newestCreatedReceipt(before, next)?.id ?? null });
      onClose();
    } catch {
      setError("Save failed.");
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <Sheet title="Add payment" onClose={onClose}>
      {error ? <p className="mb-3 text-sm font-normal text-warning">{error}</p> : null}
      {clients.length === 0 ? (
        <p className="text-sm font-normal text-muted">No stays yet. Add a stay first.</p>
      ) : (
        <div className="space-y-3">
          {!stayId ? (
            <Field label="Customer">
              <select
                className={fieldClass}
                value={selectedClientId}
                onChange={(event) => {
                  setSelectedClientId(event.target.value);
                  setSelectedStayId("");
                  setOverpayOk(false);
                }}
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-sm font-medium">{state.clients.find((item) => item.id === selectedClientId)?.name}</p>
          )}
          {!stayId && choices.length > 1 ? (
            <Field label="Stay">
              <select
                className={fieldClass}
                value={stayChoiceId}
                onChange={(event) => {
                  setSelectedStayId(event.target.value);
                  setOverpayOk(false);
                }}
              >
                <option value="">Choose stay</option>
                {choices.map((item) => (
                  <option key={item.stayId} value={item.stayId}>
                    {item.flat} · {formatStayDates(item.checkIn, item.checkOut)} · pending {formatPKR(item.pending)}
                  </option>
                ))}
              </select>
            </Field>
          ) : stay ? (
            <p className="text-sm font-normal text-muted">
              {state.flats.find((item) => item.id === stay.flatId)?.name ?? "Flat"} · pending {formatPKR(remaining)}
            </p>
          ) : null}
          <MoneyInput
            label="Amount *"
            value={amountRaw}
            placeholder="10000"
            allowZero={false}
            onChange={(next) => {
              setAmountRaw(next);
              setOverpayOk(false);
            }}
          />
          <Field label="Payment method">
            <select className={fieldClass} value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Received by">
            <select className={fieldClass} value={receivedById} onChange={(event) => setReceivedById(event.target.value)}>
              {activeReceivers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              <option value="__new">Add new…</option>
            </select>
          </Field>
          {addingReceiver ? (
            <Field label="New receiver">
              <input
                type="text"
                autoCapitalize="words"
                className={fieldClass}
                value={newReceiver}
                onChange={(event) => setNewReceiver(event.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Date">
            <input type="date" className={fieldClass} value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Notes">
            <input
              type="text"
              className={fieldClass}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          {extra > 0 ? (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-sm font-normal text-warning">
                This is {formatPKR(extra)} more than the current pending amount.
              </p>
              <Button onClick={() => setOverpayOk(true)}>Record anyway</Button>
            </div>
          ) : null}
          <Button variant="primary" className="w-full" disabled={saving} onClick={() => void save()}>
            Add Payment
          </Button>
        </div>
      )}
    </Sheet>
  );
}
