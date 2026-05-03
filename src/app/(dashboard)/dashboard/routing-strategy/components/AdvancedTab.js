"use client";

/**
 * Advanced Mode tab — 4 strategies + sticky slider + per-provider overrides.
 * [9peak-fork] v0.4.1 — Smart Routing v2.
 *
 * Power-user controls. Picking any strategy here sets routingMode="custom"
 * so Auto/Preset are turned off.
 */

import PropTypes from "prop-types";
import { Card, Input } from "@/shared/components";
import { cn } from "@/shared/utils/cn";

const STRATEGIES = [
  {
    key: "fill-first",
    label: "Fill First",
    description: "Dùng acc theo priority order. Cạn 1 acc trước, chỉ chuyển khi lỗi.",
  },
  {
    key: "round-robin",
    label: "Round Robin (Sticky)",
    description: "Rotate qua acc — sticky N request liên tiếp trên 1 acc rồi mới chuyển.",
  },
  {
    key: "least-connections",
    label: "Least Connections (Weighted)",
    description: "Score theo active + response time + recency. Acc nhàn nhất / nhanh nhất ưu tiên.",
  },
  {
    key: "openai-business",
    label: "OpenAI Business (Quota-aware)",
    description: "Quota-aware cho Codex Pro/Business. Tránh acc gần rate-limit.",
  },
];

export default function AdvancedTab({ settings, onPatch }) {
  const currentStrategy = settings.fallbackStrategy || "fill-first";
  const currentMode = settings.routingMode || "custom";
  const stickyLimit = settings.stickyRoundRobinLimit || 3;

  const setStrategy = (strategy) => {
    onPatch({ fallbackStrategy: strategy, routingMode: "custom", routingPreset: null });
  };

  const setSticky = (limit) => {
    const numLimit = parseInt(limit, 10);
    if (Number.isNaN(numLimit) || numLimit < 1) return;
    onPatch({ stickyRoundRobinLimit: numLimit });
  };

  return (
    <div className="flex flex-col gap-4">
      {currentMode !== "custom" && (
        <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-300">
          {currentMode === "auto"
            ? "Auto Mode đang BẬT — sửa strategy bên dưới sẽ tự động chuyển sang Custom mode."
            : "Đang dùng preset. Sửa strategy bên dưới sẽ chuyển sang Custom mode (preset bị bỏ)."}
        </div>
      )}

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
            <span className="material-symbols-outlined text-[20px]">tune</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Fallback Strategy</h3>
            <p className="text-sm text-text-muted">
              Chọn 1 trong 4 strategy thủ công. Tất cả connection (mọi tier) chia chung 1 strategy.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {STRATEGIES.map((s) => {
            const selected = currentStrategy === s.key && currentMode === "custom";
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStrategy(s.key)}
                className={cn(
                  "text-left p-4 rounded-lg border transition-all",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-black/5 dark:border-white/5 hover:border-primary/40 hover:bg-bg"
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "material-symbols-outlined text-[20px] mt-0.5",
                      selected ? "text-primary" : "text-text-muted"
                    )}
                  >
                    {selected ? "radio_button_checked" : "radio_button_unchecked"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{s.label}</p>
                    <p className="text-sm text-text-muted">{s.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {currentStrategy === "round-robin" && currentMode === "custom" && (
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
              <span className="material-symbols-outlined text-[20px]">repeat</span>
            </div>
            <h3 className="text-lg font-semibold">Sticky Limit</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Calls per account before switching</p>
              <p className="text-sm text-text-muted">
                1 = chuyển acc mỗi request · 3 = sticky 3 request rồi mới chuyển (mặc định)
              </p>
            </div>
            <Input
              type="number"
              min="1"
              max="10"
              value={stickyLimit}
              onChange={(e) => setSticky(e.target.value)}
              className="w-20 text-center"
            />
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-gray-500/10 text-gray-500">
            <span className="material-symbols-outlined text-[20px]">group</span>
          </div>
          <h3 className="text-lg font-semibold">Per-Provider Overrides</h3>
        </div>
        <p className="text-sm text-text-muted">
          Mỗi provider (Codex, Claude, Gemini, ...) có thể override strategy riêng từ trang
          chi tiết provider — ví dụ Codex dùng round-robin, Claude dùng fill-first.
          Vào <span className="font-mono text-xs">Providers → [tên provider]</span> để chỉnh.
        </p>
      </Card>
    </div>
  );
}

AdvancedTab.propTypes = {
  settings: PropTypes.object.isRequired,
  onPatch: PropTypes.func.isRequired,
};
