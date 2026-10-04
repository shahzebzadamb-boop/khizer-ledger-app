import type { Action } from "@/lib/ledger-actions";
import { DatabaseUnavailableError } from "@/lib/server/db";
import { applyLedgerAction } from "@/lib/server/persist-ledger";

export const dynamic = "force-dynamic";

const WRITE_TYPES = new Set<Action["type"]>([
  "RECORD_PAYMENT",
  "ADD_STAY",
  "ADD_EXPENSE",
  "APPLY_QUICK_ENTRY",
  "SET_CLIENT_PHONE",
  "ADD_CLIENT",
  "RENAME_FLAT",
  "ADD_FLAT",
  "UPDATE_FLAT",
  "ARCHIVE_FLAT",
  "RESTORE_FLAT",
  "DELETE_FLAT",
  "REVIEW_STATUS",
  "REVIEW_PENDING",
  "APPLY_MIGRATION_UPDATE",
  "SILENCE_CLIENT",
  "MARK_NIGHT_SUMMARY",
  "APPLY_CORRECTION",
  "UPDATE_STAY",
  "UPDATE_PAYMENT",
  "UPDATE_EXPENSE",
  "UPDATE_SECURITY",
  "VOID_ENTRY",
  "GENERATE_RECEIPT",
  "MARK_RECEIPT_SHARE_ATTEMPTED",
  "MARK_RECEIPT_SENT",
]);

export async function POST(request: Request) {
  try {
    const action = (await request.json()) as Action;
    if (!action?.type || !WRITE_TYPES.has(action.type)) {
      return Response.json({ error: "Unsupported action." }, { status: 400 });
    }
    const state = await applyLedgerAction(action);
    return Response.json({ state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unavailable = error instanceof DatabaseUnavailableError;
    return Response.json(
      {
        error: unavailable
          ? "Database is not configured. Set it on the server. Saves will not use in-memory data."
          : "Save failed.",
      },
      { status: unavailable ? 503 : 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
