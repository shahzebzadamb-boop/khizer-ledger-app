"use client";

import Link from "next/link";
import { useLedger } from "@/lib/store";
import { receiptForPayment } from "@/lib/receipts";

export function PaymentReceiptLink({
  paymentId,
  compact = true,
}: {
  paymentId: string;
  compact?: boolean;
}) {
  const { state, persist } = useLedger();
  const payment = state.payments.find((item) => item.id === paymentId);
  const receipt = receiptForPayment(state, paymentId);
  if (!payment) return null;
  if (payment.voided && !receipt) return null;

  if (!receipt) {
    if (payment.voided) return null;
    return (
      <button
        type="button"
        className={compact ? "min-h-11 text-sm font-medium text-secondary" : "text-sm font-medium text-secondary"}
        onClick={(event) => {
          event.stopPropagation();
          void persist({ type: "GENERATE_RECEIPT", paymentId });
        }}
      >
        Generate Receipt
      </button>
    );
  }

  return (
    <Link
      href={`/receipts/${receipt.id}`}
      className={compact ? "inline-flex min-h-11 items-center text-sm font-medium text-secondary" : "text-sm font-medium text-secondary"}
      onClick={(event) => event.stopPropagation()}
    >
      {receipt.status === "VOID" ? "Receipt (VOID)" : "Receipt"}
    </Link>
  );
}
