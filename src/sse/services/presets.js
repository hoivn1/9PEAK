/**
 * Routing strategy presets — Smart Routing v2.
 * [9peak-fork] v0.4.1 — community-friendly preset modes.
 *
 * Each preset is a named bundle of settings that get merged into the
 * global settings object when applied. Presets are the middle ground
 * between Auto Mode (zero-config, plan-aware) and full Custom mode
 * (4 strategies + per-provider overrides + sticky tuning).
 *
 * NOTE: applying a preset switches `routingMode` to `"preset"` and
 * stores the preset key in `routingPreset`. The actual routing engine
 * still reads `fallbackStrategy` from settings — presets just write it.
 */

export const PRESETS = {
  spread: {
    label: "Spread evenly",
    icon: "waves",
    emoji: "🌊",
    description: "Luân phiên đều mọi acc — tránh burn 1 acc",
    longDescription:
      "Mỗi request đi vòng qua các account. Sau N request liên tiếp trên 1 acc (sticky=2) sẽ chuyển sang acc tiếp theo. Hợp với người có nhiều acc Plus và muốn rải quota đều.",
    settings: {
      fallbackStrategy: "round-robin",
      stickyRoundRobinLimit: 2,
      providerStrategies: {},
    },
  },
  speed: {
    label: "Speed first",
    icon: "speed",
    emoji: "⚡",
    description: "Pick acc ít load nhất — response nhanh nhất",
    longDescription:
      "Score weighted theo active concurrent + average response time + recency. Ưu tiên acc đang nhàn rỗi và phản hồi nhanh nhất. Hợp với workload nhiều request đồng thời.",
    settings: {
      fallbackStrategy: "least-connections",
      providerStrategies: {},
    },
  },
  quota: {
    label: "Maximize quota",
    icon: "savings",
    emoji: "💰",
    description: "Quota-aware (Pro/Business)",
    longDescription:
      "Tối ưu cho Codex Pro/Business: tránh acc gần rate-limit, ưu tiên acc còn quota nhiều. Score = quota penalty + active count + response time. Hợp với power user có Codex Pro/Business.",
    settings: {
      fallbackStrategy: "openai-business",
      providerStrategies: {},
    },
  },
  fillfirst: {
    label: "Use one then next",
    icon: "playlist_play",
    emoji: "🎯",
    description: "Cạn 1 acc trước rồi chuyển — tiết kiệm quota từng acc",
    longDescription:
      "Vắt cạn 1 acc (theo priority order) trước khi chuyển sang acc tiếp theo. Chỉ chuyển khi rate-limit hoặc lỗi. Hợp với người có 1-2 acc xịn (Pro/Business) và acc backup.",
    settings: {
      fallbackStrategy: "fill-first",
      providerStrategies: {},
    },
  },
};

/**
 * List of preset keys in display order.
 */
export const PRESET_KEYS = ["spread", "speed", "quota", "fillfirst"];

/**
 * Look up a preset by key. Returns null for unknown keys.
 */
export function getPreset(key) {
  if (!key || typeof key !== "string") return null;
  return PRESETS[key] || null;
}
