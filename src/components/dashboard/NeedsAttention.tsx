"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { RecordPaymentModal } from "@/components/dashboard/RecordPaymentModal";
import { overdueDays } from "@/lib/dates";
import { formatPKR } from "@/lib/money";
import { clientWhatsAppHref } from "@/lib/reminders";
import type { AttentionItem } from "@/types";

function AttentionCard({ item }: { item: AttentionItem }) {
  const [open, setOpen] = useState(false);
  const overdue = overdueDays(item.checkOut) > 0;
  const whatsapp = item.remaining > 0
    ? clientWhatsAppHref({
        phone: item.phone,
        clientName: item.clientName,
        pendingAmount: item.remaining,
      })
    : null;

  return (
    <div className="border-b border-border px-3.5 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className={`kh-dot mt-1.5 ${overdue ? "bg-danger" : ""}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{item.clientName}</p>
          <p className="mt-0.5 text-xs font-normal text-muted">{item.flat}</p>
          <p className={`mt-0.5 text-xs font-medium ${overdue ? "text-danger" : "text-warning"}`}>
            {overdue ? "Overdue" : "Pending"}
          </p>
        </div>
        <p className={`money text-sm ${overdue ? "text-danger" : "text-warning"}`}>{formatPKR(item.remaining)}</p>
      </div>
      <div className="mt-2.5 flex items-center gap-2 pl-5">
        <Button variant="secondary" className="h-10 min-h-10 flex-1" onClick={() => setOpen(true)}>
          Record Payment
        </Button>
        {whatsapp ? (
          <a
            className="icon-btn border border-border text-[#3DDC84]"
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            aria-label={`WhatsApp ${item.clientName}`}
          >
            <MessageCircle size={18} />
          </a>
        ) : (
          <span className="icon-btn border border-border text-muted" aria-hidden="true">
            <MessageCircle size={18} />
          </span>
        )}
      </div>
      {open ? (
        <RecordPaymentModal
          clientId={item.clientId}
          stayId={item.stayId}
          remaining={item.remaining}
          clientName={item.clientName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  return (
    <section className="space-y-2">
      <h2 className="section-title">Needs Attention</h2>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-3.5 py-3 text-sm font-normal text-muted">
          No confirmed unpaid balances.
        </p>
      ) : (
        <div className="kh-feed">{items.map((item) => <AttentionCard key={item.stayId} item={item} />)}</div>
      )}
    </section>
  );
}
