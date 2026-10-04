import type { StayLedgerRow } from "@/lib/ledger";
import { StayLedgerCard } from "@/components/dashboard/StayLedgerCard";

export function RecentActivity({
  stays,
  showFlat,
  emptyLabel = "No stays yet.",
}: {
  stays: StayLedgerRow[];
  showFlat: boolean;
  emptyLabel?: string;
}) {
  return (
    <section className="space-y-2.5">
      <h2 className="section-title">Recent activity</h2>
      {stays.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-3.5 py-3 text-sm font-normal text-muted">
          {emptyLabel}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {stays.map((row) => (
            <StayLedgerCard key={row.stayId} row={row} showFlat={showFlat} />
          ))}
        </div>
      )}
    </section>
  );
}
