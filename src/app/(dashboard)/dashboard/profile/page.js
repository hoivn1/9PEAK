"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button, Toggle, Input, PlanBadge } from "@/shared/components";
import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";
import UpstreamTrackingCard from "./UpstreamTrackingCard";

// [9peak-fork] v0.4.0 — Tier metadata for the Auto Mode summary panel.
// Order matches TIER_PRIORITY in src/sse/services/planTier.js.
const AUTO_TIER_META = {
  pro: { label: "Pro", strategy: "fill-first" },
  business: { label: "Business", strategy: "fill-first" },
  enterprise: { label: "Enterprise", strategy: "fill-first" },
  team: { label: "Team", strategy: "fill-first" },
  plus: { label: "Plus", strategy: "round-robin (sticky 2)" },
  go: { label: "Go", strategy: "round-robin (sticky 2)" },
  free: { label: "Free", strategy: "round-robin (last resort)" },
  other: { label: "Other / Unknown", strategy: "round-robin" },
};
const AUTO_TIER_ORDER = ["pro", "business", "enterprise", "team", "plus", "go", "free", "other"];

function normalizeTierForDisplay(planType) {
  if (!planType || typeof planType !== "string") return "other";
  const lower = planType.toLowerCase().trim();
  const stripped = lower.replace(/^(chatgpt|plan|tier)\s+/i, "").trim();
  const known = ["enterprise", "business", "team", "plus", "free", "pro", "go"];
  for (const tier of known) {
    if (stripped === tier || stripped.includes(tier)) return tier;
  }
  return "other";
}

