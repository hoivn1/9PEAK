"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, Button } from "@/shared/components";

const SAMPLE = "user1@example.com|password|JBSWY3DPEHPK3PXP\nuser2@example.com|password|";
const PROXY_SAMPLE = "http://user:pass@127.0.0.1:8080\nsocks5://127.0.0.1:1080";
const terminalStatuses = new Set(["done", "failed", "cancelled"]);
const successfulTerminalStatuses = new Set(["done"]);

function parsePreview(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, raw: line.trim() }))
    .filter((item) => item.raw)
    .map((item) => {
      const [email, password, totpSecret = ""] = item.raw.split("|").map((part) => part.trim());
      return {
        line: item.line,
        email: email || "—",
        hasPassword: !!password,
        hasTotp: !!totpSecret,
        valid: !!email && !!password,
      };
    });
}

function parseProxyPreview(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function statusLabel(status) {
  const labels = {
    queued: "Đang xếp hàng",
    running: "Đang login",
    cancelling: "Đang dừng",
    pending: "Chờ xử lý",
    success: "Đã import",
    failed: "Lỗi",
    done: "Hoàn tất",
    cancelled: "Đã dừng",
  };
  return labels[status] || status || "—";
}

export default function BulkLoginCodexModal({ isOpen, onSuccess, onClose }) {
  const [credentials, setCredentials] = useState("");
  const [proxies, setProxies] = useState("");
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  const preview = useMemo(() => parsePreview(credentials), [credentials]);
  const proxyPreview = useMemo(() => parseProxyPreview(proxies), [proxies]);
  const validCount = preview.filter((item) => item.valid).length;
  const running = job && !terminalStatuses.has(job.status);

  useEffect(() => {
    if (!running || !job?.id) return undefined;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/codex/bulk-login?jobId=${encodeURIComponent(job.id)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Không đọc được trạng thái Bulk Login");
        setJob(data.job);
        if (successfulTerminalStatuses.has(data.job.status)) await onSuccess?.();
      } catch (pollError) {
        setError(pollError.message || "Không đọc được trạng thái Bulk Login");
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [job?.id, running, onSuccess]);

  const handleClose = () => {
    if (!running) {
      setJob(null);
      setError("");
      onClose?.();
    }
  };

  const startBulkLogin = async () => {
    setError("");
    setStarting(true);
    try {
      const res = await fetch("/api/codex/bulk-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials, proxies }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không bắt đầu được Bulk Login");
      setJob(data.job);
    } catch (startError) {
      setError(startError.message || "Không bắt đầu được Bulk Login");
    } finally {
      setStarting(false);
    }
  };

  const cancelBulkLogin = async () => {
    if (!job?.id) return;
    const res = await fetch("/api/codex/bulk-login/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id }),
    });
    const data = await res.json();
    if (res.ok) setJob(data.job);
  };

  const progress = job?.total ? Math.round(((job.done || 0) / job.total) * 100) : 0;
  const currentAccount = (job?.accounts || []).find((account) => account.status === "running") || null;
  const pendingCount = Math.max((job?.total || 0) - (job?.done || 0), 0);

  return (
    <Modal isOpen={isOpen} title="Bulk Login Codex" onClose={handleClose} size="xl">
      <div className="flex flex-col gap-5">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-primary">password</span>
            <div>
              <p className="font-medium text-text-main">Auto-login bằng tài khoản|mật khẩu|2FA</p>
              <p className="mt-1 text-sm text-text-muted">
                Dán mỗi dòng theo định dạng email|password|2fa_secret_base32. Hệ thống mở trình duyệt, tự đăng nhập Codex, lấy OAuth token và import thẳng vào bảng Provider OAuth chung. Mật khẩu/2FA chỉ giữ trong RAM và không lưu DB.
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="text-sm font-medium">Danh sách tài khoản</label>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setCredentials(SAMPLE)}
              disabled={running || starting}
            >
              Điền mẫu
            </button>
          </div>
          <textarea
            value={credentials}
            onChange={(event) => setCredentials(event.target.value)}
            disabled={running || starting}
            rows={9}
            placeholder="email@example.com|password|2fa_secret_base32"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
          />
          <p className="mt-1 text-xs text-text-muted">Có thể để trống cột 2FA nếu tài khoản không bật 2FA. Tối đa 50 tài khoản/lần.</p>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <label className="text-sm font-medium">Proxy xoay lúc login</label>
              <p className="mt-1 text-xs text-text-muted">Mỗi account lấy 1 proxy theo vòng lặp. Để trống nếu không dùng proxy.</p>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setProxies(PROXY_SAMPLE)}
              disabled={running || starting}
            >
              Điền mẫu proxy
            </button>
          </div>
          <textarea
            value={proxies}
            onChange={(event) => setProxies(event.target.value)}
            disabled={running || starting}
            rows={4}
            placeholder="http://user:pass@host:port\nsocks5://host:port\nhost:port:user:pass"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
          />
          <p className="mt-1 text-xs text-text-muted">
            Đã nhập {proxyPreview.length} proxy. Hỗ trợ http://, https://, socks4://, socks5:// hoặc host:port:user:pass.
          </p>
        </div>

        {preview.length > 0 && !job && !starting && (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="border-b border-border bg-sidebar px-3 py-2 text-sm font-medium">Preview: {validCount}/{preview.length} dòng hợp lệ</div>
            <div className="max-h-44 overflow-auto">
              {preview.slice(0, 10).map((item) => (
                <div key={item.line} className="grid grid-cols-[64px_1fr_100px_100px] gap-2 border-b border-border/70 px-3 py-2 text-xs last:border-b-0">
                  <span className="text-text-muted">#{item.line}</span>
                  <span className="truncate">{item.email}</span>
                  <span>{item.hasPassword ? "Có mật khẩu" : "Thiếu mật khẩu"}</span>
                  <span>{item.hasTotp ? "Có 2FA" : "Không 2FA"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {starting && !job && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-text-main">Đang khởi tạo tiến trình Auto Login...</span>
                  <span className="text-text-muted">{validCount} account · {proxyPreview.length} proxy</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
                </div>
                <p className="mt-2 text-xs text-text-muted">Đang tạo job, sau đó bảng tiến trình từng account sẽ hiện ở đây.</p>
              </div>
            </div>
          </div>
        )}

        {job && (
          <div className="rounded-lg border border-border bg-sidebar p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <div className="font-medium text-text-main">Tiến trình Auto Login: {statusLabel(job.status)}</div>
                <div className="mt-1 text-xs text-text-muted">
                  {currentAccount
                    ? `Đang xử lý: ${currentAccount.email}`
                    : job.status === "cancelling"
                      ? "Đang chờ account hiện tại dừng xong"
                      : terminalStatuses.has(job.status)
                        ? "Đã xử lý xong danh sách"
                        : "Đang chuẩn bị account tiếp theo"}
                </div>
              </div>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-text-muted">{progress}%</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-border bg-background p-3">
                <div className="text-lg font-semibold text-text-main">{job.done}/{job.total}</div>
                <div className="text-xs text-text-muted">Đã xử lý</div>
              </div>
              <div className="rounded-md border border-green-500/25 bg-green-500/10 p-3">
                <div className="text-lg font-semibold text-green-600">{job.success}</div>
                <div className="text-xs text-text-muted">Import OK</div>
              </div>
              <div className="rounded-md border border-red-500/25 bg-red-500/10 p-3">
                <div className="text-lg font-semibold text-red-600">{job.failed}</div>
                <div className="text-xs text-text-muted">Lỗi</div>
              </div>
              <div className="rounded-md border border-border bg-background p-3">
                <div className="text-lg font-semibold text-text-main">{pendingCount}</div>
                <div className="text-xs text-text-muted">Còn lại</div>
              </div>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>

            <div className="mt-3 overflow-hidden rounded-md border border-border bg-background">
              <div className="grid grid-cols-[48px_1fr_110px_110px_1fr] gap-2 border-b border-border bg-sidebar px-3 py-2 text-xs font-medium text-text-muted">
                <span>Dòng</span>
                <span>Email</span>
                <span>Trạng thái</span>
                <span>Gói</span>
                <span>Ghi chú / Proxy</span>
              </div>
              <div className="max-h-56 overflow-auto">
                {(job.accounts || []).map((account) => (
                  <div key={`${account.line}-${account.email}`} className="grid grid-cols-[48px_1fr_110px_110px_1fr] gap-2 border-b border-border/70 px-3 py-2 text-xs last:border-b-0">
                    <span className="text-text-muted">#{account.line}</span>
                    <span className="truncate">{account.email}</span>
                    <span className={account.status === "success" ? "text-green-600" : account.status === "failed" ? "text-red-600" : account.status === "running" ? "font-medium text-primary" : "text-text-muted"}>{statusLabel(account.status)}</span>
                    <span>{account.planType || "—"}</span>
                    <span className="truncate text-text-muted" title={account.error || account.proxyLabel || ""}>{account.error || account.proxyLabel || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">{error}</div>}

        <div className="flex justify-end gap-2">
          {running ? (
            <Button variant="secondary" onClick={cancelBulkLogin}>Dừng</Button>
          ) : (
            <Button variant="ghost" onClick={handleClose}>Đóng</Button>
          )}
          <Button icon="login" onClick={startBulkLogin} disabled={running || starting || validCount === 0}>
            {starting ? "Đang bắt đầu..." : "Bắt đầu Auto Login"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
