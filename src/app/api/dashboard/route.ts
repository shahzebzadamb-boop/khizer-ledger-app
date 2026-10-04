import { dashboardTotals } from "@/lib/ledger";
import { DatabaseUnavailableError } from "@/lib/server/db";
import { loadLedgerState } from "@/lib/server/load-ledger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const flat = url.searchParams.get("flat") ?? "all";
    const breakdown = url.searchParams.get("breakdown") === "1";
    if (!from || !to) {
      return Response.json({ error: "from and to are required." }, { status: 400 });
    }

    const state = await loadLedgerState();
    const range = { from: new Date(from), to: new Date(to) };
    const totals = dashboardTotals(state, range, flat);
    const flats = breakdown
      ? state.flats
          .filter((item) => flat === "all" || item.name === flat)
          .map((item) => ({ name: item.name, ...dashboardTotals(state, range, item.name) }))
      : undefined;

    return Response.json(
      { totals, flats },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const unavailable = error instanceof DatabaseUnavailableError;
    return Response.json(
      {
        error: unavailable
          ? "Database is not configured. Set it on the server. Saves will not use in-memory data."
          : "Database unavailable.",
        totals: { business: 0, received: 0, pending: 0, expenses: 0, carriedForward: 0 },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
