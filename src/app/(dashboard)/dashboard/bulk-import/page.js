"use client";
// [9peak-fork] v0.5.1 — Bulk Import Codex tokens (replaces v0.5.0 GPT Checker).
// 2-tab UI: paste JSON / upload file → preview parsed tokens → POST
// /api/codex/bulk-import → result modal.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNotificationStore } from "@/store/notificationStore";
import JsonInputTab from "./components/JsonInputTab";
import FileUploadTab from "./components/FileUploadTab";
import ImportPreviewTable from "./components/ImportPreviewTable";
import ImportResultModal from "./components/ImportResultModal";

function safeParseTokens(text) {
  if (!text || !text.trim()) return { tokens: [], error: null };
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      return { tokens: [], error: "JSON phải là array (mảng) tokens" };
    }
    return { tokens: parsed, error: null };
  } catch (e) {
    return { tokens: [], error: e?.message || "Invalid JSON" };
  }
}

export default function BulkImportPage() {
  const [tab, setTab] = useState("paste");
  const [jsonText, setJsonText] = useState("");
  const [fileText, setFileText] = useState("");
  const [fileName, setFileName] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [existingEmails, setExistingEmails] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const notify = useNotificationStore();

  // Load existing Codex emails for dedupe preview (best-effort).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/providers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const list = Array.isArray(data?.connections)
          ? data.connections
          : Array.isArray(data)
            ? data
            : [];
        const emails = list
          .filter((c) => c.provider === "codex" && c.authType === "oauth" && c.email)
          .map((c) => String(c.email).toLowerCase());
        setExistingEmails(new Set(emails));
      })
      .catch(() => {
        /* dedupe preview is best-effort; server still re-checks at POST time */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeText = tab === "paste" ? jsonText : fileText;
  const activeError = tab === "paste" ? null : fileError;
  const parsed = useMemo(() => safeParseTokens(activeText), [activeText]);

  const handleFileLoad = useCallback(({ text, error, fileName: name }) => {
    if (error) {
      setFileError(error);
      setFileText("");
      setFileName(name || null);
      return;
    }
    setFileError(null);
    setFileText(text || "");
    setFileName(name || null);
  }, []);

  const handleImport = useCallback(async () => {
    if (!parsed.tokens.length) return;
    setImporting(true);
    try {
      const res = await fetch("/api/codex/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: parsed.tokens }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        notify.error(data?.error || "Import failed");
        return;
      }
      setResult(data);
      setModalOpen(true);
      const seen = new Set(existingEmails);
      for (const d of data.details || []) {
        if (d.status === "imported" && d.email) {
          seen.add(String(d.email).toLowerCase());
        }
      }
      setExistingEmails(seen);
      if (data.imported > 0) {
        notify.success(`Đã import ${data.imported} acc Codex`);
      } else {
        notify.info("Không có acc nào mới được import");
      }
    } catch (e) {
      notify.error("Import lỗi: " + (e?.message || e));
    } finally {
      setImporting(false);
    }
  }, [parsed.tokens, notify, existingEmails]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-text-main">Bulk Import</h1>
        <p className="text-text-muted text-sm md:text-base">
          Import hàng loạt token Codex (đã login sẵn) qua paste JSON hoặc upload file.
          Login automation đã tách ra <code className="px-1 rounded bg-black/5 dark:bg-white/5">tools/collector/</code> — xem{" "}
          <code className="px-1 rounded bg-black/5 dark:bg-white/5">INSTALL.md</code> phần Bulk Import.
        </p>
      </header>

      <div className="flex items-center gap-1 border-b border-black/10 dark:border-white/10">
        <button
          type="button"
          onClick={() => setTab("paste")}
          className={
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px " +
            (tab === "paste"
              ? "border-primary text-primary"
              : "border-transparent text-text-muted hover:text-text-main")
          }
        >
          <span className="material-symbols-outlined align-middle text-[16px] mr-1">content_paste</span>
          Paste JSON
        </button>
        <button
          type="button"
          onClick={() => setTab("upload")}
          className={
            "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px " +
            (tab === "upload"
              ? "border-primary text-primary"
              : "border-transparent text-text-muted hover:text-text-main")
          }
        >
          <span className="material-symbols-outlined align-middle text-[16px] mr-1">upload_file</span>
          Upload file
        </button>
      </div>

      {tab === "paste" ? (
        <JsonInputTab value={jsonText} onChange={setJsonText} parseError={parsed.error || ""} />
      ) : (
        <FileUploadTab
          onFileLoad={handleFileLoad}
          fileName={fileName}
          parseError={activeError || parsed.error || ""}
        />
      )}

      <ImportPreviewTable
        tokens={parsed.tokens}
        existingEmails={existingEmails}
        importing={importing}
        onImport={handleImport}
      />

      <ImportResultModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        result={result}
      />
    </div>
  );
}
