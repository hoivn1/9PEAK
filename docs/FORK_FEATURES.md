# 9Router Fork (tcheat-cli) — Features & Test Matrix

**Base:** 9router upstream v0.4.5 (2026-04-24)
**Fork version:** `tcheat-cli@0.4.5`
**Merged on:** 2026-04-24

This doc is the canonical test matrix for the fork. Every row is a feature with: (1) what it does, (2) where the code lives, (3) how to test it.

---

## Legend
- 🟢 **Local-only** — customization kept from the pre-merge local fork. Upstream does NOT have this.
- 🔵 **Upstream new** — pulled in from 9router v0.3.97 → v0.4.5.
- ⚪ **Inherited** — already in both; unchanged.

---

## 1. Dashboard pages

| # | Feature | Status | Where | How to test |
|---|---------|--------|-------|-------------|
| 1.1 | **Routing Monitor** (real-time account status, concurrency dots, distribution bar, 2s polling) | 🟢 | `src/app/(dashboard)/dashboard/routing/page.js` + Sidebar entry line 22 | Open `/dashboard/routing`. Send a request through `/v1/chat/completions` — the selected account should flash "active" within 5s. |
| 1.2 | **Endpoint** with API key eye/eye-off toggle | ⚪ (upstream now has same) | `src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js` | Open `/dashboard/endpoint`, click eye icon next to any API key → value reveals; click again → masked. |
| 1.3 | **Providers** list + details with new modals (custom models, compatible endpoints, cooldown timer, passthrough models) | 🔵 | `src/app/(dashboard)/dashboard/providers/[id]/{AddApiKeyModal,AddCustomModelModal,CompatibleModelsSection,ConnectionRow,CooldownTimer,EditCompatibleNodeModal,ModelRow,PassthroughModelsSection}.js` | Open any provider detail page → click "Add custom model" → verify CRUD. Trigger a rate-limit → cooldown timer counts down. |
| 1.4 | **Combos** | ⚪ | `src/app/(dashboard)/dashboard/combos/page.js` | Create a combo chaining 2 providers, verify fallback. |
| 1.5 | **Usage** with buffered token accounting + provider limit cards + request details tab | ⚪ (+upstream polish) | `src/app/(dashboard)/dashboard/usage/` | Make 3 requests, verify chart / table / request-details all show them. |
| 1.6 | **Quota Tracker** (countdown + reset display) | ⚪ | `src/app/(dashboard)/dashboard/quota/page.js` | Add a subscription provider → quota card should show remaining + reset time. |
| 1.7 | **MITM** page + server card + Link card (new) | 🔵 | `src/app/(dashboard)/dashboard/mitm/` + `cli-tools/components/{MitmLinkCard,MitmServerCard}.js` | Turn on MITM, check cert generation & DNS interception. Click "MITM Link" card in CLI Tools. |
| 1.8 | **CLI Tools** (Claude / Codex / Cursor / Copilot / Droid / OpenClaw / OpenCode / Antigravity / Hermes) | 🔵 (Hermes is new) | `src/app/(dashboard)/dashboard/cli-tools/components/*ToolCard.js` | Install each CLI → click "Configure" → verify settings file at proper path. |
| 1.9 | **Console Log** live viewer | ⚪ | `src/app/(dashboard)/dashboard/console-log/` | Make a request → log lines appear. |
| 1.10 | **Translator** playground | ⚪ | `src/app/(dashboard)/dashboard/translator/` | Paste an OpenAI request → see translated Claude/Anthropic output. |
| 1.11 | **Proxy Pools** CRUD | ⚪ | `src/app/(dashboard)/dashboard/proxy-pools/` | Add a proxy → assign to a provider → verify egress IP changes. |
| 1.12 | **Media Providers** (TTS + new Text-to-Image tab) | 🔵 | `src/app/(dashboard)/dashboard/media-providers/` | Add a Gemini/OpenAI image provider → test Text-to-Image endpoint. |
| 1.13 | **Profile** | ⚪ | `src/app/(dashboard)/dashboard/profile/` | Change password, verify login works after. |
| 1.14 | **Image Gen** (history grid + Stats + Accounts + Gold Library) — 9Peak v0.2.0 / v0.2.1 / v0.2.2 | 🟢 | `src/app/(dashboard)/dashboard/image-gen/` + `src/app/api/image-gen/{history,image,promote-gold,gold,stats}/route.js` | Open `/dashboard/image-gen`. Tab History reads `~/.9router-image-cache/history/*.json`; click thumbnail → modal → "Promote to Gold". Tab Stats hiển thị KPI + 7-day chart + pie phân phối room/style. Tab Accounts hiển thị Codex OAuth accounts với plan badge / cooldown / 429-401 24h. Tab Gold Library lists `~/.9router-image-cache/gold/<room>/*`. |

