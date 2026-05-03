# 9Peak v0.5.1 (2026-04-24) — Decoupled architecture: strip GPT Checker, add Bulk Import UI

v0.5.0 ship GPT Checker bundle Playwright + Chromium binary thẳng vào 9peak
main app: tăng tgz size +150MB sau `npx playwright install chromium`,
tăng attack surface (browser automation chạy trong cùng process API
router), và rủi ro ban acc do automation bị ChatGPT detect → ảnh hưởng
luôn cả các feature core khác của user (image-gen, routing). Cộng đồng
cũng phản hồi không muốn cài Chromium chỉ để dùng router.

## Decision: decouple

- 9peak main = slim, KHÔNG còn login automation, KHÔNG depend Playwright.
- Login automation chuyển sang `tools/collector/` (commit riêng, project
  Node độc lập, package.json riêng, node_modules riêng) — risky-isolated.
- 9peak nhận token đã login sẵn qua trang `/dashboard/bulk-import`: paste
  JSON hoặc upload file → dedupe → save vào Codex pool.

## Cách thay đổi

### 1. Strip GPT Checker (code v0.5.0)
- Xóa `src/lib/gptChecker/` (parser, totp, worker, oauthBridge, queue,
  categorize).
- Xóa `src/app/api/gpt-checker/` (start, status, stop, imported).
- Xóa `src/app/(dashboard)/dashboard/gpt-checker/` (page + 3 components).
- `package.json`: drop `playwright-core ^1.59.1` + `otpauth ^9.5.0`.
  Bump version 0.5.0 → 0.5.1.
- `next.config.mjs`: drop `playwright-core` khỏi `serverExternalPackages`
  (chỉ còn `better-sqlite3`).

### 2. Thêm Bulk Import UI mới
- `src/app/(dashboard)/dashboard/bulk-import/page.js` — 2 tab:
  "Paste JSON" (textarea) và "Upload file" (drop zone .json), real-time
  parse preview "Detected X tokens" với plan badge + status pill (sẽ
  import / trùng / lỗi).
- `components/JsonInputTab.js` — textarea + parse error inline.
- `components/FileUploadTab.js` — kéo-thả + click chọn file, FileReader
  decode UTF-8 sang text rồi share state với JSON tab parser.
- `components/ImportPreviewTable.js` — decode `idToken` (atob client-side)
  để hiện plan, classify từng row (import / duplicate / invalid) trước
  khi gọi API. Dedupe preview dùng existing emails fetch từ
  `/api/providers`.
- `components/ImportResultModal.js` — hiển thị Total/Imported/Skipped/
  Failed + danh sách entry lỗi với reason label tiếng Việt.

### 3. API mới
- `POST /api/codex/bulk-import` — body `{tokens: [...]}`. Per-token:
  - validate email regex, accessToken JWT shape (3 phần), refreshToken
    non-empty string, idToken JWT + must contain `https://api.openai.com/auth`
    claim sau khi decode.
  - dedupe theo email (case-insensitive) so với `getProviderConnections()`
    + dedupe trong cùng batch.
  - decode `idToken` qua `extractCodexAccountInfo()` (reuse v0.4.2) để
    re-extract email/plan/workspace, merge với `providerSpecificData`
    user truyền vào.
  - save qua `createProviderConnection()` (reuse upsert logic — nếu acc
    cùng email đã tồn tại sẽ update, không tạo mới). `expiresAt` accept
    epoch ms hoặc ISO string.
  - return `{ok, total, imported, skipped, failed, details[]}`.

### 4. Sidebar nav
`src/shared/components/Sidebar.js` thay entry "GPT Checker" thành
"Bulk Import" (icon `upload_file`) trong systemItems sau "Proxy Pools".
Đánh dấu `// [9peak-fork] v0.5.1`.

### 5. INSTALL.md
Section "GPT Checker (optional)" → "Bulk Import (v0.5.1+)": giải thích
workflow tách 2 phase, format JSON spec, link sang `tools/collector/README.md`.
Risk warning về collector: automate login có thể trigger Cloudflare/
CAPTCHA, paid acc nên login tay rồi tự soạn JSON cùng schema.

## Format JSON tokens

Compatible giữa collector output và bulk-import API:

```json
[
  {
    "email": "alice@gmail.com",
    "accessToken": "eyJ...",
    "refreshToken": "rt_...",
    "idToken": "eyJ...",
    "expiresAt": 1735689600000,
    "providerSpecificData": {
      "chatgptAccountId": "...",
      "chatgptPlanType": "plus",
      "primaryWorkspace": { "id": "org-...", "title": "...", "role": "owner" }
    }
  }
]
```

Bắt buộc: `email`, `accessToken` (JWT), `refreshToken`, `idToken` (JWT có
OpenAI claim). Optional: `expiresAt` (epoch ms), `providerSpecificData`
(server tự decode `idToken` re-extract nếu thiếu).

## Files removed (14)
- `src/lib/gptChecker/{parser,totp,categorize,worker,oauthBridge,queue}.js`
- `src/app/api/gpt-checker/{start,status,stop,imported}/route.js`
- `src/app/(dashboard)/dashboard/gpt-checker/page.js`
- `src/app/(dashboard)/dashboard/gpt-checker/components/{InputArea,ProgressTable,ResultStats}.js`

## Files added (6)
- `src/app/api/codex/bulk-import/route.js`
- `src/app/(dashboard)/dashboard/bulk-import/page.js`
- `src/app/(dashboard)/dashboard/bulk-import/components/{JsonInputTab,FileUploadTab,ImportPreviewTable,ImportResultModal}.js`

## Files modified (4)
- `package.json` — version 0.5.0 → 0.5.1, drop deps playwright-core + otpauth.
- `next.config.mjs` — drop playwright-core khỏi serverExternalPackages.
- `src/shared/components/Sidebar.js` — replace GPT Checker entry với Bulk Import.
- `INSTALL.md` — replace section "GPT Checker" với "Bulk Import (v0.5.1+)".

## Backwards compat
- User đã import token v0.5.0 vẫn còn nguyên trong DB (connection schema
  không thay đổi). v0.5.1 không touch existing `providerConnections`.
- Endpoint `/api/codex/migrate-workspaces` (v0.4.4) vẫn dùng được để
  re-extract workspace cho acc cũ.

## ESLint
0 errors trên file mới + file sửa. Pre-existing error trong
`Sidebar.js:553` (`react/no-unescaped-entities` — apostrophe trong copy
"don't") vẫn out-of-scope.

---

# 9Peak v0.5.0 (2026-04-24) — GPT Checker MVP: bulk login + auto-import Codex

User có 16+ acc ChatGPT, mỗi acc OAuth thủ công ~1 phút → tốn 15+ phút
chỉ để add vào Codex pool. Lists acc đã có sẵn dạng
`email|password|2fa_secret_base32` (xuất từ 2fa.live), nhu cầu là
chạy bulk: paste list → headless Chromium tự login → tự chạy OAuth PKCE
→ tự lưu connection. Sau đó routing engine handle phần còn lại.

## Approach: Playwright + reuse OAuth core

### 1. Module mới `src/lib/gptChecker/`
- `parser.js` — split `email|password|totp_secret`, validate email regex,
  validate base32 cho field 3, return cả valid + invalid (để UI render
  dòng lỗi đỏ).
- `totp.js` — wrap `otpauth.TOTP` để generate 6-digit code từ raw base32
  secret. Pure helper, dùng cả từ worker.
- `categorize.js` — regex-based detection trên page bodyText + URL để
  phân loại: invalid_password, invalid_2fa, banned, captcha_required,
  phone_verification, timeout, chromium_missing, unknown_error.
- `worker.js` — `checkAccount(spec)`: launch headless Chromium qua
  `playwright-core`, navigate chatgpt.com/auth/login, fill email →
  password → optional TOTP → wait redirect → trigger Codex OAuth bridge
  → save vào DB qua `createProviderConnection` (reuse code v0.4.0).
  Lazy-import playwright-core để surface lỗi rõ ràng nếu user chưa
  `npx playwright install chromium`.
- `oauthBridge.js` — postLoginOAuth(page): build PKCE auth URL từ
  `CODEX_CONFIG`, navigate (ChatGPT auto-grant vì đã login), capture
  `?code=` qua `page.waitForURL` + `page.route(...)` mock localhost:1455
  callback (no real server), exchange code → tokens, decode id_token
  qua `extractCodexAccountInfo` (reuse v0.4.2).
- `queue.js` — `QueueManager` singleton (`globalThis.__9peak_gptCheckerQueue`),
  max 3 concurrent workers, random 8-20s delay giữa acc trên cùng worker
  (KHÔNG apply giữa workers khác). Job state in-memory only:
  `{jobId, accs:[{email, _password, _totpSecret, status, planType, error,
  tsStart, tsEnd, connectionId}], cancelled}`. Wipe `_password` +
  `_totpSecret` ngay sau khi acc đó done. GC stale jobs sau 30 phút.

### 2. API routes (4)
- `POST /api/gpt-checker/start` — body `{lines: string|string[]}` →
  parse + validate → enqueue → trả `{jobId, accepted, rejected}`.
- `GET /api/gpt-checker/status?jobId=xxx` — live snapshot, strip
  password/2FA fields trước khi serialize.
- `POST /api/gpt-checker/stop` — set `cancelled=true` (workers in-flight
  vẫn finish acc hiện tại, không bị kill giữa chừng để tránh leave
  browser process treo).
- `GET /api/gpt-checker/imported?jobId=xxx` — list connectionIds đã
  save (cho UI "View" link).

### 3. Dashboard UI mới `/dashboard/gpt-checker`
- `page.js` — 3-section layout: textarea bên trái (lg:col-span-2),
  ResultStats sidebar bên phải, ProgressTable bên dưới input.
  Polling 1.5s khi job running, auto-stop polling khi `finished=true`.
- `components/InputArea.js` — textarea 10 rows, real-time parse preview
  ("X acc hợp lệ · Y dòng lỗi"), red-bordered list of error lines
  (truncate ≤5 entries), Start button disabled khi 0 valid lines, amber
  warning callout về `npx playwright install chromium`.
- `components/ProgressTable.js` — table với cột # / Email / Status badge
  / Plan / Time elapsed / Actions. Status colors: pending=gray,
  running=blue+spinner, valid=emerald, invalid_*=red, banned=red-700,
  captcha=orange, timeout=yellow, unknown=rose. Plan column reuse
  `<PlanBadge>` (v0.4.0). Per-row "View" link → /dashboard/providers
  cho acc valid.
- `components/ResultStats.js` — stacked horizontal bar (no recharts để
  giảm bundle), 3 counters Valid/Failed/Pending, per-status legend.

### 4. Sidebar nav
`src/shared/components/Sidebar.js` thêm vào `systemItems` sau
"Proxy Pools": `{href:"/dashboard/gpt-checker", label:"GPT Checker",
icon:"verified"}`. Đánh dấu `// [9peak-fork] v0.5.0`.

### 5. Dependencies + INSTALL note
- Add `playwright-core ^1.55.0` + `otpauth ^9.4.1` vào dependencies.
  Chromium binary KHÔNG bundle (giữ tgz size nhỏ) — install on-demand
  qua `npx playwright install chromium`.
- INSTALL.md thêm section "GPT Checker (optional, v0.5.0+)" trước
  Attribution: hướng dẫn install Chromium + format input.
- Khi Playwright fail launch (Chromium chưa install), worker.js bắt
  exception "Executable doesn't exist" và return status `chromium_missing`
  với error message "Chromium binary missing. Run: npx playwright install
  chromium" → UI hiện badge xám "Chromium missing" thay vì silent crash.

