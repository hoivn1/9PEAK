import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";

// [9peak-fork] List all PNGs in the gold library grouped by room.

// Force dynamic + no-cache — gold library grows when user promotes an image.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const GOLD_DIR = path.join(os.homedir(), ".9router-image-cache", "gold");
const ROOMS = ["living", "bedroom", "child", "worship", "kitchen", "bath", "office"];
const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
};

function parseFilename(filename) {
  // expected format: <style>-<label>.png. Style is alnum+hyphen, label is alnum+hyphen.
  // Take everything before the last "-" as style, after as label (without .png).
  const base = filename.replace(/\.png$/i, "");
  const lastDash = base.lastIndexOf("-");
  if (lastDash < 0) return { style: base, label: "" };
  return { style: base.slice(0, lastDash), label: base.slice(lastDash + 1) };
}

export async function GET() {
  try {
    const rooms = {};
    for (const room of ROOMS) rooms[room] = [];

    let roomDirs;
    try {
      roomDirs = await fs.readdir(GOLD_DIR, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") return NextResponse.json({ rooms }, { headers: NO_CACHE_HEADERS });
      throw err;
    }

    for (const dirent of roomDirs) {
      if (!dirent.isDirectory()) continue;
      const room = dirent.name;
      const subdir = path.join(GOLD_DIR, room);
      let files;
      try {
        files = await fs.readdir(subdir);
      } catch {
        continue;
      }

      const list = [];
      for (const f of files) {
        if (!f.toLowerCase().endsWith(".png")) continue;
        const fullPath = path.join(subdir, f);
        try {
          const stat = await fs.stat(fullPath);
          const { style, label } = parseFilename(f);
          list.push({
            path: fullPath,
            filename: f,
            style,
            label,
            mtime: stat.mtimeMs,
            size: stat.size,
          });
        } catch {
          // skip
        }
      }
      list.sort((a, b) => b.mtime - a.mtime);
      // Always include the bucket so the UI shows known rooms even if foreign room appears.
      if (!rooms[room]) rooms[room] = [];
      rooms[room] = list;
    }

    return NextResponse.json({ rooms }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("[image-gen/gold] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
