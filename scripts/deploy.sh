#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# 9Peak local deploy — atomic build + asset copy + restart + verify
# ───────────────────────────────────────────────────────────────────────
# Usage: bash scripts/deploy.sh
# Thay thế cho chuỗi lệnh thủ công cũ (build → cp static → cp public →
# restart → curl check) vốn hay miss bước → CSS 404 / page trắng.
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# Resolve repo root regardless of where script is invoked
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$REPO_ROOT"

VERSION=$(node -p "require('./package.json').version")
PORT=${PORT:-20128}
SERVICE=${SERVICE_NAME:-9router}

log() {
  printf "\033[36m[deploy]\033[0m %s\n" "$*"
}
fail() {
  printf "\033[31m[deploy] ✗ %s\033[0m\n" "$*" >&2
  exit 1
}

log "Version: $VERSION, port: $PORT, service: $SERVICE"

# ─── 1/5 Build (postbuild hook auto-copies assets) ──────────────────
log "1/5 Building production bundle + copying standalone assets..."
BUILD_START=$(date +%s)
NODE_ENV=production npm run build > /tmp/9peak-deploy-build.log 2>&1 || {
  tail -50 /tmp/9peak-deploy-build.log
  fail "next build failed — see /tmp/9peak-deploy-build.log"
}
BUILD_SECS=$(($(date +%s) - BUILD_START))
log "   build OK (${BUILD_SECS}s)"

# ─── 2/5 Verify assets exist in standalone ──────────────────────────
log "2/5 Verifying standalone assets..."
[[ -d .next/standalone/.next/static ]] || fail ".next/standalone/.next/static missing — postbuild did not run"
[[ -d .next/standalone/public ]] || fail ".next/standalone/public missing — postbuild did not run"
STATIC_COUNT=$(find .next/standalone/.next/static -type f 2>/dev/null | wc -l)
[[ "$STATIC_COUNT" -gt 0 ]] || fail ".next/standalone/.next/static is empty"
log "   ${STATIC_COUNT} static files OK"

# ─── 3/5 Restart service ────────────────────────────────────────────
if ! systemctl cat "$SERVICE" >/dev/null 2>&1; then
  log "   systemd service '$SERVICE' not found — skipping restart (run manually if needed)"
else
  log "3/5 Restarting systemd service '$SERVICE'..."
  sudo systemctl restart "$SERVICE"
  sleep 3
  systemctl is-active "$SERVICE" >/dev/null || {
    sudo systemctl status "$SERVICE" --no-pager | tail -15
    fail "service failed to start"
  }
  log "   service active"
fi

# ─── 4/5 Health check ───────────────────────────────────────────────
log "4/5 Health check (HTTP on port $PORT)..."
for i in 1 2 3 4 5; do
  if curl -sfS "http://localhost:$PORT/api/version" >/dev/null 2>&1; then
    break
  fi
  [[ "$i" == "5" ]] && fail "HTTP not responding after 5 tries"
  sleep 1
done

VERSION_JSON=$(curl -s "http://localhost:$PORT/api/version")
CURRENT=$(echo "$VERSION_JSON" | node -e "process.stdin.on('data', d => { try { console.log(JSON.parse(d).currentVersion) } catch { console.log('?') } })")
log "   /api/version reports: $CURRENT"
if [[ "$CURRENT" != "$VERSION" ]]; then
  fail "version mismatch: package.json=$VERSION but running=$CURRENT"
fi

# ─── 5/5 Sanity-check a static asset actually serves 200 ────────────
# Next.js serves static assets at /_next/static/... (underscore prefix).
# Filesystem path is .next/standalone/.next/static/... → rewrite to URL.
log "5/5 Sanity-check a random static CSS/JS chunk..."
# `head -1` closes the pipe → SIGPIPE on find → non-zero exit → pipefail aborts.
# Trail `|| true` so the pipeline exit is discarded for this sampling step.
SAMPLE=$(find .next/standalone/.next/static \( -name "*.css" -o -name "*.js" \) 2>/dev/null | head -1 || true)
if [[ -n "$SAMPLE" ]]; then
  # Strip filesystem prefix, then rewrite ".next" → "_next" for URL.
  # e.g. ".next/standalone/.next/static/css/abc.css" → "/_next/static/css/abc.css"
  URL_PATH="${SAMPLE#.next/standalone/.next}"
  URL_PATH="/_next${URL_PATH}"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT${URL_PATH}")
  if [[ "$HTTP_CODE" == "200" ]]; then
    log "   static asset serves 200 OK ($URL_PATH)"
  else
    fail "static asset returned HTTP $HTTP_CODE for $URL_PATH — CSS/JS will break in browser"
  fi
fi

printf "\033[32m[deploy] ✓ v%s live at http://localhost:%s\033[0m\n" "$VERSION" "$PORT"