---

## 2. Providers (OpenAI/Anthropic-compatible + built-ins)

| # | Provider | Status | Type | Where | Test |
|---|----------|--------|------|-------|------|
| 2.1 | **Azure OpenAI** | 🔵 | APIKEY | `open-sse/executors/azure.js` + `config/providers.js` | Add Azure endpoint (resource+deployment+apiVersion), send chat request. |
| 2.2 | **Volcengine Ark** (CN) | 🔵 | APIKEY | `open-sse/config/providers.js:159`, `providerModels.js:330` | Add Ark API key, verify model listing. |
| 2.3 | **OpenCode Go** | 🔵 | OAUTH/subscription | `open-sse/executors/opencode-go.js` | Import OpenCode Go account → send request. |
| 2.4 | **Grok Web** (no API key, web scrape) | 🔵 | Session cookie | `open-sse/executors/grok-web.js` | Paste Grok session cookie → send chat. |
| 2.5 | **Perplexity Web** | 🔵 | Session cookie | `open-sse/executors/perplexity-web.js` | Paste Perplexity session → send chat. |
| 2.6 | **Cursor** (OAuth import, translator/executor) | ⚪ (inherited v0.2.66) | OAUTH | `open-sse/executors/cursor.js` | Login Cursor → send request. |
| 2.7 | **Claude** (Opus 4.6, Sonnet 4.6) | ⚪ | OAUTH | `open-sse/executors/*claude*` | OAuth login Claude → chat with Opus 4.6. |
| 2.8 | **Codex** (GPT-5.3 + 5.5, thinking levels, precise cooldown `resetsAtMs`, email backfill) | 🔵 (5.5 + cooldown new) | OAUTH | `open-sse/executors/codex.js` | OAuth Codex → test GPT-5.5; hit rate limit → verify `resetsAtMs` shown. |
| 2.9 | **Kiro** (token refresh, request translation) | ⚪ | OAUTH | `open-sse/executors/kiro.js` | OAuth Kiro → send chat → wait for token refresh. |
| 2.10 | **iFlow** (Kimi K2.5) | ⚪ | OAUTH | `open-sse/executors/iflow.js` | Login iFlow → chat with K2.5. |
| 2.11 | **MiniMax Coding** | ⚪ | APIKEY | — | Add MiniMax key → chat. |
| 2.12 | **Antigravity** (Droid, Copilot, OpenClaw) | ⚪ (+stability fixes) | OAUTH | `open-sse/executors/antigravity.js` | Run each CLI → verify it routes through 9router. |
| 2.13 | **Ollama custom host URL** | 🔵 | Local/remote | `open-sse/translator/request/openai-to-ollama.js` | Configure Ollama provider with remote URL (`http://192.168.x.x:11434`) → chat. |
| 2.14 | **Qoder** / **Qwen** (OAuth) | ⚪ | OAUTH | `open-sse/executors/{qoder,qwen}.js` | OAuth login → chat. |
| 2.15 | **GitHub Copilot** (model mapping fix) | ⚪ | OAUTH | `open-sse/executors/github.js` | OAuth GitHub → pick model → verify correct mapping. |
| 2.16 | **Vertex AI** | ⚪ | APIKEY/OAuth | `open-sse/executors/vertex.js` | Add Vertex creds → chat. |
| 2.17 | **OpenAI-compatible custom nodes** (CRUD/validation/test) | ⚪ | APIKEY | `src/app/(dashboard)/dashboard/providers/new/` | Add a custom compatible endpoint → click "Test" → verify auth check. |

---

## 3. OpenAI-compatible API endpoints

