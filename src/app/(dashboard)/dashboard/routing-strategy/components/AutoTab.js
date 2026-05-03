"use client";

/**
 * Auto Mode tab — GPT account group routing.
 * [9peak-fork] v0.5.1 — simple account rotation by FREE / PLUS / BUSINESS.
 */

import PropTypes from "prop-types";
import { Card, Button, Toggle, PlanBadge } from "@/shared/components";

const GROUP_META = {
  business: {
    label: "Business / Pro / Team",
    badge: "Business",
    icon: "business_center",
    color: "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20",
    strategy: "Fill-first theo tier cao",
    description: "Ưu tiên quota cao, dùng một acc trước rồi mới chuyển khi bị giới hạn.",
  },
  plus: {
    label: "Plus / Go",
    badge: "Plus",
    icon: "workspace_premium",
    color: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
    strategy: "Sticky round-robin",
    description: "Rải request đều hơn giữa các acc Plus để tránh burn một acc quá nhanh.",
  },
  free: {
    label: "Free",
    badge: "Free",
    icon: "public",
    color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    strategy: "Round-robin sticky=1",
    description: "Xoay đều từng request vì quota thấp, chỉ dùng khi nhóm cao hơn không có sẵn.",
  },
  other: {
    label: "Other / Unknown",
    badge: "Other",
    icon: "help",
    color: "text-slate-600 dark:text-slate-300 bg-slate-500/10 border-slate-500/20",
    strategy: "Round-robin an toàn",
    description: "Không đọc được plan rõ ràng nên xử lý như nhóm dự phòng.",
  },
};
const GROUP_ORDER = ["business", "plus", "free", "other"];

function normalizeTier(planType) {
  if (!planType || typeof planType !== "string") return "other";
  const lower = planType.toLowerCase().trim();
  const stripped = lower.replace(/^(chatgpt|plan|tier)\s+/i, "").trim();
  const known = ["enterprise", "business", "team", "plus", "free", "pro", "go"];
  for (const tier of known) {
    if (stripped === tier || stripped.includes(tier)) return tier;
  }
  return "other";
}

function tierToGroup(tier) {
  if (["pro", "business", "enterprise", "team"].includes(tier)) return "business";
  if (["plus", "go"].includes(tier)) return "plus";
  if (tier === "free") return "free";
  return "other";
}

export default function AutoTab({ settings, codexConnections, onUpdateMode }) {
  const autoOn = (settings.routingMode || "custom") === "auto";

  const groupRows = (() => {
    const buckets = {};
    for (const group of GROUP_ORDER) buckets[group] = [];
    for (const conn of codexConnections) {
      const tier = normalizeTier(conn.providerSpecificData?.chatgptPlanType);
      const group = tierToGroup(tier);
      buckets[group].push({ ...conn, normalizedTier: tier });
    }
    return GROUP_ORDER.map((group) => ({
      group,
      meta: GROUP_META[group],
      connections: buckets[group],
    }));
  })();

  const activeGroups = groupRows.filter((row) => row.connections.length > 0);
  const mixedMode = activeGroups.length > 1;
  const totalAccounts = activeGroups.reduce((sum, row) => sum + row.connections.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold">GPT Account Groups</h3>
              <p className="text-sm text-text-muted">
                Xoay acc Codex theo nhóm FREE / PLUS / BUSINESS. Bật Auto để 9Peak tự chọn cách an toàn nhất.
              </p>
            </div>
          </div>
          <Toggle checked={autoOn} onChange={() => onUpdateMode(autoOn ? "custom" : "auto")} />
        </div>

        {mixedMode && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-300">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px] mt-0.5">shuffle</span>
              <div>
                <p className="font-medium">Mixed List đang bật tự động</p>
                <p className="text-xs mt-1">
                  List đang lẫn nhiều loại acc ({activeGroups.map((row) => row.meta.badge).join(" + ")}) nên Auto Mode sẽ xoay đều toàn bộ {totalAccounts} acc với sticky=1.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border/50">
          {groupRows.map(({ group, meta, connections }) => {
            const active = connections.length > 0;
            return (
              <div
                key={group}
                className={`p-4 rounded-xl border ${active ? meta.color : "bg-bg border-border text-text-muted"}`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-[20px]">{meta.icon}</span>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{meta.label}</p>
                      <p className="text-xs opacity-80">{connections.length} acc active</p>
                    </div>
                  </div>
                  <PlanBadge planType={meta.badge} size="sm" />
                </div>

                <p className="text-sm font-medium mb-1">{mixedMode && active ? "Mixed even round-robin" : meta.strategy}</p>
                <p className="text-xs opacity-80 mb-3">
                  {mixedMode && active
                    ? "Khi list bị lẫn nhóm, nhóm này cũng được đưa vào vòng xoay đều toàn list."
                    : meta.description}
                </p>

                {connections.length > 0 ? (
                  <div className="text-xs opacity-80 truncate">
                    {connections
                      .map((c) => c.displayName || c.email || c.name || c.id?.slice(0, 8))
                      .join(", ")}
                  </div>
                ) : (
                  <p className="text-xs opacity-70 italic">Chưa có acc nhóm này.</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-bg border border-border text-sm text-text-muted">
          <p className="font-medium text-text-main mb-1">Luật Auto Mode</p>
          <p>
            Một nhóm duy nhất: dùng strategy tối ưu riêng của nhóm đó. Nhiều nhóm lẫn nhau: xoay đều toàn list để tránh ưu tiên sai loại acc.
          </p>
        </div>
      </Card>

      {!autoOn && (
        <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-300">
          Auto Mode đang TẮT — đang dùng routing thủ công. Bật Auto lại bằng toggle ở trên,
          hoặc qua tab Preset / Advanced để chọn strategy khác.
        </div>
      )}
    </div>
  );
}

AutoTab.propTypes = {
  settings: PropTypes.object.isRequired,
  codexConnections: PropTypes.array.isRequired,
  onUpdateMode: PropTypes.func.isRequired,
};
