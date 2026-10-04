"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ClientIdentityFields } from "@/components/clients/ClientIdentityFields";
import { findClientByPhone } from "@/lib/ledger";
import { normalizePhone } from "@/lib/phone";
import { useLedger } from "@/lib/store";

export function AddClientSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { persist, state } = useLedger();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      setError("Enter the client name.");
      return;
    }
    if (!normalizePhone(phone)) {
      setError("Enter a valid phone number.");
      return;
    }
    const existing = findClientByPhone(state, phone);
    if (existing) {
      onClose();
      router.push(`/clients/${existing.id}`);
      return;
    }
    setSaving(true);
    try {
      const next = await persist({ type: "ADD_CLIENT", payload: { name: name.trim(), phone } });
      const created = next.clients.find((client) => normalizePhone(client.phone) === normalizePhone(phone));
      onClose();
      if (created) router.push(`/clients/${created.id}`);
    } catch {
      setError("Save failed.");
      setSaving(false);
    }
  }

  return (
    <Sheet title="Add client" onClose={onClose}>
      {error ? <p className="mb-3 text-sm font-normal text-warning">{error}</p> : null}
      <form
        className="space-y-3"
        autoComplete="on"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <ClientIdentityFields
          name={name}
          phone={phone}
          state={state}
          onNameChange={setName}
          onPhoneChange={setPhone}
          onUseExisting={(clientId) => {
            onClose();
            router.push(`/clients/${clientId}`);
          }}
        />
        <Button type="submit" variant="primary" className="w-full" disabled={saving}>
          Add Client
        </Button>
      </form>
    </Sheet>
  );
}
