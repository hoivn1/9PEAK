"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardSkeleton, SegmentedControl } from "@/shared/components";
import HistoryGrid from "./components/HistoryGrid";
import GoldLibraryTab from "./components/GoldLibraryTab";
import StatsTab from "./components/StatsTab";
import AccountsTab from "./components/AccountsTab";
import TabErrorBoundary from "./components/TabErrorBoundary";

const POLL_INTERVAL_MS = 30000; // auto-refresh history every 30s when tab is visible

export default function ImageGenPage() {
  const [activeTab, setActiveTab] = useState("history");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [goldRefresh, setGoldRefresh] = useState(0);
  const [toast, setToast] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(0);

  // Silent = skeleton suppressed (for background polling, no UI flicker)
  const loadHistory = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/image-gen/history?_=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
      setLastRefreshedAt(Date.now());
    } catch (err) {
      setError(err.message || "Fetch failed");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
  }, [loadHistory]);

  // Auto-poll while History tab active + document visible — picks up new
  // gens from Telegram bot without manual refresh.
  useEffect(() => {
    if (activeTab !== "history") return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      loadHistory({ silent: true });
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) tick();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      clearInterval(id);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [activeTab, loadHistory]);

  const handlePromoted = (destPath) => {
    setToast(`Đã promote sang Gold: ${destPath}`);
    setGoldRefresh((v) => v + 1);
    setTimeout(() => setToast(""), 3500);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">Image Gen</h1>
        <p className="text-sm text-text-muted mt-1">
          Lịch sử sinh ảnh và quản lý Gold library — đọc từ ~/.9router-image-cache.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SegmentedControl
          options={[
            { value: "history", label: "History", icon: "history" },
            { value: "stats", label: "Stats", icon: "analytics" },
            { value: "accounts", label: "Accounts", icon: "manage_accounts" },
            { value: "gold", label: "Gold Library", icon: "star" },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
        {activeTab === "history" && (
          <div className="flex items-center gap-3">
            {lastRefreshedAt > 0 && (
              <span className="text-[11px] text-text-muted" title={new Date(lastRefreshedAt).toLocaleString()}>
                Auto-refresh 30s · {entries.length} gens
              </span>
            )}
            <button
              type="button"
              onClick={() => loadHistory()}
              className="text-sm text-primary hover:underline cursor-pointer flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              Refresh
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-sm">
          {toast}
        </div>
      )}

      {error && (
        <Card>
          <p className="text-red-500 text-sm">Lỗi tải history: {error}</p>
        </Card>
      )}

      {activeTab === "history" && (
        <TabErrorBoundary>
          {loading ? <CardSkeleton /> : <HistoryGrid entries={entries} onPromoted={handlePromoted} />}
        </TabErrorBoundary>
      )}

      {activeTab === "stats" && (
        <TabErrorBoundary>
          <StatsTab />
        </TabErrorBoundary>
      )}

      {activeTab === "accounts" && (
        <TabErrorBoundary>
          <AccountsTab />
        </TabErrorBoundary>
      )}

      {activeTab === "gold" && (
        <TabErrorBoundary>
          <GoldLibraryTab refreshKey={goldRefresh} />
        </TabErrorBoundary>
      )}
    </div>
  );
}
