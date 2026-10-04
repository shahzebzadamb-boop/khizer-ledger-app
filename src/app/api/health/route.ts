import { isDatabaseConfigured, pingDatabase, getPool } from "@/lib/server/db";
import { prepareLedgerDatabase } from "@/lib/server/prepare-ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isDatabaseConfigured();
  if (configured) {
    try {
      await prepareLedgerDatabase(getPool());
    } catch {
      // pingDatabase reports the live connection
    }
  }
  const database = configured && (await pingDatabase());
  return Response.json(
    {
      app: "ok",
      database: database ? "ok" : "unavailable",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
