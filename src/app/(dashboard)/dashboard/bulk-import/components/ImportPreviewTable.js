"use client";
// [9peak-fork] v0.5.1 — Bulk Import: preview table cho parsed tokens.
// Mỗi row: email + plan badge (decode idToken locally) + status (will import / dup / invalid).

import { useMemo } from "react";
import PropTypes from "prop-types";
import { Card, PlanBadge } from "@/shared/components";

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
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (base64.length % 4)) % 4;
    base64 += "=".repeat(pad);
    if (typeof atob === "function") {
      return JSON.parse(decodeURIComponent(escape(atob(base64))));
    }
    return JSON.parse(globalThis.Buffer.from(base64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Run client-side validation on parsed tokens. Cross-check with existing
 * Codex emails (passed in as prop) for dedupe preview.
 */
function classify(tokens, existingEmails) {
  const seen = new Set();
  return tokens.map((t, idx) => {
    const row = { idx, email: t?.email || null, plan: null, status: "import", reason: null };
    if (!t || typeof t !== "object") {
      row.status = "invalid";
      row.reason = "không phải object";
      return row;
    }
    if (!row.email || !EMAIL_RE.test(String(row.email).trim())) {
      row.status = "invalid";
      row.reason = "email lỗi";
      return row;
    }
    if (!isJwt(t.accessToken)) {
      row.status = "invalid";
      row.reason = "accessToken không phải JWT";
      return row;
    }
    if (!t.refreshToken || typeof t.refreshToken !== "string") {
      row.status = "invalid";
      row.reason = "thiếu refreshToken";
      return row;
    }
    if (!isJwt(t.idToken)) {
      row.status = "invalid";
      row.reason = "idToken không phải JWT";
      return row;
    }
    const payload = decodeJwtPayload(t.idToken);
    const auth = payload && payload["https://api.openai.com/auth"];
    if (!auth) {
      row.status = "invalid";
      row.reason = "idToken thiếu OpenAI claim";
      return row;
    }
    row.plan = auth.chatgpt_plan_type || t.providerSpecificData?.chatgptPlanType || null;
    const lc = String(row.email).trim().toLowerCase();
    if (existingEmails.has(lc) || seen.has(lc)) {
      row.status = "duplicate";
      row.reason = "đã có Codex connection";
    } else {
      seen.add(lc);
    }
    return row;
  });
}

function StatusPill({ status, reason }) {
  if (status === "import") {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
        sẽ import
      </span>
    );
  }
  if (status === "duplicate") {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        title={reason || ""}
      >
        trùng (skip)
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
      title={reason || ""}
    >
      lỗi
    </span>
  );
}
StatusPill.propTypes = {
  status: PropTypes.string.isRequired,
  reason: PropTypes.string,
};

export default function ImportPreviewTable({ tokens, existingEmails, importing, onImport }) {
  const rows = useMemo(() => classify(tokens || [], existingEmails || new Set()), [tokens, existingEmails]);
  const counts = useMemo(() => {
    const c = { willImport: 0, duplicate: 0, invalid: 0 };
    for (const r of rows) {
      if (r.status === "import") c.willImport++;
      else if (r.status === "duplicate") c.duplicate++;
      else c.invalid++;
    }
    return c;
  }, [rows]);

  if (!rows.length) {
    return (
      <Card padding="md" className="text-sm text-text-muted">
        Chưa có token nào — paste JSON hoặc upload file ở trên.
      </Card>
    );
  }

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm">
          <span className="text-text-main font-semibold">Detected {rows.length} tokens</span>
          <span className="ml-2 text-text-muted">
            · {counts.willImport} sẽ import
            {counts.duplicate > 0 && <> · {counts.duplicate} trùng</>}
            {counts.invalid > 0 && <> · <span className="text-red-600 dark:text-red-400">{counts.invalid} lỗi</span></>}
          </span>
        </div>
        <button
          type="button"
          onClick={onImport}
          disabled={importing || counts.willImport === 0}
          className={
            "px-4 py-2 rounded-md font-semibold text-sm transition-colors " +
            (importing || counts.willImport === 0
              ? "bg-black/10 dark:bg-white/10 text-text-muted cursor-not-allowed"
              : "bg-primary text-white hover:bg-primary/90")
          }
        >
          {importing ? "Importing…" : `Import All (${counts.willImport})`}
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-black/5 dark:border-white/5">
        <table className="w-full text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="text-left px-3 py-2 font-semibold w-[3rem]">#</th>
              <th className="text-left px-3 py-2 font-semibold">Email</th>
              <th className="text-left px-3 py-2 font-semibold">Plan</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.idx} className="border-t border-black/5 dark:border-white/5">
                <td className="px-3 py-2 text-text-muted font-mono">{r.idx + 1}</td>
                <td className="px-3 py-2 font-mono text-xs break-all">{r.email || <span className="text-red-500">(thiếu email)</span>}</td>
                <td className="px-3 py-2">{r.plan ? <PlanBadge planType={r.plan} /> : <span className="text-text-muted text-xs">—</span>}</td>
                <td className="px-3 py-2">
                  <StatusPill status={r.status} reason={r.reason} />
                  {r.reason && r.status !== "import" && (
                    <span className="ml-2 text-xs text-text-muted">{r.reason}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

ImportPreviewTable.propTypes = {
  tokens: PropTypes.array.isRequired,
  existingEmails: PropTypes.instanceOf(Set),
  importing: PropTypes.bool,
  onImport: PropTypes.func.isRequired,
};