## Files mới
- `src/lib/gptChecker/parser.js`
- `src/lib/gptChecker/totp.js`
- `src/lib/gptChecker/categorize.js`
- `src/lib/gptChecker/worker.js`
- `src/lib/gptChecker/oauthBridge.js`
- `src/lib/gptChecker/queue.js`
- `src/app/api/gpt-checker/start/route.js`
- `src/app/api/gpt-checker/status/route.js`
- `src/app/api/gpt-checker/stop/route.js`
- `src/app/api/gpt-checker/imported/route.js`
- `src/app/(dashboard)/dashboard/gpt-checker/page.js`
- `src/app/(dashboard)/dashboard/gpt-checker/components/InputArea.js`
- `src/app/(dashboard)/dashboard/gpt-checker/components/ProgressTable.js`
- `src/app/(dashboard)/dashboard/gpt-checker/components/ResultStats.js`

## Files sửa
- `src/shared/components/Sidebar.js` — thêm GPT Checker vào systemItems.
- `package.json` — version 0.4.5 → 0.5.0, deps `playwright-core` + `otpauth`.
- `INSTALL.md` — section "GPT Checker (optional)".

## Edge cases handled
- **No 2FA**: field 3 trống → worker skip TOTP step, bỏ qua waitFor 2FA
  selector (timeout 8s rồi continue).
- **CAPTCHA / press-and-hold**: regex match trong `categorize.js` →
  status `captcha_required` (UI orange badge).
- **Banned/suspended**: regex match "account has been suspended/banned/
  deactivated" → status `banned` (UI dark red badge).
- **Phone verification**: redirect đến phone verify form → detect qua
  bodyText "verify your phone" → status `phone_verification`.
- **Timeout 60s**: `NAV_TIMEOUT=60000` cho login, exception bubbled lên
  → status `timeout`.
- **Chromium chưa install**: launch fail với "Executable doesn't exist" →
  status `chromium_missing` + error message rõ ràng + UI badge xám
  "Chromium missing".
- **State mismatch (CSRF check)**: oauthBridge so sánh `state` query
  param với generated state → throw nếu khác.
- **Cancel mid-job**: `cancelled=true`, workers in-flight finish acc
  hiện tại rồi exit (không kill browser giữa chừng để tránh zombie
  process). Pending acc skip.
- **Free vs Paid**: KHÔNG filter — Free acc cũng add vào Codex pool
  (xác nhận với upstream behavior). Routing engine v0.4.0 Auto Mode
  treat Free là last-resort qua tier priority.
- **Re-running job giữa chừng**: `globalThis.__9peak_gptCheckerQueue`
  singleton survives Next dev hot-reload, GC tick xoá job >30 phút sau
  finish.

## Security
- Password + 2FA secret KHÔNG bao giờ chạm DB. Stored only on
  in-memory `acc._password` / `acc._totpSecret`, wiped to "" ngay khi
  worker xong acc đó. Status endpoint chỉ serialize `{idx, email, status,
  planType, error, tsStart, tsEnd, connectionId}` — không có _password
  / _totpSecret trong response.
- `state` PKCE param verified để chống CSRF callback injection.

## Cắt giảm scope
- KHÔNG run dev/build/deploy/pack — owner tự deploy.
- KHÔNG verify chạy thật end-to-end vì Playwright cần Chromium binary
  (~150MB download). Code structure verified qua ESLint + manual review.
- KHÔNG ship Chromium binary trong tgz để giữ size <10MB.

---

# 9Peak v0.4.5 (2026-04-25) — Owner-centric workspace + rename labels

User chạy 10 acc ChatGPT Business chia 2 farm (mỗi farm = 1 owner +
4 member). Khi 1 owner die → toàn bộ 5 acc trong farm đó liên đới
billing/quota, gọi API fail. UI v0.4.4 chỉ trigger cascade khi ≥50%
members down → owner die mà 4 member vẫn "healthy" (testStatus chưa
update) → cascade không nổ → user phải đoán farm nào die.

## Vấn đề
v0.4.3 ship cascade 2-tier (warning ≥50%, critical ≥80%) dựa trên
ratio members down. Nhưng Business semantic: 1 owner đại diện billing
cho cả workspace. Owner suspended/banned/expired → 4 member còn lại
chưa "down" theo testStatus nhưng API call thực tế sẽ fail. Triệu
chứng silent: dashboard xanh, prod đỏ.

Thêm nữa, JWT title nhiều khi generic ("Workspace", "ChatGPT
Workspace") hoặc trùng giữa 2 farm → user không phân biệt được
trong UI.

## Approach: severity tier mới + owner prominent + rename

### 1. `owner-down` cascade (priority cao nhất)
`detectCascade()` trong `src/lib/codexWorkspace.js`:
  - Nếu group có owner AND owner is down → trigger ngay, severity
    = `"owner-down"`, bất kể ratio members.
  - Severity rank mới: owner-down (0) > critical (1) > warning
    (2) > none (3). Workspace sort dùng rank này → farm chết
    owner luôn lên đầu danh sách.
  - Helper `getCascadeAtRiskMembers(group)` trả về members ngoài
    owner → UI dùng để overlay badge "at-risk · billing chung
    với owner".

### 2. Owner header prominent
`WorkspaceCard.js` render 1 dòng riêng dưới title:
  - 👑 icon amber-500 + text "Chủ farm: <email>" (text-base
    semibold, amber-600/400).
  - Status pill inline: ✓ active hoặc ❌ DOWN · <reason>
    (cooldown / expired / unavailable / disabled / error).
  - Click email → copy clipboard (dùng `<CopyableText>`).

Owner row tách lên đầu member list với highlight bg-amber-50/60
+ border-l-2 amber-500/60. Member rows không bị reorder trong DB
— chỉ visual ordering ở client.

### 3. At-risk badge cho member khi owner down
Khi cascade.severity === "owner-down":
  - Mỗi non-owner member row: thêm badge nhỏ "⚠️ at-risk ·
    billing chung với owner" (yellow-500/15).
  - Border-left soft yellow.
  - Tooltip giải thích nếu hover.
  - Owner row pop với amber border (no dim).
  - Card border ngoài: red-500/70 + glow shadow stronger hơn
    critical (vì owner-down nguy hiểm hơn ratio-based).

### 4. Local rename labels
User đặt nick "Farm 1" / "Farm 2" cho dễ phân biệt:
  - Header có button "✏️ rename" (hoặc "label" nếu chưa đặt).
  - Click → inline input → Enter save / Esc cancel / blur save.
  - Persist qua POST `/api/settings { codexWorkspaceLabels: {
    "<workspaceId>": "Farm 1" } }`.
  - Display: customLabel thay JWT title; JWT title hiện thành
    subtitle nhỏ "(workspace gốc: ...)" để admin vẫn biết origin.
  - Lưu trong `settings.codexWorkspaceLabels` (object map
    workspaceId → label, max 60 chars).
  - Validation server-side: regex `^[a-zA-Z0-9_-]+$` cho
    workspace ID hoặc sentinel `__individual__`/`__unassigned__`,
    value string max 60 chars, empty string = delete entry.

## Files sửa
- `src/lib/codexWorkspace.js` — `detectCascade()` mới owner-down
  tier, `getCascadeAtRiskMembers()` export mới, sort dùng
  severityRank. Đánh dấu `// [9peak-fork] v0.4.5`.
- `src/app/(dashboard)/dashboard/providers/[id]/components/WorkspaceCard.js`
  — owner header line, status pill, owner-down banner, at-risk
  member badge, rename inline input, custom label display +
  origin subtitle. Owner row reorder lên đầu (visual-only).
- `src/app/(dashboard)/dashboard/providers/[id]/page.js` — load
  `codexWorkspaceLabels` từ /api/settings, `handleRenameWorkspace()`
  callback, pass `customLabel` + `onRename` xuống WorkspaceCard.
- `src/lib/localDb.js` — default settings thêm
  `codexWorkspaceLabels: {}`. Migration safe: existing settings
  thiếu field → `ensureDbShape()` set `{}`, không crash.
- `src/app/api/settings/route.js` — PATCH whitelist accept
  `codexWorkspaceLabels` với `validateWorkspaceLabels()`: object
  validation, key format regex, value max 60 chars, empty string
  → omit (delete).
- `package.json`: version 0.4.5.

## Edge cases handled
- **No owner** (legacy workspace, Team plan không có owner role):
  cascade fallback về ratio-based (critical/warning) như cũ. Header
  bỏ qua owner block.
- **Multiple owners** (rare nhưng có thể): `group.owner` là member
  đầu tiên với role=owner. Nếu owner đó down → cascade owner-down
  trigger. ownerCount counter vẫn báo total.
- **Owner is also member** (1-acc workspace): orderedMembers
  dedupe — owner chỉ render 1 lần (filter id !== owner.id rồi
  prepend).
- **Personal / Unassigned groups**: rename button không render
  (`renameAllowed = false` cho `__individual__` / `__unassigned__`).
  Owner header cũng không render (no owner data).
- **Empty label**: trim → empty string → server omit khỏi map →
  fallback về JWT title.
- **Long label**: client maxLength=60, server `.slice(0, 60)`
  defensive.

## Backwards compat
- Existing user không có `codexWorkspaceLabels` field → default
  `{}` qua `ensureDbShape()`, UI fallback JWT title.
- Cascade severity `"warning"` / `"critical"` ratio-based vẫn
  trigger như v0.4.3 khi owner OK nhưng ≥50% members down.
- Provider khác (không phải codex) zero impact — `WorkspaceCard`
  chỉ render trong Codex grouped view.

## ESLint
0 errors trên file sửa. Pre-existing errors trong page.js
(`react-hooks/set-state-in-effect`) vẫn out-of-scope.

---

# 9Peak v0.4.4 (2026-04-24) — Migration helper Codex workspace (Phần 3)

Wire button "Re-fetch workspace info" trong tab providers/codex
để admin migrate các connection cũ (OAuth trước v0.4.2) một
phát ăn ngay, không phải re-OAuth từng acc.

## Vấn đề
v0.4.2 ship extract logic, v0.4.3 ship cascade UI, nhưng existing
user có ~10 acc Codex OAuth từ v0.3.x → tất cả vào "Unassigned"
group vì providerSpecificData.primaryWorkspace chưa có. Bắt user
re-OAuth 10 acc thủ công là UX tệ — và id_token gốc đã lưu sẵn
trong DB, decode lại được mà.

## Approach
- Endpoint `POST /api/codex/migrate-workspaces` chạy 1 lần khi
  admin click button.
- Helper `migrateAllCodexConnections()` (`src/lib/migrateCodexWorkspace.js`):
  loop mọi connection provider="codex" + authType="oauth", decode
  `idToken` qua `extractCodexAccountInfo()` (re-export từ v0.4.2),
  patch `providerSpecificData` qua `updateProviderConnection()`.
- Skip rule:
  - Đã có `primaryWorkspace` hoặc `organizations.length > 0` → skip.
  - Không có `idToken` → skip.
- Failed rule:
  - id_token decode được nhưng không chứa workspace info → failed
    (id_token cũ hơn ngày OpenAI ship `id_token_add_organizations`).
  - DB write lỗi → failed.
- Trả về `{ ok, migrated, skipped, failed, total, details }` với
  details là array per-connection để debug.

## UI
Button "Re-fetch workspace info" đã ship placeholder ở v0.4.2 trong
"Unassigned" group section. v0.4.4 wire endpoint thật + show:
  - Loading state ("Re-fetching...") khi đang chạy.
  - Disabled khi đang chạy (tránh double-click).
  - Alert summary với migrated / skipped / failed / total.
  - Auto refresh `fetchConnections()` sau khi xong → user thấy
    workspace mới hiện ra ngay.

## Auth
Endpoint không có verifyAuth() riêng — cùng pattern như mọi route
trong `/api/providers/*` (dashboard guard ở page level + same-origin
gate). Local-only enforce qua `dynamic = "force-dynamic"`.

## Files mới
- `src/lib/migrateCodexWorkspace.js` — `migrateAllCodexConnections()`.
- `src/app/api/codex/migrate-workspaces/route.js` — POST endpoint.

## Files sửa
- `src/app/(dashboard)/dashboard/providers/[id]/page.js` — wire
  button: state `migratingWorkspaces`, alert summary, disabled
  loading. Đánh dấu `// [9peak-fork]`.
- `package.json`: version 0.4.4.

## Backwards compat
- Mỗi connection đã migrated → skip lần sau (idempotent).
- Connection không có id_token → skip (chỉ đếm vào `skipped`,
  không fail).
- Khi mọi acc đã có workspace info → "Unassigned" group disappear,
  button không còn render. Migration chỉ hiện khi có việc.

## ESLint
0 errors trên file mới (`migrateCodexWorkspace.js`,
`migrate-workspaces/route.js`). 2 pre-existing errors trong page.js
vẫn out-of-scope.

---

# 9Peak v0.4.3 (2026-04-24) — Cascade alert (Phần 2 Workspace Grouping)

Hoàn thiện cascade-failure detection cho Codex workspace card:
khi >50% members trong 1 workspace down, banner đỏ/vàng theo
severity + dim các healthy members để admin thấy ngay nhóm acc
nào đang sập kéo theo.

## Vấn đề
v0.4.2 ship banner cơ bản nhưng không phân severity (50% và 90%
down hiện y như nhau) và không tạo visual emphasis trên các
member down — admin vẫn phải đọc từng row mới biết.

## Severity tiers
`detectCascade()` (`src/lib/codexWorkspace.js`, đã có từ v0.4.2):

  - 50-79% members down → **warning** (yellow)
  - ≥80% members down   → **critical** (red, shadow ring)
  - ≤50% hoặc <2 members → no cascade

Single-member group không trigger cascade — 1/1 down chỉ là lỗi
acc bình thường, không phải hiện tượng workspace-wide.

## UI v0.4.3
- Card border đổi màu theo severity (red glow cho critical,
  soft yellow cho warning).
- Banner ở đầu card 2 dòng:
  - Tiêu đề "Cascade failure (critical)" hoặc "Cascade warning"
    + counter "X/Y members (Z%) đang unavailable".
  - Hint action: kiểm tra Codex dashboard / reauth từng acc.
- Member rows: healthy members `opacity-70` (dim) khi cascade
  triggered, down members giữ full opacity → mắt nhìn ra ngay
  acc nào cần xử lý.
- Transition smooth (`transition-opacity`) để toggle group
  by workspace mượt.

## Files sửa
- `src/app/(dashboard)/dashboard/providers/[id]/components/WorkspaceCard.js`
  — `<CascadeBanner>` severity-aware, `<MemberRow>` dim prop,
  card border tier. Đánh dấu `// [9peak-fork]`.
- `package.json`: version 0.4.3.

## Không thay đổi
- `groupConnectionsByWorkspace()` + `detectCascade()` logic giữ
  nguyên từ v0.4.2 (đã ship đầy đủ severity field). v0.4.3 chỉ
  consume.
- Provider khác zero impact.

## ESLint
0 errors trên file sửa. Pre-existing errors trong page.js
(`react-hooks/set-state-in-effect`) vẫn out-of-scope.

---

# 9Peak v0.4.2 (2026-04-24) — Codex Workspace Grouping (Phần 1: extract + UI)

Group connections Codex theo workspace (org) trong tab
`/dashboard/providers/codex` để user thấy nhóm acc nào thuộc cùng
1 workspace Team/Business — tránh trường hợp owner die kéo theo
toàn bộ members mà mình không biết.

## Vấn đề
JWT từ Codex OAuth có sẵn field `organizations` (mỗi acc thuộc
1+ workspace, mỗi workspace có owner/admin/member). Code v0.4.1
chỉ extract `chatgpt_account_id` + `chatgpt_plan_type`, bỏ qua
toàn bộ workspace metadata. Hệ quả:

  - User add 5 acc Team từ workspace "Acme Corp" + 3 acc Pro
    cá nhân → tab Codex flat list, không phân biệt được nhóm
    nào với nhóm nào.
  - Owner Team workspace bị suspend → 4 members liên đới (cùng
    billing) tất cả die cùng lúc → user không biết tại sao 4 acc
    cùng lỗi 1 lần.

## Phase 1 (v0.4.2) — extract + UI grouping
- `extractCodexAccountInfo()` decode `organizations` array,
  pick `primaryWorkspace` (non-personal trước, role=owner trước).
  Save vào `providerSpecificData.{organizations, primaryWorkspace,
  chatgptUserId}`. Đánh dấu `// [9peak-fork]`.
- `mapTokens()` (mapping OAuth response → DB row) wire workspace
  data vào `providerSpecificData`.
- `backfillCodexEmails()` (run-once trên startup) extend để
  re-extract workspace info nếu acc cũ chưa có — backwards
  compat.
- `refreshCodexToken()` (open-sse) re-decode `id_token` mới nếu
  có (Codex thường không trả id_token khi refresh nên path này
  ít chạm); existing data preserved khi không có.

## UI grouping
- Tab `/dashboard/providers/codex` thêm toggle **"Group by
  workspace"** (default ON cho codex, không hiện cho provider
  khác).
