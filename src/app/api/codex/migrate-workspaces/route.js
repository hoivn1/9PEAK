/**
 * [9peak-fork] v0.4.4 — POST /api/codex/migrate-workspaces
 *
 * Admin-triggered re-extraction of Codex workspace info for connections that
 * OAuth'd before v0.4.2 (so `providerSpecificData.primaryWorkspace` is missing).
 *
 * Auth: follows the same pattern as the rest of /api/providers (no explicit
 * verifyAuth — dashboard guard at the page level + same-origin requirement
 * gates access).
 *
 * Returns: { ok, migrated, skipped, failed, total, details }
 */

import { NextResponse } from "next/server";
import { migrateAllCodexConnections } from "@/lib/migrateCodexWorkspace";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await migrateAllCodexConnections();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.log("Error migrating Codex workspaces:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}
