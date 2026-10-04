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
    <header className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {logo ? (
          <span className="kh-logo-plate">
            <img src="/branding/khizer-logo.png" alt="" width={44} height={44} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-xs font-normal tracking-wide text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
    </header>
  );
}
