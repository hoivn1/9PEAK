"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardSkeleton } from "@/shared/components";

const POLL_INTERVAL_MS = 30000;
const PLAN_STYLES = {
  business: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  team: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  enterprise: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
  pro: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  plus: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  go: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  free: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function PlanBadge({ planType }) {
  if (!planType) return <span className="text-text-muted text-xs">—</span>;
  const key = String(planType).toLowerCase();
  const cls = PLAN_STYLES[key] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      {planType}
    </span>
  );
}

function StatusBadge({ status, errorCode, hasCooldown }) {
  if (hasCooldown) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
        Cooldown
      </span>
    );
  }
  if (status === "unavailable" || status === "error") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        {errorCode || "Disabled"}
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
        Expired
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      Active
    </span>
  );
}

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 1000) return "vừa xong";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s trước`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}p trước`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h trước`;
  return `${Math.floor(diff / 86400000)} ngày trước`;
}

function fmtDuration(ms) {
  if (!ms || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export default function AccountsTab() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/routing-stats", { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `HTTP ${res.status}`);
        return;
      }
      const json = await res.json();
      setStats(json);
      setError("");
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, load]);

  if (loading && !stats) return <CardSkeleton />;
  if (error && !stats) {
    return (
      <Card>
        <p className="text-red-500 text-sm">Lỗi tải routing stats: {error}</p>
      </Card>
    );
  }
  if (!stats) return null;

  const connectionEntries = Object.entries(stats.connections || {});
  const codexAccounts = connectionEntries
    .filter(([, info]) => info.provider === "codex")
    .map(([id, info]) => {
      const lastUsedAt = stats.lastUsedAt?.[id] || null;
      const totalReqs = stats.totalRequests?.[id] || 0;
      const activeReqs = stats.activeRequests?.[id] || 0;
      const modelLocks = info.modelLocks || {};
      // eslint-disable-next-line react-hooks/purity
      const now = Date.now();
      let maxCooldownMs = 0;
      for (const v of Object.values(modelLocks)) {
        const t = v ? new Date(v).getTime() : 0;
        if (t > now) maxCooldownMs = Math.max(maxCooldownMs, t - now);
      }
      // Heuristic: count this account as having a recent 429 if errorCode=429 and lastErrorAt is within 24h.
      const errAt = info.lastErrorAt ? new Date(info.lastErrorAt).getTime() : 0;
      const within24h = errAt && (now - errAt) < 86400000;
      const has429 = within24h && Number(info.errorCode) === 429;
      const has401 = within24h && Number(info.errorCode) === 401;
      return {
        id,
        ...info,
        lastUsedAt,
        totalReqs,
        activeReqs,
        cooldownMs: maxCooldownMs,
        has429: has429 ? 1 : 0,
        has401: has401 ? 1 : 0,
      };
    })
    .sort((a, b) => {
      const aT = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const bT = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      return bT - aT;
    });

  const total = codexAccounts.length;
  const activeCount = codexAccounts.filter((c) =>
    !c.testStatus || c.testStatus === "active" || c.testStatus === "success"
  ).length;
  const total429 = codexAccounts.reduce((sum, c) => sum + c.has429, 0);
  const needAttention = codexAccounts.filter((c) => c.cooldownMs > 0 || c.has429).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Header controls */}
      <Card className="px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-text-main">Codex Accounts ({total})</h3>
          <p className="text-xs text-text-muted">
            Theo dõi sức khỏe các tài khoản ChatGPT OAuth dùng cho image generation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-text-muted">
              Cập nhật: {lastUpdated.toLocaleTimeString("vi-VN")}
            </span>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto refresh 30s</span>
          </label>
          <button
            type="button"
            onClick={load}
            className="text-sm text-primary hover:underline cursor-pointer flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Refresh
          </button>
        </div>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="px-4 py-3 flex flex-col gap-1">
          <span className="text-text-muted text-xs uppercase font-semibold">Active / Total</span>
          <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {activeCount} / {total}
          </span>
        </Card>
        <Card className="px-4 py-3 flex flex-col gap-1">
          <span className="text-text-muted text-xs uppercase font-semibold">Tổng 429 (24h gần nhất)</span>
          <span className={`text-2xl font-bold ${total429 > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-text-main"}`}>
            {total429}
          </span>
          <span className="text-[11px] text-text-muted">Đếm theo errorCode lần gần nhất</span>
        </Card>
        <Card className="px-4 py-3 flex flex-col gap-1">
          <span className="text-text-muted text-xs uppercase font-semibold">Cần attention</span>
          <span className={`text-2xl font-bold ${needAttention > 0 ? "text-red-500" : "text-text-main"}`}>
            {needAttention}
          </span>
          <span className="text-[11px] text-text-muted">Đang cooldown hoặc 429 trong 24h</span>
        </Card>
      </div>

      {/* Table */}
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 dark:border-white/5 text-left bg-black/[0.02] dark:bg-white/[0.02]">
                <th className="px-3 py-2 text-xs font-medium text-text-muted">Account</th>
                <th className="px-3 py-2 text-xs font-medium text-text-muted">Plan</th>
                <th className="px-3 py-2 text-xs font-medium text-text-muted">Trạng thái</th>
                <th className="px-3 py-2 text-xs font-medium text-text-muted">429 (24h)</th>
                <th className="px-3 py-2 text-xs font-medium text-text-muted">401 (24h)</th>
                <th className="px-3 py-2 text-xs font-medium text-text-muted">Last used</th>
                <th className="px-3 py-2 text-xs font-medium text-text-muted">Cooldown còn lại</th>
              </tr>
            </thead>
            <tbody>
              {codexAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-text-muted text-sm">
                    Không có account Codex nào active. Thêm account ở trang Providers.
                  </td>
                </tr>
              ) : (
                codexAccounts.map((c) => {
                  const lockedModels = Object.keys(c.modelLocks || {});
                  return (
                    <tr key={c.id} className="border-b border-black/5 dark:border-white/5 last:border-b-0">
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col">
                          <span className="font-medium text-text-main">{c.email || c.name}</span>
                          {c.email && c.name && c.name !== c.email && (
                            <span className="text-[10px] text-text-muted">{c.name}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <PlanBadge planType={c.chatgptPlanType} />
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge
                          status={c.testStatus}
                          errorCode={c.errorCode}
                          hasCooldown={c.cooldownMs > 0}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        {c.has429 ? (
                          <span className="font-medium text-yellow-600 dark:text-yellow-400">≥ 1</span>
                        ) : (
                          <span className="text-text-muted">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {c.has401 ? (
                          <span className="font-medium text-red-500">≥ 1</span>
                        ) : (
                          <span className="text-text-muted">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-text-main" title={c.lastUsedAt || ""}>
                        {timeAgo(c.lastUsedAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col">
                          <span className={c.cooldownMs > 0 ? "text-yellow-600 dark:text-yellow-400 font-medium" : "text-text-muted"}>
                            {fmtDuration(c.cooldownMs)}
                          </span>
                          {lockedModels.length > 0 && (
                            <span className="text-[10px] text-text-muted">
                              Locked: {lockedModels.join(", ")}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-[11px] text-text-muted text-center">
        Note: 429/401 24h chỉ phản ánh errorCode gần nhất từ routing-stats — không phải full counter.
        Chi tiết per-request xem ở /dashboard/routing.
      </p>
    </div>
  );
}
