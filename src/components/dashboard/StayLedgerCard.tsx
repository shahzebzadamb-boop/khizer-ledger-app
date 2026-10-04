"use client";

import { useState } from "react";
import { formatDate, formatStayDates } from "@/lib/dates";
import { formatPKR } from "@/lib/money";
import { displayPhone } from "@/lib/phone";
import { clientWhatsAppHref } from "@/lib/reminders";
import type { StayLedgerRow } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { EntryEditor } from "@/components/dashboard/EntryEditor";
import { PaymentReceiptLink } from "@/components/receipts/PaymentReceiptLink";
import { PaymentReceiptNotice } from "@/components/receipts/PaymentReceiptNotice";
import { AddPaymentSheet } from "@/components/ledger/AddPaymentSheet";

function MoneyRow({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm font-normal text-muted">{label}</span>
      <span className={cn("money text-sm", accent ?? "text-foreground")}>{formatPKR(value)}</span>
    </div>
  );
}

export function StayLedgerCard({
  row,
  showFlat,
  showDates,
  showPhone,
  showWhatsApp,
  showActions,
}: {
  row: StayLedgerRow;
  showFlat: boolean;
  showDates?: boolean;
  showPhone?: boolean;
  showWhatsApp?: boolean;
  showActions?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<{ kind: "stay" | "payment"; id: string } | null>(null);
  const [addPayment, setAddPayment] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const securityHeld = row.security
    .filter((item) => item.kind === "RECEIVED")
    .reduce((sum, item) => sum + item.amount, 0);
  const reminderHref = clientWhatsAppHref({
    phone: row.phone,
    clientName: row.clientName,
    pendingAmount: row.pending,
  });

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        className="w-full px-3.5 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((value) => !value);
          }
        }}
        aria-expanded={open}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{row.clientName}</p>
            {showPhone && row.phone ? (
              <p className="mt-0.5 text-xs font-normal text-muted">{displayPhone(row.phone)}</p>
            ) : null}
            <p className="mt-0.5 text-xs font-normal text-muted">
              {showFlat ? `${row.flat} · ` : ""}
              {row.nights} night{row.nights === 1 ? "" : "s"}
            </p>
            {showDates || !showFlat ? (
              <p className="mt-0.5 text-xs font-normal text-muted">
                {formatStayDates(row.checkIn, row.checkOut).replace(" – ", " → ")}
              </p>
            ) : null}
          </div>
          <p className={cn("shrink-0 text-[11px] font-medium", row.pending > 0 ? "text-warning" : "text-muted")}>
            {row.status}
          </p>
        </div>
        <div className="mt-2 space-y-1">
          <MoneyRow label="Business" value={row.business} />
          <MoneyRow label="Received" value={row.received} accent="text-primary" />
          <MoneyRow label="Pending" value={row.pending} accent={row.pending > 0 ? "text-warning" : undefined} />
        </div>
        {row.methods.length > 0 ? (
          <p className="mt-2 text-xs font-normal text-muted">
            {row.methods.join(" · ")}
            {row.receivedBy.length > 0 ? ` · Received by ${row.receivedBy.join(", ")}` : ""}
          </p>
        ) : null}
      </div>
      {showWhatsApp && reminderHref ? (
        <div className="px-3.5 pb-3">
          <a
            href={reminderHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
            onClick={(event) => event.stopPropagation()}
          >
            WhatsApp
          </a>
        </div>
      ) : null}
      {receiptId ? (
        <div className="px-3.5 pb-3">
          <PaymentReceiptNotice receiptId={receiptId} onDismiss={() => setReceiptId(null)} />
        </div>
      ) : null}
      {open ? (
        <div className="space-y-2.5 border-t border-border px-3.5 py-3">
          <p className="text-xs font-normal text-muted">
            {row.clientName}
            {row.phone ? ` · ${displayPhone(row.phone)}` : ""}
          </p>
          <p className="text-xs font-normal text-muted">
            {row.flat} · {formatStayDates(row.checkIn, row.checkOut).replace(" – ", " → ")} · {row.nights} nights
          </p>
          <MoneyRow label="Business" value={row.business} />
          <MoneyRow label="Received" value={row.received} accent="text-primary" />
          <MoneyRow label="Pending" value={row.pending} accent={row.pending > 0 ? "text-warning" : undefined} />
          {securityHeld > 0 ? <MoneyRow label="Security" value={securityHeld} /> : null}
          {row.payments.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payment history</p>
              {row.payments.map((payment, index) => (
                <div key={payment.id} className="space-y-1">
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => setEdit({ kind: "payment", id: payment.id })}
                  >
                    <p className="text-xs font-medium">Payment {index + 1}</p>
                    <p className="text-sm">
                      <span className="money">{formatPKR(payment.amount)}</span>
                      <span className="text-muted"> · {payment.method}</span>
                    </p>
                    <p className="text-xs font-normal text-muted">Received by {payment.receivedBy}</p>
                    <p className="text-xs font-normal text-muted">{formatDate(payment.receivedAt)}</p>
                  </button>
                  <PaymentReceiptLink paymentId={payment.id} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs font-normal text-muted">No payments yet.</p>
          )}
          {row.discounts.map((item) => (
            <p key={item.id} className="text-xs font-normal text-muted">
              Discount {formatPKR(item.amount)}
              {item.note ? ` · ${item.note}` : ""}
            </p>
          ))}
          {row.extensionNotes.map((note) => (
            <p key={note} className="text-xs font-normal text-muted">
              {note}
            </p>
          ))}
          {showActions !== false ? (
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
              <button type="button" className="min-h-11 text-sm font-medium text-secondary" onClick={() => setAddPayment(true)}>
                Add Payment
              </button>
              <button
                type="button"
                className="min-h-11 text-sm font-medium text-secondary"
                onClick={() => setEdit({ kind: "stay", id: row.stayId })}
              >
                Edit Stay
              </button>
              {reminderHref ? (
                <a
                  href={reminderHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
                >
                  WhatsApp
                </a>
              ) : null}
              <button
                type="button"
                className="min-h-11 text-sm font-medium text-secondary"
                onClick={() => setEdit({ kind: "stay", id: row.stayId })}
              >
                Void Entry
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-sm font-medium text-secondary"
              onClick={() => setEdit({ kind: "stay", id: row.stayId })}
            >
              Edit
            </button>
          )}
        </div>
      ) : null}
      {edit ? <EntryEditor kind={edit.kind} id={edit.id} onClose={() => setEdit(null)} /> : null}
      {addPayment ? (
        <AddPaymentSheet
          stayId={row.stayId}
          clientId={row.clientId}
          onClose={() => setAddPayment(false)}
          onAdded={(info) => {
            if (info?.receiptId) setReceiptId(info.receiptId);
          }}
        />
      ) : null}
    </div>
  );
}
