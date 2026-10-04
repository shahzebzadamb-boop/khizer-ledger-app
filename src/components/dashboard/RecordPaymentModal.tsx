"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PAYMENT_METHODS } from "@/types";
import { useLedger } from "@/lib/store";
import { formatPKR, moneyInputFromSaved, parseFormAmount } from "@/lib/money";
import { newestCreatedReceipt, type AddedReceiptInfo } from "@/lib/receipts";
import { MoneyInput } from "@/components/ui/MoneyInput";

export function RecordPaymentModal({
  clientId,
  stayId,
  remaining,
  clientName,
  onClose,
  onAdded,
}: {
  clientId: string;
  stayId: string;
  remaining: number;
  clientName: string;
  onClose: () => void;
  onAdded?: (info?: AddedReceiptInfo) => void;
}) {
  const { persist, state } = useLedger();
  const lock = useRef(false);
  const [amount, setAmount] = useState(moneyInputFromSaved(remaining));
  const [method, setMethod] = useState(PAYMENT_METHODS[0].value);
  const [receivedById, setReceivedById] = useState(
    state.receivers.find((item) => item.name === "Anas")?.id ?? "recv_anas",
  );
  const [overpayOk, setOverpayOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const value = parseFormAmount(amount, false);
  const extra = value != null && remaining > 0 && value > remaining ? value - remaining : 0;

  async function save() {
    if (value == null || value <= 0) return;
    if (extra > 0 && !overpayOk) return;
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    try {
      const before = state;
      const next = await persist({
        type: "RECORD_PAYMENT",
        payload: { clientId, stayId, amount: value, method, receivedById },
      });
      onAdded?.({ receiptId: newestCreatedReceipt(before, next)?.id ?? null });
      onClose();
    } catch {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-4">
        <h3 className="section-title">Record payment</h3>
        <p className="mt-1 text-sm font-normal text-muted">
          {clientName} · remaining {formatPKR(remaining)}
        </p>
        <div className="mt-4">
          <MoneyInput
            label="Amount"
            value={amount}
            allowZero={false}
            onChange={(next) => {
              setAmount(next);
              setOverpayOk(false);
            }}
          />
        </div>
        <label className="mt-3 block text-sm font-medium">
          Method
          <select
            className="mt-1 w-full rounded-xl border border-border bg-input px-3 text-base"
            value={method}
            onChange={(event) => setMethod(event.target.value as typeof method)}
          >
            {PAYMENT_METHODS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm font-medium">
          Received By
          <select
            className="mt-1 w-full rounded-xl border border-border bg-input px-3 text-base"
            value={receivedById}
            onChange={(event) => setReceivedById(event.target.value)}
          >
            {state.receivers.filter((item) => item.active).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {extra > 0 ? (
          <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-normal text-warning">
              This is {formatPKR(extra)} more than the current pending amount.
            </p>
            <Button onClick={() => setOverpayOk(true)}>Record anyway</Button>
          </div>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
