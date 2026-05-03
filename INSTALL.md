# 9Peak — Hướng dẫn cài đặt

9Peak là bản fork của [9Router](https://github.com/decolua/9router) by @decolua, maintained bởi Hoivn1 GitHub. Tập trung vào image-generation qua subscription accounts cho thiết kế nội thất VN.

---

## Yêu cầu

- **Node.js 20+** (`node -v` kiểm tra)
- **RAM**: ≥ 512 MB (khuyến nghị 1 GB+)
- **Port 20128** phải free (hoặc dùng `--port` flag)
- **OS**: Linux, macOS, Windows (WSL)

Nếu chưa có Node 20+:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

---

## Cách 1: Cài từ file .tgz (khuyến nghị cho test PC cá nhân)

Sau khi nhận file `9peak-0.3.4.tgz` (từ GitHub release hoặc SCP/USB):

```bash
# 1. Setup npm global prefix ở home (không cần sudo)
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=$HOME/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# 2. Cài global
npm install -g ./9peak-0.3.4.tgz

# 3. Chạy (lần đầu sẽ tự build ~2-3 phút)
9peak
```

Hoặc dùng alias quen thuộc:
```bash
9router          # cùng binary
tcheat-cli       # cùng binary
```

Dashboard tự mở ở `http://localhost:20128`.

---

## Cách 2: Clone repo + build from source

```bash
# 1. Clone
git clone git@github.com:hoivn1/CCHEATCLI.git 9peak
cd 9peak

# 2. Install deps + build
npm install --no-audit --no-fund
npm run build        # postbuild tự copy static assets vào standalone

# 3. Chạy (3 cách tương đương)
npm run cli
# hoặc
node bin/9peak.mjs
# hoặc link global để gõ "9peak" từ bất kỳ đâu
npm link && 9peak
```

---

## Cách 3: Docker

```bash
cd 9peak
bash start.sh      # build image + run container port 20128
```

---

## CLI flags

```bash
9peak                    # Start server port 20128 (auto build nếu chưa)
9peak --port 3000        # Port khác
9peak --dev              # Dev mode hot-reload
9peak --build            # Chỉ build, không start
9peak --no-open          # Không tự mở browser
9peak --help             # Show help
```

---

## Environment variables

| Var | Default | Mô tả |
|---|---|---|
| `PORT` | `20128` | Port server |
| `DATA_DIR` | `~/.9router` | Thư mục DB + logs (giữ tương thích với upstream 9router) |
| `JWT_SECRET` | auto | Secret JWT cho dashboard auth |
| `INITIAL_PASSWORD` | — | Password đăng nhập dashboard lần đầu |
| `HTTP_PROXY` / `HTTPS_PROXY` | — | Proxy outbound |

---

## Chạy như systemd service (Linux, auto-start khi reboot)

```bash
sudo tee /etc/systemd/system/9peak.service << EOF
[Unit]
Description=9Peak AI Router Dashboard
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/.npm-global/lib/node_modules/9peak
ExecStart=$HOME/.npm-global/bin/9peak --no-open
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=20128

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable 9peak
sudo systemctl start 9peak
sudo systemctl status 9peak
```

Xem log:
```bash
sudo journalctl -u 9peak -f
```

---

## Update (pull upstream 9Router)

9Peak KHÔNG auto-update (tránh đè fork bằng upstream). Vào dashboard →
Settings → card **"Upstream Tracking"** để xem version upstream mới +
link Releases/Changelog. Pull thủ công qua git khi thấy commit hữu ích:

```bash
cd 9peak
git fetch upstream
git log master..upstream/master --oneline   # xem upstream có gì mới
git cherry-pick <commit>                     # pull commit cụ thể
# hoặc
git merge upstream/master                    # merge toàn bộ (có thể conflict)
```

---

## Troubleshooting

### Port 20128 đã dùng
```bash
lsof -i :20128                # tìm process
kill -9 <PID>                 # kill
# hoặc dùng port khác
9peak --port 8080
```

### Build fail
```bash
cd $HOME/.npm-global/lib/node_modules/9peak   # hoặc repo clone
rm -rf .next node_modules
npm install --no-audit --no-fund
npm run build
```

### CSS không load / dashboard trắng
```bash
# Đảm bảo postbuild đã chạy
node scripts/copy-standalone-assets.js
# Check standalone có đầy đủ
ls .next/standalone/.next/static .next/standalone/public
```

### Permission denied khi cài global
→ Setup npm prefix home dir như ở Cách 1 để tránh cần sudo:
```bash
npm config set prefix '~/.npm-global'
```

### Node version cũ
```bash
nvm install 20 && nvm use 20
```

---

## Bulk Import (v0.5.1+)

v0.5.1 tách bộ phận login automation ra khỏi 9peak main app — 9peak giờ chỉ
nhận **JSON tokens đã được login sẵn** qua trang `/dashboard/bulk-import`,
KHÔNG còn nhúng Playwright/Chromium nữa. Lý do tách: bundle Playwright
phình tgz +150MB, tăng attack surface, automation có rủi ro ban acc → ảnh
hưởng main app community.

### Workflow

```
1. Run collector tool (tools/collector/) → tokens.json
2. 9peak dashboard → Bulk Import → Paste JSON hoặc Upload file
3. Click Import All → 9peak decode + dedupe + lưu vào Codex pool
```

### Format JSON

File `tokens.json` là 1 array các object, mỗi object 1 acc:

```json
[
  {
    "email": "alice@gmail.com",
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "rt_abc123...",
    "idToken": "eyJhbGciOiJSUzI1NiIs...",
    "expiresAt": 1735689600000,
    "providerSpecificData": {
      "chatgptAccountId": "user-xxx",
      "chatgptPlanType": "plus",
      "primaryWorkspace": { "id": "org-xxx", "title": "...", "role": "owner" }
    }
  }
]
```

- **Bắt buộc**: `email`, `accessToken`, `refreshToken`, `idToken`.
  `accessToken` + `idToken` phải là JWT 3 phần (`a.b.c`).
- **Optional**: `expiresAt` (epoch ms), `providerSpecificData` (nếu thiếu,
  9peak tự decode `idToken` qua `extractCodexAccountInfo()` để extract
  workspace + plan).
- 9peak dedupe theo `email` (skip nếu đã có Codex connection cùng email).

### Collector tool

Code generate JSON ở `tools/collector/` — standalone Node project, KHÔNG
share node_modules với 9peak main:

```bash
cd tools/collector
npm install                    # postinstall tự chạy `playwright install chromium`
node collect.js my-accs.txt --output tokens.json
```

Xem chi tiết format input + flag: [`tools/collector/README.md`](./tools/collector/README.md).

Risk warning: tool này automate login → có thể trigger Cloudflare/CAPTCHA.
Acc Free thường ổn, paid acc nên login tay → export token thủ công rồi tự
soạn JSON (cùng schema).

---

## Attribution

9Peak là fork từ [9Router](https://github.com/decolua/9router) © 2024-2026 decolua.
Fork modifications © 2026 Hoivn1 GitHub.

Xem [NOTICE.md](./NOTICE.md) + [LICENSE](./LICENSE) để biết chi tiết.

Nếu anh thấy 9Router gốc hữu ích, **ủng hộ upstream trước**: star https://github.com/decolua/9router và báo bug không liên quan fork lên đó.
