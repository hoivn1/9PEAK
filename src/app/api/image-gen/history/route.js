import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";

// [9peak-fork] Image gen dashboard API — read-only access to history JSON files
// produced by the OpenClaw skill at ~/.9router-image-cache/history/*.json

// Force dynamic + no-cache — history is filesystem-backed and changes any time
// gen.sh writes a new entry. Without this, Next.js/browser caches served a
// stale list and new gens from the Telegram bot wouldn't show up on reload.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const HISTORY_DIR = path.join(os.homedir(), ".9router-image-cache", "history");

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
};

export async function GET() {
  try {
    let entries;
    try {
      entries = await fs.readdir(HISTORY_DIR);
    } catch (err) {
      if (err.code === "ENOENT") return NextResponse.json([]);
      throw err;
    }

    const jsonFiles = entries.filter((f) => f.endsWith(".json"));
    const items = [];

    for (const file of jsonFiles) {
      const fullPath = path.join(HISTORY_DIR, file);
      try {
        const raw = await fs.readFile(fullPath, "utf8");
        const data = JSON.parse(raw);
        const outputPath = data.output;
        const outputExists = outputPath ? fsSync.existsSync(outputPath) : false;
        items.push({ ...data, _file: file, outputExists });
      } catch {
        // skip corrupt files
      }
    }

    items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return NextResponse.json(items, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[image-gen/history] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