- Khi ON, render workspace-grouped view thay flat list:
  1. Workspaces (non-personal) — sort: cascade-triggered đầu,
     rồi member count desc, rồi alphabetical.
  2. **Individual accounts** — gom mọi connections có
     `primaryWorkspace.personal === true` (mỗi user Plus/Pro
     có 1 personal org riêng, gom chung cho clean UI).
  3. **Unassigned** — connections chưa có workspace data
     (legacy OAuth pre-v0.4.2). Có button "Re-fetch workspace
     info" (placeholder; v0.4.4 sẽ wire endpoint thật).
- Mỗi workspace card hiện:
  - Tên workspace nổi bật (`text-base font-bold`).
  - Workspace ID nhỏ phía dưới, click-to-copy (monospace text).
  - PlanBadge (sync v0.4.0 PlanBadge component, color theo tier).
  - Counter "X owner · Y acc · Z healthy".
  - Per-member icon role: 👑 owner / 🛡️ admin / 👤 member.
  - Cooldown timer + status badge (qua `<ConnectionRow>` reuse).
- Khi OFF, fall back flat list nguyên xi (parity với v0.4.1).

## Cascade detection (sketch — v0.4.3 hoàn thiện)
`detectCascade(group)` — tính ratio members down (status !== active
hoặc có active modelLock). Trigger khi `>50% AND ≥2 members`.
v0.4.2 ship banner cơ bản; v0.4.3 thêm severity tiers
(warning 50-79% / critical ≥80%) + dim healthy members.

## Files mới
- `src/lib/codexWorkspace.js` — `groupConnectionsByWorkspace()`,
  `detectCascade()`, `isConnectionDown()`, `SPECIAL_GROUP_IDS`.
- `src/app/(dashboard)/dashboard/providers/[id]/components/WorkspaceCard.js`
  — card UI + cascade banner + member rows (qua ConnectionRow).

## Files sửa
- `src/lib/oauth/providers.js` — `extractCodexAccountInfo()`
  + `mapTokens()` codex + `backfillCodexEmails()`. Đánh dấu
  `// [9peak-fork]`.
- `open-sse/services/tokenRefresh.js` — `refreshCodexToken()`
  re-extract workspace nếu refresh trả id_token mới.
- `src/app/(dashboard)/dashboard/providers/[id]/page.js` —
  toggle "Group by workspace" (default ON cho codex) + render
  workspace-grouped view qua `<WorkspaceCard>`.
- `package.json`: version 0.4.2.

## Backwards compat
- Existing connections không có workspace data → render trong
  "Unassigned" group, KHÔNG crash. Owner re-fetch qua button
  v0.4.4 hoặc next OAuth re-add.
- Provider khác (claude/kiro/...) zero impact — toggle chỉ hiện
  cho codex.
- `extractCodexAccountInfo()` return shape thêm field; existing
  callers (chỉ đọc `chatgptAccountId`/`chatgptPlanType`) không
  bị break.

## ESLint
0 errors trên các file mới + các file sửa do v0.4.2. 2 pre-existing
errors trong page.js (`react-hooks/set-state-in-effect` line 243
+ 405) không phải do v0.4.2 — bug cũ từ trước, out-of-scope cho
commit này.

---

# 9Peak v0.4.1 (2026-04-25) — Preset Modes + Routing Strategy page

Smart Routing v2 — phần 2/2 (preset bundles + dedicated dashboard).

## Tại sao
v0.4.0 ship Auto Mode (zero-config) nhưng power user vẫn cần
control sâu hơn — chọn 1 strategy cụ thể, hoặc 1 bundle config
nhanh không cần đọc 4 strategy descriptions. v0.4.1 thêm:

  1. 4 named preset modes (Spread / Speed / Quota / Fill-First).
  2. Dedicated page `/dashboard/routing-strategy` với 3 tabs
     (Auto / Preset / Advanced) — gom tất cả routing controls
     vào 1 chỗ thay vì rải trong Settings.
  3. Sidebar nav entry "Routing Strategy" (icon `tune`) ngay sau
     "Routing Monitor" — discoverable cho user mới.

## 4 Presets
Mỗi preset là 1 bundle settings áp dụng 1-click qua POST
`/api/settings/preset`. Click preset → confirm modal (giải thích
chi tiết) → apply → switch `routingMode = "preset"` +
`routingPreset = "<key>"`.

  - 🌊 **Spread evenly**     → fallback=round-robin, sticky=2
    Luân phiên đều mọi acc — tránh burn 1 acc.
  - ⚡ **Speed first**        → fallback=least-connections
    Pick acc ít load nhất — score weighted theo active+rt+recency.
  - 💰 **Maximize quota**    → fallback=openai-business
    Quota-aware cho Codex Pro/Business.
  - 🎯 **Use one then next** → fallback=fill-first
    Cạn 1 acc trước rồi chuyển — tiết kiệm quota từng acc.

## Page UX
3 tabs (segmented control style):

  - **Auto** — Auto Mode toggle + bản đồ rotation hiện tại
    (group by tier với PlanBadge + acc list + strategy label).
  - **Preset** — grid 4 preset cards. Card hiện tại được highlight
    "Đang dùng". Click → confirm modal → POST → settings refresh.
  - **Advanced** — radio list 4 strategies + sticky slider (chỉ
    hiện khi round-robin chọn) + pointer "vào trang provider để
    override per-provider".

Chuyển tab nào tự động dựa vào `routingMode` hiện tại
(auto → tab Auto, preset → tab Preset, custom → tab Advanced).

Mọi tab đều warn rõ khi chuyển: bật Auto thì các strategy thủ
công bị disable; chọn preset thì Auto bị tắt; sửa Advanced thì
preset bị bỏ.

