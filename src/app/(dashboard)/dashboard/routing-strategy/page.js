"use client";

/**
 * Routing Strategy page — 3 tabs: Auto / Preset / Advanced.
 * [9peak-fork] v0.4.1 — Smart Routing v2 dedicated dashboard.
 *
 * Auto    — zero-config, plan-aware rotation (recommended for community).
 * Preset  — 4 named bundles (Spread / Speed / Quota / Fill-First).
 * Advanced — manual 4-strategy + sticky + per-provider override pointers.
 */

import { useEffect, useState } from "react";
import { CardSkeleton } from "@/shared/components";
import { cn } from "@/shared/utils/cn";
import AutoTab from "./components/AutoTab";
import PresetTab from "./components/PresetTab";
import AdvancedTab from "./components/AdvancedTab";

const TABS = [
  { key: "auto", label: "Auto", icon: "auto_awesome" },
  { key: "preset", label: "Preset", icon: "tune" },
  { key: "advanced", label: "Advanced", icon: "settings_input_component" },
];

export default function RoutingStrategyPage() {
  const [settings, setSettings] = useState(null);
  const [codexConnections, setCodexConnections] = useState([]);
  const [activeTab, setActiveTab] = useState("auto");
  const [loading, setLoading] = useState(true);

  // Pick initial tab based on current routingMode.
  useEffect(() => {
    let canceled = false;
    Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/providers", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([settingsData, providersData]) => {
        if (canceled) return;
        setSettings(settingsData);
        const codex = (providersData?.connections || []).filter(
          (c) => c.provider === "codex" && c.isActive !== false
        );
        setCodexConnections(codex);
        const mode = settingsData?.routingMode || "custom";
        if (mode === "auto") setActiveTab("auto");
        else if (mode === "preset") setActiveTab("preset");
        else setActiveTab("advanced");
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load routing settings:", err);
        setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, []);

  const patchSettings = async (patch) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings((prev) => ({ ...(prev || {}), ...data }));
      }
    } catch (err) {
      console.error("Failed to patch settings:", err);
    }
  };

  const updateMode = (mode) => patchSettings({ routingMode: mode });

  const handlePresetApplied = (applied) => {
    setSettings((prev) => ({ ...(prev || {}), ...applied }));
  };

  if (loading || !settings) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight mb-1">Routing Strategy</h1>
        <p className="text-text-muted">
          Chọn cách 9Peak phân bổ request giữa các account. Auto Mode (mặc định)
          phù hợp cho hầu hết người dùng cộng đồng.
        </p>
      </div>

      <div className="inline-flex items-center p-1 rounded-lg bg-black/5 dark:bg-white/5 self-start">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all",
              activeTab === t.key
                ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
                : "text-text-muted hover:text-text-main"
            )}
          >
            <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "auto" && (
        <AutoTab
          settings={settings}
          codexConnections={codexConnections}
          onUpdateMode={updateMode}
        />
      )}
      {activeTab === "preset" && (
        <PresetTab settings={settings} onApplied={handlePresetApplied} />
      )}
      {activeTab === "advanced" && (
        <AdvancedTab settings={settings} onPatch={patchSettings} />
      )}
    </div>
  );
}
