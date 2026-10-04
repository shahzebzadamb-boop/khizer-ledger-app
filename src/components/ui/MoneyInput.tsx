"use client";

import { formatPKR, parseFormAmount, sanitizeMoneyInput } from "@/lib/money";
import { Field, fieldClass } from "@/components/ui/Sheet";

export function MoneyInput({
  label,
  value,
  onChange,
  allowZero = true,
  placeholder,
  helper = "typed",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  allowZero?: boolean;
  placeholder?: string;
  helper?: "typed" | "always" | "never";
  disabled?: boolean;
}) {
  const parsed = parseFormAmount(value, true);
  const showHelper =
    helper === "never"
      ? false
      : helper === "always"
        ? parsed != null
        : value !== "" && parsed != null;

  function apply(raw: string) {
    const next = sanitizeMoneyInput(raw);
    if (next == null) return;
    onChange(next);
  }

  return (
    <Field label={label}>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        enterKeyHint="done"
        aria-label={label}
        disabled={disabled}
        className={fieldClass}
        value={value}
        placeholder={placeholder}
        onChange={(event) => apply(event.target.value)}
        onPaste={(event) => {
          event.preventDefault();
          apply(event.clipboardData.getData("text"));
        }}
        onFocus={(event) => {
          if (value === "0") event.currentTarget.select();
        }}
      />
      {showHelper && parsed != null ? (
        <p className="mt-1 money text-sm font-normal text-muted">{formatPKR(parsed)}</p>
      ) : null}
    </Field>
  );
}
