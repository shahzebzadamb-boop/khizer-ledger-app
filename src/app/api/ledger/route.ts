import { DatabaseUnavailableError } from "@/lib/server/db";
import { loadLedgerState } from "@/lib/server/load-ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await loadLedgerState();
    return Response.json({ state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unavailable = error instanceof DatabaseUnavailableError;
    return Response.json(
      {
        error: unavailable
          ? "Database is not configured. Set it on the server. Saves will not use in-memory data."
          : "Database unavailable.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
