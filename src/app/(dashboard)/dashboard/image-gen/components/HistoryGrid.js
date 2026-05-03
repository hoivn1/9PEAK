"use client";

import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import HistoryCard from "./HistoryCard";
import DetailModal from "./DetailModal";

const ROOMS = ["living", "bedroom", "child", "worship", "kitchen", "bath", "office"];

export default function HistoryGrid({ entries, onPromoted }) {
  const [filterRoom, setFilterRoom] = useState("");
  const [filterStyle, setFilterStyle] = useState("");
  const [onlyExists, setOnlyExists] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activeEntry, setActiveEntry] = useState(null);

  const styles = useMemo(() => {
    const s = new Set();
    for (const e of entries) if (e.style) s.add(e.style);
    return [...s].sort();
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterRoom && e.room !== filterRoom) return false;
      if (filterStyle && e.style !== filterStyle) return false;
      if (onlyExists && !e.outputExists) return false;
      if (fromDate) {
        const fromTs = new Date(fromDate).getTime() / 1000;
        if (e.ts < fromTs) return false;
      }
      if (toDate) {
        const toTs = new Date(toDate).getTime() / 1000 + 86400;
        if (e.ts > toTs) return false;
      }
      return true;
    });
  }, [entries, filterRoom, filterStyle, onlyExists, fromDate, toDate]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-surface border border-black/5 dark:border-white/5">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase font-semibold text-text-muted" htmlFor="filter-room">Room</label>
          <select
            id="filter-room"
            value={filterRoom}
            onChange={(e) => setFilterRoom(e.target.value)}
            className="px-2 py-1.5 rounded border border-black/10 dark:border-white/10 bg-bg text-sm"
          >
            <option value="">Tất cả</option>
            {ROOMS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase font-semibold text-text-muted" htmlFor="filter-style">Style</label>
          <select
            id="filter-style"
            value={filterStyle}
            onChange={(e) => setFilterStyle(e.target.value)}
            className="px-2 py-1.5 rounded border border-black/10 dark:border-white/10 bg-bg text-sm"
          >
            <option value="">Tất cả</option>
            {styles.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase font-semibold text-text-muted" htmlFor="filter-from">Từ ngày</label>
          <input
            id="filter-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-2 py-1.5 rounded border border-black/10 dark:border-white/10 bg-bg text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase font-semibold text-text-muted" htmlFor="filter-to">Đến ngày</label>
          <input
            id="filter-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-2 py-1.5 rounded border border-black/10 dark:border-white/10 bg-bg text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={onlyExists}
            onChange={(e) => setOnlyExists(e.target.checked)}
          />
          Chỉ show có PNG
        </label>
        <span className="ml-auto text-xs text-text-muted self-center">
          {filtered.length} / {entries.length} kết quả
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-2">
          <span className="material-symbols-outlined text-[48px]">image_search</span>
          <p className="text-sm">Không có ảnh nào khớp filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((entry) => (
            <HistoryCard
              key={entry._file || entry.ts}
              entry={entry}
              onClick={() => setActiveEntry(entry)}
            />
          ))}
        </div>
      )}

      {activeEntry && (
        <DetailModal
          entry={activeEntry}
          onClose={() => setActiveEntry(null)}
          onPromoted={(dest) => {
            if (typeof onPromoted === "function") onPromoted(dest);
          }}
        />
      )}
    </div>
  );
}

HistoryGrid.propTypes = {
  entries: PropTypes.array.isRequired,
  onPromoted: PropTypes.func,
};
