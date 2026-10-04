"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { receiverName, flatName } from "@/lib/ledger";
import { formatDate } from "@/lib/dates";
import { formatPKR, methodLabel } from "@/lib/money";
import { useLedger } from "@/lib/store";
import { DEFAULT_RECEIVER_NAME, KHIZER_NAME } from "@/lib/receivers";
import { cn } from "@/lib/utils";
import { PaymentReceiptLink } from "@/components/receipts/PaymentReceiptLink";
import { EntryEditor } from "@/components/dashboard/EntryEditor";

export default function PaymentsPage() {
  const { state } = useLedger();
  const [filter, setFilter] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const payments = [...state.payments].filter((item) => !item.voided).sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  const chips = useMemo(() => {
    const named = [DEFAULT_RECEIVER_NAME, KHIZER_NAME];
    const extras = state.receivers
      .filter((item) => !named.includes(item.name))
      .map((item) => item.name);
    return ["All", ...named, ...extras];
  }, [state.receivers]);

  const visible = payments.filter((payment) => {
    if (filter === "all") return true;
    return receiverName(state, payment.receivedById) === filter;
  });

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const payment of payments) {
      const name = receiverName(state, payment.receivedById);
      map.set(name, (map.get(name) ?? 0) + payment.amount);
    }
    return map;
  }, [payments, state]);

  return (
    <div className="space-y-4">
      <PageHeader title="Payments" subtitle="Money received toward rent." />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => {
          const id = chip === "All" ? "all" : chip;
          return (
            <button
              key={chip}
              type="button"
              className={cn("chip", filter === id && "chip-active")}
              onClick={() => setFilter(id)}
            >
              {chip}
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5 rounded-2xl border border-border bg-surface px-3.5 py-3">
        <p className="text-sm text-muted">
          Received by Anas <span className="money text-foreground">{formatPKR(totals.get(DEFAULT_RECEIVER_NAME) ?? 0)}</span>
        </p>
        <p className="text-sm text-muted">
          Received by Khizer <span className="money text-foreground">{formatPKR(totals.get(KHIZER_NAME) ?? 0)}</span>
        </p>
        {[...totals.entries()]
          .filter(([name]) => name !== DEFAULT_RECEIVER_NAME && name !== KHIZER_NAME)
          .map(([name, amount]) => (
            <p key={name} className="text-sm text-muted">
              Received by {name} <span className="money text-foreground">{formatPKR(amount)}</span>
            </p>
          ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {visible.length === 0 ? (
          <p className="px-3.5 py-3 text-sm font-normal text-muted">No payments yet.</p>
        ) : (
          visible.map((payment) => (
            <div
              key={payment.id}
              role="button"
              tabIndex={0}
              className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0"
              onClick={() => setEditId(payment.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setEditId(payment.id);
              }}
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {state.clients.find((client) => client.id === payment.clientId)?.name ?? "Customer"}
                </p>
                <p className="mt-0.5 text-sm font-normal text-muted">
                  {methodLabel(payment.method)} · {receiverName(state, payment.receivedById)}
                  {payment.flatId ? ` · Flat ${flatName(state, payment.flatId)}` : ""}
                </p>
                <p className="mt-0.5 text-xs font-normal text-muted">{formatDate(payment.receivedAt)}</p>
                <PaymentReceiptLink paymentId={payment.id} />
              </div>
              <p className="money shrink-0 text-sm">{formatPKR(payment.amount)}</p>
            </div>
          ))
        )}
      </div>
      {editId ? <EntryEditor kind="payment" id={editId} onClose={() => setEditId(null)} /> : null}
    </div>
  );
}