export default function ProfilePage() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState({ fallbackStrategy: "fill-first" });
  const [loading, setLoading] = useState(true);
  // [9peak-fork] v0.4.0 — Auto Mode preview data (Codex connections grouped by tier).
  const [codexConnections, setCodexConnections] = useState([]);
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [passStatus, setPassStatus] = useState({ type: "", message: "" });
  const [passLoading, setPassLoading] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState({ type: "", message: "" });
  const importFileRef = useRef(null);
  const [proxyForm, setProxyForm] = useState({
    outboundProxyEnabled: false,
    outboundProxyUrl: "",
    outboundNoProxy: "",
  });
  const [proxyStatus, setProxyStatus] = useState({ type: "", message: "" });
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyTestLoading, setProxyTestLoading] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setProxyForm({
          outboundProxyEnabled: data?.outboundProxyEnabled === true,
          outboundProxyUrl: data?.outboundProxyUrl || "",
          outboundNoProxy: data?.outboundNoProxy || "",
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch settings:", err);
        setLoading(false);
      });
  }, []);

  // [9peak-fork] v0.4.0 — fetch Codex connections to preview Auto Mode rotation plan.
  useEffect(() => {
    fetch("/api/providers", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const codex = (data?.connections || []).filter((c) => c.provider === "codex" && c.isActive !== false);
        setCodexConnections(codex);
      })
      .catch(() => {});
  }, []);

  const updateOutboundProxy = async (e) => {
    e.preventDefault();
    if (settings.outboundProxyEnabled !== true) return;
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outboundProxyUrl: proxyForm.outboundProxyUrl,
          outboundNoProxy: proxyForm.outboundNoProxy,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyStatus({ type: "success", message: "Proxy settings applied" });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch (err) {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const testOutboundProxy = async () => {
    if (settings.outboundProxyEnabled !== true) return;

    const proxyUrl = (proxyForm.outboundProxyUrl || "").trim();
    if (!proxyUrl) {
      setProxyStatus({ type: "error", message: "Please enter a Proxy URL to test" });
      return;
    }

    setProxyTestLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings/proxy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyUrl }),
      });

      const data = await res.json();
      if (res.ok && data?.ok) {
        setProxyStatus({
          type: "success",
          message: `Proxy test OK (${data.status}) in ${data.elapsedMs}ms`,
        });
      } else {
        setProxyStatus({
          type: "error",
          message: data?.error || "Proxy test failed",
        });
      }
    } catch (err) {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyTestLoading(false);
    }
  };

  const updateOutboundProxyEnabled = async (outboundProxyEnabled) => {
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outboundProxyEnabled }),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyForm((prev) => ({ ...prev, outboundProxyEnabled: data?.outboundProxyEnabled === true }));
        setProxyStatus({
          type: "success",
          message: outboundProxyEnabled ? "Proxy enabled" : "Proxy disabled",
        });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch (err) {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setPassStatus({ type: "error", message: "Passwords do not match" });
      return;
    }

    setPassLoading(true);
    setPassStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPassStatus({ type: "success", message: "Password updated successfully" });
        setPasswords({ current: "", new: "", confirm: "" });
      } else {
        setPassStatus({ type: "error", message: data.error || "Failed to update password" });
      }
    } catch (err) {
      setPassStatus({ type: "error", message: "An error occurred" });
    } finally {
      setPassLoading(false);
    }
  };

  // [9peak-fork] v0.4.0 — Auto Mode toggle.
  const updateRoutingMode = async (nextMode) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routingMode: nextMode }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, routingMode: nextMode }));
      }
    } catch (err) {
      console.error("Failed to update routingMode:", err);
    }
  };

  const updateFallbackStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallbackStrategy: strategy }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, fallbackStrategy: strategy }));
      }
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  };

  const updateComboStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStrategy: strategy }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, comboStrategy: strategy }));
      }
    } catch (err) {
      console.error("Failed to update combo strategy:", err);
    }
  };

  const updateStickyLimit = async (limit) => {
    const numLimit = parseInt(limit);
    if (isNaN(numLimit) || numLimit < 1) return;

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stickyRoundRobinLimit: numLimit }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, stickyRoundRobinLimit: numLimit }));
      }
    } catch (err) {
      console.error("Failed to update sticky limit:", err);
    }
  };

  const updateRequireLogin = async (requireLogin) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireLogin }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, requireLogin }));
      }
    } catch (err) {
      console.error("Failed to update require login:", err);
    }
  };

  const updateObservabilityEnabled = async (enabled) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enableObservability: enabled }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, enableObservability: enabled }));
      }
    } catch (err) {
      console.error("Failed to update enableObservability:", err);
    }
  };

  const reloadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error("Failed to reload settings:", err);
    }
  };

  const handleExportDatabase = async () => {
    setDbLoading(true);
    setDbStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings/database");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export database");
      }

      const payload = await res.json();
      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[.:]/g, "-");
      anchor.href = url;
      anchor.download = `9router-backup-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setDbStatus({ type: "success", message: "Database backup downloaded" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Failed to export database" });
    } finally {
      setDbLoading(false);
    }
  };

  const handleImportDatabase = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDbLoading(true);
    setDbStatus({ type: "", message: "" });

    try {
      const raw = await file.text();
      const payload = JSON.parse(raw);

      const res = await fetch("/api/settings/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to import database");
      }

      await reloadSettings();
      setDbStatus({ type: "success", message: "Database imported successfully" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Invalid backup file" });
    } finally {
      if (importFileRef.current) {
        importFileRef.current.value = "";
      }
      setDbLoading(false);
    }
  };

  const observabilityEnabled = settings.enableObservability === true;

  // [9peak-fork] v0.4.0 — Group Codex connections by plan tier for Auto Mode preview.
  const autoModeOn = (settings.routingMode || "custom") === "auto";
  const tierGroups = (() => {
    const groups = {};
    for (const tier of AUTO_TIER_ORDER) groups[tier] = [];
    for (const conn of codexConnections) {
      const tier = normalizeTierForDisplay(conn.providerSpecificData?.chatgptPlanType);
      (groups[tier] || groups.other).push(conn);
    }
    return AUTO_TIER_ORDER.filter((t) => groups[t].length > 0).map((t) => ({
      tier: t,
      meta: AUTO_TIER_META[t],
      connections: groups[t],
    }));
  })();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col gap-6">
        {/* Upstream tracking — admin-only check for upstream 9Router releases */}
        <UpstreamTrackingCard />

        {/* [9peak-fork] v0.5.1 — Account routing summary only. */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Account Rotation</h3>
                <p className="text-sm text-text-muted">
                  Tóm tắt xoay acc GPT. Chỉnh chi tiết ở trang Routing Strategy.
                </p>
              </div>
            </div>
            <Toggle
              checked={autoModeOn}
              onChange={() => updateRoutingMode(autoModeOn ? "custom" : "auto")}
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-3 pt-2 border-t border-border/50">
            <p className="text-sm text-text-muted">
              {autoModeOn
                ? "Auto Mode đang bật: 9Peak tự xoay theo nhóm FREE / PLUS / BUSINESS. Nếu list lẫn nhiều loại acc, hệ thống sẽ xoay đều toàn list."
                : "Auto Mode đang tắt: hệ thống đang dùng strategy thủ công/preset đã chọn."}
            </p>
            {tierGroups.length === 0 ? (
              <p className="text-sm text-text-muted italic">
                Chưa có Codex connection nào active. Thêm acc ở trang Providers để xem bản đồ rotation.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {tierGroups.map(({ tier, meta, connections }) => (
                  <div
                    key={tier}
                    className="flex items-center justify-between p-3 rounded-lg bg-bg border border-border"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <PlanBadge planType={meta.label} size="md" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {connections.length} acc · {meta.strategy}
                        </p>
                        <p className="text-xs text-text-muted truncate">
                          {connections
                            .map((c) => c.displayName || c.email || c.name || c.id?.slice(0, 8))
                            .join(", ")}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="primary"
              icon="route"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.href = "/dashboard/routing-strategy";
                }
              }}
            >
              Mở Routing Strategy
            </Button>
          </div>
        </Card>

        {/* Local Mode Info */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">computer</span>
              </div>
              <div>
                <h2 className="text-xl font-semibold">Local Mode</h2>
                <p className="text-text-muted">Running on your machine</p>
              </div>
            </div>
            <div className="inline-flex p-1 rounded-lg bg-black/5 dark:bg-white/5">
              {["light", "dark", "system"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTheme(option)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all",
                    theme === option
                      ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
                      : "text-text-muted hover:text-text-main"
                  )}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {option === "light" ? "light_mode" : option === "dark" ? "dark_mode" : "contrast"}
                  </span>
                  <span className="capitalize text-sm">{option}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 pt-4 border-t border-border">
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg border border-border">
              <div>
                <p className="font-medium">Database Location</p>
                <p className="text-sm text-text-muted font-mono">~/.9router/db.json</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon="download"
                onClick={handleExportDatabase}
                loading={dbLoading}
              >
                Download Backup
              </Button>
              <Button
                variant="outline"
                icon="upload"
                onClick={() => importFileRef.current?.click()}
                disabled={dbLoading}
              >
                Import Backup
              </Button>
              <input
                ref={importFileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportDatabase}
              />
            </div>
            {dbStatus.message && (
              <p className={`text-sm ${dbStatus.type === "error" ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                {dbStatus.message}
              </p>
            )}
          </div>
        </Card>

        {/* Security */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[20px]">shield</span>
            </div>
            <h3 className="text-lg font-semibold">Security</h3>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Require login</p>
                <p className="text-sm text-text-muted">
                  When ON, dashboard requires password. When OFF, access without login.
                </p>
              </div>
              <Toggle
                checked={settings.requireLogin === true}
                onChange={() => updateRequireLogin(!settings.requireLogin)}
                disabled={loading}
              />
            </div>
            {settings.requireLogin === true && (
              <form onSubmit={handlePasswordChange} className="flex flex-col gap-4 pt-4 border-t border-border/50">
                {settings.hasPassword && (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Current Password</label>
                    <Input
                      type="password"
                      placeholder="Enter current password"
                      value={passwords.current}
                      onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                      required
                    />
                  </div>
                )}
                {/* {!settings.hasPassword && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      Setting password for the first time. Leave current password empty or use default: <code className="bg-blue-500/20 px-1 rounded">123456</code>
                    </p>
                  </div>
                )} */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">New Password</label>
                    <Input
                      type="password"
                      placeholder="Enter new password"
                      value={passwords.new}
                      onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Confirm New Password</label>
                    <Input
                      type="password"
                      placeholder="Confirm new password"
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {passStatus.message && (
                  <p className={`text-sm ${passStatus.type === "error" ? "text-red-500" : "text-green-500"}`}>
                    {passStatus.message}
                  </p>
                )}

                <div className="pt-2">
                  <Button type="submit" variant="primary" loading={passLoading}>
                    {settings.hasPassword ? "Update Password" : "Set Password"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Card>

        {/* Routing Preferences */}
        <Card id="routing-strategy-advanced">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
              <span className="material-symbols-outlined text-[20px]">route</span>
            </div>
            <h3 className="text-lg font-semibold">Routing Strategy</h3>
          </div>
          <div className="flex flex-col gap-4">
            <div className="p-3 rounded-lg bg-bg border border-border">
              <p className="font-medium mb-1">Cài đặt xoay acc đã chuyển sang trang riêng</p>
              <p className="text-sm text-text-muted">
                Để tránh rối setting, Profile chỉ giữ tóm tắt. Tất cả Auto / Preset / Advanced account rotation nằm ở Routing Strategy.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <div>
                <p className="font-medium">Combo Round Robin</p>
                <p className="text-sm text-text-muted">
                  Đây là xoay provider/model trong combo, tách riêng với xoay account GPT.
                </p>
              </div>
              <Toggle
                checked={settings.comboStrategy === "round-robin"}
                onChange={() => updateComboStrategy(settings.comboStrategy === "round-robin" ? "fallback" : "round-robin")}
                disabled={loading}
              />
            </div>

            <Button
              type="button"
              variant="secondary"
              icon="tune"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.href = "/dashboard/routing-strategy";
                }
              }}
            >
              Chỉnh Account Rotation
            </Button>
          </div>
        </Card>

        {/* Network */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
              <span className="material-symbols-outlined text-[20px]">wifi</span>
            </div>
            <h3 className="text-lg font-semibold">Network</h3>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Outbound Proxy</p>
                <p className="text-sm text-text-muted">Enable proxy for OAuth + provider outbound requests.</p>
              </div>
              <Toggle
                checked={settings.outboundProxyEnabled === true}
                onChange={() => updateOutboundProxyEnabled(!(settings.outboundProxyEnabled === true))}
                disabled={loading || proxyLoading}
              />
            </div>

            {settings.outboundProxyEnabled === true && (
              <form onSubmit={updateOutboundProxy} className="flex flex-col gap-4 pt-2 border-t border-border/50">
                <div className="flex flex-col gap-2">
                  <label className="font-medium">Proxy URL</label>
                  <Input
                    placeholder="http://127.0.0.1:7897"
                    value={proxyForm.outboundProxyUrl}
                    onChange={(e) => setProxyForm((prev) => ({ ...prev, outboundProxyUrl: e.target.value }))}
                    disabled={loading || proxyLoading}
                  />
                  <p className="text-sm text-text-muted">Leave empty to inherit existing env proxy (if any).</p>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                  <label className="font-medium">No Proxy</label>
                  <Input
                    placeholder="localhost,127.0.0.1"
                    value={proxyForm.outboundNoProxy}
                    onChange={(e) => setProxyForm((prev) => ({ ...prev, outboundNoProxy: e.target.value }))}
                    disabled={loading || proxyLoading}
                  />
                  <p className="text-sm text-text-muted">Comma-separated hostnames/domains to bypass the proxy.</p>
                </div>

                <div className="pt-2 border-t border-border/50 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    loading={proxyTestLoading}
                    disabled={loading || proxyLoading}
                    onClick={testOutboundProxy}
                  >
                    Test proxy URL
                  </Button>
                  <Button type="submit" variant="primary" loading={proxyLoading}>
                    Apply
                  </Button>
                </div>
              </form>
            )}

            {proxyStatus.message && (
              <p className={`text-sm ${proxyStatus.type === "error" ? "text-red-500" : "text-green-500"} pt-2 border-t border-border/50`}>
                {proxyStatus.message}
              </p>
            )}
          </div>
        </Card>

        {/* Observability Settings */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
              <span className="material-symbols-outlined text-[20px]">monitoring</span>
            </div>
            <h3 className="text-lg font-semibold">Observability</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Enable Observability</p>
              <p className="text-sm text-text-muted">
                Record request details for inspection in the logs view
              </p>
            </div>
            <Toggle
              checked={observabilityEnabled}
              onChange={updateObservabilityEnabled}
              disabled={loading}
            />
          </div>
        </Card>

        {/* App Info */}
        <div className="text-center text-sm text-text-muted py-4">
          <p>{APP_CONFIG.name} v{APP_CONFIG.version}</p>
          <p className="mt-1">Local Mode - All data stored on your machine</p>
        </div>
      </div>
    </div>
  );
}
