import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
  logo,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  logo?: boolean;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {logo ? (
          <img
            src="/logo-mark.png"
            alt=""
            width={40}
            height={40}
            className="mt-0.5 h-10 w-10 shrink-0 object-contain"
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm font-normal text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
