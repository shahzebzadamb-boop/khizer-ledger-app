"use client";

import Link from "next/link";
import { ReceiptShareButtons } from "@/components/receipts/ReceiptShareButtons";
import { buildReceiptView } from "@/lib/receipts";
import { useLedger } from "@/lib/store";

export function PaymentReceiptNotice({
  receiptId,
  onDismiss,
}: {
  receiptId: string;
  onDismiss?: () => void;
}) {
  const { state } = useLedger();
  const receipt = state.receipts.find((item) => item.id === receiptId);
  const view = receipt ? buildReceiptView(state, receipt) : null;
  if (!view) return <p className="toast-ok">✓ Payment added</p>;
  const client = state.clients.find((item) => item.id === view.receipt.clientId);

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-primary">✓ Payment added</p>
        {onDismiss ? (
          <button type="button" className="text-xs font-medium text-muted" onClick={onDismiss}>
            Close
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs font-normal text-muted">{view.receipt.receiptNumber}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <ReceiptShareButtons view={view} phone={client?.phone} compact shareLabel="WhatsApp Receipt" />
        <Link href={`/receipts/${view.receipt.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-secondary">
          View
        </Link>
      </div>
    </div>
  );
}
