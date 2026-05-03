"use client";
// [9peak-fork] v0.5.1 — Bulk Import: paste JSON tab.

import PropTypes from "prop-types";
import { Card } from "@/shared/components";

export default function JsonInputTab({ value, onChange, parseError }) {
  return (
    <Card padding="md" className="space-y-3">
      <div>
        <h3 className="text-text-main font-semibold">Paste JSON</h3>
        <p className="text-sm text-text-muted">
          Paste array tokens (mảng JSON) thu thập từ collector tool. Mỗi entry phải có{" "}
          <code className="px-1 rounded bg-black/5 dark:bg-white/5">email</code>,{" "}
          <code className="px-1 rounded bg-black/5 dark:bg-white/5">accessToken</code>,{" "}
          <code className="px-1 rounded bg-black/5 dark:bg-white/5">refreshToken</code>,{" "}
          <code className="px-1 rounded bg-black/5 dark:bg-white/5">idToken</code>.
        </p>
      </div>
      <textarea
        rows={14}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          '[\n  {\n    "email": "alice@gmail.com",\n    "accessToken": "eyJ...",\n    "refreshToken": "rt_...",\n    "idToken": "eyJ...",\n    "expiresAt": 1735689600000\n  }\n]'
        }
        className="w-full px-3 py-2 rounded-md font-mono text-xs bg-bg border border-black/10 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      {parseError && (
        <div className="rounded-md border border-red-300/60 dark:border-red-800/60 bg-red-50/60 dark:bg-red-900/20 p-3 text-xs text-red-700 dark:text-red-300">
          <span className="font-semibold">Parse lỗi:</span> {parseError}
        </div>
      )}
    </Card>
  );
}

JsonInputTab.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  parseError: PropTypes.string,
};
