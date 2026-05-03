"use client";

import { useEffect, useState } from "react";
import { Card } from "@/shared/components";
import { APP_CONFIG } from "@/shared/constants/config";

export default function UpstreamTrackingCard() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <div className="flex items-center gap-4 mb-4">
        <div className="size-12 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl">fork_right</span>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Upstream Tracking</h2>
          <p className="text-text-muted text-sm">
            9Peak là fork của 9Router by @{APP_CONFIG.upstreamAuthor}. Theo dõi release upstream để cherry-pick thủ công khi có tính năng hữu ích.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-4 border-t border-border">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-bg border border-border">
            <p className="text-xs text-text-muted uppercase font-semibold mb-1">9Peak (đang chạy)</p>
            <p className="text-2xl font-bold text-primary">v{APP_CONFIG.version}</p>
            <p className="text-xs text-text-muted mt-0.5">Fork by Hoivn1 GitHub</p>
          </div>
          <div className="p-3 rounded-lg bg-bg border border-border">
            <p className="text-xs text-text-muted uppercase font-semibold mb-1">9Router (upstream npm)</p>
            <p className="text-2xl font-bold text-text-main">
              {loading ? "…" : info?.latestVersion ? `v${info.latestVersion}` : "—"}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {info?.latestVersion && info?.hasUpdate ? (
                <span className="text-blue-600 dark:text-blue-400">↑ Mới hơn 9Peak hiện tại</span>
              ) : info?.latestVersion ? (
                <span>Không mới hơn fork</span>
              ) : (
                "Chưa fetch được"
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <a
            href={info?.upstreamReleasesUrl || "https://github.com/decolua/9router/releases"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-sm font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">new_releases</span>
            Releases trên GitHub
            <span className="material-symbols-outlined text-[14px]">north_east</span>
          </a>
          <a
            href={info?.upstreamChangelogUrl || "https://github.com/decolua/9router/blob/master/CHANGELOG.md"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-text-main text-sm font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">history</span>
            Changelog
            <span className="material-symbols-outlined text-[14px]">north_east</span>
          </a>
          <a
            href={APP_CONFIG.upstreamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-text-main text-sm font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">code</span>
            Repo upstream
            <span className="material-symbols-outlined text-[14px]">north_east</span>
          </a>
        </div>

        <p className="text-xs text-text-muted pt-1">
          ℹ️ 9Peak không auto-update. Khi muốn cherry-pick từ upstream:
          <code className="ml-1 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-[11px]">
            git fetch upstream && git log master..upstream/master --oneline
          </code>
        </p>
      </div>
    </Card>
  );
}