| # | Endpoint | Status | Format | Where | Test |
|---|----------|--------|--------|-------|------|
| 3.1 | `POST /v1/chat/completions` | ⚪ | OpenAI chat | `src/app/api/v1/chat/completions/` | `curl -X POST localhost:20128/v1/chat/completions -d '{"model":"gpt-4","messages":[...]}'` |
| 3.2 | `POST /v1/messages` | ⚪ | Anthropic | `src/app/api/v1/messages/` | `curl` with Anthropic-style body → get Claude stream. |
| 3.3 | `POST /v1/responses` | ⚪ | Codex responses API | `src/app/api/v1/responses/` | Codex CLI → verify works through router. |
| 3.4 | `POST /v1/embeddings` | ⚪ | OpenAI | `src/app/api/v1/embeddings/` | `curl` with embedding body. |
| 3.5 | `POST /v1/audio/speech` (TTS) | ⚪ | OpenAI TTS | `src/app/api/v1/audio/speech/` | `curl` → get audio bytes. |
| 3.6 | **Text-to-Image handler** (OpenAI/Gemini/MiniMax/OpenRouter/Nanobanana/SDWebUI formats) | 🔵 | Multi | `open-sse/handlers/imageGenerationCore.js` | POST image prompt → get image URL/base64. |
| 3.7 | `GET /v1/models` | ⚪ | OpenAI | `src/app/api/v1/models/` | `curl` → list of all models (including GPT-5.5, custom). |

---

## 4. Core engine features

| # | Feature | Status | Where | Test |
|---|---------|--------|-------|------|
| 4.1 | **RTK (Reduce Token Kill)** — pre-filter `ls`/`grep`/`find` context before sending to LLM | 🔵 | `open-sse/rtk/` (5 files + `/filters/`) | Send a chat message containing `ls -la` output → verify token count dropped significantly in usage page. |
| 4.2 | **Cooldown cap** (max cap on rate-limit backoff) | 🔵 | `open-sse/config/runtimeConfig.js` | Trigger rate limit on a provider → verify cooldown never exceeds configured cap. |
| 4.3 | **Dynamic custom model fetching** | 🔵 | provider executor changes | Add custom model in UI → it appears in model picker without restart. |
| 4.4 | **Smart fallback routing** (subscription → cheap → free) | ⚪ | `src/sse/` + `chatCore.js` | Exhaust main provider → verify auto-fallback. |
| 4.5 | **Round-robin** across multi-account | ⚪ | `src/sse/services/` | Add 3 accounts on same provider → send 3 requests → each picks different account. |
| 4.6 | **Sticky routing** | ⚪ | `src/sse/services/` | Enable sticky → verify same conv stays on same account. |
| 4.7 | **Config-driven error handling** (centralized error rules) | 🔵 | `open-sse/config/errorConfig.js` | Provider returns a known 429 shape → verify mapped error. |
| 4.8 | **Stream format translation** (OpenAI ↔ Claude) | ⚪ | `open-sse/translator/` | Send OpenAI request → route to Claude → verify OpenAI stream out. |
| 4.9 | **Non-streaming translation support** | ⚪ | `open-sse/translator/` | Request with `stream:false` → verify JSON response. |
| 4.10 | **Concurrency/rate limiting** | ⚪ | `src/sse/services/` | Launch 20 parallel requests → verify queueing. |
| 4.11 | **Token refresh** (Kiro/Claude/etc.) | ⚪ | `src/sse/services/` | Let token expire → next request auto-refreshes. |
| 4.12 | **Outbound proxy** (HTTP/HTTPS/SOCKS) | ⚪ | `src/proxy.js`, `src/lib/network/` | Set `HTTPS_PROXY=...` → verify egress through proxy. |

---

## 5. Auth / security

| # | Feature | Where | Test |
|---|---------|-------|------|
| 5.1 | JWT auth (jose, 24h) | `src/sse/services/` | Login → token has 24h expiry. |
| 5.2 | bcrypt password hashing | — | Change password → hash in db.json is bcrypt. |
| 5.3 | Local bypass (127.0.0.1 skips auth) | — | Curl from localhost without auth → succeeds (if enabled). |
| 5.4 | `requireLogin` toggle | `/api/settings` | Toggle → dashboard prompts login. |
| 5.5 | API key validation on save | — | Save invalid API key → validation error. |
| 5.6 | Strengthened CLI token validation (v0.4.1) | — | Try invalid CLI token → rejected. |

---

## 6. Infra / runtime

