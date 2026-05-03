/**
 * Apply a routing preset.
 * [9peak-fork] v0.4.1 — Smart Routing v2 preset endpoint.
 *
 * POST /api/settings/preset { preset: "spread" | "speed" | "quota" | "fillfirst" }
 *
 * Reads the preset bundle from src/sse/services/presets.js, merges its
 * settings into global settings, and switches routingMode to "preset".
 * Returns the merged settings (without password).
 */

import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { PRESETS, getPreset } from "@/sse/services/presets.js";
import { resetComboRotation } from "open-sse/services/combo.js";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const presetKey = body?.preset;

    if (!presetKey || typeof presetKey !== "string") {
      return NextResponse.json({ error: "preset key required" }, { status: 400 });
    }

    const preset = getPreset(presetKey);
    if (!preset) {
      return NextResponse.json({
        error: `Unknown preset: ${presetKey}`,
        available: Object.keys(PRESETS),
      }, { status: 400 });
    }

    const current = await getSettings();
    const merged = await updateSettings({
      ...preset.settings,
      routingMode: "preset",
      routingPreset: presetKey,
    });

    // Combo rotation may depend on fallbackStrategy — reset if it changed.
    if (preset.settings.fallbackStrategy && preset.settings.fallbackStrategy !== current.fallbackStrategy) {
      try { resetComboRotation(); } catch { /* non-critical */ }
    }

    const { password, ...safe } = merged;
    return NextResponse.json({
      ok: true,
      preset: presetKey,
      label: preset.label,
      applied: safe,
    });
  } catch (error) {
    console.log("Error applying preset:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  // Helpful introspection: list available presets.
  const list = Object.entries(PRESETS).map(([key, p]) => ({
    key,
    label: p.label,
    emoji: p.emoji,
    icon: p.icon,
    description: p.description,
    longDescription: p.longDescription,
    settings: p.settings,
  }));
  return NextResponse.json({ presets: list });
}
