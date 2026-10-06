"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import {
  activeFlats,
  archivedFlats,
  findFlatByCode,
  flatHasHistory,
  normalizeFlatCode,
} from "@/lib/flats";
import { useLedger } from "@/lib/store";

const HISTORY_LOCK_MESSAGE = "This apartment has history. Add a new apartment instead.";

export function ApartmentsSettings({
  addOpen,
  onAddOpenChange,
}: {
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
}) {
  const { state, persist } = useLedger();
  const [localOpen, setLocalOpen] = useState(false);
  const open = addOpen ?? localOpen;
  function setOpen(next: boolean) {
    setLocalOpen(next);
    onAddOpenChange?.(next);
  }
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editDisplay, setEditDisplay] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const active = useMemo(() => activeFlats(state), [state]);
  const archived = useMemo(() => archivedFlats(state), [state]);
  const editing = state.flats.find((flat) => flat.id === editId) ?? null;
  const editingLocked = editing ? flatHasHistory(state, editing.id) : false;

  function openAdd() {
    setError(null);
    setCode("");
    setDisplayName("");
    setEditId(null);
    setOpen(true);
  }

  async function addApartment() {
    const name = normalizeFlatCode(code);
    if (!name) {
      setError("Use a flat code like 912-C or 703/704.");
      return;
    }
    const existing = findFlatByCode(state, name);
    if (existing) {
      setError(`${existing.name} already exists.`);
      return;
    }
    setError(null);
    try {
      await persist({ type: "ADD_FLAT", payload: { name, displayName: displayName.trim() || null } });
    } catch {
      setError("Couldn't save. Please try again.");
      return;
    }
    setCode("");
    setDisplayName("");
    setOpen(false);
  }

  async function saveEdit() {
    if (!editing) return;
    setEditError(null);
    if (editingLocked) {
      try {
        await persist({ type: "UPDATE_FLAT", payload: { flatId: editing.id, displayName: editDisplay } });
      } catch {
        setEditError("Couldn't save. Please try again.");
        return;
      }
      setEditId(null);
      return;
    }
    const nextName = normalizeFlatCode(editCode);
    if (!nextName) {
      setEditError("Use a flat code like 912-C or 703/704.");
      return;
    }
    const existing = findFlatByCode(state, nextName);
    if (existing && existing.id !== editing.id) {
      setEditError(`${existing.name} already exists.`);
      return;
    }
    try {
      await persist({ type: "UPDATE_FLAT", payload: { flatId: editing.id, name: nextName, displayName: editDisplay } });
    } catch {
      setEditError("Couldn't save. Please try again.");
      return;
    }
    setEditId(null);
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="section-title">Active Apartments</h2>
        <p className="mt-1 text-sm font-normal text-muted">Add the properties Khizer manages</p>
      </div>
      <Button variant="primary" className="w-full" onClick={openAdd}>
        + Add Apartment
      </Button>
      <Card className="space-y-2">
        {active.map((flat) => (
          <div key={flat.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
            <div className="min-w-0">
              <p className="text-sm font-medium">{flat.name}</p>
              <p className="text-xs font-normal text-muted">{flat.displayName ?? "Active"}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="min-h-11 text-sm font-medium text-secondary"
                onClick={() => {
                  setEditId(flat.id);
                  setEditCode(flat.name);
                  setEditDisplay(flat.displayName ?? "");
                  setEditError(null);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="min-h-11 text-sm font-medium text-warning"
                onClick={() => {
                  if (flatHasHistory(state, flat.id)) {
                    void persist({ type: "ARCHIVE_FLAT", flatId: flat.id });
                    return;
                  }
                  if (window.confirm(`Delete unused apartment ${flat.name}?`)) {
                    void persist({ type: "DELETE_FLAT", flatId: flat.id });
                  }
                }}
              >
                {flatHasHistory(state, flat.id) ? "Archive" : "Delete"}
              </button>
            </div>
          </div>
        ))}
        {active.length === 0 ? <p className="text-sm font-normal text-muted">No active apartments.</p> : null}
      </Card>
      {archived.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted">Archived</h3>
          <Card className="space-y-2">
            {archived.map((flat) => (
              <div key={flat.id} className="flex items-center justify-between gap-3 py-1">
                <p className="text-sm">{flat.name}</p>
                <button type="button" className="min-h-11 text-sm font-medium text-secondary" onClick={() => void persist({ type: "RESTORE_FLAT", flatId: flat.id })}>
                  Restore
                </button>
              </div>
            ))}
          </Card>
        </div>
      ) : null}

      {open ? (
        <Sheet title="Add Apartment" onClose={() => setOpen(false)}>
          {error ? <p className="mb-3 text-sm text-warning">{error}</p> : null}
          <label className="block text-sm font-medium">
            Apartment / Flat Number *
            <input className="mt-1 w-full rounded-xl border border-border bg-input px-3 text-base" value={code} onChange={(event) => setCode(event.target.value)} placeholder="912-C or 703/704" />
          </label>
          <label className="mt-3 block text-sm font-medium">
            Display name (optional)
            <input className="mt-1 w-full rounded-xl border border-border bg-input px-3 text-base" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Centaurus 912-C" />
          </label>
          <Button className="mt-4 w-full" variant="primary" onClick={() => void addApartment()}>
            Add Apartment
          </Button>
        </Sheet>
      ) : null}

      {editing ? (
        <Sheet title={`Edit ${editing.name}`} onClose={() => setEditId(null)}>
          {editingLocked ? (
            <p className="mb-3 text-sm font-normal text-muted">{HISTORY_LOCK_MESSAGE}</p>
          ) : (
            <p className="mb-3 text-sm font-normal text-muted">This unused apartment can be renamed. Archive old apartments instead of turning them into a new property.</p>
          )}
          {editError ? <p className="mb-3 text-sm text-warning">{editError}</p> : null}
          {editingLocked ? (
            <p className="mb-3 text-sm font-medium">
              Apartment code
              <span className="mt-1 block rounded-xl border border-border bg-input px-3 py-3 text-base font-medium text-muted">{editing.name}</span>
            </p>
          ) : (
            <label className="block text-sm font-medium">
              Apartment / Flat Number *
              <input className="mt-1 w-full rounded-xl border border-border bg-input px-3 text-base" value={editCode} onChange={(event) => setEditCode(event.target.value)} />
            </label>
          )}
          <label className="mt-3 block text-sm font-medium">
            Display name
            <input className="mt-1 w-full rounded-xl border border-border bg-input px-3 text-base" value={editDisplay} onChange={(event) => setEditDisplay(event.target.value)} />
          </label>
          <Button className="mt-4 w-full" variant="primary" onClick={() => void saveEdit()}>
            Save
          </Button>
          {editingLocked ? (
            <Button
              className="mt-2 w-full"
              variant="secondary"
              onClick={() => {
                setEditId(null);
                openAdd();
              }}
            >
              Add New Apartment
            </Button>
          ) : null}
        </Sheet>
      ) : null}
    </section>
  );
}
