"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardSkeleton } from "@/shared/components";
import { cn } from "@/shared/utils/cn";

const ROOM_LABELS = {
  living: "Phòng khách",
  bedroom: "Phòng ngủ",
  child: "Phòng trẻ em",
  worship: "Phòng thờ",
  kitchen: "Phòng bếp",
  bath: "Phòng tắm",
  office: "Văn phòng",
};

function formatTime(ms) {
  if (!ms) return "-";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function GoldLibraryTab({ refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openRooms, setOpenRooms] = useState(new Set());
  const [activeImage, setActiveImage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/image-gen/gold", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("[gold] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, refreshKey]);

  if (loading && !data) return <CardSkeleton />;

  const rooms = data?.rooms || {};
  const totalCount = Object.values(rooms).reduce((sum, list) => sum + list.length, 0);

  const toggleRoom = (room) => {
    setOpenRooms((prev) => {
      const next = new Set(prev);
      if (next.has(room)) next.delete(room);
      else next.add(room);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="px-4 py-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-text-main">Gold Library</h3>
          <p className="text-sm text-text-muted">
            {totalCount} ảnh gold trong {Object.keys(rooms).filter((r) => rooms[r].length > 0).length} phòng
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="text-sm text-primary hover:underline cursor-pointer flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Refresh
        </button>
      </Card>

      <div className="flex flex-col gap-2">
        {Object.entries(rooms).map(([room, list]) => {
          const isOpen = openRooms.has(room);
          return (
            <Card key={room} padding="none" className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggleRoom(room)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-text-muted text-[20px]">
                    {isOpen ? "folder_open" : "folder"}
                  </span>
                  <span className="font-medium text-text-main">{ROOM_LABELS[room] || room}</span>
                  <span className="text-xs text-text-muted font-mono">{room}</span>
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
                    {list.length}
                  </span>
                </div>
                <span
                  className="material-symbols-outlined text-[18px] text-text-muted transition-transform"
                  style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  expand_more
                </span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4">
                  {list.length === 0 ? (
                    <p className="text-sm text-text-muted italic py-2">Chưa có ảnh gold cho phòng này.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {list.map((g) => {
                        const src = `/api/image-gen/image?path=${encodeURIComponent(g.path)}`;
                        return (
                          <button
                            key={g.path}
                            type="button"
                            onClick={() => setActiveImage(g)}
                            className={cn(
                              "group flex flex-col rounded-lg overflow-hidden border border-black/5 dark:border-white/5",
                              "bg-bg text-left transition-all hover:border-primary/30 hover:shadow-md cursor-pointer"
                            )}
                          >
                            <div className="aspect-square w-full bg-black/5 dark:bg-white/5 overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={src}
                                alt={g.filename}
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="px-2 py-1.5 flex flex-col gap-0.5">
                              <span className="text-xs font-medium text-text-main truncate">{g.style}</span>
                              <span className="text-[10px] text-text-muted truncate">
                                {g.label || "—"} • {formatTime(g.mtime)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Lightbox */}
      {activeImage && (
        <button
          type="button"
          onClick={() => setActiveImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/image-gen/image?path=${encodeURIComponent(activeImage.path)}`}
            alt={activeImage.filename}
            className="max-w-full max-h-full object-contain rounded shadow-2xl"
          />
        </button>
      )}
    </div>
  );
}
