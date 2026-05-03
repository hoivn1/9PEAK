#!/usr/bin/env node

/**
 * 9peak — CLI entry point
 *
 * 9Peak is a fork of 9Router (https://github.com/decolua/9router) by @decolua.
 * All core routing/SSE/OAuth code is the work of the upstream 9Router project.
 * See NOTICE.md and LICENSE for full attribution.
 *
 * Usage:
 *   9peak                   Start server (build first if needed)
 *   9peak --port 3000       Custom port (default 20128)
 *   9peak --dev             Dev mode (hot reload)
 *   9peak --build           Build only, don't start
 *   9peak --no-open         Don't open browser
 *   9peak --help            Show help
 *
 * Aliases: `9peak`, `9router` and `tcheat-cli` also invoke this same entry point.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, readFileSync } from "fs";
import { execSync, spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

let PKG_VERSION = "0.1.0";
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  if (pkg && pkg.version) PKG_VERSION = pkg.version;
} catch {
  // fall back to default
}

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" || args[i] === "-p") {
    flags.port = args[++i];
  } else if (args[i] === "--dev" || args[i] === "-d") {
    flags.dev = true;
  } else if (args[i] === "--build" || args[i] === "-b") {
    flags.buildOnly = true;
  } else if (args[i] === "--help" || args[i] === "-h") {
    flags.help = true;
  } else if (args[i] === "--no-open") {
    flags.noOpen = true;
  }
}

const PORT = flags.port || process.env.PORT || "20128";

if (flags.help) {
  console.log(`
  9peak — AI Router Dashboard (fork of 9Router by @decolua)

  Usage:
    9peak                       Start server on port ${PORT}
    9peak --port 3000           Start on custom port
    9peak --dev                 Start in dev mode (hot reload)
    9peak --build               Build only (no start)
    9peak --no-open             Don't open browser on start
    9peak --help                Show this help

  Aliases:
    9peak, 9router, tcheat-cli   Same entry point as 9peak

  Environment:
    PORT                        Server port (default: 20128)
    DATA_DIR                    Data directory (default: ~/.9router)
    JWT_SECRET                  JWT secret for auth
    INITIAL_PASSWORD            Initial dashboard password

  Credit:
    Upstream: https://github.com/decolua/9router
    Fork:     https://github.com/hoivn1/CCHEATCLI
  `);
  process.exit(0);
}

function log(tag, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`\x1b[36m[${time}]\x1b[0m \x1b[33m[${tag}]\x1b[0m ${msg}`);
}

function runSync(cmd, opts = {}) {
  try {
    execSync(cmd, { cwd: ROOT, stdio: "inherit", ...opts });
    return true;
  } catch {
    return false;
  }
}

function checkDeps() {
  const nodeModules = join(ROOT, "node_modules");
  if (!existsSync(nodeModules)) {
    log("SETUP", "Installing dependencies...");
    const ok = runSync("npm install --no-audit --no-fund");
    if (!ok) {
      console.error("\x1b[31mFailed to install dependencies\x1b[0m");
      process.exit(1);
    }
    log("SETUP", "Dependencies installed");
  }
}

function checkBuild() {
  const standalone = join(ROOT, ".next", "standalone", "server.js");
  const nextDir = join(ROOT, ".next");
  if (!existsSync(standalone) && !existsSync(nextDir)) {
    return false;
  }
  if (existsSync(standalone)) return "standalone";
  return "next";
}

function build() {
  log("BUILD", "Building production bundle...");
  const start = Date.now();
  // Use `npm run build` (not `npx next build`) so the `postbuild` lifecycle
  // script runs — it copies .next/static + public into .next/standalone/.
  // Without this step, production starts but all CSS/JS chunks 404 and the
  // dashboard renders broken. This is the #1 cause of "CSS lỗi" bug reports
  // when users install 9Peak fresh from npm or cook their own builds.
  const ok = runSync("npm run build", {
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
  });
  if (!ok) {
    console.error("\x1b[31mBuild failed\x1b[0m");
    process.exit(1);
  }
  // Double-check standalone assets are actually present post-build.
  const staticDir = join(ROOT, ".next", "standalone", ".next", "static");
  const publicDir = join(ROOT, ".next", "standalone", "public");
  if (!existsSync(staticDir) || !existsSync(publicDir)) {
    console.error("\x1b[31m[BUILD] Standalone assets missing after build (postbuild failed?)\x1b[0m");
    console.error("\x1b[31m         Expected: .next/standalone/.next/static and .next/standalone/public\x1b[0m");
    console.error("\x1b[33m         Run: node scripts/copy-standalone-assets.js\x1b[0m");
    process.exit(1);
  }
  const secs = ((Date.now() - start) / 1000).toFixed(1);
  log("BUILD", `Done in ${secs}s (postbuild OK)`);
}

function startStandalone() {
  const serverJs = join(ROOT, ".next", "standalone", "server.js");
  if (!existsSync(serverJs)) {
    log("START", "Standalone server.js not found, falling back to next start");
    return startNext();
  }

  log("START", `Starting standalone server on port ${PORT}...`);

  const child = spawn(process.execPath, [serverJs], {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT,
      HOSTNAME: "0.0.0.0",
    },
  });

  child.on("close", (code) => process.exit(code || 0));
  setupSignals(child);
}

function startNext() {
  log("START", `Starting server on port ${PORT}...`);

  const child = spawn("npx", ["next", "start", "--port", PORT], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT,
    },
  });

  child.on("close", (code) => process.exit(code || 0));
  setupSignals(child);
}

function startDev() {
  log("DEV", `Starting dev server on port ${PORT}...`);

  const child = spawn("npx", ["next", "dev", "--webpack", "--port", PORT], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      PORT,
    },
  });

  child.on("close", (code) => process.exit(code || 0));
  setupSignals(child);
}

function setupSignals(child) {
  const cleanup = (signal) => {
    child.kill(signal);
    process.exit(0);
  };
  process.on("SIGINT", () => cleanup("SIGINT"));
  process.on("SIGTERM", () => cleanup("SIGTERM"));
}

async function openBrowser() {
  if (flags.noOpen) return;
  setTimeout(async () => {
    try {
      const openModule = await import("open");
      const open = openModule.default;
      await open(`http://localhost:${PORT}`);
    } catch {
      // open is optional
    }
  }, 2000);
}

const bannerVersion = `v${PKG_VERSION}`.padEnd(16);
console.log(`
  \x1b[36m╔═══════════════════════════════════════════╗
  ║   9Peak ${bannerVersion}                  ║
  ║   AI Router Dashboard                     ║
  ║   Fork of 9Router by @decolua             ║
  ║   https://github.com/decolua/9router      ║
  ╚═══════════════════════════════════════════╝\x1b[0m
`);

checkDeps();

if (flags.dev) {
  startDev();
  openBrowser();
} else if (flags.buildOnly) {
  build();
} else {
  const buildState = checkBuild();
  if (!buildState) {
    build();
  }
  startStandalone();
  openBrowser();
}
