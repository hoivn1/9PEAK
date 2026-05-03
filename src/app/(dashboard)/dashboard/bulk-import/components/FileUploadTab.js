"use client";
// [9peak-fork] v0.5.1 — Bulk Import: file upload + drag-drop tab.

import { useCallback, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Card } from "@/shared/components";

export default function FileUploadTab({ onFileLoad, fileName, parseError }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const readFile = useCallback(
    (file) => {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".json")) {
        onFileLoad({ error: "File phải có extension .json", fileName: file.name });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = String(e.target?.result || "");
        onFileLoad({ text, fileName: file.name });
      };
      reader.onerror = () => onFileLoad({ error: "Đọc file lỗi", fileName: file.name });
      reader.readAsText(file);
    },
    [onFileLoad]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) readFile(file);
    },
    [readFile]
  );

  return (
    <Card padding="md" className="space-y-3">
      <div>
        <h3 className="text-text-main font-semibold">Upload JSON file</h3>
        <p className="text-sm text-text-muted">
          Kéo-thả file <code className="px-1 rounded bg-black/5 dark:bg-white/5">tokens.json</code> hoặc click để chọn.
        </p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={
          "w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 px-4 transition-colors cursor-pointer " +
          (dragOver
            ? "border-primary bg-primary/5"
            : "border-black/10 dark:border-white/15 hover:border-primary/60 hover:bg-primary/5")
        }
      >
        <span className="material-symbols-outlined text-[36px] text-text-muted">cloud_upload</span>
        <div className="text-sm text-text-main font-medium">
          {fileName ? `Đã chọn: ${fileName}` : "Kéo file vào đây hoặc click để chọn"}
        </div>
        <div className="text-xs text-text-muted">Định dạng: .json (array tokens)</div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => readFile(e.target.files?.[0])}
      />

      {parseError && (
        <div className="rounded-md border border-red-300/60 dark:border-red-800/60 bg-red-50/60 dark:bg-red-900/20 p-3 text-xs text-red-700 dark:text-red-300">
          <span className="font-semibold">Parse lỗi:</span> {parseError}
        </div>
      )}
    </Card>
  );
}

FileUploadTab.propTypes = {
  onFileLoad: PropTypes.func.isRequired,
  fileName: PropTypes.string,
  parseError: PropTypes.string,
};
