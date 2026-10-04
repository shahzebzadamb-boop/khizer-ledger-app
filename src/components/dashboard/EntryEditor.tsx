"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { formatPKR, moneyInputFromSaved, parseFormAmount } from "@/lib/money";
import { useLedger } from "@/lib/store";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type Expense, type Payment, type SecurityTransaction, type Stay } from "@/types";
import { flatsForSelect } from "@/lib/flats";
import { stayCollectible } from "@/lib/ledger";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass = "w-full rounded-xl border border-border bg-input px-3 text-base";

export function EntryEditor({
  kind,
  id,
  onClose,
}: {
  kind: "stay" | "payment" | "expense" | "security";
  id: string;
  onClose: () => void;
}) {
  const { state, persist } = useLedger();
  const lock = useRef(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [toast, setToast] = useState(false);
  const [saving, setSaving] = useState(false);

  const stay = state.stays.find((item) => item.id === id);
  const payment = state.payments.find((item) => item.id === id);
  const expense = state.expenses.find((item) => item.id === id);
  const security = state.security.find((item) => item.id === id);

  async function save(action: Parameters<typeof persist>[0]) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    try {
      await persist(action);
      setToast(true);
      window.setTimeout(() => {
        setToast(false);
        onClose();
      }, 1400);
    } catch {
      lock.current = false;
      setSaving(false);
      setConfirmSave(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-4">
        {toast ? <p className="toast-ok mb-3">✓ Updated</p> : null}
        {kind === "stay" && stay ? (
          <StayFields stay={stay} confirmSave={confirmSave} setConfirmSave={setConfirmSave} onSave={save} />
        ) : null}
        {kind === "payment" && payment ? (
          <PaymentFields payment={payment} confirmSave={confirmSave} setConfirmSave={setConfirmSave} onSave={save} />
        ) : null}
        {kind === "expense" && expense ? (
          <ExpenseFields expense={expense} confirmSave={confirmSave} setConfirmSave={setConfirmSave} onSave={save} />
        ) : null}
        {kind === "security" && security ? (
          <SecurityFields row={security} confirmSave={confirmSave} setConfirmSave={setConfirmSave} onSave={save} />
        ) : null}

        {confirmVoid ? (
          <div className="mt-4 space-y-2 rounded-xl border border-border p-3">
            <p className="text-sm font-medium">Void this entry?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="danger"
                disabled={saving}
                onClick={() =>
                  void save({
                    type: "VOID_ENTRY",
                    payload: {
                      entityType: kind === "stay" ? "Stay" : kind === "expense" ? "Expense" : kind === "security" ? "Security" : "Payment",
                      entityId: id,
                    },
                  })
                }
              >
                Void
              </Button>
              <Button onClick={() => setConfirmVoid(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setConfirmVoid(true)}>
              Void entry
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StayFields({
  stay,
  confirmSave,
  setConfirmSave,
  onSave,
}: {
  stay: Stay;
  confirmSave: boolean;
  setConfirmSave: (value: boolean) => void;
  onSave: (action: Parameters<ReturnType<typeof useLedger>["persist"]>[0]) => Promise<void>;
}) {
  const { state } = useLedger();
  const client = state.clients.find((item) => item.id === stay.clientId);
  const [clientName, setClientName] = useState(client?.name ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [flat, setFlat] = useState(state.flats.find((item) => item.id === stay.flatId)?.name ?? "");
  const [checkIn, setCheckIn] = useState(stay.checkIn.slice(0, 10));
  const [nights, setNights] = useState(String(stay.nights));
  const [business, setBusiness] = useState(moneyInputFromSaved(stayCollectible(stay.id, state)));
  const [notes, setNotes] = useState(state.rentEntries.find((item) => item.stayId === stay.id)?.note ?? "");

  return (
    <div className="space-y-3">
      <p className="section-title">Edit stay</p>
      <Field label="Customer">
        <input className={inputClass} value={clientName} onChange={(event) => setClientName(event.target.value)} />
      </Field>
      <Field label="Phone">
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className={inputClass}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </Field>
      <Field label="Flat">
        <select className={inputClass} value={flat} onChange={(event) => setFlat(event.target.value)}>
          {flatsForSelect(state, stay.flatId).map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Check-in">
        <input type="date" className={inputClass} value={checkIn} onChange={(event) => setCheckIn(event.target.value)} />
      </Field>
      <Field label="Nights">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className={inputClass}
          value={nights}
          onChange={(event) => setNights(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))}
        />
      </Field>
      <MoneyInput label="Business" value={business} allowZero={false} onChange={setBusiness} />
      <Field label="Notes">
        <textarea className={inputClass} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      {confirmSave ? (
        <SaveConfirm
          onYes={() =>
            void onSave({
              type: "UPDATE_STAY",
              payload: {
                stayId: stay.id,
                clientName,
                phone: phone.trim() || null,
                flat,
                checkIn: new Date(`${checkIn}T00:00:00`).toISOString(),
                nights: Number(nights) || stay.nights,
                business: parseFormAmount(business, false) ?? stayCollectible(stay.id, state),
                notes: notes.trim() || null,
              },
            })
          }
          onNo={() => setConfirmSave(false)}
        />
      ) : (
        <Button variant="primary" className="w-full" onClick={() => setConfirmSave(true)}>
          Save
        </Button>
      )}
    </div>
  );
}

function PaymentFields({
  payment,
  confirmSave,
  setConfirmSave,
  onSave,
}: {
  payment: Payment;
  confirmSave: boolean;
  setConfirmSave: (value: boolean) => void;
  onSave: (action: Parameters<ReturnType<typeof useLedger>["persist"]>[0]) => Promise<void>;
}) {
  const { state } = useLedger();
  const [amount, setAmount] = useState(moneyInputFromSaved(payment.amount));
  const [method, setMethod] = useState(payment.method);
  const [receivedById, setReceivedById] = useState(payment.receivedById ?? "recv_anas");
  const [receivedAt, setReceivedAt] = useState(payment.receivedAt.slice(0, 10));
  const [stayId, setStayId] = useState(payment.stayId ?? "");
  const stays = state.stays.filter((item) => item.clientId === payment.clientId && !item.voided);

  return (
    <div className="space-y-3">
      <p className="section-title">Edit payment</p>
      <p className="text-sm text-muted">{formatPKR(payment.amount)}</p>
      <MoneyInput label="Amount" value={amount} allowZero={false} onChange={setAmount} />
      <Field label="Payment method">
        <select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
          {PAYMENT_METHODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Received By">
        <select className={inputClass} value={receivedById} onChange={(event) => setReceivedById(event.target.value)}>
          {state.receivers.filter((item) => item.active).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input type="date" className={inputClass} value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} />
      </Field>
      <Field label="Linked stay">
        <select className={inputClass} value={stayId} onChange={(event) => setStayId(event.target.value)}>
          {stays.map((item) => (
            <option key={item.id} value={item.id}>
              {state.flats.find((flat) => flat.id === item.flatId)?.name} · {item.nights} nights
            </option>
          ))}
        </select>
      </Field>
      {confirmSave ? (
        <SaveConfirm
          onYes={() =>
            void onSave({
              type: "UPDATE_PAYMENT",
              payload: {
                paymentId: payment.id,
                amount: parseFormAmount(amount, false) ?? payment.amount,
                method,
                receivedById,
                receivedAt: new Date(`${receivedAt}T12:00:00`).toISOString(),
                stayId: stayId || payment.stayId,
              },
            })
          }
          onNo={() => setConfirmSave(false)}
        />
      ) : (
        <Button variant="primary" className="w-full" onClick={() => setConfirmSave(true)}>
          Save
        </Button>
      )}
    </div>
  );
}

function ExpenseFields({
  expense,
  confirmSave,
  setConfirmSave,
  onSave,
}: {
  expense: Expense;
  confirmSave: boolean;
  setConfirmSave: (value: boolean) => void;
  onSave: (action: Parameters<ReturnType<typeof useLedger>["persist"]>[0]) => Promise<void>;
}) {
  const { state } = useLedger();
  const [amount, setAmount] = useState(moneyInputFromSaved(expense.amount));
  const [category, setCategory] = useState(expense.category);
  const [flat, setFlat] = useState(state.flats.find((item) => item.id === expense.flatId)?.name ?? "");
  const [method, setMethod] = useState(expense.method);
  const [description, setDescription] = useState(expense.description);
  const [spentAt, setSpentAt] = useState(expense.spentAt.slice(0, 10));

  return (
    <div className="space-y-3">
      <p className="section-title">Edit expense</p>
      <MoneyInput label="Amount" value={amount} allowZero={false} onChange={setAmount} />
      <Field label="Category">
        <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
          {EXPENSE_CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Flat">
        <select className={inputClass} value={flat} onChange={(event) => setFlat(event.target.value)}>
          {flatsForSelect(state, expense.flatId).map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Payment method">
        <select className={inputClass} value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
          {PAYMENT_METHODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Description">
        <input className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <Field label="Date">
        <input type="date" className={inputClass} value={spentAt} onChange={(event) => setSpentAt(event.target.value)} />
      </Field>
      {confirmSave ? (
        <SaveConfirm
          onYes={() =>
            void onSave({
              type: "UPDATE_EXPENSE",
              payload: {
                expenseId: expense.id,
                amount: parseFormAmount(amount, false) ?? expense.amount,
                category,
                flat: flat || null,
                method,
                description,
                spentAt: new Date(`${spentAt}T12:00:00`).toISOString(),
              },
            })
          }
          onNo={() => setConfirmSave(false)}
        />
      ) : (
        <Button variant="primary" className="w-full" onClick={() => setConfirmSave(true)}>
          Save
        </Button>
      )}
    </div>
  );
}

function SecurityFields({
  row,
  confirmSave,
  setConfirmSave,
  onSave,
}: {
  row: SecurityTransaction;
  confirmSave: boolean;
  setConfirmSave: (value: boolean) => void;
  onSave: (action: Parameters<ReturnType<typeof useLedger>["persist"]>[0]) => Promise<void>;
}) {
  const { state } = useLedger();
  const [amount, setAmount] = useState(moneyInputFromSaved(row.amount));
  const [flat, setFlat] = useState(state.flats.find((item) => item.id === row.flatId)?.name ?? "");
  const [clientId, setClientId] = useState(row.clientId);
  const [kind, setKind] = useState(row.kind);

  return (
    <div className="space-y-3">
      <p className="section-title">Edit security</p>
      <MoneyInput label="Amount" value={amount} allowZero={false} onChange={setAmount} />
      <Field label="Flat">
        <select className={inputClass} value={flat} onChange={(event) => setFlat(event.target.value)}>
          {flatsForSelect(state, row.flatId).map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Customer">
        <select className={inputClass} value={clientId} onChange={(event) => setClientId(event.target.value)}>
          {state.clients.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Status">
        <select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
          <option value="RECEIVED">Held</option>
          <option value="ADJUSTED_TO_RENT">Applied to rent</option>
        </select>
      </Field>
      {confirmSave ? (
        <SaveConfirm
          onYes={() =>
            void onSave({
              type: "UPDATE_SECURITY",
              payload: { securityId: row.id, amount: parseFormAmount(amount, false) ?? row.amount, flat: flat || null, clientId, kind },
            })
          }
          onNo={() => setConfirmSave(false)}
        />
      ) : (
        <Button variant="primary" className="w-full" onClick={() => setConfirmSave(true)}>
          Save
        </Button>
      )}
    </div>
  );
}

function SaveConfirm({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-sm font-medium">Save changes?</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" onClick={onYes}>
          Save
        </Button>
        <Button onClick={onNo}>Cancel</Button>
      </div>
    </div>
  );
}
