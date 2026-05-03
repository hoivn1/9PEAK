// ═══════════════════════════════════════════════════════════════════════
// 9Peak Premium Palette — "Indochine Jade & Antique Brass"
// ───────────────────────────────────────────────────────────────────────
// Heritage-inspired palette for a Vietnamese interior design tool.
// Deep jade primary (ngói men / sơn mài) + antique brass accent (đồng thau).
// Bone-ivory light theme (giấy dó) + midnight-jade dark theme (sơn then).
// Distinctly different hue family from upstream 9Router's warm coral.
// Single source of truth: src/app/globals.css CSS variables — this file
// mirrors them for component-level hex access. Keep in sync.
// ═══════════════════════════════════════════════════════════════════════

export const COLORS = {
  // Primary — Deep Jade (ngói men Long Sơn / sơn mài truyền thống)
  primary: {
    DEFAULT: "#1B4F42",
    hover: "#133B31",
    light: "#3E7A6B",
    dark: "#0C2A23",
  },

  // Accent — Antique Brass (đồng thau cửa đình, warm enough to balance jade)
  accent: {
    DEFAULT: "#B8925F",
    hover: "#9A7947",
    light: "#D4B080",
    dark: "#6E5533",
  },

  // Light theme — Bone Ivory (giấy dó silk paper)
  light: {
    bg: "#F4F1E8",
    bgAlt: "#E8E3D4",
    surface: "#FBFAF5",
    sidebar: "rgba(244, 241, 232, 0.80)",
    border: "rgba(27, 79, 66, 0.12)",
    textMain: "#1C2420",
    textMuted: "#5E6A63",
  },

  // Dark theme — Midnight Jade (sơn then black-green lacquer)
  dark: {
    bg: "#0A1612",
    bgAlt: "#101D18",
    surface: "#15241E",
    sidebar: "rgba(10, 22, 18, 0.85)",
    border: "rgba(184, 146, 95, 0.10)",
    textMain: "#E8E3D4",
    textMuted: "#8B958A",
  },

  // Status colors (unchanged — semantic meaning must stay)
  status: {
    success: "#22C55E",
    successLight: "#DCFCE7",
    successDark: "#166534",
    warning: "#F59E0B",
    warningLight: "#FEF3C7",
    warningDark: "#92400E",
    error: "#EF4444",
    errorLight: "#FEE2E2",
    errorDark: "#991B1B",
    info: "#3B82F6",
    infoLight: "#DBEAFE",
    infoDark: "#1E40AF",
  },
};

// CSS Variables mapping for Tailwind
export const CSS_VARIABLES = {
  light: {
    "--color-primary": COLORS.primary.DEFAULT,
    "--color-primary-hover": COLORS.primary.hover,
    "--color-accent": COLORS.accent.DEFAULT,
    "--color-accent-hover": COLORS.accent.hover,
    "--color-bg": COLORS.light.bg,
    "--color-bg-alt": COLORS.light.bgAlt,
    "--color-surface": COLORS.light.surface,
    "--color-sidebar": COLORS.light.sidebar,
    "--color-border": COLORS.light.border,
    "--color-text-main": COLORS.light.textMain,
    "--color-text-muted": COLORS.light.textMuted,
  },
  dark: {
    "--color-primary": COLORS.primary.DEFAULT,
    "--color-primary-hover": COLORS.primary.hover,
    "--color-accent": COLORS.accent.DEFAULT,
    "--color-accent-hover": COLORS.accent.hover,
    "--color-bg": COLORS.dark.bg,
    "--color-bg-alt": COLORS.dark.bgAlt,
    "--color-surface": COLORS.dark.surface,
    "--color-sidebar": COLORS.dark.sidebar,
    "--color-border": COLORS.dark.border,
    "--color-text-main": COLORS.dark.textMain,
    "--color-text-muted": COLORS.dark.textMuted,
  },
};
