"use client";
// [9peak-fork] v0.5.1 — Codex provider-table bulk import modal with import-time proxy controls.

import { useCallback, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Button, Card, Modal, Select, Toggle } from "@/shared/components";
import JsonInputTab from "../../../bulk-import/components/JsonInputTab";
import FileUploadTab from "../../../bulk-import/components/FileUploadTab";
import ImportPreviewTable from "../../../bulk-import/components/ImportPreviewTable";
import ImportResultModal from "../../../bulk-import/components/ImportResultModal";

function safeParseTokens(text) {
  if (!text.trim()) return { tokens: [], error: "" };
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return { tokens: [], error: "Root JSON phải là array" };
    return { tokens: parsed, error: "" };
  } catch (err) {
    return { tokens: [], error: err?.message || "JSON parse error" };
  }
}

export default function BulkImportCodexModal({ isOpen, onClose, proxyPools = [], connections = [], onImported }) {
  const [activeTab, setActiveTab] = useState("paste");
  const [jsonText, setJsonText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [proxyMode, setProxyMode] = useState("none");
  const [proxyPoolId, setProxyPoolId] = useState("");
  const [proxyPoolIds, setProxyPoolIds] = useState([]);
  const [importProxyOnly, setImportProxyOnly] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [apiError, setApiError] = useState("");

  const parsed = useMemo(() => safeParseTokens(jsonText), [jsonText]);
  const existingEmails = useMemo(
    () => connections.filter((c) => c?.provider === "codex" && c?.email).map((c) => String(c.email).toLowerCase()),
    [connections]
  );
  const proxyOptions = useMemo(
    () => proxyPools.map((pool) => ({ value: pool.id, label: `${pool.name || pool.id}${pool.isActive === false ? " (inactive)" : ""}` })),
    [proxyPools]
  );
  const activeProxyPools = useMemo(() => proxyPools.filter((pool) => pool?.id && pool.isActive !== false), [proxyPools]);

  const resetAndClose = useCallback(() => {
    if (importing) return;
    setApiError("");
    onClose?.();
  }, [importing, onClose]);

  const handleFileLoad = useCallback(({ text, fileName: nextFileName, error }) => {
    setFileName(nextFileName || "");
    if (error) {
      setFileError(error);
      return;
    }
    setFileError("");
    setJsonText(text || "");
    setActiveTab("file");
  }, []);

  const toggleRoundRobinPool = useCallback((id) => {
    setProxyPoolIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }, []);

  const handleImport = useCallback(async () => {
    setApiError("");
    const tokens = parsed.tokens || [];
    if (!tokens.length || parsed.error) {
      setApiError(parsed.error || "Không có token hợp lệ để import");
      return;
    }
    if (proxyMode === "single" && !proxyPoolId) {
      setApiError("Chọn 1 proxy pool để import");
      return;
    }
    if (proxyMode === "round-robin" && !proxyPoolIds.length) {
      setApiError("Chọn ít nhất 1 proxy pool để xoay khi import");
      return;
    }

    setImporting(true);
    try {
      const response = await fetch("/api/codex/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokens,
          proxyMode,
          proxyPoolId: proxyMode === "single" ? proxyPoolId : undefined,
          proxyPoolIds: proxyMode === "round-robin" ? proxyPoolIds : undefined,
          bindRuntimeProxy: !importProxyOnly,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || `Import failed (${response.status})`);
      }
      setResult(data);
      await onImported?.(data);
    } catch (err) {
      setApiError(err?.message || "Import lỗi");
    } finally {
      setImporting(false);
    }
  }, [importProxyOnly, onImported, parsed, proxyMode, proxyPoolId, proxyPoolIds]);

  const tabs = [
    { id: "paste", label: "Paste JSON", icon: "content_paste" },
    { id: "file", label: "Upload File", icon: "upload_file" },
  ];

  return (
    <>
      <Modal isOpen={isOpen} onClose={resetAndClose} title="Bulk Import Codex OAuth" size="full">
        <div className="space-y-5">
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-text-muted">
            Import token JSON vào đúng bảng OAuth Codex hiện tại. Hệ thống vẫn tự decode Free/Plus/Business và workspace từ <span className="font-mono">idToken</span>. Proxy mặc định chỉ dùng lúc import, không bind vào account sau khi import.
          </div>

          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors " +
                  (activeTab === tab.id
                    ? "border-primary bg-primary text-white"
                    : "border-black/10 dark:border-white/10 text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5")
                }
              >
                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "paste" ? (
            <JsonInputTab value={jsonText} onChange={setJsonText} parseError={parsed.error} />
          ) : (
            <FileUploadTab onFileLoad={handleFileLoad} fileName={fileName} parseError={fileError || parsed.error} />
          )}

          <Card padding="md" className="space-y-4">
            <div>
              <h3 className="font-semibold text-text-main">Import Proxy</h3>
              <p className="text-sm text-text-muted">
                Proxy này chỉ phục vụ quá trình import/validate số lượng lớn. Sau import account xoay bình thường, trừ khi anh tắt chế độ import-only bên dưới.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Select
                label="Proxy mode"
                value={proxyMode}
                onChange={(e) => setProxyMode(e.target.value)}
                options={[
                  { value: "none", label: "No proxy" },
                  { value: "single", label: "One proxy pool for import" },
                  { value: "round-robin", label: "Round-robin proxy pools" },
                ]}
              />

              {proxyMode === "single" && (
                <Select
                  label="Proxy pool"
                  value={proxyPoolId}
                  onChange={(e) => setProxyPoolId(e.target.value)}
                  placeholder="Choose proxy pool"
                  options={proxyOptions}
                  disabled={!proxyOptions.length}
                  hint={!proxyOptions.length ? "Chưa có proxy pool active" : "Dùng pool này trong lúc import"}
                />
              )}
            </div>

            {proxyMode === "round-robin" && (
              <div className="rounded-lg border border-black/10 dark:border-white/10 p-3 space-y-2">
                <div className="text-sm font-medium text-text-main">Chọn proxy pools để xoay</div>
                {!activeProxyPools.length ? (
                  <div className="text-sm text-text-muted">Chưa có proxy pool active.</div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {activeProxyPools.map((pool) => (
                      <label key={pool.id} className="flex items-center gap-2 rounded-md border border-black/5 dark:border-white/10 px-3 py-2 text-sm cursor-pointer hover:bg-black/5 dark:hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={proxyPoolIds.includes(pool.id)}
                          onChange={() => toggleRoundRobinPool(pool.id)}
                          className="rounded border-black/20 dark:border-white/20"
                        />
                        <span className="truncate text-text-main">{pool.name || pool.id}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {proxyMode !== "none" && (
              <div className="flex items-center justify-between gap-4 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-text-main">Import-only proxy</div>
                  <div className="text-xs text-text-muted">Bật: không lưu proxy vào account. Tắt: bind proxy pool đã chọn vào account sau import.</div>
                </div>
                <Toggle checked={importProxyOnly} onChange={setImportProxyOnly} />
              </div>
            )}
          </Card>

          {apiError && (
            <div className="rounded-md border border-red-300/60 dark:border-red-800/60 bg-red-50/60 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
              {apiError}
            </div>
          )}

          <ImportPreviewTable tokens={parsed.tokens} existingEmails={existingEmails} importing={importing} onImport={handleImport} />

          <div className="flex justify-end gap-2 border-t border-black/5 dark:border-white/10 pt-4">
            <Button variant="ghost" onClick={resetAndClose} disabled={importing}>Đóng</Button>
            <Button icon="upload" loading={importing} disabled={!!parsed.error || !parsed.tokens.length} onClick={handleImport}>
              Import vào bảng Codex
            </Button>
          </div>
        </div>
      </Modal>

      <ImportResultModal isOpen={!!result} result={result} onClose={() => setResult(null)} />
    </>
  );
}

BulkImportCodexModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  proxyPools: PropTypes.array,
  connections: PropTypes.array,
  onImported: PropTypes.func,
};
