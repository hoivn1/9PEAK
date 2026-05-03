"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardSkeleton } from "@/shared/components";

// Distribution chart palette — leads with 9Peak brand colors (jade + brass),
// then qualitative hues for additional categories. Ensures theme consistency.
const PIE_COLORS = [
  "#1B4F42", // jade (brand primary)
  "#B8925F", // antique brass (brand accent)
  "#3E7A6B", // jade light
  "#D4B080", // brass light
  "#6E5533", // brass dark
  "#0C2A23", // jade dark
  "#5E6A63", // sage neutral
  "#A38B5F", // muted gold
  "#2B7A8C", // teal (harmonic cool)
  "#8B4543", // muted rust (harmonic warm contrast)
];

function formatTs(ts) {
  if (!ts) return "-";
  const d = new Date(ts * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timeAgo(ts) {
  if (!ts) return "-";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)}s trước`;
  if (diff < 3600) return `${Math.floor(diff / 60)}p trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

function KpiCard({ title, value, subtitle, accent }) {
  return (
    <Card className="px-4 py-3 flex flex-col gap-1">
      <span className="text-text-muted text-xs uppercase font-semibold">{title}</span>
      <span className={`text-2xl font-bold ${accent || "text-text-main"}`}>{value}</span>
      {subtitle && <span className="text-[11px] text-text-muted">{subtitle}</span>}
    </Card>
  );
}

function DailyBars({ items }) {
  const max = Math.max(1, ...items.map((d) => d?.count || 0));
  return (
    <div className="flex items-end gap-2 h-[180px] pt-3">
      {items.map((d, i) => {
        const count = d?.count || 0;
        const heightPct = (count / max) * 100;
        const dateLabel = d?.date ? d.date.slice(5) : "-";
        return (
          <div key={d?.date || i} className="flex-1 flex flex-col items-center justify-end gap-1 group">
            <span className="text-[11px] font-semibold text-text-main opacity-0 group-hover:opacity-100 transition-opacity">
              {count}
            </span>
            <div
              className="w-full rounded-t-md bg-linear-to-t from-primary to-primary/70 hover:from-primary-hover hover:to-primary transition-all relative"
              style={{ height: `${Math.max(heightPct, count > 0 ? 4 : 0.5)}%`, minHeight: count > 0 ? 4 : 1 }}
              title={`${d?.date || "?"}: ${count} ảnh`}
            />
            <span className="text-[10px] text-text-muted whitespace-nowrap">{dateLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

function DistributionList({ items, keyName, total }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-text-muted">Chưa có data.</p>;
  }
  const max = Math.max(1, ...items.map((d) => d?.count || 0));
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((entry, i) => {
        const name = entry?.[keyName] || "-";
        const count = entry?.count || 0;
        const percent = entry?.percent ?? (total > 0 ? Math.round((count / total) * 100) : 0);
        const widthPct = (count / max) * 100;
        const color = PIE_COLORS[i % PIE_COLORS.length];
        return (
          <div key={name} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-text-main capitalize">{name}</span>
              <span className="text-text-muted text-xs">
                <span className="font-semibold text-text-main">{count}</span>
                <span className="ml-1.5">({percent}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${widthPct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StatsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/image-gen/stats", { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `HTTP ${res.status}`);
        return;
      }
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading && !data) return <CardSkeleton />;
  if (error) {
    return (
      <Card>
        <p className="text-red-500 text-sm">Lỗi tải stats: {error}</p>
      </Card>
    );
  }
  if (!data || !data.totalGens) {
    return (
      <Card className="px-6 py-12 flex flex-col items-center gap-2 text-text-muted">
        <span className="material-symbols-outlined text-[48px]">analytics</span>
        <p className="text-sm">Chưa có ảnh nào được sinh.</p>
      </Card>
    );
  }

  const gensLast7Days = Array.isArray(data.gensLast7Days) ? data.gensLast7Days : [];
  const byRoom = Array.isArray(data.byRoom) ? data.byRoom : [];
  const byStyle = Array.isArray(data.byStyle) ? data.byStyle : [];
  const editVsGenerate = data.editVsGenerate || { edits: 0, generates: 0 };
  const successRate = data.successRate || { total: 0, hasOutput: 0, percent: 0 };
  const totalLast7 = gensLast7Days.reduce((sum, d) => sum + (d?.count || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Tổng ảnh" value={data.totalGens} accent="text-primary" />
        <KpiCard title="Tuần này" value={totalLast7} subtitle="7 ngày gần nhất" />
        <KpiCard
          title="Tỉ lệ thành công"
          value={`${successRate.percent}%`}
          subtitle={`${successRate.hasOutput}/${successRate.total} có PNG`}
          accent="text-emerald-600 dark:text-emerald-400"
        />
        <KpiCard
          title="TB inputs/gen"
          value={Number(data.avgInputsPerGen ?? 0).toFixed(2)}
          subtitle="ảnh đầu vào trung bình"
        />
      </div>

      {/* 7-day chart */}
      <Card className="px-4 py-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-main">Ảnh sinh / ngày (7 ngày qua)</h3>
          <button
            type="button"
            onClick={load}
            className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            Refresh
          </button>
        </div>
        <DailyBars items={gensLast7Days} />
      </Card>

      {/* Distribution lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="px-4 py-4 flex flex-col gap-3">
          <h3 className="font-semibold text-text-main">Phân phối theo Room</h3>
          <DistributionList items={byRoom} keyName="room" total={data.totalGens} />
        </Card>
        <Card className="px-4 py-4 flex flex-col gap-3">
          <h3 className="font-semibold text-text-main">Phân phối theo Style</h3>
          <DistributionList items={byStyle} keyName="style" total={data.totalGens} />
        </Card>
      </div>

      {/* Edit vs Generate + timestamps */}
      <Card className="px-4 py-4 flex flex-col gap-3">
        <h3 className="font-semibold text-text-main">Edit vs Generate & timestamps</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-black/5 dark:border-white/5">
                <td className="px-3 py-2 text-text-muted w-1/3">Edit (is_edit=1)</td>
                <td className="px-3 py-2 font-medium text-blue-600 dark:text-blue-400">
                  {editVsGenerate.edits} ({data.totalGens > 0 ? Math.round((editVsGenerate.edits / data.totalGens) * 100) : 0}%)
                </td>
              </tr>
              <tr className="border-b border-black/5 dark:border-white/5">
                <td className="px-3 py-2 text-text-muted">Generate (is_edit=0)</td>
                <td className="px-3 py-2 font-medium text-emerald-600 dark:text-emerald-400">
                  {editVsGenerate.generates} ({data.totalGens > 0 ? Math.round((editVsGenerate.generates / data.totalGens) * 100) : 0}%)
                </td>
              </tr>
              <tr className="border-b border-black/5 dark:border-white/5">
                <td className="px-3 py-2 text-text-muted">Ảnh mới nhất</td>
                <td className="px-3 py-2 text-text-main">
                  {timeAgo(data.lastGenAt)} <span className="text-text-muted">({formatTs(data.lastGenAt)})</span>
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-text-muted">Ảnh cũ nhất</td>
                <td className="px-3 py-2 text-text-main">
                  {timeAgo(data.oldestGenAt)} <span className="text-text-muted">({formatTs(data.oldestGenAt)})</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
