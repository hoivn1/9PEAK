"use client";

/**
 * Preset Mode tab — 4 preset cards.
 * [9peak-fork] v0.4.1 — Smart Routing v2.
 *
 * Clicking a preset POSTs /api/settings/preset which switches routingMode
 * to "preset" and applies the bundled settings.
 */

import { useState } from "react";
import PropTypes from "prop-types";
import { Card, Button, ConfirmModal } from "@/shared/components";
import { cn } from "@/shared/utils/cn";

const PRESET_LIST = [
  {
    key: "spread",
    emoji: "🌊",
    label: "Spread evenly",
    description: "Luân phiên đều mọi acc — tránh burn 1 acc",
    longDescription:
      "Mỗi request đi vòng qua các account. Sau N request liên tiếp trên 1 acc (sticky=2) sẽ chuyển sang acc tiếp theo. Hợp với người có nhiều acc Plus và muốn rải quota đều.",
    accent: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  },
  {
    key: "speed",
    emoji: "⚡",
    label: "Speed first",
    description: "Pick acc ít load nhất — response nhanh nhất",
    longDescription:
      "Score weighted theo active concurrent + average response time + recency. Ưu tiên acc đang nhàn rỗi và phản hồi nhanh nhất. Hợp với workload nhiều request đồng thời.",
    accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  {
    key: "quota",
    emoji: "💰",
    label: "Maximize quota",
    description: "Quota-aware (Pro/Business)",
    longDescription:
      "Tối ưu cho Codex Pro/Business: tránh acc gần rate-limit, ưu tiên acc còn quota nhiều. Score = quota penalty + active count + response time.",
    accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  },
  {
    key: "fillfirst",
    emoji: "🎯",
    label: "Use one then next",
    description: "Cạn 1 acc trước rồi chuyển — tiết kiệm quota từng acc",
    longDescription:
      "Vắt cạn 1 acc (theo priority order) trước khi chuyển sang acc tiếp theo. Chỉ chuyển khi rate-limit hoặc lỗi. Hợp với người có 1-2 acc xịn và acc backup.",
    accent: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
  },
];

export default function PresetTab({ settings, onApplied }) {
  const [pending, setPending] = useState(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  const currentMode = settings.routingMode || "custom";
  const currentPreset = currentMode === "preset" ? settings.routingPreset : null;

  const handleApply = async () => {
    if (!pending) return;
    setApplying(true);
    setError("");
    try {
      const res = await fetch("/api/settings/preset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: pending.key }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Không apply được preset");
        return;
      }
      onApplied(data.applied);
      setPending(null);
    } catch (err) {
      setError(err.message || "Network error");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {currentMode === "auto" && (
        <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-300">
          Auto Mode đang BẬT. Chọn preset bên dưới sẽ tự động tắt Auto Mode.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PRESET_LIST.map((p) => {
          const selected = currentPreset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setPending(p)}
              className={cn(
                "text-left p-5 rounded-lg border transition-all",
                "bg-surface hover:shadow-md",
                selected
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-black/5 dark:border-white/5 hover:border-primary/40"
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={cn("inline-flex items-center justify-center w-10 h-10 rounded-lg text-2xl border", p.accent)}>
                  {p.emoji}
                </div>
                {selected && (
                  <span className="text-xs font-semibold text-primary">
                    Đang dùng
                  </span>
                )}
              </div>
              <h4 className="font-semibold mb-1">{p.label}</h4>
              <p className="text-sm text-text-muted mb-2">{p.description}</p>
              <p className="text-xs text-text-muted/80 leading-relaxed">{p.longDescription}</p>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <ConfirmModal
        isOpen={!!pending}
        onClose={() => !applying && setPending(null)}
        onConfirm={handleApply}
        title={pending ? `Áp dụng preset "${pending.label}"?` : ""}
        message={pending ? pending.longDescription : ""}
        confirmText={applying ? "Đang áp dụng..." : "Apply preset"}
        cancelText="Huỷ"
        variant="primary"
        loading={applying}
      />
    </div>
  );
}

PresetTab.propTypes = {
  settings: PropTypes.object.isRequired,
  onApplied: PropTypes.func.isRequired,
};
