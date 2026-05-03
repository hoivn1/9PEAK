import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";
import { resetComboRotation } from "open-sse/services/combo.js";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const settings = await getSettings();
    const { password, ...safeSettings } = settings;
    
    const enableRequestLogs = process.env.ENABLE_REQUEST_LOGS === "true";
    const enableTranslator = process.env.ENABLE_TRANSLATOR === "true";
    
    return NextResponse.json({ 
      ...safeSettings, 
      enableRequestLogs,
      enableTranslator,
      hasPassword: !!password
    });
  } catch (error) {
    console.log("Error getting settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// [9peak-fork] v0.4.5 — validate codexWorkspaceLabels payload.
// Shape: { [workspaceId: string]: string } where:
//   - key matches OAuth-style workspace ID regex OR special sentinels
//     "__individual__" / "__unassigned__" (these come from codexWorkspace.js
//     SPECIAL_GROUP_IDS — kept in sync manually since this route runs in the
//     edge runtime and we avoid pulling in the whole module).
//   - value is a string (max 60 chars). Empty string is allowed and means
//     "remove the label".
// Returns { valid: boolean, error?: string, sanitised?: object }.
const WORKSPACE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const SPECIAL_KEYS = new Set(["__individual__", "__unassigned__"]);
const CAVEMAN_LEVELS = new Set(["lite", "full", "ultra"]);
function validateWorkspaceLabels(input) {
  if (input == null) return { valid: true, sanitised: {} };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, error: "codexWorkspaceLabels must be an object" };
  }
  const sanitised = {};
  for (const [key, raw] of Object.entries(input)) {
    if (typeof key !== "string" || key.length === 0 || key.length > 128) {
      return { valid: false, error: `Invalid workspace label key: ${String(key).slice(0, 40)}` };
    }
    if (!SPECIAL_KEYS.has(key) && !WORKSPACE_ID_RE.test(key)) {
      return { valid: false, error: `Invalid workspace label key format: ${key.slice(0, 40)}` };
    }
    if (typeof raw !== "string") {
      return { valid: false, error: `Workspace label for ${key} must be a string` };
    }
    const trimmed = raw.trim().slice(0, 60);
    if (trimmed.length === 0) continue; // empty → omit (acts as delete)
    sanitised[key] = trimmed;
  }
  return { valid: true, sanitised };
}

export async function PATCH(request) {
  try {
    const body = await request.json();

    if (Object.prototype.hasOwnProperty.call(body, "cavemanEnabled")) {
      body.cavemanEnabled = body.cavemanEnabled === true;
    }

    if (Object.prototype.hasOwnProperty.call(body, "cavemanLevel")) {
      if (typeof body.cavemanLevel !== "string") {
        return NextResponse.json({ error: "cavemanLevel must be a string" }, { status: 400 });
      }
      const level = body.cavemanLevel.trim().toLowerCase();
      if (!CAVEMAN_LEVELS.has(level)) {
        return NextResponse.json({ error: "cavemanLevel must be one of: lite, full, ultra" }, { status: 400 });
      }
      body.cavemanLevel = level;
    }

    // [9peak-fork] v0.4.5 — validate codexWorkspaceLabels before persisting.
    if (Object.prototype.hasOwnProperty.call(body, "codexWorkspaceLabels")) {
      const result = validateWorkspaceLabels(body.codexWorkspaceLabels);
      if (!result.valid) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      body.codexWorkspaceLabels = result.sanitised;
    }

    // If updating password, hash it
    if (body.newPassword) {
      const settings = await getSettings();
      const currentHash = settings.password;

      // Verify current password if it exists
      if (currentHash) {
        if (!body.currentPassword) {
          return NextResponse.json({ error: "Current password required" }, { status: 400 });
        }
        const isValid = await bcrypt.compare(body.currentPassword, currentHash);
        if (!isValid) {
          return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      } else {
        // First time setting password, no current password needed
        // Allow empty currentPassword or default "123456"
        if (body.currentPassword && body.currentPassword !== "123456") {
           return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
        }
      }

      const salt = await bcrypt.genSalt(10);
      body.password = await bcrypt.hash(body.newPassword, salt);
      delete body.newPassword;
      delete body.currentPassword;
    }

    const settings = await updateSettings(body);

    // Apply outbound proxy settings immediately (no restart required)
    if (
      Object.prototype.hasOwnProperty.call(body, "outboundProxyEnabled") ||
      Object.prototype.hasOwnProperty.call(body, "outboundProxyUrl") ||
      Object.prototype.hasOwnProperty.call(body, "outboundNoProxy")
    ) {
      applyOutboundProxyEnv(settings);
    }

    // Invalidate combo rotation state when strategy settings change
    if (
      Object.prototype.hasOwnProperty.call(body, "comboStrategy") ||
      Object.prototype.hasOwnProperty.call(body, "comboStrategies")
    ) {
      resetComboRotation();
    }

    const { password, ...safeSettings } = settings;
    return NextResponse.json(safeSettings);
  } catch (error) {
    console.log("Error updating settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
