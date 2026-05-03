"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import Modal from "@/shared/components/Modal";
import Button from "@/shared/components/Button";
import PromoteGoldModal from "./PromoteGoldModal";

function formatTs(ts) {
  if (!ts) return "-";
  const d = new Date(ts * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DetailModal({ entry, onClose, onPromoted }) {
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [showPromote, setShowPromote] = useState(false);
  const [copyState, setCopyState] = useState("");

  if (!entry) return null;

  const exists = entry.outputExists;
  const fullSrc = exists ? `/api/image-gen/image?path=${encodeURIComponent(entry.output)}` : null;
  const prompt = entry.user_prompt || "";
  const promptShort = prompt.length > 300 ? prompt.slice(0, 300) + "..." : prompt;

  const meta = [
    ["Room", entry.room],
    ["Style", entry.style],
    ["Tier", entry.tier],
    ["Wall accent", entry.wall_accent],
    ["Lighting", entry.lighting],
    ["Mode", entry.is_edit ? "Edit" : "Generate"],
    ["Inputs", entry.inputs_count],
    ["Keep furniture", entry.keep_furniture ? "yes" : "no"],
    ["Keep wall", entry.keep_wall ? "yes" : "no"],
    ["Generated", formatTs(entry.ts)],
  ];

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState("Đã copy!");
      setTimeout(() => setCopyState(""), 2000);
    } catch {
      setCopyState("Copy fail");
    }
  };

  const handleDownload = () => {
    if (!fullSrc) return;
    const a = document.createElement("a");
    a.href = fullSrc;
    a.download = `9peak-${entry.room}-${entry.style}-${entry.ts}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <>
      <Modal
        isOpen={true}
        onClose={onClose}
        size="full"
        title={`${entry.room} • ${entry.style}`}
      >
        <div className="flex flex-col gap-4">
          {/* Image */}
          <div className="rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 flex items-center justify-center">
            {fullSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fullSrc}
                alt={`${entry.room} ${entry.style}`}
                className="max-h-[60vh] w-auto object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-text-muted py-12">
                <span className="material-symbols-outlined text-[48px]">image_not_supported</span>
                <p className="text-sm">PNG đã bị xoá khỏi /tmp.</p>
                <p className="text-xs font-mono break-all px-4">{entry.output}</p>
              </div>
            )}
          </div>

          {/* Meta table */}
          <div className="rounded-lg border border-black/5 dark:border-white/5 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {meta.map(([k, v]) => (
                  <tr key={k} className="border-b border-black/5 dark:border-white/5 last:border-b-0">
                    <td className="px-3 py-1.5 text-text-muted w-1/3">{k}</td>
                    <td className="px-3 py-1.5 font-medium text-text-main">{v ?? "-"}</td>
                  </tr>
                ))}
                {entry.gold_ref && (
                  <tr className="border-b border-black/5 dark:border-white/5 last:border-b-0">
                    <td className="px-3 py-1.5 text-text-muted">Gold ref</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-text-main break-all">{entry.gold_ref}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Prompt */}
          {prompt && (
            <div className="rounded-lg border border-black/5 dark:border-white/5 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-semibold text-text-muted">Prompt</span>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  {copyState || "Copy prompt"}
                </button>
              </div>
              <p className="text-sm text-text-main whitespace-pre-wrap">
                {showFullPrompt ? prompt : promptShort}
              </p>
              {prompt.length > 300 && (
                <button
                  type="button"
                  onClick={() => setShowFullPrompt((v) => !v)}
                  className="text-xs text-primary hover:underline self-start cursor-pointer"
                >
                  {showFullPrompt ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              variant="outline"
              icon="download"
              disabled={!exists}
              onClick={handleDownload}
            >
              Download PNG
            </Button>
            <Button
              variant="primary"
              icon="star"
              disabled={!exists}
              onClick={() => setShowPromote(true)}
            >
              Promote to Gold
            </Button>
          </div>
        </div>
      </Modal>

      {showPromote && (
        <PromoteGoldModal
          entry={entry}
          onClose={() => setShowPromote(false)}
          onSuccess={(dest) => {
            setShowPromote(false);
            if (typeof onPromoted === "function") onPromoted(dest);
          }}
        />
      )}
    </>
  );
}

DetailModal.propTypes = {
  entry: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
  onPromoted: PropTypes.func,
};
