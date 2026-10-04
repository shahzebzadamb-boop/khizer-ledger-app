import type { ReactNode } from "react";

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="kh-sheet-backdrop" onClick={onClose}>
      <div
        className="kh-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="kh-sheet-grab" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="section-title">{title}</h3>
          <button type="button" className="min-h-11 text-sm font-medium text-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const fieldClass = "w-full rounded-xl border border-border bg-input px-3 text-base";
