import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";

// [9peak-fork] Aggregate stats over all history JSON files.

// Force dynamic + no-cache — stats recompute from filesystem every request.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const HISTORY_DIR = path.join(os.homedir(), ".9router-image-cache", "history");
const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
};

function dateKey(ts) {
  const d = new Date(ts * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pct(num, total) {
  if (!total) return 0;
  return Math.round((num / total) * 1000) / 10;
}

export async function GET() {
  try {
    let files;
    try {
      files = await fs.readdir(HISTORY_DIR);
    } catch (err) {
      if (err.code === "ENOENT") {
        return NextResponse.json({
          totalGens: 0,
          gensLast7Days: [],
          byRoom: [],
          byStyle: [],
          avgInputsPerGen: 0,
          editVsGenerate: { edits: 0, generates: 0 },
          successRate: { total: 0, hasOutput: 0, percent: 0 },
          lastGenAt: null,
          oldestGenAt: null,
        }, { headers: NO_CACHE_HEADERS });
      }
      throw err;
    }

    const entries = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(HISTORY_DIR, f), "utf8");
        entries.push(JSON.parse(raw));
      } catch {
        // skip
      }
    }

    const totalGens = entries.length;

    // Last 7 days bucket — today + 6 days back
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const buckets = {};
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const pad = (n) => String(n).padStart(2, "0");
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      buckets[key] = 0;
      days.push(key);
    }
    for (const e of entries) {
      const k = dateKey(e.ts);
      if (k in buckets) buckets[k]++;
    }
    const gensLast7Days = days.map((date) => ({ date, count: buckets[date] }));

    // By room / by style
    const roomCounts = {};
    const styleCounts = {};
    let totalInputs = 0;
    let edits = 0;
    let generates = 0;
    let hasOutput = 0;
    let lastGenAt = null;
    let oldestGenAt = null;

    for (const e of entries) {
      if (e.room) roomCounts[e.room] = (roomCounts[e.room] || 0) + 1;
      if (e.style) styleCounts[e.style] = (styleCounts[e.style] || 0) + 1;
      totalInputs += Number(e.inputs_count) || 0;
      if (e.is_edit) edits++;
      else generates++;
      if (e.output && fsSync.existsSync(e.output)) hasOutput++;
      if (e.ts) {
        if (lastGenAt === null || e.ts > lastGenAt) lastGenAt = e.ts;
        if (oldestGenAt === null || e.ts < oldestGenAt) oldestGenAt = e.ts;
      }
    }

    const byRoom = Object.entries(roomCounts)
      .map(([room, count]) => ({ room, count, percent: pct(count, totalGens) }))
      .sort((a, b) => b.count - a.count);
    const byStyle = Object.entries(styleCounts)
      .map(([style, count]) => ({ style, count, percent: pct(count, totalGens) }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      totalGens,
      gensLast7Days,
      byRoom,
      byStyle,
      avgInputsPerGen: totalGens ? Math.round((totalInputs / totalGens) * 100) / 100 : 0,
      editVsGenerate: { edits, generates },
      successRate: {
        total: totalGens,
        hasOutput,
        percent: pct(hasOutput, totalGens),
      },
      lastGenAt,
      oldestGenAt,
    }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[image-gen/stats] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
