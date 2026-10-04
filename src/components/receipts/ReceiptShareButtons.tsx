"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { buildReceiptPdfFile } from "@/lib/receipt-pdf";
import { receiptWhatsAppHref } from "@/lib/reminders";
import { downloadBlob, shareOrFallbackReceipt } from "@/lib/share-receipt";
import { useLedger } from "@/lib/store";
import type { ReceiptView } from "@/lib/receipts";

export function ReceiptShareButtons({
  view,
  phone,
  compact,
  shareLabel = "Share",
}: {
  view: ReceiptView;
  phone?: string | null;
  compact?: boolean;
  shareLabel?: string;
}) {
  const { persist } = useLedger();
  const [busy, setBusy] = useState(false);
  const fallbackHref = receiptWhatsAppHref({ phone, clientName: view.clientName });
  const voided = view.receipt.status === "VOID";

  async function markAttempt() {
    try {
      await persist({ type: "MARK_RECEIPT_SHARE_ATTEMPTED", receiptId: view.receipt.id });
    } catch {
      // sharing should still proceed
    }
  }

  async function share() {
    if (busy || voided) return;
    setBusy(true);
    try {
      await markAttempt();
      await shareOrFallbackReceipt({ view, phone });
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const file = await buildReceiptPdfFile(view);
      downloadBlob(file, file.name);
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <button type="button" className="min-h-11 text-sm font-medium text-primary" disabled={busy || voided} onClick={() => void share()}>
        {shareLabel}
      </button>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="primary" disabled={busy || voided} onClick={() => void share()}>
        {shareLabel}
      </Button>
      <Button disabled={busy} onClick={() => void download()}>
        Download
      </Button>
      {fallbackHref ? (
        <a
          href={fallbackHref}
          target="_blank"
          rel="noreferrer"
          className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold"
          onClick={() => void markAttempt()}
        >
          Open WhatsApp
        </a>
      ) : null}
    </div>
  );
}
