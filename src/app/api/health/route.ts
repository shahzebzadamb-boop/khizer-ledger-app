import { isDatabaseConfigured, lastDatabaseFailureCode, pingDatabase, getPool, logDatabaseFailure } from "@/lib/server/db";
import { prepareLedgerDatabase } from "@/lib/server/prepare-ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isDatabaseConfigured();
  if (configured) {
    try {
      await prepareLedgerDatabase(getPool());
    } catch (error) {
      logDatabaseFailure("prepare", error);
    }
  }
  const database = configured && (await pingDatabase());
  return Response.json(
    database
      ? { app: "ok", database: "ok" }
      : { app: "ok", database: "unavailable", code: lastDatabaseFailureCode() },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