## Profile page
Card "Auto Routing" trong Settings giữ nguyên (toggle + tier
preview), button "Mở Advanced Settings" giờ navigate sang
`/dashboard/routing-strategy` thay vì cuộn xuống section trong
trang Settings. Section "Routing Strategy (Advanced)" cũ giữ
làm fallback cho user habit — sửa ở đó vẫn work.

## Files mới
- `src/sse/services/presets.js` — `PRESETS`, `PRESET_KEYS`,
  `getPreset()`. 4 preset definitions với description ngắn +
  long description (cho confirm modal).
- `src/app/api/settings/preset/route.js` — `POST` apply preset,
  `GET` list available presets.
- `src/app/(dashboard)/dashboard/routing-strategy/page.js` — page
  chính 3-tab.
- `src/app/(dashboard)/dashboard/routing-strategy/components/AutoTab.js`
  — Auto Mode UI lifted từ profile (toggle + tier groups).
- `src/app/(dashboard)/dashboard/routing-strategy/components/PresetTab.js`
  — grid 4 preset cards + ConfirmModal.
- `src/app/(dashboard)/dashboard/routing-strategy/components/AdvancedTab.js`
  — radio list 4 strategies + sticky slider + per-provider pointer.

## Files sửa
- `src/shared/components/Sidebar.js` — thêm nav entry "Routing
  Strategy" sau "Routing Monitor" (icon `tune`). Đánh dấu
  `// [9peak-fork]`.
- `src/app/(dashboard)/dashboard/profile/page.js` — button
  "Mở Advanced Settings" navigate sang trang mới.
- `package.json`: version 0.4.1.

## Không đụng
- Routing engine (`src/sse/services/auth.js`) — không thay đổi
  từ v0.4.0. Preset chỉ ghi `fallbackStrategy` vào settings,
  engine đọc nguyên vẹn.
- Migration logic — vẫn như v0.4.0.

## ESLint
0 errors trên các file mới. Pre-existing error trong Sidebar.js
(unescaped `'` line 550) không phải do v0.4.1 — bug cũ từ trước,
out-of-scope cho commit này.

---

# 9Peak v0.4.0 (2026-04-25) — Auto Routing (smart per-plan rotation)

Smart Routing v2 — phần đầu (core engine + Auto Mode toggle).

## Vấn đề
9Peak đang có 4 strategies routing (`fill-first`, `round-robin`,
`least-connections`, `openai-business`) nhưng UI chỉ expose 2 cái
qua một toggle "Round Robin" trong Settings. Community user
(90% xài ChatGPT Plus, một số ít Pro/Business) không có cách
trực quan để chọn strategy phù hợp với plan của mình.

Plan tier metadata đã có sẵn (field `chatgptPlanType` lưu trong
`providerSpecificData` từ v0.2.2) nhưng chưa được ghép với routing
engine.

## Auto Mode — zero-config, smart per-plan
Group connections Codex theo plan tier, đi từ tier cao nhất xuống
thấp nhất:

  pro > business > enterprise > team > plus > go > free > other

Tier nào có ≥1 acc available → break + pick từ tier đó dùng strategy
khớp với tier:

  - pro/business/enterprise/team → fill-first (vắt 1 acc trước,
    chỉ chuyển khi rate-limit; tận dụng quota cao của tier).
  - plus/go                      → round-robin sticky=2 (rải đều
    để tránh burn 1 acc — quota Plus thấp hơn nhiều).
  - free                         → round-robin (last resort, chỉ
    chạm khi mọi tier paid đều unavailable).
  - other/null                   → round-robin (acc chưa biết plan
    được treat như Plus mặc định).

Free tier thật sự là last-resort, không lẫn vào pool tier paid.
Pro user không bao giờ bị rotate sang Free vô nghĩa.

## Migration — không phá người cũ
Existing user (DB đã có settings keys như `requireLogin`,
`fallbackStrategy`...) → `routingMode = "custom"` (giữ hành vi
v0.3.x: dùng `fallbackStrategy` cũ).
Fresh install (DB lần đầu khởi tạo) → `routingMode = "auto"`
(community-friendly, không cần config gì để work tốt).

Logic detect upgrade nằm trong `ensureDbShape()`
(`src/lib/localDb.js`): nếu settings object đã có ít nhất 1 key
v0.3.x-era → coi là upgrade → force `"custom"`.

## Files mới
- `src/sse/services/planTier.js` — `normalizePlanTier()`,
  `TIER_PRIORITY`, `TIER_STRATEGY`, `TIER_STICKY_LIMIT`.
- `src/sse/services/autoRouting.js` — `selectAuto()` core picker
  + `summarizeAutoPlan()` for UI preview.
- `src/shared/components/PlanBadge.js` — reusable badge,
  color coding sync với AccountsTab v0.2.2 (purple cho
  business/team, fuchsia cho enterprise, blue cho pro/plus,
  gray cho go/free, gray nhạt cho other).

## Files sửa
- `src/sse/services/auth.js` — thêm hook `selectAuto()` vào
  `getProviderCredentials()` trước khối 4-strategy hiện tại.
  Khi `routingMode === "auto"` → Auto Mode pick; nếu Auto trả
  null (defensive) hoặc mode === "custom" → fall through nhánh
  cũ. Đánh dấu `// [9peak-fork]`.
- `src/lib/localDb.js` — thêm 4 default settings: `routingMode`,
  `routingPreset`, `perAccountOverrides`,
  `welcomeWizardCompletedAt`. Migration logic phân biệt
  upgrade vs fresh-install.
- `src/app/(dashboard)/dashboard/profile/page.js` — Card
  "Auto Routing" mới ở đầu trang với toggle ON/OFF, list các
  tier groups (badge + acc count + strategy), button "Mở
  Advanced Settings" cuộn xuống section cũ. Section
  fallbackStrategy cũ đổi tên thành "Routing Strategy
  (Advanced)" + có warning khi Auto Mode đang BẬT.
- `src/shared/components/index.js` — export PlanBadge.

## Không thay đổi (giữ nguyên cho v0.4.1)
- Settings page chưa có dedicated "Routing Strategy" page —
  v0.4.1 sẽ thêm `/dashboard/routing-strategy` với 3 tabs
  (Auto / Preset / Advanced) + 4 preset modes (Spread / Speed
  / Quota / Fill-First).
- Sidebar chưa thêm nav entry mới — v0.4.1.

## Scope
- src/sse/services/planTier.js (mới)
- src/sse/services/autoRouting.js (mới)
- src/shared/components/PlanBadge.js (mới)
- src/sse/services/auth.js (Auto Mode hook)
- src/lib/localDb.js (default + migration)
- src/app/(dashboard)/dashboard/profile/page.js (UI card)
- src/shared/components/index.js (export PlanBadge)
- package.json: version 0.4.0

---

# 9Peak v0.3.9 (2026-04-25) — Fix MITM "Cannot find module './logger'"

User cài v0.3.8 thành công, dashboard chạy. Click MITM Start →

  Error: Cannot find module './logger'
  Require stack:
   - C:\Users\duyth\AppData\Roaming\9router\runtime\mitm\server.js

Hai bug riêng biệt cùng manifest chung lỗi này:

## Bug 1: standalone build chỉ bao gồm `server.js`, không có siblings
Next.js outputFileTracing scan static imports nhưng MITM server.js
được spawn DYNAMIC qua child_process (không phải import statement).
Tracer chỉ catch được `server.js` → bundle thiếu `logger.js`,
`paths.js`, `config.js`, `dns/dnsConfig.js`, `cert/*`, `handlers/*`.
Khi MITM start → `require('./logger')` → MODULE_NOT_FOUND.

Fix: thêm `outputFileTracingIncludes` vào next.config.mjs:
```js
outputFileTracingIncludes: {
  "*": ["./src/mitm/**/*"],
}
```
Force Next bao gồm toàn bộ src/mitm tree vào standalone bundle.

Verify sau build: standalone giờ có đủ 14 file (server, manager,
logger, paths, config, dns/dnsConfig, cert/{generate,install,rootCA},
handlers/{base,copilot,cursor,kiro,antigravity}).

## Bug 2: manager.js copy server.js sai location runtime
`ensureRuntimeServer()` copy `server.js` từ install dir vào
`%APPDATA%\9router\runtime\mitm\server.js` để tránh EBUSY khi
update package. Logic cũ:
```js
if (!bundledPath.includes('/node_modules/')) return bundledPath;
// else copy
```
Giả định: file trong node_modules là bundled (self-contained, no
sibling requires). Sai cho 9peak vì ta ship raw source (server.js
vẫn `require('./logger')`). Copy đơn lẻ → siblings vắng → MODULE_NOT_FOUND.

Fix detection: check sibling files thực tế thay vì heuristic path.
```js
const hasSiblings =
  fs.existsSync(path.join(dir, "logger.js")) ||
  fs.existsSync(path.join(dir, "paths.js")) ||
  fs.existsSync(path.join(dir, "dns"));
if (hasSiblings) return bundledPath;  // run from source location
```

Giờ MITM run from `<install>/.next/standalone/src/mitm/server.js` —
chỗ siblings đầy đủ — không copy lung tung.

## Verified
- find .next/standalone/src/mitm: 14 files OK (was 1)
- find .next/standalone -name "*.node": 0 files (cross-platform OK)
- npm pack: 9peak-0.3.9.tgz 10 MB, 3704 files

