"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Field, Sheet, fieldClass } from "@/components/ui/Sheet";
import { dateInputToISO, karachiDateInput } from "@/lib/dates";
import { activeFlats, defaultFlatName } from "@/lib/flats";
import { parseFormAmount } from "@/lib/money";
import { useLedger } from "@/lib/store";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type ExpenseCategory, type PaymentMethod } from "@/types";

export function AddExpenseSheet({
  defaultFlat,
  onClose,
  onAdded,
}: {
  defaultFlat?: string;
  onClose: () => void;
  onAdded?: () => void;
}) {
  const { persist, state } = useLedger();
  const lock = useRef(false);
  const [flat, setFlat] = useState(
    defaultFlat && defaultFlat !== "all" ? defaultFlat : defaultFlatName(state),
  );
  const [date, setDate] = useState(karachiDateInput());
  const [category, setCategory] = useState<ExpenseCategory>("CLEANING");
  const [description, setDescription] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = parseFormAmount(amountRaw, false);
  const categoryLabel = EXPENSE_CATEGORIES.find((item) => item.value === category)?.label ?? category;

  async function save() {
    if (!flat) {
      setError("Choose a flat.");
      return;
    }
    if (amount == null) {
      setError("Enter a valid amount.");
      return;
    }
    if (lock.current || amount <= 0) return;
    lock.current = true;
    setSaving(true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    try {
      await persist({
        type: "ADD_EXPENSE",
        payload: {
          flat,
          amount,
          category,
          description: description.trim() || categoryLabel,
          method,
          spentAt: dateInputToISO(date),
          notes: notes.trim() || null,
        },
      });
      onAdded?.();
      onClose();
    } catch {
      setError("Couldn't save. Please try again.");
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <Sheet title="Add expense" onClose={onClose}>
      {error ? <p className="mb-3 text-sm font-normal text-warning">{error}</p> : null}
      <div className="space-y-3">
        <Field label="Flat *">
          <select className={fieldClass} value={flat} onChange={(event) => setFlat(event.target.value)}>
            {activeFlats(state).length === 0 ? <option value="">Add apartment first</option> : null}
            {activeFlats(state).map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date *">
          <input type="date" className={fieldClass} value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        <Field label="Category *">
          <select
            className={fieldClass}
            value={category}
            onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
          >
            {EXPENSE_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <input
            type="text"
            className={fieldClass}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Sofa cleaning"
          />
        </Field>
        <MoneyInput
          label="Amount *"
          value={amountRaw}
          placeholder="5000"
          allowZero={false}
          onChange={setAmountRaw}
        />
        <Field label="Payment method">
          <select className={fieldClass} value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <input
            type="text"
            className={fieldClass}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        <Button variant="primary" className="w-full" disabled={saving} onClick={() => void save()}>
          Add Expense
        </Button>
      </div>
    </Sheet>
  );
}
