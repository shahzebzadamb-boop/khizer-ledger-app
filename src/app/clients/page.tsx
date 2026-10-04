"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { AddClientSheet } from "@/components/clients/AddClientSheet";
import { Button } from "@/components/ui/Button";
import { clientProfile } from "@/lib/ledger";
import { displayPhone } from "@/lib/phone";
import { formatPKR } from "@/lib/money";
import { useLedger } from "@/lib/store";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function ClientsPage() {
  const { state } = useLedger();
  const [addOpen, setAddOpen] = useState(false);
  const clients = [...state.clients].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clients"
        subtitle="Phone is the customer ID."
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            + Add Client
          </Button>
        }
      />
      {clients.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-3.5 py-3 text-sm font-normal text-muted">
          No clients yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {clients.map((client) => {
            const profile = clientProfile(client.id, state);
            const pending = profile.currentlyPending > 0;
            return (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="flex min-h-14 items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-input text-[11px] font-semibold text-secondary">
                  {initials(client.name) || "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{client.name}</p>
                  <p className="mt-0.5 truncate text-sm font-normal text-muted">
                    {displayPhone(client.phone)}
                    {client.phoneMissing ? " · phone missing" : ""}
                    {profile.lastFlat ? ` · ${profile.lastFlat}` : ""}
                  </p>
                </div>
                <p className={`money shrink-0 text-sm ${pending ? "text-warning" : "text-secondary"}`}>
                  {formatPKR(profile.currentlyPending)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
      {addOpen ? <AddClientSheet onClose={() => setAddOpen(false)} /> : null}
    </div>
  );
}
