import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// [9peak-fork] Serve PNG files referenced by image-gen history.
// Only files under /tmp/9router-image-* or ~/.9router-image-cache/gold are allowed.

const TMP_PREFIX = "/tmp/9router-image-";
const GOLD_PREFIX = path.join(os.homedir(), ".9router-image-cache", "gold") + path.sep;

function isAllowed(absPath) {
  if (absPath.startsWith(TMP_PREFIX)) return true;
  if (absPath.startsWith(GOLD_PREFIX)) return true;
  return false;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("path");
    if (!raw) {
      return new Response(JSON.stringify({ error: "missing path" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const decoded = decodeURIComponent(raw);
    const resolved = path.resolve(decoded);

    if (!isAllowed(resolved)) {
      return new Response(JSON.stringify({ error: "path not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    let buf;
    try {
      buf = await fs.readFile(resolved);
    } catch (err) {
      if (err.code === "ENOENT") {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw err;
    }

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[image-gen/image] error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
