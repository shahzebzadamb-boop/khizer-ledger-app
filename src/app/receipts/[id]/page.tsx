"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ReceiptDocument } from "@/components/receipts/ReceiptDocument";
import { ReceiptShareButtons } from "@/components/receipts/ReceiptShareButtons";
import { buildReceiptView } from "@/lib/receipts";
import { useLedger } from "@/lib/store";

export default function ReceiptPreviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state, persist, ready } = useLedger();
  const [marking, setMarking] = useState(false);
  const receipt = state.receipts.find((item) => item.id === params.id) ?? null;
  const view = useMemo(() => (receipt ? buildReceiptView(state, receipt) : null), [receipt, state]);
  const client = view ? state.clients.find((item) => item.id === view.receipt.clientId) : null;

  if (!ready) {
    return <p className="text-sm font-normal text-muted">Loading receipt…</p>;
  }
  if (!receipt || !view) {
    return (
      <div className="space-y-3">
        <Link href="/reports/receipts" className="inline-flex min-h-11 items-center text-sm font-medium text-secondary">
          ← Back
        </Link>
        <p className="text-sm text-muted">Receipt not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-secondary" onClick={() => router.back()}>
          ← Back
        </button>
        <p className="text-sm font-medium">Receipt</p>
      </div>
      {view.receipt.status === "VOID" ? (
        <p className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-warning">VOID</p>
      ) : null}
      <ReceiptShareButtons view={view} phone={client?.phone} />
      {!view.receipt.sharedAt ? (
        <Button
          disabled={marking}
          onClick={() => {
            setMarking(true);
            void persist({ type: "MARK_RECEIPT_SENT", receiptId: view.receipt.id }).finally(() => setMarking(false));
          }}
        >
          Mark as Sent
        </Button>
      ) : (
        <p className="text-xs font-normal text-muted">Marked as sent</p>
      )}
      <div className="receipt-preview-frame overflow-hidden rounded-2xl border border-border bg-white">
        <div className="receipt-preview-page">
          <ReceiptDocument view={view} />
        </div>
      </div>
    </div>
  );
}
