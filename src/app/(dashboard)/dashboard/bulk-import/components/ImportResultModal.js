"use client";
// [9peak-fork] v0.5.1 — Bulk Import: result modal sau khi POST /api/codex/bulk-import.

import PropTypes from "prop-types";
import { Modal, Button } from "@/shared/components";

function reasonLabel(reason) {
  switch (reason) {
    case "duplicate":
      return "đã có connection cùng email";
    case "invalid_email":
      return "email không hợp lệ";
    case "invalid_access_token":
      return "accessToken không phải JWT";
    case "missing_refresh_token":
      return "thiếu refreshToken";
    case "invalid_id_token":
      return "idToken không phải JWT";
    case "id_token_missing_openai_claim":
      return "idToken thiếu claim OpenAI";
    case "db_save_failed":
      return "DB save lỗi";
    case "not_object":
      return "entry không phải object";
    default:
      return reason || "không rõ";
  }
}

export default function ImportResultModal({ isOpen, onClose, result }) {
  if (!result) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Import result" size="md">
        <div className="text-sm text-text-muted">Không có dữ liệu trả về.</div>
      </Modal>
    );
  }

  const { total = 0, imported = 0, skipped = 0, failed = 0, details = [] } = result;
  const failedDetails = details.filter((d) => d.status === "failed");
  const skippedDetails = details.filter((d) => d.status === "skipped");

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import result" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-md border border-black/5 dark:border-white/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Total</div>
            <div className="text-2xl font-semibold text-text-main">{total}</div>
          </div>
          <div className="rounded-md border border-emerald-300/50 dark:border-emerald-800/40 bg-emerald-50/40 dark:bg-emerald-900/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Imported</div>
            <div className="text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{imported}</div>
          </div>
          <div className="rounded-md border border-amber-300/50 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-900/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Skipped</div>
            <div className="text-2xl font-semibold text-amber-700 dark:text-amber-300">{skipped}</div>
          </div>
          <div className="rounded-md border border-red-300/50 dark:border-red-800/40 bg-red-50/40 dark:bg-red-900/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">Failed</div>
            <div className="text-2xl font-semibold text-red-700 dark:text-red-300">{failed}</div>
          </div>
        </div>

        {failedDetails.length > 0 && (
          <div className="rounded-md border border-red-300/50 dark:border-red-800/40 bg-red-50/30 dark:bg-red-900/10 p-3 text-xs">
            <div className="font-semibold text-red-700 dark:text-red-300 mb-1">Failed:</div>
            <ul className="list-disc pl-5 space-y-0.5 text-red-700/90 dark:text-red-300/90">
              {failedDetails.slice(0, 10).map((d) => (
                <li key={d.idx}>
                  <span className="font-mono">#{d.idx + 1}</span> {d.email || "(no email)"} — {reasonLabel(d.reason)}
                  {d.error && <span className="opacity-80"> · {d.error.slice(0, 120)}</span>}
                </li>
              ))}
              {failedDetails.length > 10 && <li>… và {failedDetails.length - 10} entry lỗi khác</li>}
            </ul>
          </div>
        )}

        {skippedDetails.length > 0 && (
          <div className="rounded-md border border-amber-300/50 dark:border-amber-800/40 bg-amber-50/30 dark:bg-amber-900/10 p-3 text-xs">
            <div className="font-semibold text-amber-700 dark:text-amber-300 mb-1">Skipped (duplicate):</div>
            <ul className="list-disc pl-5 space-y-0.5 text-amber-700/90 dark:text-amber-300/90">
              {skippedDetails.slice(0, 10).map((d) => (
                <li key={d.idx}>
                  <span className="font-mono">#{d.idx + 1}</span> {d.email}
                </li>
              ))}
              {skippedDetails.length > 10 && <li>… và {skippedDetails.length - 10} entry trùng khác</li>}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="primary" onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </Modal>
  );
}

ImportResultModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  result: PropTypes.object,
};
