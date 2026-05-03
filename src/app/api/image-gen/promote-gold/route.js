import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";

// [9peak-fork] Copy a generated PNG (under /tmp/9router-image-*) into the
// gold reference library at ~/.9router-image-cache/gold/<room>/<style>-<label>.png.

const TMP_PREFIX = "/tmp/9router-image-";
const GOLD_DIR = path.join(os.homedir(), ".9router-image-cache", "gold");

const ROOMS = new Set(["living", "bedroom", "child", "worship", "kitchen", "bath", "office"]);
const STYLE_RE = /^[a-zA-Z0-9-]+$/;

export async function POST(request) {
  try {
    const body = await request.json();
    const { sourcePath, room, style, label } = body || {};

    if (!sourcePath || typeof sourcePath !== "string") {
      return NextResponse.json({ error: "sourcePath required" }, { status: 400 });
    }
    const resolvedSource = path.resolve(sourcePath);
    if (!resolvedSource.startsWith(TMP_PREFIX)) {
      return NextResponse.json(
        { error: "sourcePath must be under /tmp/9router-image-*" },
        { status: 403 }
      );
    }

    if (!room || !ROOMS.has(room)) {
      return NextResponse.json(
        { error: `room must be one of: ${[...ROOMS].join(", ")}` },
        { status: 400 }
      );
    }

    if (!style || typeof style !== "string" || !STYLE_RE.test(style)) {
      return NextResponse.json(
        { error: "style must be alphanumeric/hyphen and non-empty" },
        { status: 400 }
      );
    }

    const cleanLabel = (label && typeof label === "string" && STYLE_RE.test(label))
      ? label
      : String(Math.floor(Date.now() / 1000));

    const roomDir = path.join(GOLD_DIR, room);
    await fs.mkdir(roomDir, { recursive: true });
    const destPath = path.join(roomDir, `${style}-${cleanLabel}.png`);

    await fs.copyFile(resolvedSource, destPath);

    return NextResponse.json({ ok: true, destPath });
  } catch (error) {
    console.error("[image-gen/promote-gold] error:", error);
    if (error.code === "ENOENT") {
      return NextResponse.json({ error: "source file not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
