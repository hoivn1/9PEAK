"use client";

import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

function timeAgo(ts) {
  if (!ts) return "-";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)}s trước`;
  if (diff < 3600) return `${Math.floor(diff / 60)}p trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

export default function HistoryCard({ entry, onClick }) {
  const exists = entry.outputExists;
  const thumbUrl = exists
    ? `/api/image-gen/image?path=${encodeURIComponent(entry.output)}`
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col rounded-lg overflow-hidden border border-black/5 dark:border-white/5",
        "bg-surface text-left transition-all hover:border-primary/30 hover:shadow-md cursor-pointer",
      )}
    >
      <div className="relative aspect-square w-full bg-black/5 dark:bg-white/5 flex items-center justify-center overflow-hidden">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={`${entry.room} ${entry.style}`}
            className={cn(
              "w-full h-full object-cover transition-all",
              !exists && "grayscale opacity-60"
            )}
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-text-muted p-4">
            <span className="material-symbols-outlined text-[32px]">image_not_supported</span>
            <span className="text-xs">PNG đã bị xoá</span>
          </div>
        )}
        {entry.is_edit ? (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-blue-500/90 text-white text-[10px] font-semibold">
            EDIT
          </span>
        ) : (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-emerald-500/90 text-white text-[10px] font-semibold">
            GEN
          </span>
        )}
      </div>
      <div className="px-3 py-2 flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
            {entry.room}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-text-muted text-[11px]">
            {entry.style}
          </span>
        </div>
        <span className="text-[11px] text-text-muted">{timeAgo(entry.ts)}</span>
      </div>
    </button>
  );
}

HistoryCard.propTypes = {
  entry: PropTypes.object.isRequired,
  onClick: PropTypes.func,
};
