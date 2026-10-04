"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EntryEditor } from "@/components/dashboard/EntryEditor";
import { formatDate } from "@/lib/dates";
import { useLedger } from "@/lib/store";

export default function ActivityPage() {
  const { state } = useLedger();
  const [edit, setEdit] = useState<{ kind: "stay" | "payment" | "expense" | "security"; id: string } | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader title="Activity" subtitle="What was recorded." />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {state.activityLogs.length === 0 ? (
          <p className="px-3.5 py-3 text-sm font-normal text-muted">No activity yet.</p>
        ) : (
          state.activityLogs.map((item) => {
            const kind =
              item.entityType === "Stay"
                ? "stay"
                : item.entityType === "Payment"
                  ? "payment"
                  : item.entityType === "Expense"
                    ? "expense"
                    : item.entityType === "Security"
                      ? "security"
                      : null;
            return (
              <button
                key={item.id}
                type="button"
                className="block w-full border-b border-border px-3.5 py-2.5 text-left last:border-b-0"
                onClick={() => {
                  if (kind) setEdit({ kind, id: item.entityId });
                }}
              >
                <p className="text-sm font-medium">{item.summary}</p>
                <p className="mt-0.5 text-xs font-normal text-muted">{formatDate(item.createdAt)}</p>
              </button>
            );
          })
        )}
      </div>
      {edit ? <EntryEditor kind={edit.kind} id={edit.id} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}