| # | Feature | Status | Where | Test |
|---|---------|--------|-------|------|
| 6.1 | **In-app version update** (appUpdater + `/api/version/update`) | 🔵 | `src/lib/appUpdater.js`, `src/app/api/version/update/route.js` | Dashboard header "Update" button → should kill MITM, spawn updater, gracefully exit. |
| 6.2 | **In-app download/update UX** | 🔵 | Sidebar `UpdateProgress` component | When update available → progress bar shows. |
| 6.3 | **Corrupt JSON DB recovery + schema migration** | ⚪ | `src/lib/localDb.js` | Corrupt `~/.9router/db.json` then restart → DB rebuilds. |
| 6.4 | **Cloudflare tunnel** integration | ⚪ | `src/lib/tunnel/` | Enable tunnel → public URL works. |
| 6.5 | **MITM child process** (SSL cert gen, DNS interception) | ⚪ | `src/mitm/` | Enable MITM → `~/.mitmproxy` has cert. |
| 6.6 | **i18n** (32 locales, cookie-based) | ⚪ | `src/i18n/` | Change locale cookie → dashboard re-renders. |
| 6.7 | **Docker** multi-stage build | ⚪ | `Dockerfile`, `start.sh` | `docker build . && docker run -p 20128:20128`. |
| 6.8 | **Standalone output** (next.config: `output: 'standalone'`) | ⚪ | `next.config.mjs` | `npm run build` → `.next/standalone/server.js` exists. |

---

## 6b. ChatGPT OAuth Image Generation (fork — v0.4.5-local.3) 🔥

🟢 **Local fork feature** — not in upstream. Lets `/v1/images/generations` use your Codex OAuth accounts (Plus/Pro/Business/Go/Team/Enterprise) instead of a paid `sk-...` API key.

| # | Feature | Where | Test |
|---|---------|-------|------|
| 6b.1 | **Settings gate** `enableChatGPTImageGen` (default OFF) | `src/sse/handlers/imageGeneration.js` early-return | Request `codex/gpt-image-1` when OFF → 503 `"Codex image generation is disabled..."` |
| 6b.2 | **UI toggle** + red warning bar | `src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js` — "Experimental features" card | Toggle at `/dashboard/endpoint` → verify `db.json.settings.enableChatGPTImageGen` flips |
| 6b.3 | **Codex image provider** backend | `open-sse/handlers/imageGenerationCore.js` — `IMAGE_PROVIDERS.codex`, `buildImageHeaders/Body/` codex branches, `parseCodexImageStream()` | Enable flag, then `curl -X POST /v1/images/generations -d '{"model":"codex/gpt-image-1","prompt":"..."}'` |
| 6b.4 | **Endpoint** `POST chatgpt.com/backend-api/codex/responses` with `tools:[{type:"image_generation"}]` + SSE parsing | Same file, `parseCodexImageStream` | Look at service log for `[IMAGE] CODEX \| gpt-image-1 \| Success \| images=1` |
| 6b.5 | **Model `codex/gpt-image-1`** in catalog | `open-sse/config/providerModels.js` block `cx` | Flag ON → `/v1/models` lists `cx/gpt-image-1` |
| 6b.6 | **Plan-type badge** per account (Plus/Pro/Business/Go/Team/Enterprise/Free) | `src/app/(dashboard)/dashboard/providers/[id]/ConnectionRow.js` | Open `/dashboard/providers/codex` — badges appear beside account names |
| 6b.7 | **Per-model lock on image 429** — text chat on same account stays active | `markAccountUnavailable(connId, 429, ..., "gpt-image-1")` + `modelLock_gpt-image-1` | Exhaust image quota → account still responds to cx/gpt-5.4 |
| 6b.8 | **Multi-account fallback** on `model_access_denied` / 403 | `handleImageGeneration` fallback loop | Add Free-tier account to pool → 403 → auto rotates to next account |

### Request examples

```bash
# Single image
curl -X POST http://localhost:20128/v1/images/generations \
  -H "Authorization: Bearer <9router-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"codex/gpt-image-1","prompt":"red apple on white plate"}'

# With reference image (input_image) — edit/variation
curl ... -d '{"model":"codex/gpt-image-1","prompt":"change to blue","image":"data:image/png;base64,iVBORw..."}'

# Override wrapping text model (default: gpt-5.4)
curl ... -d '{"model":"codex/gpt-image-1","prompt":"...","codexModel":"gpt-5.3"}'
```

### Verified result (2026-04-24)

Successful test via account `duythanhtest3@gmail.com` (Business): 1254×1254 PNG, 1.6MB, 61s. Prompt "a red apple on a white plate" → photorealistic apple on white plate.

### ⚠️ Limitations & ToS risk