## Scope
- src/mitm/manager.js: ensureRuntimeServer detection logic
- next.config.mjs: outputFileTracingIncludes for src/mitm/**
- package.json: version 0.3.9
- standalone/package.json: version sync 0.3.9

---

# 9Peak v0.3.8 (2026-04-25) — Ship prebuilt standalone (no Windows build needed)

User test v0.3.7 trên Windows lại fail với JSX parse error:
  Module parse failed: Unexpected token (34:4) trong CooldownTimer.js
  cùng lúc 5+ files khác (ModelRow, BasicChatPage, cli-tools/page,
  console-log/page, etc.)

Root cause: Next SWC native binary `@next/swc-win32-x64-msvc` không
cài đầy đủ vì user dùng `--force` flag khi install (do conflict 9router
cũ cài trước). `--force` bypass optional deps install. Trên Linux dev
em chưa từng gặp nên không catch ra.

Sau 4 lần iterate fix per-issue (NODE_ENV, prop-types, path alias,
SWC binary), em chuyển sang **ship prebuilt standalone** trong tgz.
Bypass hoàn toàn build pipeline trên user PC.

## How
1. Build production trên Linux dev em (next build --webpack +
   postbuild copy assets).
2. Strip Linux-only native binaries từ standalone:
   - `@img/sharp-linux-x64/...node` (Next image opt — không dùng vì
     `images: { unoptimized: true }`)
   - `better-sqlite3/build/...node` (optional dep, code fallback
     sang sql.js pure JS)
3. Add `.next/standalone/` + `.next/static/` vào `files` field
   package.json để bao gồm trong `npm pack`.
4. Update `.next/standalone/package.json` version 0.3.8.
5. `npm pack` → 9peak-0.3.8.tgz (10 MB compressed, 3691 files).

## Flow user
1. `npm install -g 9peak-0.3.8.tgz` — npm extract tgz, cài deps
   từ package.json (vẫn cần để compatibility), không build.
2. `9peak` — `bin/9peak.mjs` `checkBuild()` thấy `.next/standalone/
   server.js` đã tồn tại → skip build → start ngay.
3. Server start trong < 5 giây, no Windows build issues.

## Verified
- `PORT=20129 node .next/standalone/server.js` trên Linux:
  GET /api/version trả `currentVersion=0.3.8` OK.
- `find .next/standalone -name "*.node"`: 0 binaries (cross-platform).
- tgz size: 10 MB (so với 1.4 MB code-only). Trade-off chấp nhận
  được — bypass mọi build issue trên user platform.

## Trade-offs
- tgz lớn hơn (10 MB vs 1.4 MB) — vẫn nhỏ so với download Next 16 deps.
- Build pinned tại packaging time. User không customize build options
  được. Để custom: clone repo từ source.
- node_modules duplicate (standalone/node_modules + install/node_modules).
  Wasteful nhưng hoạt động.

## Scope
- package.json: files thêm .next/standalone/ + .next/static/
- .next/standalone/package.json: version sync 0.3.8
- Strip linux-x64 native binaries trước pack

## Không thay đổi
- next.config.mjs (giữ webpack alias từ v0.3.7).
- Source code các trang/components.
- bin/9peak.mjs (đã có sẵn checkBuild detect standalone).

---

# 9Peak v0.3.7 (2026-04-25) — Explicit webpack alias for Windows

User cài v0.3.6 trên Windows, build fail (sau khi prop-types đã fix):
  Module not found: Can't resolve '@/shared/components'
  Module not found: Can't resolve '@/shared/hooks/useCopyToClipboard'
  Module not found: Can't resolve '@/shared/constants/providers'
  ... tương tự cho 4-5 path alias `@/shared/*`

Root cause: `jsconfig.json` path aliases (`@/*` → `./src/*`) hoạt động
ngon trên Linux/Mac (dev của em) nhưng Windows + Next 16 + webpack có
quirk resolution. Có thể do path separator (\\ vs /) hoặc cách Next
load jsconfig.json khi cwd là `%APPDATA%\npm\node_modules\9peak\`.

## Fix — bulletproof
Thay vì rely vào jsconfig.json, declare explicit webpack alias
trong `next.config.mjs`:

```js
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

webpack: (config) => {
  config.resolve.alias = {
    ...(config.resolve.alias || {}),
    "@": path.resolve(__dirname, "src"),
    "open-sse": path.resolve(__dirname, "open-sse"),
  };
  return config;
}
```

Webpack alias ưu tiên hơn jsconfig.json và chạy identical trên mọi
OS/node version. `path.resolve(__dirname, "src")` dùng native path
separator tự động (Windows: C:\...\src, Linux: /.../src).

## Verified
- Test build trên Linux với alias mới: ✓ vẫn pass
- `npm pack`: 9peak-0.3.7.tgz (1.4 MB, 593 files)

## Scope
- next.config.mjs: thêm import path + webpack.resolve.alias
- package.json: version 0.3.7
- jsconfig.json: giữ nguyên (IDE autocomplete vẫn dùng)

---

# 9Peak v0.3.6 (2026-04-25) — Fix missing `prop-types` dep

User cài v0.3.5 trên Windows, build fail:

  Module not found: Can't resolve 'prop-types'
  ./src/app/(dashboard)/dashboard/image-gen/components/DetailModal.js

Kéo theo barrel import `@/shared/components` fail (vì Sidebar.js import
prop-types) → 4-5 error module-not-found cascade.

Root cause: package `prop-types` được 10+ components import static
nhưng KHÔNG có trong package.json dependencies. Trên Linux dev, npm
transitively pull prop-types qua `@xyflow/react` (hay lib khác) nên
build OK. Trên Windows fresh install, transitive path không trigger
→ prop-types vắng → build fail.

## Fix
- Add `prop-types@^15.8.1` vào `dependencies`.
- Audit các package import khác (chalk, chalk-animation, figlet,
  gradient-string) — chỉ dùng trong `src/lib/oauth/utils/banner.js`
  mà file này KHÔNG được import ở đâu trong app → orphan file,
  Next.js tree-shake → không cần add.

## Verified
- `npm install` trên dev: node_modules/prop-types@15.8.1 ✓
- `npm pack`: 9peak-0.3.6.tgz (1.4 MB, 593 files)

## Scope
- package.json: thêm prop-types dependency + version 0.3.6.

---

# 9Peak v0.3.5 (2026-04-25) — Fix Windows build: inline NODE_ENV syntax

User cài v0.3.4 trên Windows, `9peak` trigger `npm run build` → fail:

  'NODE_ENV' is not recognized as an internal or external command

Root cause: scripts dùng inline env syntax Unix-only:
  "build": "NODE_ENV=production next build --webpack"

Windows cmd.exe parse "NODE_ENV=production" như command name, không
phải env var. Fix cross-platform standard: prefix `cross-env`.

## Changes
- Add `cross-env` vào `dependencies` (7M weekly downloads, standard
  fix cho vấn đề này trong Node ecosystem).
- Update 4 scripts trong package.json:
  * build: cross-env NODE_ENV=production next build --webpack
  * start: cross-env NODE_ENV=production next start
  * build:bun: cross-env NODE_ENV=production bun --bun next build
  * start:bun: cross-env NODE_ENV=production bun ./.next/standalone/server.js
- Repack: 9peak-0.3.5.tgz (1.4 MB, 593 files).

## Verified
Test local repack OK. Flow Windows giờ:
1. `npm install -g .\9peak-0.3.5.tgz` — cross-env vào node_modules
2. `9peak` → bin/9peak.mjs gọi `npm run build`
3. npm script: `cross-env NODE_ENV=production next build --webpack`
4. cross-env parse NODE_ENV, spawn `next build --webpack` với env đúng
5. Build thành công trên Windows (cũng vẫn OK trên Linux/Mac).

---

# 9Peak v0.3.4 (2026-04-25) — Đóng gói 9peak-*.tgz cài được như 9router

User: "Đóng gói để bản 9Peak có thể cài đặt gọn như 9router. E đóng gói
a sẽ test ngay trên pc cá nhân."

Bản 9router gốc cài bằng `npm install -g 9router` rồi chạy `9router`.
9Peak phải đạt cùng UX: cài 1 lệnh, gõ 1 từ, dashboard chạy.

## Package.json changes
- **Move build-time deps `dependencies`**: `tailwindcss`, `postcss`,
  `@tailwindcss/postcss`. Trước đây ở devDependencies — khi `npm i -g`
  chỉ cài deps, không cài devDeps → build fail ở máy người dùng.
  Giờ move qua deps để global install build được.
- **engines.node**: `>=20.0.0` (Next.js 16 requirement, cảnh báo sớm).
- **files list** mở rộng: thêm `docs/`, `eslint.config.mjs`, `LICENSE`,
  `NOTICE.md`, `README.md`, `CHANGELOG.md`, `INSTALL.md`, `package.json`,
  `next.config.mjs`, `postcss.config.mjs`, `jsconfig.json`
- `bin` vẫn 3 aliases: `9peak`, `9router`, `tcheat-cli` → drop-in.

## INSTALL.md viết lại (tiếng Việt)
Hướng dẫn 3 cách cài:
1. **Từ .tgz** (khuyến nghị test PC cá nhân):
   ```
   npm config set prefix '~/.npm-global'       # tránh sudo
   npm install -g ./9peak-0.3.4.tgz
   9peak
   ```
2. **Clone repo + build** (dev setup).
3. **Docker** (via start.sh).

+ Env vars, systemd service template, troubleshooting section, update
workflow (git fetch upstream + cherry-pick).

## Test package: `npm pack` tạo `9peak-0.3.4.tgz`
- Size: 1.4 MB (593 files)
- Gồm: bin/, src/, open-sse/, scripts/, public/, i18n/, cloud/,
  docs/, LICENSE, NOTICE.md, README.md, INSTALL.md, CHANGELOG.md,
  package.json, next.config.mjs, postcss.config.mjs, jsconfig.json
- Không gồm: node_modules, .next, *.tgz cũ

## Flow lần đầu user chạy
1. User tải tgz (từ GitHub release hoặc SCP/USB).
2. `npm install -g ./9peak-0.3.4.tgz` — npm extract + cài deps (~5 min
   lần đầu tùy máy).
3. User gõ `9peak` — `bin/9peak.mjs` check:
   - `node_modules/` tồn tại? (có, npm install đã làm)
   - `.next/standalone/` tồn tại? (không, chưa build)
   - → auto chạy `npm run build` → postbuild copy assets → start
     standalone server port 20128
4. Browser tự mở (trừ khi --no-open).
5. Lần chạy sau: skip build, start ngay.

## Không thay đổi
- Routing/SSE/OAuth/MITM/provider, image-gen API, UI palette.
- Fork attribution chain (LICENSE, NOTICE.md, README credit).

---

# 9Peak v0.3.3 (2026-04-25) — Fix history tab không update + auto-poll 30s

User: "history đã lấy ảnh liên tục từ chat chưa em? Vì sáng a có test
vài ảnh nửa mà reload hiện tại không thấy thiết kế đó". Bug xác nhận:
file history `1777083424.json` đã tồn tại (gen sáng nay lúc 09:17 VN
time) nhưng dashboard không show sau reload.

## Root cause
2 tầng cache ngăn data mới đến UI:
1. **Next.js route cache**: `/api/image-gen/history` + `/stats` + `/gold`
   không khai báo `dynamic = "force-dynamic"` và không trả header
   `Cache-Control: no-store` → Next mặc định cache response ở edge hay
   server-side, phục vụ bản cũ cho request reload.
2. **Browser cache**: không có query-string bust, browser có thể dùng
   304 Not Modified hoặc disk cache từ session trước.

## Fix
### Server side (3 route files)
- `src/app/api/image-gen/history/route.js`
- `src/app/api/image-gen/stats/route.js`
- `src/app/api/image-gen/gold/route.js`

Mỗi route thêm:
```js
export const dynamic = "force-dynamic";
export const revalidate = 0;
```
Và trả header:
```
Cache-Control: no-store, no-cache, must-revalidate, max-age=0
Pragma: no-cache
```
Áp dụng cho cả success response và error response.

### Client side (`image-gen/page.js`)
1. **Cache-busting query string**: `/api/image-gen/history?_=${Date.now()}`
   để browser không reuse disk cache.
2. **Auto-poll 30s**: khi tab History active và document visible, fetch
   lại mỗi 30s → ảnh mới từ Telegram bot xuất hiện tự động không cần
   bấm Refresh. Pause khi tab ẩn (document.hidden) để tiết kiệm.
3. **Silent mode**: polling không hiện skeleton (tránh flicker UI);
   chỉ manual Refresh mới reset skeleton.
4. **Visibility event**: khi user quay lại tab (đổi browser tab rồi
   quay lại), fetch ngay không chờ 30s.
5. **UI indicator**: góc trên phải history tab hiện
   "Auto-refresh 30s · N gens" với hover tooltip last-refresh time.

## Verify
- curl `http://localhost:20128/api/image-gen/history` có header
  `Cache-Control: no-store` ✓
- Dashboard history tab tự reload mỗi 30s khi mở
- Ảnh mới gen qua Telegram bot hiện trong < 30s mà không cần reload

---

# 9Peak v0.3.2 (2026-04-25) — Indochine Jade palette + fix "CSS lỗi" triệt để

Hai mục tiêu trong 1 release:

## 1. Fix "CSS lỗi" triệt để (share cho người khác cài không còn breakage)

**Root cause:** Next.js standalone build (`output: 'standalone'`) emit
`.next/standalone/server.js` self-contained, NHƯNG static assets ở
`.next/static/` và `public/` **KHÔNG tự copy vào standalone**. Mỗi lần
build mà quên bước `cp -r` là CSS/JS chunks 404, dashboard render
trắng. Bug này hay gặp vì phải gõ 3 lệnh tay sau mỗi build — dễ miss.

### Files mới
- `scripts/copy-standalone-assets.js` — Node script cross-platform
  (fs.cpSync, chạy được trên Windows), auto wipe + copy
  `.next/static` + `public` → `.next/standalone/`. Rẻ, idempotent.
- `scripts/deploy.sh` — atomic deploy cho host systemd: build (postbuild
  auto-copy) → verify standalone files tồn tại → restart service →
  curl /api/version khớp version → curl random static chunk trả 200.
  Bất kỳ step nào fail thì abort với message rõ ràng, không để lại
  half-deployed state.

### Thay đổi
- `package.json`:
  - Thêm `"postbuild": "node scripts/copy-standalone-assets.js"`.
    npm tự chạy sau `npm run build` (lifecycle hook) — không ai phải
    nhớ chạy thủ công nữa.
  - Thêm script shortcut `"deploy": "bash scripts/deploy.sh"`.
- `bin/9peak.mjs`: đổi build function từ `npx next build --webpack` →
  `npm run build` để postbuild fire. End-users cài `npm i -g 9peak`
  rồi chạy `9peak` lần đầu sẽ auto build + copy assets đầy đủ. Thêm
  post-build guard: nếu standalone/static hoặc standalone/public
  không tồn tại sau build → exit code 1 với gợi ý fix.
- `CLAUDE.md`: document workflow mới, dặn rõ không gõ lệnh thủ công.

### Tại sao không lỗi nữa
- End user cài `npm i -g 9peak` → `9peak` chạy → `npm run build` →
  postbuild auto copy → dashboard hoạt động 100%.
- Local dev: `npm run deploy` 1 lệnh xong, có verify step trước khi
  báo success.
- Nếu postbuild fail (vd permission), script báo ngay với HTTP check
  cuối cùng trước khi report OK.

## 2. UI redesign "Indochine Jade & Antique Brass"

Áp palette từ frontend-design skill — **di sản trang trí nội thất
VN** (ngói men, sơn mài, đồng thau cổ, giấy dó). Thay hoàn toàn tone
warm-coral của v0.3.0 bằng cool jade — đối cực hue với 9Router,
impossible to confuse.

### Palette
- **Primary**: Deep Jade `#1B4F42` (ngói men Long Sơn / sơn mài
  truyền thống). Hover `#133B31`, light `#3E7A6B`, dark `#0C2A23`.
- **Accent**: Antique Brass `#B8925F` (đồng thau cửa đình, không
  vàng champagne mà nâu đồng ấm). Hover `#9A7947`, light `#D4B080`.
- **Light bg**: Bone Ivory `#F4F1E8` (giấy dó silk paper).
- **Dark bg**: Midnight Jade `#0A1612` (sơn then — đen xanh lacquer,
  không charcoal/brown).
- **Text dark**: `#1C2420` forest black (not pure black).
- **Text ivory**: `#E8E3D4` (warm ivory cho dark theme).

### Logo refinement
- Khung icon: dual-gradient jade core `#2E6556 → #1B4F42 → #0C2A23`
  + brass inner-shine overlay `#B8925F/30`.
- Ring: brass `#B8925F/35` hover `/70`.
- "9" gradient: white → ivory `#E8E3D4` (không còn white → cream).
- Pixel grid: brass `#D4B080` với 4 stops opacity rotation.

### Wordmark "9Peak"
- "9": gradient jade `#1B4F42 → #3E7A6B → #1B4F42` (trong light mode),
  `.dark` override sang lighter stops `#3E7A6B → #6FA79A → #3E7A6B`
  cho readable trên sơn then.
- "Pix": gradient brass `#B8925F → #D4B080 → #9A7947`.

### Sidebar + shadows
- Top accent line: brass (thay champagne gold cũ).
- Section header "SYSTEM"/"DEBUG": brass uppercase tracked.
- Active nav ring: outer jade `rgba(27, 79, 66, 0.25)` + inner brass
  `rgba(184, 146, 95, 0.35)` (reversed từ v0.3.0 — giờ jade chiếm
  ngoài để hợp với primary).
- Mesh gradient bg-sidebar-premium: brass blush top-left + jade blush
  bottom-right trên bone ivory base (light) hoặc midnight jade (dark).
- border-glow keyframe animation: update từ coral sang jade pulse.
- Scrollbar thumb: brass-tinted thay grey.

### CSS utilities mới
- `.animate-brass-shimmer` — 4s background-position shimmer cho
  premium accents sau này (chưa dùng, đã sẵn).
- `.dark .text-gradient-primary` override với lighter jade stops.

### StatsTab PIE_COLORS
Thay palette chart distribution bằng on-brand: jade → brass → jade
light → brass light → ... Chart phòng/style giờ consistent với theme.

### Tại sao Jade + Brass, không Navy (theo yêu cầu trước)
Navy hợp với "blue/ocean" user nói, nhưng navy + gold hơi generic
yacht/corporate. Jade + brass là lựa chọn distinctive hơn cho một
designer nội thất VN — màu sơn mài + đồng thau cổ là vật liệu truyền
thống user làm hàng ngày. Rooted, premium, không "AI slop".

(Navy attempt đã stash trong git, recover bằng `git stash list` +
`git stash pop` nếu muốn quay lại sau.)

## Scope
File touched:
- `scripts/copy-standalone-assets.js` (new)
- `scripts/deploy.sh` (new)
- `package.json` — postbuild hook, deploy script, version 0.3.2
- `bin/9peak.mjs` — build uses `npm run build` + asset presence guard
- `CLAUDE.md` — document deploy workflow
- `src/app/globals.css` — full palette + shadows + gradients + utilities
- `src/shared/constants/colors.js` — mirror palette
- `src/shared/components/Sidebar.js` — bg, logo, wordmark, active state, sections

Các trang/component khác auto-pick màu mới qua CSS variables — không cần sửa
từng file.

---

# 9Peak v0.3.0 (2026-04-25) — UI redesign "Champagne & Terracotta" (premium look)

User request: "Cải tạo lại giao diện nhìn khác 9router tý. Tone màu nhìn vào
xịn sang." — UI redesign substantial, không phải subtle shift như v0.2.6.

## Color palette overhaul: "Champagne & Terracotta"
Hai màu chủ đạo (giữ family với 9router warm-tone nhưng deeper + thêm gold):

### Primary — Burnt Sienna deeper
- DEFAULT: `#D97757` → `#B5573A` (sâu hơn, rõ tone hơn, ko bị "Claude generic")
- hover: `#C56243` → `#9A4830`
- dark: `#B0664D` → `#823B26`

### NEW — Champagne Gold accent
- DEFAULT: `#C9A57A` (toàn dùng cho highlight, separator, section header)
- hover: `#B58D5F`
- light: `#E0C499` (pixel grid trong logo)

### Light theme — warm cream linen (premium paper)
- bg: `#FBF9F6` → `#FAF6EE`
- bgAlt: `#F5F1ED` → `#F2EBDF`
- sidebar: opaque whitish → `rgba(248, 242, 230, 0.78)` (warm linen blur)
- border: pure black 10% → warm brown `rgba(94, 65, 47, 0.10)`
- text-main: `#383733` → `#2E2419` (deeper warm)
- text-muted: `#75736E` → `#756454`

### Dark theme — deep warm coffee (rich, not generic charcoal)
- bg: `#191918` → `#15110D` (very deep với brown undertone)
- bgAlt: `#1F1F1E` → `#1E1813`
- surface: `#242423` → `#251E18`
- border: white 10% → warm tan `rgba(255, 200, 150, 0.08)`
- text-main: `#ECEBE8` → `#F0E8DC`
- text-muted: `#9E9D99` → `#A39A8B`

### Shadows
- shadow-warm: glow đỏ Claude → glow burnt-sienna sâu hơn (`rgba(181, 87, 58, 0.18)`)
- NEW shadow-gold: champagne glow `rgba(201, 165, 122, 0.28)`
- shadow-elevated: deeper, cooler

## Logo redesign — "metallic premium"
- Khung icon dual-gradient: terracotta core (`#D8714D → #823B26`) + gold inner-shine
  overlay (`#C9A57A/25`).
- Ring: gold `ring-[#C9A57A]/30 → /60` khi hover.
- "9" trong logo: gradient white → champagne (`#FFFFFF → #FFE3CA`) cho cảm giác
  metallic.
- Pixel grid: champagne gold thay vì white (4 chấm với opacity rotation).

## Typography wordmark
- "9Peak" sidebar: split thành "9" gradient terracotta + "Pix" gradient gold —
  như logo Stripe / Vercel với 2 màu tương phản.
- Subtitle: "v0.3.0 · Hoivn1 GitHub" với uppercase + letter-spacing wide
  (signature look).

## Sidebar premium polish
- Background: `bg-vibrancy` cũ → `bg-sidebar-premium` mới với 2 radial gradient
  (gold blush top-left + terracotta blush bottom-right) + warm linen base.
- Backdrop blur stronger: `blur(20px)` → `blur(28px) saturate(160%)` (glass
  morphism rõ hơn).
- Section header "System" / "Debug": small uppercase gold text + horizontal
  separator gradient → fade. Trông như magazine layout.
- Active nav item: thay vì chỉ `bg-primary/10` đơn giản, giờ có:
  - Background tint primary
  - Inner ring champagne gold (`inset 0 0 0 1px rgba(201,165,122,0.25)`)
  - Outer ring primary (`0 0 0 1px rgba(181,87,58,0.20)`)
  → Cảm giác "engraved/embossed", không flat nữa.
- Top accent line: gradient gold mảnh chạy ngang trên cùng sidebar.

## CSS utilities mới (globals.css)
- `.bg-sidebar-premium` — sidebar gradient warm linen + gold blush
- `.text-gradient-gold` — wordmark gold gradient
- `.text-gradient-primary` — wordmark terracotta gradient
- `.card-premium-hover` — hover lift -1px + shadow-warm + border tint
- `--shadow-gold` — champagne glow shadow

## Không thay đổi
- Routing/SSE/OAuth/MITM/provider, port 20128, image-gen API.
- Logo concept (vẫn "9 + pixel grid") — chỉ refine màu sắc/gradient.
- Component structure các trang khác — chỉ thay variable, không sửa layout.

## Scope
File touched:
- `src/app/globals.css` — palette, shadows, gradients, utilities
- `src/shared/constants/colors.js` — mirror palette
- `src/shared/components/Sidebar.js` — bg, logo, wordmark, active state, sections

Các trang/component khác auto-pick màu mới qua CSS variables — không cần sửa
từng file.

---

# 9Peak v0.2.6 (2026-04-25) — Stats không recharts + upstream → Settings + tone sang hơn

User test v0.2.5: tab Stats load 1 lúc rồi lỗi lại. F12 console báo
`Minified React error #62` ở component recharts (path/Pie). Đồng thời
yêu cầu (1) move upstream notice từ sidebar sang Settings (admin tự
biết check), (2) tone màu shift để khác 9router tý.

## Fix Stats lần này dứt điểm
- **Bỏ hẳn recharts** trong StatsTab. Thay 7-day bar chart và 2 pie
  chart bằng HTML/CSS thuần (Tailwind divs):
  - `DailyBars`: 7 div cột với height % theo count, hover hiện count.
  - `DistributionList`: list bar ngang cho room/style — name + count
    + percent + bar fill có color rotation. Dễ đọc, ổn định, ko
    phụ thuộc lib.
- KPI card + Edit/Generate table giữ nguyên — chưa từng lỗi.
- Lý do: recharts v3 có nhiều breaking change so với v2, đặc biệt
  Pie/Cell rendering trên app dùng standalone Next build. Thay vì
  fight lib, dùng HTML thuần xử lý 100% reliable cho data nhỏ
  (7 ngày × room/style).

## Upstream notice → Settings (`/dashboard/profile`)
- Sidebar: bỏ pill "Upstream 9Router v0.4.5" + 2 link.
- Profile page: thêm card "Upstream Tracking" mới ở đầu trang, có:
  - 2 ô số: 9Peak version (đang chạy) | 9Router upstream (npm)
  - Indicator "↑ Mới hơn 9Peak hiện tại" nếu upstream > fork
  - 3 nút link: Releases / Changelog / Repo upstream
  - Hint command `git fetch upstream && git log master..upstream/master`
- File mới: `profile/UpstreamTrackingCard.js`.
- Sidebar logic: vẫn render flow "Update now" cũ khi
  `isUpstreamCheck=false` (sau này nếu publish 9peak lên npm).

## Tone màu — premium shift
Shift palette để 9Peak nhìn distinct với 9router gốc nhưng vẫn cùng
warm-tone family (TCHEAT_CLI vibe). File: `shared/constants/colors.js`.
- Primary: Claude coral `#D97757` → Burnt sienna `#CA6A47` (deeper,
  saturated hơn, dark `#B0664D` → `#8E4D34`).
- Light bg: `#FBF9F6` → `#FBF7F2` (cream amber-tinted hơn).
- Light border: pure black 10% → warm brown `rgba(94,65,47,0.12)`.
- Dark bg: `#191918` → `#1A1714` (brown undertone).
- Dark surface: `#242423` → `#27221E`.
- Dark border: pure white 10% → warm tan `rgba(255,220,190,0.10)`.

Subtle nhưng đủ visible — anh sẽ thấy app "ấm" và "sang" hơn upstream.

## Không thay đổi
- Routing/SSE/OAuth/MITM/provider, port 20128, image-gen API.
- Logo SVG (đã chỉnh ở v0.2.4).

---

# 9Peak v0.2.5 (2026-04-25) — Fix Stats TDZ bug + upstream tracking pill

User test v0.2.4 vẫn báo Stats lỗi. Trace lại thì lỗi căn nguyên nằm ở
StatsTab.js — bug do replace_all toàn cục từ v0.2.3 đã làm hỏng defensive
init lines:

```js
// SAI (Temporal Dead Zone — tự reference trước khi declare)
const gensLast7Days = Array.isArray(gensLast7Days) ? gensLast7Days : [];
// ĐÚNG
const gensLast7Days = Array.isArray(data.gensLast7Days) ? data.gensLast7Days : [];
```

JavaScript throws ReferenceError tại runtime khi gặp pattern này, đó là
nguyên nhân thật của "Tab này lỗi runtime — không phải lỗi server".

## Fixes
- **Khôi phục `data.` prefix** ở 4 dòng const init trong StatsTab
  (`gensLast7Days`, `byRoom`, `byStyle`, `editVsGenerate`).

## Updater notification redesign
Theo yêu cầu: "version mình cứ theo 9router để biết bao giờ bản đấy có
upgrade gì hay thì mình fork và lấy".

- `/api/version` revert về query upstream `9router` trên npm.
- Response thêm field `isUpstreamCheck: true` + `upstreamReleasesUrl` +
  `upstreamChangelogUrl`.
- Sidebar render khác nhau theo `isUpstreamCheck`:
  - **isUpstreamCheck=true** (case hiện tại): hiện pill xanh thông báo
    "Upstream 9Router v0.4.5" + 2 link "Releases ↗" / "Changelog ↗"
    sang upstream. KHÔNG có nút "Update now" (auto-update sẽ đè
    bản fork bằng upstream, mất hết branding 9Peak).
  - **isUpstreamCheck=false** (sau này nếu publish 9peak lên npm):
    giữ nguyên flow "Update now" cũ.

## Không thay đổi
- Routing/SSE/OAuth/MITM/provider, port 20128.
- Logic image-gen, page layout khác, credit @decolua các nơi.

## Fixes
- **Bỏ prop `label` ở `<Pie>` chart** (Phân phối Room/Style) — recharts v3.8.1
  có breaking change ở callback signature của Pie label làm StatsTab throw
  runtime ("Tab này lỗi runtime"). Chuyển sang dùng Tooltip + Legend thuần,
  hover lên slice vẫn thấy đầy đủ count + percent.
- **Đổi `NPM_PACKAGE_NAME` trong `/api/version` từ `9router` → `9peak`**.
  Trước đây hardcode `9router` nên dashboard hiện banner "↑ New version
  available: v0.4.5" — đó là version upstream, click Update sẽ đè bản fork
  bằng upstream. Giờ query `9peak` (chưa publish lên npm) → npm trả 404,
  `hasUpdate=false`, banner ẩn.

## UI polish
- **Logo "9Peak" to hơn**: text từ `text-lg font-semibold` → `text-2xl
  font-extrabold` + gradient cam clip-path để chữ "9Peak" có cùng tone với
  icon. Khung icon từ `size-9 rounded` → `size-11 rounded-xl` cho cân đối,
  shadow sâu hơn (`shadow-lg`). Trông uy tín và rõ thương hiệu hơn.

---

# 9Peak v0.2.3 (2026-04-25) — Fix Stats tab crash + logo polish

Fix lỗi "This page couldn't load" khi mở tab Stats trong /dashboard/image-gen
+ làm đẹp logo sidebar + dọn credit fork khỏi sidebar header.

## Fixes
- **TabErrorBoundary mới** (`src/app/(dashboard)/dashboard/image-gen/components/
  TabErrorBoundary.js`) — wrap quanh từng tab History/Stats/Accounts/Gold để
  1 tab lỗi runtime không kéo crash cả page. Hiện fallback UI với nút "Thử lại".
- **StatsTab defensive** — bind sẵn `gensLast7Days/byRoom/byStyle/editVsGenerate/
  successRate` thành biến local có default Array/Object để tránh `undefined.reduce`
  hay `undefined.map` khi API trả thiếu field.
- `avgInputsPerGen` format `.toFixed(2)` để hiển thị nhất quán (1.13 thay vì
  1.1333333333).

## UI polish
- **Logo 9Peak mới**: SVG inline thay cho icon Material Symbol "hub". Giữ nguyên
  tone gradient cam #f97815 → #c2590a của TCHEAT_CLI, thêm ring shadow nhẹ và
  ký tự "9" + lưới 4 pixel chấm bottom-right (motif "Pix").
- **Bỏ dòng credit "fork of 9Router by @decolua"** khỏi sidebar header để
  giao diện gọn. Credit vẫn giữ đầy đủ trong NOTICE.md, README.md, LICENSE,
  CLI banner (`9peak --help`), và `APP_CONFIG.upstreamAuthor` vẫn export sẵn
  cho component khác dùng nếu cần.

---

# 9Peak v0.2.2 (2026-04-25) — Image Gen Accounts tab (Codex health)

Tab Accounts mới trong `/dashboard/image-gen` — theo dõi sức khỏe các tài
khoản ChatGPT Codex OAuth dùng cho image generation pipeline (gpt-image-1).

## Features
- **Bảng account** filter `provider="codex"`: email, plan badge (Plus/Pro/
  Business/Go/Team/Enterprise/Free với color coding tím/xanh/xám), trạng thái
  Active/Cooldown/Disabled, số 429/401 trong 24h gần nhất, Last used (relative
  time), Cooldown còn lại (lấy từ `modelLock_*` lớn nhất).
- **3 summary card**: Active / Total, tổng 429 trong 24h, số account cần
  attention (đang cooldown hoặc 429 trong 24h).
- **Auto refresh 30s** với toggle tắt.

## Backend
- Mở rộng `/api/routing-stats` (file fork-local) thêm fields cho mỗi
  connection: `email`, `chatgptPlanType` (từ `providerSpecificData`),
  `modelLocks` (chỉ giữ lock chưa hết hạn). Format response cũ giữ nguyên,
  chỉ thêm field mới.

## Mục đích
User dễ phát hiện account bị rate limit hay lock để xử lý sớm, tránh pipeline
bị gián đoạn khi demo với khách hàng.

---

# 9Peak v0.2.1 (2026-04-25) — Image Gen Stats tab

Tab Stats mới trong `/dashboard/image-gen` — thống kê nhanh hiệu suất pipeline
sinh ảnh (gpt-image-1) để theo dõi phân phối room/style và success rate.

## Features
- **4 KPI card**: Tổng ảnh, Tuần này (7 ngày qua), Tỉ lệ thành công (PNG còn
  tồn tại), Trung bình inputs/gen.
- **Biểu đồ cột 7 ngày** (recharts) — số ảnh sinh mỗi ngày.
- **2 pie chart**: phân phối theo Room (7 phòng) và theo Style.
- **Bảng**: Edit vs Generate (`is_edit=1` vs `0`), timestamp ảnh cũ nhất / mới
  nhất (relative + absolute).

## API mới
- `GET /api/image-gen/stats` — aggregate toàn bộ history JSON, tính tỉ lệ
  thành công bằng `fs.existsSync(entry.output)`.

## Không đổi
- Existing API (`/api/image-gen/history`, `/image`, `/promote-gold`, `/gold`)
  giữ nguyên.
- Routing logic, SSE layer, OAuth flow không thay đổi.

---

# 9Peak v0.2.0 (2026-04-25) — Image Gen Dashboard (history + Gold library)

Trang mới `/dashboard/image-gen` cho phép xem lịch sử ảnh đã sinh qua pipeline
Telegram → OpenClaw → 9router → Codex (gpt-image-1) và quản lý gold reference
library — đáp ứng PLAN.md Tier 4.2.

## Features
- **Tab History**: grid thumbnail đọc từ `~/.9router-image-cache/history/*.json`,
  filter theo room/style/date, click mở modal xem prompt + metadata đầy đủ.
- **Tab Gold Library**: accordion 7 phòng (`living, bedroom, child, worship,
  kitchen, bath, office`), liệt kê toàn bộ ảnh gold hiện có, click mở lightbox.
- **Promote to Gold**: từ modal History, copy ảnh /tmp sang
  `~/.9router-image-cache/gold/<room>/<style>-<label>.png`.
- Sidebar: thêm link "Image Gen" (icon palette) giữa MITM và CLI Tools.

## API mới (src/app/api/image-gen/)
- `GET /api/image-gen/history`     — đọc history JSON, sort by ts desc, kèm flag `outputExists`.
- `GET /api/image-gen/image?path=` — serve PNG, validate path prefix (chỉ cho /tmp/9router-image-* hoặc gold dir, chống directory traversal).
- `POST /api/image-gen/promote-gold` — copy ảnh, validate room/style whitelist.
- `GET /api/image-gen/gold`        — list gold files grouped by room.

## Không thay đổi
- Không đụng skill `gen.sh` / SKILL.md / cache JSON files trực tiếp.
- Không đổi routing logic, SSE layer, OAuth flow, port 20128.

---

# 9Peak v0.1.0 (2026-04-25) — Rebrand fork as 9Peak (Hoivn1 GitHub)

**This is a downstream fork of 9Router.** All upstream work is by [@decolua](https://github.com/decolua) and contributors — see [NOTICE.md](./NOTICE.md) and [LICENSE](./LICENSE).

## Fork rebrand (visible-only changes; zero behavior change)
- Package renamed `tcheat-cli` → `9peak`, version reset to `0.1.0`, `private: true` to prevent accidental publish.
- `bin/` exposes three aliases all pointing to `bin/9peak.mjs`: `9peak`, `9router`, `tcheat-cli` — drop-in replacement.
- New `bin/9peak.mjs` banner credits upstream 9Router by @decolua.
- `LICENSE` retains original decolua MIT copyright verbatim; fork modifications copyright appended underneath.
- New `NOTICE.md` explicitly attributes upstream authorship and lists fork-specific additions.
- README rewritten with prominent "fork of 9Router" notice at top, credit section above features, upstream link in footer.
- Dashboard brand strings ("9Router" → "9Peak") in layout metadata, PWA manifest, sidebar header, updater modals.
- CLAUDE.md updated so AI agents working on the repo know this is a fork.

## What is NOT changed
- API endpoint stays `http://localhost:20128/v1` (drop-in).
- All routing/SSE/OAuth/MITM/provider-integration code is untouched in this release.
- Upstream update mechanism in `src/lib/updater/` still works; `UPDATER_CONFIG.npmPackageName` now targets `9peak` (no upstream overwrite).

## Upstream basis
Forked from `decolua/9router` at `bda391a` (v0.4.5-local.3 local fork state, synced 2026-04-24).

---

# v0.4.5-local.3 (2026-04-24) — Codex image generation (upstream fork state)

## Features
- **ChatGPT OAuth image generation** (experimental, gated): new `codex/gpt-image-1` model routes `/v1/images/generations` through Codex OAuth tokens (Plus/Pro/Business/Go/Team) instead of paid OpenAI API key. Default OFF — enable via Endpoint page toggle. Backend calls `chatgpt.com/backend-api/codex/responses` with `tools:[{type:"image_generation"}]` and parses SSE stream for `image_generation_call.result` base64.
- Plan-type badge per Codex connection (Plus / Pro / Business / Go / Team / Enterprise / Free).
- Per-model lock on image quota 429 — text chat on same account stays active.

# v0.4.5-local.2 (2026-04-24) — Concurrency + business optimizer re-wired

## Fixes
- Re-ported `concurrency.js` + `openaiBusinessOptimizer.js` (accidentally dropped during upstream merge).
- Re-wired `acquireSlot` / `releaseSlot` / `tagRoutingLogClient` / `recordResponseTime` / `recordRateLimits` into v0.4.5 `auth.js` + `chat.js` + `embeddings.js`.
- Routing Monitor (`/dashboard/routing`) now shows live active requests + routingLog.
- Added `routing-stats` API endpoint (local-only).
- Restored max-concurrent-per-account enforcement.
- Restored `openai-business` routing strategy (quota-aware bonus for Codex accounts).

# v0.4.5-local.1 (2026-04-24) — Fork merged

## Preserved from local fork
- Routing Monitor dashboard (real-time account status)
- 9Remote CLI install/start/status integration
- Endpoint API key visibility toggle (eye icon)
- tcheat-cli branded wrapper (bin/tcheat-cli.mjs)

## Merged from upstream 9router (v0.3.97 → v0.4.5)
- See entries below

# v0.4.5 (2026-04-24)

## Improvements
- Cap maximum cooldown for rate limit handling in account unavailability and single-model chat flows
- Dynamic custom model fetching for model selection

# v0.4.3 (2026-04-24)

## Improvements
- Improve in-app download/update UX on dashboard
- Improve Codex provider rate limit handling with precise cooldown (`resetsAtMs`) and email backfill for OAuth accounts

# v0.4.2 (2026-04-24)

## Features
- Add Azure OpenAI provider support
- Add built-in Volcengine Ark provider support (#741)
- Add GPT 5.5 model

## Fixes
- Enhance retry logic and configuration for HTTP status codes

# v0.4.1 (2026-04-23)

## Features
- Add Hermes CLI tool with settings management and integration
- Add in-app version update mechanism (appUpdater + /api/version/update)

## Improvements
- Strengthen CLI token validation for enhanced security
- Enhance Sidebar layout for CLI tools
- Update executors and runtime config

# v0.3.98 (2026-04-22)

## Features
- Add RTK — filter context (ls/grep/find/.....) before sending to LLM to save tokens

# v0.3.97 (2026-04-22)

## Features
- Add OpenCode Go provider and support for custom models
- Add Text To Image provider
- Support custom host URL for remote Ollama servers

## Fixes
- Fix copy to clipboard issue

# v0.3.96 (2026-04-17)

## Features
- Add marked package for Markdown rendering
- Enhance changelog styles

## Improvements
- Refactor error handling to config-driven approach with centralized error rules
- Refactor localDb structure
- Update Qwen executor for OAuth handling
- Enhance error formatting to include low-level cause details
- Refactor HeaderMenu to use MenuItem component
- Improve LanguageSwitcher to support controlled open state
- Update backoff configuration and improve CLI detection messages
- Add installation guides for manual configuration in tool cards (Droid, Claude, OpenClaw)

## Fixes
- Fix Codex image URL fetches to await before sending upstream (#575)
- Strip thinking/reasoning_effort for GitHub Copilot chat completions (#623)
- Enable Codex Apply/Reset buttons when CLI is installed (#591)
- Show manual config option when Claude CLI detection fails (#589)
- Show manual config option when OpenClaw detection fails (#579)
- Ensure LocalMutex acquire returns release callback correctly (#569)
- Strip enumDescriptions from tool schema in antigravity-to-openai (#566)
- Strip temperature parameter for gpt-5.4 model (#536)
- Add Blackbox AI as a supported provider (#599)
- Add multi-model support for Factory Droid CLI tool (#521)
- Add GLM-5 and MiniMax-M2.5 models to Kiro provider (#580)
- Fix usage tracking bug

# v0.3.91 (2026-04-15)

## Features
- Add Kiro AWS Identity Center device flow for provider OAuth
- Add TTS (Text-to-Speech) core handler and TTS models config
- Add media providers dashboard page
- Add suggested models API endpoint

## Improvements
- Refactor error handling to config-driven approach with centralized error rules
- Refactor localDb and usageDb for cleaner structure

## Fixes
- Fix usage tracking bug

# v0.3.90 (2026-04-14)

## Features
- Add proactive token refresh lead times for providers and Codex proxy management
- Enhance CodexExecutor with compact URL support

## Improvements
- Enhance Windows Tailscale installation with curl support and fallback to well-known Windows path
- Refactor execSync and spawn calls with windowsHide option for better Windows compatibility

## Fixes
- Fix noAuth support for providers and adjusted MITM restart settings
- Bug fixes

# v0.3.89 (2026-04-13)

## Improvements
- Improved dashboard access control by blocking tunnel/Tailscale access when disabled

# v0.3.87 (2026-04-13)

## Fixes
- Fix codex cache session id

# v0.3.86 (2026-04-13)

## Features
- Add provider models and thinking configurations for enhanced chat handling
- Add Vercel relay support to proxy functionality
- Add Vercel deploy endpoint for proxy pools management

## Improvements
- Enhance proxy functionality with new relay capabilities
- Streamline GitHub Actions Docker publish workflow
- Update Docker configuration and package management

## Fixes
- Remove obsolete 9remote installation/management APIs

# v0.3.83 (2026-04-08)

## Fixes
- Fix OpenRouter custom models not showing after being added

# Unreleased

## Features
- Added API key visibility toggle (eye icon) to Endpoint dashboard page for improved UX and security.

# v0.2.66 (2026-02-06)

## Features
- Added Cursor provider end-to-end support, including OAuth import flow and translator/executor integration (`137f315`, `0a026c7`).
- Enhanced auth/settings flow with `requireLogin` control and `hasPassword` state handling in dashboard/login APIs (`249fc28`).
- Improved usage/quota UX with richer provider limit cards, new quota table, and clearer reset/countdown display (`32aefe5`).
- Added model support for custom providers in UI/combos/model selection (`a7a52be`).
- Expanded model/provider catalog:
  - Codex updates: GPT-5.3 support, translation fixes, thinking levels (`127475d`)
  - Added Claude Opus 4.6 model (`e8aa3e2`)
  - Added MiniMax Coding (CN) provider (`7c609d7`)
  - Added iFlow Kimi K2.5 model (`9e357a7`)
  - Updated CLI tools with Droid/OpenClaw cards and base URL visibility improvements (`a2122e3`)
- Added auto-validation for provider API keys when saving settings (`b275dfd`).
- Added Docker/runtime deployment docs and architecture documentation updates (`5e4a15b`).

## Fixes
- Improved local-network compatibility by allowing auth cookie flow over HTTP deployments (`0a394d0`).
- Improved Antigravity quota/stream handling and Droid CLI compatibility behavior (`3c65e0c`, `c612741`, `8c6e3b8`).
- Fixed GitHub Copilot model mapping/selection issues (`95fd950`).
- Hardened local DB behavior with corrupt JSON recovery and schema-shape migration safeguards (`e6ef852`).
- Fixed logout/login edge cases:
  - Prevent unintended auto-login after logout (`49df3dc`)
  - Avoid infinite loading on failed `/api/settings` responses (`01c9410`)

# v0.2.56 (2026-02-04)

## Features
- Added Anthropic-compatible provider support across providers API/UI flow (`da5bdef`).
- Added provider icons to dashboard provider pages/lists (`60bd686`, `8ceb8f2`).
- Enhanced usage tracking pipeline across response handlers/streams with buffered accounting improvements (`a33924b`, `df0e1d6`, `7881db8`).

## Fixes
- Fixed usage conversion and related provider limits presentation issues (`e6e44ac`).

# v0.2.52 (2026-02-02)

## Features
- Implemented Codex Cursor compatibility and Next.js 16 proxy migration updates (`e9b0a73`, `7b864a9`, `1c6dd6d`).
- Added OpenAI-compatible provider nodes with CRUD/validation/test coverage in API and UI (`0a28f9f`).
- Added token expiration and key-validity checks in provider test flow (`686585d`).
- Added Kiro token refresh support in shared token refresh service (`f2ca6f0`).
- Added non-streaming response translation support for multiple formats (`63f2da8`).
- Updated Kiro OAuth wiring and auth-related UI assets/components (`31cc79a`).

## Fixes
- Fixed cloud translation/request compatibility path (`c7219d0`).
- Fixed Kiro auth modal/flow issues (`85b7bb9`).
- Included Antigravity stability fixes in translator/executor flow (`2393771`, `8c37b39`).

# v0.2.43 (2026-01-27)

## Fixes
- Fixed CLI tools model selection behavior (`a015266`).
- Fixed Kiro translator request handling (`d3dd868`).

# v0.2.36 (2026-01-19)

## Features
- Added the Usage dashboard page and related usage stats components (`3804357`).
- Integrated outbound proxy support in Open SSE fetch pipeline (`0943387`).
- Improved OpenAI compatibility and build stability across endpoint/profile/providers flows (`d9b8e48`).

## Fixes
- Fixed combo fallback behavior (`e6ca119`).
- Resolved SonarQube findings, Next.js image warnings, and build/lint cleanups (`7058b06`, `0848dd5`).

# v0.2.31 (2026-01-18)

## Fixes
- Fixed Kiro token refresh and executor behavior (`6b22b1f`, `1d481c2`).
- Fixed Kiro request translation handling (`eff52f7`, `da15660`).

# v0.2.27 (2026-01-15)

## Features
- Added Kiro provider support with OAuth flow (`26b61e5`).

## Fixes
- Fixed Codex provider behavior (`26b61e5`).

# v0.2.21 (2026-01-12)

## Changes
- README updates.
- Antigravity bug fixes.
