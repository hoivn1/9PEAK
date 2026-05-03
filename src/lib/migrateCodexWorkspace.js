/**
 * [9peak-fork] v0.4.4 — Migration helper for Codex workspace info.
 *
 * Existing users who OAuth'd Codex acc before v0.4.2 don't have
 * `providerSpecificData.organizations` / `primaryWorkspace` saved (the extract
 * logic landed in v0.4.2). The id_token IS still saved (`connection.idToken`
 * field), so we can re-decode it and back-fill the workspace data without
 * forcing them to re-OAuth every account.
 *
 * Triggered manually by admin via the "Re-fetch workspace info" button on
 * the Codex provider detail page (POST /api/codex/migrate-workspaces). Not
 * auto-run on startup — admin opt-in keeps DB writes predictable.
 *
 * The startup-time `backfillCodexEmails()` in src/lib/oauth/providers.js DOES
 * include workspace fields as of v0.4.2; this migrator is a manual trigger
 * for admins who want to re-run after a fresh upgrade or who skipped the
 * startup window.
 */

import { getProviderConnections, updateProviderConnection } from "@/lib/localDb";
import { extractCodexAccountInfo } from "@/lib/oauth/providers";

/**
 * Re-extract workspace info for every Codex OAuth connection that lacks it.
 *
 * @returns {Promise<{migrated:number, skipped:number, failed:number, total:number, details:Array<{id:string, status:string, reason?:string}>}>}
 */
export async function migrateAllCodexConnections() {
  const connections = await getProviderConnections({ provider: "codex" });
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const details = [];

  for (const conn of connections) {
    const psd = conn.providerSpecificData || {};
    const hasWorkspace = !!psd.primaryWorkspace
      || (Array.isArray(psd.organizations) && psd.organizations.length > 0);
    if (hasWorkspace) {
      skipped++;
      details.push({ id: conn.id, status: "skipped", reason: "already has workspace" });
      continue;
    }
    if (conn.authType !== "oauth" || !conn.idToken) {
      skipped++;
      details.push({ id: conn.id, status: "skipped", reason: "no id_token" });
      continue;
    }
    try {
      const info = extractCodexAccountInfo(conn.idToken);
      if (!info || (!info.primaryWorkspace && !(info.organizations && info.organizations.length))) {
        // id_token decoded but no workspace info inside — corrupt or older id_token
        failed++;
        details.push({ id: conn.id, status: "failed", reason: "no workspace in id_token" });
        continue;
      }
      const patch = {
        providerSpecificData: {
          ...(conn.providerSpecificData || {}),
          ...(info.chatgptAccountId ? { chatgptAccountId: info.chatgptAccountId } : {}),
          ...(info.chatgptPlanType ? { chatgptPlanType: info.chatgptPlanType } : {}),
          ...(info.chatgptUserId ? { chatgptUserId: info.chatgptUserId } : {}),
          ...(info.organizations ? { organizations: info.organizations } : {}),
          ...(info.primaryWorkspace ? { primaryWorkspace: info.primaryWorkspace } : {}),
        },
      };
      if (!conn.email && info.email) patch.email = info.email;
      const updated = await updateProviderConnection(conn.id, patch);
      if (updated) {
        migrated++;
        details.push({ id: conn.id, status: "migrated" });
      } else {
        failed++;
        details.push({ id: conn.id, status: "failed", reason: "DB update returned null" });
      }
    } catch (err) {
      failed++;
      details.push({ id: conn.id, status: "failed", reason: err?.message || String(err) });
    }
  }

  return {
    migrated,
    skipped,
    failed,
    total: connections.length,
    details,
  };
}
