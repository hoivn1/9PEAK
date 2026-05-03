#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════════════
// 9Peak postbuild — copy static assets into Next.js standalone output
// ───────────────────────────────────────────────────────────────────────
// Next.js standalone builds emit a self-contained server.js at
// .next/standalone/ but DO NOT populate the static chunks or public/.
// Without this copy step, /dashboard/* loads with 404s on CSS/JS chunks
// and the page renders broken.
//
// npm runs this automatically via the `postbuild` script (lifecycle hook).
// Safe to re-run — cpSync overwrites existing.
// Cross-platform (Node fs, no shell cp) so it works on Windows too.
// ═══════════════════════════════════════════════════════════════════════

import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.log("[postbuild] No .next/standalone — skipping (not a standalone build).");
  process.exit(0);
}

const tasks = [
  {
    src: join(root, ".next", "static"),
    dst: join(standalone, ".next", "static"),
    label: ".next/static",
  },
  {
    src: join(root, "public"),
    dst: join(standalone, "public"),
    label: "public",
  },
];

const t0 = Date.now();
for (const { src, dst, label } of tasks) {
  if (!existsSync(src)) {
    console.warn(`[postbuild] Source missing: ${label} (${src}) — skipped.`);
    continue;
  }
  // Wipe existing dst first so stale hashed chunks from previous builds don't linger
  if (existsSync(dst)) {
    rmSync(dst, { recursive: true, force: true });
  }
  cpSync(src, dst, { recursive: true });
  console.log(`[postbuild] ✓ ${label} → standalone`);
}
const ms = Date.now() - t0;
console.log(`[postbuild] Done in ${ms}ms. Standalone server ready.`);
