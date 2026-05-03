// [9peak-fork] v0.5.1 — POST /api/codex/bulk-import
//
// Bulk-import a list of Codex tokens (collected ngoài app, ví dụ qua
// `tools/collector/`). Validate per-token, decode `idToken` qua
// `extractCodexAccountInfo()` để re-extract email/plan/workspace info,
// dedupe theo email, save qua `createProviderConnection()`.
//
// Body: {
//   tokens: [{ email, accessToken, refreshToken, idToken, expiresAt?, providerSpecificData? }],
//   proxyMode?: "none" | "single" | "round-robin",
//   proxyPoolId?: string,
//   proxyPoolIds?: string[],
//   bindRuntimeProxy?: boolean
// }
// Returns: { ok, total, imported, skipped, failed, details: [...] }

import { NextResponse } from "next/server";
import {
  createProviderConnection,
  getProviderConnections,
  getProxyPoolById,
} from "@/lib/localDb";
import { extractCodexAccountInfo } from "@/lib/oauth/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isJwt(value) {
  if (!value || typeof value !== "string") return false;
  const parts = value.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

function decodeJwtPayload(jwt) {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (base64.length % 4)) % 4;
    return JSON.parse(Buffer.from(base64 + "=".repeat(pad), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Validate one token entry. Return { ok, reason? } — reason is short status
 * key cho details payload trên client.
 */
function validateToken(t) {
  if (!t || typeof t !== "object") return { ok: false, reason: "not_object" };
  if (!t.email || typeof t.email !== "string" || !EMAIL_RE.test(t.email.trim())) {
    return { ok: false, reason: "invalid_email" };
  }
  if (!isJwt(t.accessToken)) return { ok: false, reason: "invalid_access_token" };
  if (!t.refreshToken || typeof t.refreshToken !== "string" || !t.refreshToken.trim()) {
    return { ok: false, reason: "missing_refresh_token" };
  }
  if (!isJwt(t.idToken)) return { ok: false, reason: "invalid_id_token" };
  // idToken should carry the OpenAI auth claim
  const payload = decodeJwtPayload(t.idToken);
  if (!payload || !payload["https://api.openai.com/auth"]) {
    return { ok: false, reason: "id_token_missing_openai_claim" };
  }
  return { ok: true };
}

async function resolveProxyImportOptions(body = {}) {
  const mode = ["none", "single", "round-robin"].includes(body?.proxyMode) ? body.proxyMode : "none";
  const bindRuntimeProxy = body?.bindRuntimeProxy === true;

  if (mode === "none") {
    return { mode, bindRuntimeProxy: false, proxyPoolIds: [] };
  }

  const rawIds = mode === "single"
    ? [body?.proxyPoolId]
    : (Array.isArray(body?.proxyPoolIds) ? body.proxyPoolIds : []);

  const proxyPoolIds = [...new Set(rawIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!proxyPoolIds.length) {
    return { error: mode === "single" ? "Select one proxy pool for import" : "Select at least one proxy pool for round-robin import" };
  }

  for (const id of proxyPoolIds) {
    const pool = await getProxyPoolById(id);
    if (!pool || pool.isActive === false) {
      return { error: `Proxy pool not found or inactive: ${id}` };
    }
  }

  return { mode, bindRuntimeProxy, proxyPoolIds };
}

function pickProxyPoolId(proxyOptions, importIndex) {
  if (!proxyOptions || proxyOptions.mode === "none") return null;
  if (proxyOptions.mode === "single") return proxyOptions.proxyPoolIds[0] || null;
  if (proxyOptions.mode === "round-robin") {
    const ids = proxyOptions.proxyPoolIds || [];
    return ids.length ? ids[importIndex % ids.length] : null;
  }
  return null;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const tokens = Array.isArray(body?.tokens) ? body.tokens : null;
  if (!tokens || !tokens.length) {
    return NextResponse.json({ ok: false, error: "Missing or empty `tokens` array" }, { status: 400 });
  }

  const proxyOptions = await resolveProxyImportOptions(body);
  if (proxyOptions.error) {
    return NextResponse.json({ ok: false, error: proxyOptions.error }, { status: 400 });
  }

  // Snapshot existing Codex emails for dedupe (one DB read for the whole batch)
  let existingEmails = new Set();
  try {
    const connections = await getProviderConnections();
    existingEmails = new Set(
      connections
        .filter((c) => c.provider === "codex" && c.authType === "oauth" && c.email)
        .map((c) => String(c.email).toLowerCase())
    );
  } catch (err) {
    console.log("[bulk-import] failed to load connections for dedupe:", err?.message || err);
  }

  // Track emails imported within this batch so duplicates inside the same payload
  // don't all save (creates noisy upserts otherwise).
  const seenInBatch = new Set();

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let importAttemptIndex = 0;
  const details = [];

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    const validation = validateToken(raw);
    if (!validation.ok) {
      failed++;
      details.push({
        idx: i,
        email: raw?.email || null,
        status: "failed",
        reason: validation.reason,
      });
      continue;
    }

    const email = String(raw.email).trim().toLowerCase();

    if (existingEmails.has(email) || seenInBatch.has(email)) {
      skipped++;
      details.push({ idx: i, email, status: "skipped", reason: "duplicate" });
      continue;
    }

    // Re-extract account info from idToken (authoritative). Fall back to
    // user-provided providerSpecificData if extraction returns empty.
    const info = extractCodexAccountInfo(raw.idToken);
    const userPSD = raw.providerSpecificData && typeof raw.providerSpecificData === "object"
      ? raw.providerSpecificData
      : {};

    const providerSpecificData = {
      ...userPSD,
      ...(info.chatgptAccountId ? { chatgptAccountId: info.chatgptAccountId } : {}),
      ...(info.chatgptPlanType ? { chatgptPlanType: info.chatgptPlanType } : {}),
      ...(info.chatgptUserId ? { chatgptUserId: info.chatgptUserId } : {}),
      ...(info.organizations && info.organizations.length ? { organizations: info.organizations } : {}),
      ...(info.primaryWorkspace ? { primaryWorkspace: info.primaryWorkspace } : {}),
    };

    const assignedProxyPoolId = pickProxyPoolId(proxyOptions, importAttemptIndex);
    importAttemptIndex++;
    if (assignedProxyPoolId && proxyOptions.bindRuntimeProxy) {
      providerSpecificData.proxyPoolId = assignedProxyPoolId;
    } else {
      delete providerSpecificData.proxyPoolId;
    }

    let expiresAt = null;
    if (typeof raw.expiresAt === "number" && raw.expiresAt > 0) {
      expiresAt = new Date(raw.expiresAt).toISOString();
    } else if (typeof raw.expiresAt === "string" && raw.expiresAt.trim()) {
      // Already an ISO string maybe
      const parsed = new Date(raw.expiresAt);
      if (!Number.isNaN(parsed.getTime())) expiresAt = parsed.toISOString();
    }

    try {
      const connection = await createProviderConnection({
        provider: "codex",
        authType: "oauth",
        email: info.email || email,
        accessToken: raw.accessToken,
        refreshToken: raw.refreshToken,
        idToken: raw.idToken,
        expiresAt,
        testStatus: "active",
        providerSpecificData: Object.keys(providerSpecificData).length ? providerSpecificData : undefined,
      });
      seenInBatch.add(email);
      imported++;
      details.push({
        idx: i,
        email: connection?.email || email,
        status: "imported",
        connectionId: connection?.id || null,
        planType: info.chatgptPlanType || null,
        importProxyPoolId: assignedProxyPoolId,
        runtimeProxyBound: !!(assignedProxyPoolId && proxyOptions.bindRuntimeProxy),
      });
    } catch (err) {
      failed++;
      details.push({
        idx: i,
        email,
        status: "failed",
        reason: "db_save_failed",
        error: err?.message || String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    total: tokens.length,
    imported,
    skipped,
    failed,
    proxyMode: proxyOptions.mode,
    bindRuntimeProxy: proxyOptions.bindRuntimeProxy,
    details,
  });
}
