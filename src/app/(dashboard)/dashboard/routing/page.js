"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardSkeleton } from "@/shared/components";

const POLL_INTERVAL = 2000;
const RECENT_THRESHOLD_MS = 5000; // highlight accounts used within 5s

function timeAgo(isoStr) {
  if (!isoStr) return "-";
  const diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 1000) return "vua xong";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s truoc`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m truoc`;
  return `${Math.floor(diff / 3600000)}h truoc`;
}

// Absolute datetime in VN format. Shows just time if same day, else "dd/MM HH:mm".
function formatTestedAt(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  const DD = String(d.getDate()).padStart(2, "0");
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  return `${DD}/${MM} ${hh}:${mm}`;
}

function StatusBadge({ status, errorCode }) {
  if (status === "unavailable" || status === "error") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        {errorCode || "Error"}
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
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      Ready
    </span>
  );
}

function ConcurrencyDots({ active, max }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-full transition-all duration-300 ${
            i < active
              ? "bg-primary scale-110 shadow-sm shadow-primary/50"
              : "bg-gray-200 dark:bg-gray-700"
          }`}
          title={i < active ? "In use" : "Available"}
        />
      ))}
      {active > max && (
        <span className="text-xs text-red-500 font-medium ml-1">+{active - max}</span>
      )}
    </div>
  );
}

function DistributionBar({ connectionStats }) {
  const totalReqs = connectionStats.reduce((sum, c) => sum + c.total, 0);
  if (totalReqs === 0) return <p className="text-xs text-text-muted text-center py-2">Chua co request nao.</p>;

  const colors = [
    "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500",
    "bg-cyan-500", "bg-yellow-500", "bg-red-400", "bg-indigo-500", "bg-teal-500",
    "bg-lime-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500",
  ];

  return (
    <div>
      <div className="flex h-8 rounded-lg overflow-hidden shadow-inner">
        {connectionStats.map((c, i) => {
          const pct = (c.total / totalReqs) * 100;
          if (pct < 0.3) return null;
          return (
            <div
              key={c.id}
              className={`${colors[i % colors.length]} relative group transition-all duration-500`}
              style={{ width: `${pct}%` }}
              title={`${c.name}: ${c.total} requests (${pct.toFixed(1)}%)`}
            >
              {pct > 6 && (
                <span className="absolute inset-0 flex items-center justify-center text-white text-[11px] font-semibold truncate px-1">
                  {c.name}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {connectionStats.map((c, i) => {
          const pct = totalReqs > 0 ? ((c.total / totalReqs) * 100).toFixed(0) : 0;
          return (
            <div key={c.id} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-sm ${colors[i % colors.length]}`} />
              <span className="text-xs text-text-muted">{c.name}: <span className="text-text-main font-medium">{c.total}</span> ({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RoutingMonitorPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const prevTotalsRef = useRef({});
  const [recentlyUsed, setRecentlyUsed] = useState(new Set());

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/routing-stats", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const prevTotals = prevTotalsRef.current;
        const nextRecentlyUsed = new Set();

        for (const [id, info] of Object.entries(data.connections || {})) {
          const previousTotal = prevTotals[id] || 0;
          const nextTotal = (data.totalRequests && data.totalRequests[id]) || 0;
          if (nextTotal > previousTotal) nextRecentlyUsed.add(id);
        }

        prevTotalsRef.current = data.totalRequests || {};
        setRecentlyUsed(nextRecentlyUsed);
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch routing stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Update relative times every second
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleResetCounters = async () => {
    await fetch("/api/routing-stats", { method: "DELETE" }).catch(() => {});
    prevTotalsRef.current = {};
    fetchStats();
  };

  const handleClearAllLocks = async () => {
    await fetch("/api/models/availability", { method: "DELETE" }).catch(() => {});
    fetchStats();
  };

  // Health check: unified state — results persist across table changes
  const [healthResults, setHealthResults] = useState({});
  const [testingIds, setTestingIds] = useState(new Set()); // IDs currently being tested
  const [healthTestTime, setHealthTestTime] = useState(null);

  const testConnectionIds = async (ids) => {
    // Mark all IDs as testing
    setTestingIds(prev => new Set([...prev, ...ids]));
    try {
      for (const id of ids) {
        try {
          const res = await fetch(`/api/providers/${id}/test`, { method: "POST" });
          if (res.ok) {
            const data = await res.json();
            const healthCheck = data.healthCheck || data;
            const testedAt = healthCheck.testedAt || new Date().toISOString();
            // Update result immediately per account (progressive)
            setHealthResults(prev => ({
              ...prev,
              [id]: {
                valid: healthCheck.valid,
                latencyMs: healthCheck.latencyMs || 0,
                error: healthCheck.error || null,
                statusCode: healthCheck.statusCode,
                testedAt,
                refreshed: healthCheck.refreshed || false,
              }
            }));
          }
        } catch { /* skip */ }
        // Remove this ID from testing set
        setTestingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
      setHealthTestTime(new Date().toISOString());
      fetchStats();
    } catch (err) {
      console.error("Health check failed:", err);
      // Clear all testing IDs on error
      setTestingIds(prev => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  };

  const isAnyTesting = testingIds.size > 0;

  if (loading) return <CardSkeleton />;
  if (!stats) return <Card><p className="text-text-muted text-sm">Failed to load routing stats.</p></Card>;

  const connectionEntries = Object.entries(stats.connections || {});
  const maxConcurrent = stats.maxConcurrent || 2;

  const connectionStats = connectionEntries.map(([id, info]) => ({
    id,
    name: info.name,
    provider: info.provider,
    priority: info.priority,
    testStatus: info.testStatus,
    lastError: info.lastError,
    errorCode: info.errorCode,
    active: stats.activeRequests[id] || 0,
    total: stats.totalRequests[id] || 0,
    lastUsed: stats.lastUsedAt?.[id] || null,
    avgMs: stats.responseTime?.[id]?.avgMs || 0,
    reqCount: stats.responseTime?.[id]?.count || 0,
    // Health priority: fresh optimistic result from this session > persisted DB value
    health: healthResults[id] || info.healthCheck || null,
  })).sort((a, b) => {
    // Sort: recently used first, then by total desc
    const aRecent = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
    const bRecent = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
    return bRecent - aRecent;
  });

  // Split into ready vs error groups
  const readyAccounts = connectionStats.filter(c =>
    !c.testStatus || c.testStatus === "active" || c.testStatus === "success"
  );
  const errorAccounts = connectionStats.filter(c =>
    c.testStatus === "unavailable" || c.testStatus === "error" || c.testStatus === "expired"
  );

  const totalActive = connectionStats.reduce((sum, c) => sum + c.active, 0);
  const totalServed = connectionStats.reduce((sum, c) => sum + c.total, 0);

  // Latest health-check timestamp across all accounts — used for "Kiểm tra lúc ..." header.
  // Picks the fresh in-session test time if available, otherwise newest persisted result.
  const latestTestedAt = healthTestTime || connectionStats.reduce((max, c) => {
    const t = c.health?.testedAt;
    if (t && (!max || t > max)) return t;
    return max;
  }, null);

  const strategyLabels = {
    "least-connections": "Ít tải nhất",
    "round-robin": "Luân phiên",
    "fill-first": "Ưu tiên cao nhất",
    "openai-business": "OpenAI Business",
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{totalActive}</p>
            <p className="text-xs text-text-muted mt-1">Đang xử lý</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-text-main">{totalServed}</p>
            <p className="text-xs text-text-muted mt-1">Đã xử lý</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{readyAccounts.length}</p>
            <p className="text-xs text-text-muted mt-1">Sẵn sàng</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className={`text-2xl font-bold ${errorAccounts.length > 0 ? "text-red-500" : "text-text-main"}`}>{errorAccounts.length}</p>
            <p className="text-xs text-text-muted mt-1">Đang lỗi</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-lg font-semibold text-text-main">{strategyLabels[stats.globalStrategy] || stats.globalStrategy}</p>
            <p className="text-xs text-text-muted mt-1">Chiến lược</p>
          </div>
        </Card>
        {(stats.queueLength || 0) > 0 && (
          <Card>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-500 animate-pulse">{stats.queueLength}</p>
              <p className="text-xs text-text-muted mt-1">Đang chờ slot</p>
            </div>
          </Card>
        )}
      </div>

      {/* Ready Accounts */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <h2 className="text-lg font-semibold">Sẵn sàng ({readyAccounts.length})</h2>
            {latestTestedAt && (
              <span
                className="text-xs text-text-muted ml-2"
                title={new Date(latestTestedAt).toLocaleString("vi-VN")}
              >
                Kiểm tra lúc {formatTestedAt(latestTestedAt)} ({timeAgo(latestTestedAt)})
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => testConnectionIds(readyAccounts.map(c => c.id))}
              disabled={readyAccounts.some(c => testingIds.has(c.id))}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                readyAccounts.some(c => testingIds.has(c.id))
                  ? "bg-blue-200 text-blue-500 dark:bg-blue-900/30 cursor-wait"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
              }`}
            >
              {readyAccounts.some(c => testingIds.has(c.id))
                ? `Đang test ${readyAccounts.filter(c => testingIds.has(c.id)).length} acc...`
                : `Test ${readyAccounts.length} acc sẵn sàng`}
            </button>
            <button
              onClick={handleResetCounters}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              Reset bộ đếm
            </button>
          </div>
        </div>

        {readyAccounts.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">Không có account nào sẵn sàng.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 text-xs font-medium text-text-muted">Account</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-text-muted">Sống/Chết</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-text-muted">Slots</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-text-muted">Đã xử lý</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-text-muted">Tốc độ TB</th>
                  <th className="pb-2 text-xs font-medium text-text-muted">Lần cuối</th>
                </tr>
              </thead>
              <tbody>
                {readyAccounts.map((c) => {
                  const isRecent = recentlyUsed.has(c.id);
                  const lastUsedMs = c.lastUsed ? Date.now() - new Date(c.lastUsed).getTime() : Infinity;
                  const isVeryRecent = lastUsedMs < RECENT_THRESHOLD_MS;
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-border/50 transition-all duration-500 ${
                        isRecent
                          ? "bg-green-50 dark:bg-green-900/20"
                          : isVeryRecent
                            ? "bg-green-50/50 dark:bg-green-900/10"
                            : "hover:bg-background-secondary/50"
                      }`}
                    >
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          {isRecent && (
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
                          )}
                          <span className="font-medium text-text-main">{c.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">
                        {testingIds.has(c.id) ? (
                          <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /> Đang test...
                          </span>
                        ) : c.health ? (
                          c.health.valid ? (
                            <div>
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                Sống
                                <span className="text-text-muted ml-0.5">({c.health.latencyMs}ms)</span>
                              </span>
                              {c.health.testedAt && (
                                <p className="text-[10px] text-text-muted mt-0.5" title={new Date(c.health.testedAt).toLocaleString("vi-VN")}>
                                  {formatTestedAt(c.health.testedAt)} · {timeAgo(c.health.testedAt)}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                Chết
                                {c.health.statusCode && <span className="text-text-muted ml-0.5">({c.health.statusCode})</span>}
                              </span>
                              <p className="text-[10px] text-red-400 mt-0.5 max-w-[200px] truncate" title={c.health.error || ""}>
                                {c.health.error === "Token expired and refresh failed" ? "Token hết hạn, không refresh được"
                                  : c.health.error === "Token invalid or revoked" ? "Token bị thu hồi hoặc không hợp lệ"
                                  : c.health.error === "Token expired" ? "Token hết hạn"
                                  : c.health.error === "Access denied" ? "Bị từ chối truy cập (có thể hết gói Business)"
                                  : c.health.error || "Không xác định"}
                              </p>
                              {c.health.testedAt && (
                                <p className="text-[10px] text-text-muted mt-0.5" title={new Date(c.health.testedAt).toLocaleString("vi-VN")}>
                                  {formatTestedAt(c.health.testedAt)} · {timeAgo(c.health.testedAt)}
                                </p>
                              )}
                            </div>
                          )
                        ) : (
                          <span className="text-xs text-text-muted">Chưa test</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <ConcurrencyDots active={c.active} max={maxConcurrent} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-text-main font-semibold text-base">{c.total}</span>
                        <span className="text-xs text-text-muted ml-1">lượt</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        {c.avgMs > 0 ? (
                          <span className={`text-xs font-mono font-medium ${
                            c.avgMs < 3000 ? "text-green-600 dark:text-green-400" :
                            c.avgMs < 8000 ? "text-yellow-600 dark:text-yellow-400" :
                            "text-red-500"
                          }`}>
                            {c.avgMs < 1000 ? `${c.avgMs}ms` : `${(c.avgMs / 1000).toFixed(1)}s`}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">-</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <span className={`text-xs ${isVeryRecent ? "text-green-600 dark:text-green-400 font-semibold" : "text-text-muted"}`}>
                          {timeAgo(c.lastUsed)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Error Accounts */}
      {errorAccounts.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Đang lỗi ({errorAccounts.length})</h2>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => testConnectionIds(errorAccounts.map(c => c.id))}
                disabled={errorAccounts.some(c => testingIds.has(c.id))}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  errorAccounts.some(c => testingIds.has(c.id))
                    ? "bg-blue-200 text-blue-500 dark:bg-blue-900/30 cursor-wait"
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                }`}
              >
                {errorAccounts.some(c => testingIds.has(c.id))
                  ? `Đang test ${errorAccounts.filter(c => testingIds.has(c.id)).length} acc...`
                  : `Test ${errorAccounts.length} acc lỗi`}
              </button>
              <button
                onClick={handleClearAllLocks}
                className="px-3 py-1.5 text-xs bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/50 rounded-md transition-colors"
              >
                Xoá tất cả lock
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 text-xs font-medium text-text-muted">Account</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-text-muted">Test login</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-text-muted">Đã xử lý</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-text-muted">Lỗi routing</th>
                  <th className="pb-2 text-xs font-medium text-text-muted">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {errorAccounts.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 bg-red-50/30 dark:bg-red-900/5">
                    <td className="py-2.5 pr-4">
                      <div>
                        <span className="font-medium text-text-main">{c.name}</span>
                        <p className="text-[10px] text-text-muted">{c.provider}</p>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      {testingIds.has(c.id) ? (
                        <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /> Đang test...
                        </span>
                      ) : c.health ? (
                        c.health.valid ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              Vẫn sống
                              <span className="text-text-muted ml-0.5">({c.health.latencyMs}ms)</span>
                            </span>
                            <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">Login OK - lỗi routing chỉ tạm thời.</p>
                            {c.health.testedAt && (
                                <p className="text-[10px] text-text-muted mt-0.5" title={new Date(c.health.testedAt).toLocaleString("vi-VN")}>
                                  {formatTestedAt(c.health.testedAt)} · {timeAgo(c.health.testedAt)}
                                </p>
                              )}
                          </div>
                        ) : (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                              <span className="w-2 h-2 rounded-full bg-red-500" />
                              Chết thật
                              {c.health.statusCode && <span className="text-text-muted ml-0.5">({c.health.statusCode})</span>}
                            </span>
                            <p className="text-[10px] text-red-400 mt-0.5 max-w-[220px]" title={c.health.error || ""}>
                              {c.health.statusCode === 401 ? "Token hết hạn hoặc bị thu hồi"
                                : c.health.statusCode === 403 ? "Bị từ chối - có thể đã bị xoá khỏi nhóm Business"
                                : c.health.error === "Token expired and refresh failed" ? "Token hết hạn, không refresh được"
                                : c.health.error || "Không login được"}
                            </p>
                            {c.health.testedAt && (
                                <p className="text-[10px] text-text-muted mt-0.5" title={new Date(c.health.testedAt).toLocaleString("vi-VN")}>
                                  {formatTestedAt(c.health.testedAt)} · {timeAgo(c.health.testedAt)}
                                </p>
                              )}
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-text-muted">Chưa test</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="font-mono text-text-main font-semibold text-base">{c.total}</span>
                      <span className="text-xs text-text-muted ml-1">lượt</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <StatusBadge status={c.testStatus} errorCode={c.errorCode} />
                    </td>
                    <td className="py-2.5 text-xs text-text-muted max-w-[250px]" title={c.lastError || ""}>
                      <p className="truncate">{c.lastError || "-"}</p>
                      {c.health?.valid && (
                        <p className="text-[10px] text-yellow-600 dark:text-yellow-400 mt-0.5">Acc vẫn sống - bấm "Xoá tất cả lock" để dùng lại</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Client VMs */}
      {stats.clientStats && Object.keys(stats.clientStats).length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-[20px]">devices</span>
            <h2 className="text-lg font-semibold">Clients (VMs)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 text-xs font-medium text-text-muted">IP</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-text-muted">Đang xử lý</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-text-muted">Tổng request</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-text-muted">Model cuối</th>
                  <th className="pb-2 text-xs font-medium text-text-muted">Lần cuối</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.clientStats)
                  .sort(([, a], [, b]) => {
                    const aTime = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
                    const bTime = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
                    return bTime - aTime;
                  })
                  .map(([ip, cs]) => {
                    const lastMs = cs.lastSeenAt ? Date.now() - new Date(cs.lastSeenAt).getTime() : Infinity;
                    const isRecent = lastMs < RECENT_THRESHOLD_MS;
                    return (
                      <tr
                        key={ip}
                        className={`border-b border-border/50 transition-all duration-500 ${
                          isRecent ? "bg-blue-50 dark:bg-blue-900/15" : "hover:bg-background-secondary/50"
                        }`}
                      >
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            {cs.activeRequests > 0 && (
                              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            )}
                            <span className="font-mono font-medium text-text-main">{ip}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          {cs.activeRequests > 0 ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">
                              {cs.activeRequests}
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted">0</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="font-mono font-semibold text-text-main">{cs.total}</span>
                          <span className="text-xs text-text-muted ml-1">lượt</span>
                        </td>
                        <td className="py-2.5 pr-4 text-xs text-text-muted">{cs.lastModel || "-"}</td>
                        <td className="py-2.5">
                          <span className={`text-xs ${isRecent ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-text-muted"}`}>
                            {timeAgo(cs.lastSeenAt)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Routing Log - WHO was used WHEN for WHAT */}
      <Card>
        <h2 className="text-lg font-semibold mb-3">Lịch sử routing</h2>
        {stats.routingLog.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-4">Chưa có request nào. Gửi request để thấy log.</p>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            <div className="space-y-0">
              {stats.routingLog.slice(0, 30).map((entry, i) => {
                const time = new Date(entry.timestamp).toLocaleTimeString();
                const isFirst = i === 0;
                return (
                  <div
                    key={`${entry.timestamp}-${i}`}
                    className={`flex items-center gap-3 py-2 px-2 rounded-md text-sm transition-all ${
                      isFirst ? "bg-green-50 dark:bg-green-900/15" : i % 2 === 0 ? "bg-background-secondary/30" : ""
                    }`}
                  >
                    <span className="text-text-muted text-xs font-mono w-16 shrink-0">{time}</span>
                    {entry.clientIp && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-mono shrink-0">
                        {entry.clientIp}
                      </span>
                    )}
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-text-muted shrink-0">
                      {entry.model || entry.provider}
                    </span>
                    <span className="material-symbols-outlined text-text-muted text-base">arrow_forward</span>
                    <span className={`font-semibold shrink-0 ${isFirst ? "text-green-600 dark:text-green-400" : "text-text-main"}`}>
                      {entry.connectionName}
                    </span>
                    <span className="text-xs text-text-muted truncate hidden md:inline">
                      {entry.strategy === "least-connections" ? "ít tải nhất" : entry.strategy === "round-robin" ? "luân phiên" : entry.strategy === "fill-first" ? "ưu tiên" : entry.strategy === "openai-business" ? "OpenAI Business" : entry.strategy}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Distribution - LOWER PRIORITY */}
      {connectionStats.length > 0 && connectionStats.some(c => c.total > 0) && (
        <Card>
          <h2 className="text-lg font-semibold mb-3">Phân phối request</h2>
          <DistributionBar connectionStats={connectionStats.sort((a, b) => b.total - a.total)} />
        </Card>
      )}
    </div>
  );
}
