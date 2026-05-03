"use client";

/**
 * Reusable badge for ChatGPT plan tiers.
 * [9peak-fork] v0.4.0 — color coding mirrors AccountsTab.js (image-gen, v0.2.2).
 *
 * Props:
 *   - planType: string ("Plus", "Pro", "Business", "Team", "Enterprise",
 *               "Go", "Free", null) — case-insensitive, null/unknown
 *               renders as "Other".
 *   - size: "sm" | "md" — visual scale (default "sm").
 */

import PropTypes from "prop-types";

const PLAN_STYLES = {
  business: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  team: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  enterprise: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
  pro: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  plus: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  go: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  free: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  other: "bg-gray-100 text-gray-500 dark:bg-gray-800/60 dark:text-gray-400",
};

function normalize(planType) {
  if (!planType || typeof planType !== "string") return { key: "other", label: "Other" };
  const lower = planType.toLowerCase().trim();
  const stripped = lower.replace(/^(chatgpt|plan|tier)\s+/i, "").trim();
  const known = ["enterprise", "business", "team", "plus", "free", "pro", "go"];
  for (const tier of known) {
    if (stripped === tier || stripped.includes(tier)) {
      // Capitalize first letter for display.
      return { key: tier, label: tier.charAt(0).toUpperCase() + tier.slice(1) };
    }
  }
  return { key: "other", label: "Other" };
}

export default function PlanBadge({ planType, size = "sm" }) {
  const { key, label } = normalize(planType);
  const cls = PLAN_STYLES[key] || PLAN_STYLES.other;
  const sizing =
    size === "md"
      ? "px-2.5 py-1 text-xs"
      : "px-2 py-0.5 text-[11px]";
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${sizing} ${cls}`}>
      {label}
    </span>
  );
}

PlanBadge.propTypes = {
  planType: PropTypes.string,
  size: PropTypes.oneOf(["sm", "md"]),
};
