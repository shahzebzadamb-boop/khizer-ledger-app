import { Suspense } from "react";
import { LedgerPage } from "@/components/ledger/LedgerPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm font-normal text-muted">Loading ledger…</p>}>
      <LedgerPage />
    </Suspense>
  );
}
