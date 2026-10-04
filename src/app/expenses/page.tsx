"use client";

import { useRef, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { formatDate } from "@/lib/dates";
import { activeFlats, defaultFlatName } from "@/lib/flats";
import { flatName } from "@/lib/ledger";
import { formatPKR, methodLabel, parseFormAmount } from "@/lib/money";
import { useLedger } from "@/lib/store";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/types";
import { EntryEditor } from "@/components/dashboard/EntryEditor";

export default function ExpensesPage() {
  const { state, persist } = useLedger();
  const lock = useRef(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0].value);
  const [method, setMethod] = useState(PAYMENT_METHODS[0].value);
  const [flat, setFlat] = useState(defaultFlatName(state));
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const expenses = [...state.expenses].filter((item) => !item.voided).sort((a, b) => (a.spentAt < b.spentAt ? 1 : -1));
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const parsedAmount = parseFormAmount(amount, false);

  async function save() {
    if (!parsedAmount || !description.trim() || lock.current) return;
    lock.current = true;
    setSaving(true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    try {
      await persist({
        type: "ADD_EXPENSE",
        payload: { amount: parsedAmount, description: description.trim(), category, method, flat },
      });
      setAmount("");
      setDescription("");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Expenses" subtitle="Business costs" />
      <Card className="p-3">
        <p className="card-label">Total</p>
        <p className="money mt-1.5 text-xl">{formatPKR(total)}</p>
      </Card>
      <Card className="space-y-3">
        <input
          placeholder="Description"
          className="w-full rounded-xl border border-border bg-input px-3 text-base"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <MoneyInput
          label="Amount"
          value={amount}
          placeholder="5000"
          allowZero={false}
          onChange={setAmount}
        />
        <select className="w-full rounded-xl border border-border bg-input px-3 text-base" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
          {EXPENSE_CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <select className="w-full rounded-xl border border-border bg-input px-3 text-base" value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
          {PAYMENT_METHODS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <select className="w-full rounded-xl border border-border bg-input px-3 text-base" value={flat} onChange={(event) => setFlat(event.target.value)}>
          {activeFlats(state).map((item) => (
            <option key={item.id} value={item.name}>{item.name}</option>
          ))}
        </select>
        <Button variant="primary" className="w-full" disabled={saving} onClick={() => void save()}>
          Save expense
        </Button>
      </Card>
      {expenses.length === 0 ? (
        <p className="text-sm font-normal text-muted">No expenses yet.</p>
      ) : (
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {expenses.map((expense) => {
          const tag = EXPENSE_CATEGORIES.find((item) => item.value === expense.category)?.label ?? expense.category;
          return (
            <div
              key={expense.id}
              role="button"
              tabIndex={0}
              className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0"
              onClick={() => setEditId(expense.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setEditId(expense.id);
              }}
            >
              <div className="min-w-0">
                <p className="font-medium">{expense.description}</p>
                <p className="mt-1 text-sm font-normal text-muted">
                  {methodLabel(expense.method)} · {formatDate(expense.spentAt)}
                  {expense.flatId ? ` · Flat ${flatName(state, expense.flatId)}` : ""}
                </p>
                <span className="mt-1.5 inline-flex rounded-full bg-input px-2 py-0.5 text-[11px] font-medium text-secondary">
                  {tag}
                </span>
              </div>
              <p className="money shrink-0 text-sm">{formatPKR(expense.amount)}</p>
            </div>
          );
        })}
      </div>
      )}
      {editId ? <EntryEditor kind="expense" id={editId} onClose={() => setEditId(null)} /> : null}
    </div>
  );
}