- **No `size` / `quality` / `n` fields** — backend doesn't accept them; they're appended to prompt text as hints.
- **Plan-dependent quota** — each OAuth account has its own daily/monthly image limit (Plus ~40/3h, Pro/Business wider).
- **ToS**: OpenAI ToS may restrict non-official client usage of OAuth tokens. Accounts may get rate-limited or suspended. Use at your own risk — default OFF.
- **`revised_prompt`** not always returned by newer ChatGPT backend.

---

## 7. Local-only additions (fork brand)

| # | Feature | Where | Test |
|---|---------|-------|------|
| 7.1 🟢 | **`tcheat-cli` CLI wrapper** (build-if-needed, port flag, dev mode, no-open flag) | `bin/tcheat-cli.mjs` + `package.json#bin` | `npx tcheat-cli --help` shows usage. `tcheat-cli --port 3000` starts on 3000. |
| 7.2 🟢 | **9Remote install** API | `src/app/api/9remote/install/route.js` | `curl -X POST localhost:20128/api/9remote/install` → `npm install -g 9remote`. |
| 7.3 🟢 | **9Remote start** API | `src/app/api/9remote/start/route.js` | `curl -X POST localhost:20128/api/9remote/start` → spawns `9remote ui --start`. |
| 7.4 🟢 | **9Remote status** API (health check localhost:2208 with 1.5s timeout) | `src/app/api/9remote/status/route.js` | `curl localhost:20128/api/9remote/status` → `{installed, running}`. |
| 7.5 🟢 | **9Remote promo modal** (marketing) | `src/shared/components/NineRemotePromoModal.js` | Header → click 9Remote badge → promo modal. |
| 7.6 🟢 | **9Remote install modal** (deeper flow, currently dormant in UI) | `src/shared/components/NineRemoteModal.js` | Re-exported from `components/index.js` — wire to any button to expose. |
| 7.7 🟢 | **Branded docs** (CLAUDE.md, INSTALL.md) | `CLAUDE.md`, `INSTALL.md` | Read to verify fork-specific notes. |

---

## 8. Install / packaging (fork)

### Install from tarball
```bash
# on the dev machine (you just packed):
cd ~/9router-merged && npm pack   # → tcheat-cli-0.4.5.tgz

# on any target machine:
npm install -g ./tcheat-cli-0.4.5.tgz
tcheat-cli                        # start on :20128
tcheat-cli --port 3000            # custom port
tcheat-cli --dev                  # dev mode
tcheat-cli --help                 # help
```

### Data location
- Default DB: `~/.9router/db.json`  (lowdb + proper-lockfile)
- Usage log: `~/.9router/usage.json`, `~/.9router/log.txt`
- Override via env: `DATA_DIR=/custom/path`

### Key env vars
| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `20128` | HTTP port |
| `DATA_DIR` | `~/.9router` | DB location |
| `JWT_SECRET` | auto-gen | JWT signing |
| `INITIAL_PASSWORD` | `admin` | first-boot password |
| `REQUIRE_API_KEY` | `false` | Require API key on `/v1/*` |
| `ENABLE_REQUEST_LOGS` | `false` | Log full bodies |
| `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` | — | Outbound proxy |
| `BASE_URL` | — | Public URL (tunnel) |
| `CLOUD_URL` | — | Cloud sync |

---

## 9. Smoke-test script (suggest)

```bash
# 1. boot
tcheat-cli --no-open &
sleep 5

# 2. models
curl -s localhost:20128/v1/models | jq '.data | length'

# 3. chat (requires configured provider)
curl -s -X POST localhost:20128/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"hi"}]}'

# 4. 9remote status
curl -s localhost:20128/api/9remote/status

# 5. routing monitor
open http://localhost:20128/dashboard/routing
```

---

## 10. Known quirks / things to watch

1. **`9remoteManager.js` is process-local** — if running in Next.js standalone multi-worker, PID not shared across workers. Same as pre-merge.
2. **`marked` dep added** for markdown rendering in changelog viewer. Safe to keep.
3. **Endpoint eye-toggle** was a local-only patch pre-merge but upstream v0.4.5 ships same feature → no visible change after merge.
4. **`private: true` removed** from package.json so `npm pack` works. Do NOT publish to npm registry accidentally (add `"publishConfig": {"access": "restricted"}` or keep local).
5. **Backup location**: `/home/duythanh/9router.bak-v0.3.96` (full 1.4G snapshot of pre-merge state). Delete when you're confident the merge works.
