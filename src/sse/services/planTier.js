/**
 * Plan tier normalization for ChatGPT/Codex connections — Smart Routing v2.
 * [9peak-fork] v0.4.0 — Auto Mode core helpers.
 *
 * Field `chatgptPlanType` is stored on Codex connections inside
 * `providerSpecificData.chatgptPlanType` (since v0.2.2). Values come
 * from upstream OpenAI metadata in arbitrary casing — "Plus", "PLUS",
 * "ChatGPT Plus", "Pro", "team", etc. We normalize to a stable lowercase
 * tier ID so routing logic can group/sort deterministically.
 */

/**
 * Tier priority — highest quota first.
 * Auto Mode iterates this list top-down: pick from the first tier
 * that has at least one available connection. `free` and `other`
 * are last-resort backups.
 */
export const TIER_PRIORITY = [
  "pro",
  "business",
  "enterprise",
  "team",
  "plus",
  "go",
  "free",
  "other",
];

/**
 * Strategy applied within a single tier. High-quota tiers (pro/business/
 * enterprise/team) milk one account first; low-quota tiers (plus/go/free)
 * spread requests with sticky round-robin to avoid burning a single seat.
 */
export const TIER_STRATEGY = {
  pro: "fill-first",
  business: "fill-first",
  enterprise: "fill-first",
  team: "fill-first",
  plus: "round-robin",
  go: "round-robin",
  free: "round-robin",
  other: "round-robin",
};

/**
 * Sticky limit (calls per account before round-robin rotates) for tiers
 * that use round-robin. Lower-tier => smaller sticky => spread harder.
 */
export const TIER_STICKY_LIMIT = {
  plus: 2,
  go: 2,
  free: 1,
  other: 2,
};

/**
 * When the active pool contains multiple GPT account groups, Auto Mode
 * switches to a fair whole-pool rotation instead of prioritizing one tier.
 */
export const MIXED_TIER_STICKY_LIMIT = 1;

/**
 * Collapse raw tiers into user-facing GPT account groups.
 */
export function getTierGroup(tier) {
  if (["pro", "business", "enterprise", "team"].includes(tier)) return "business";
  if (["plus", "go"].includes(tier)) return "plus";
  if (tier === "free") return "free";
  return "other";
}

/**
 * Normalize an arbitrary plan string to a tier ID.
 * Returns `"other"` for unknown / null / undefined.
 *
 * Examples:
 *   "Plus"          -> "plus"
 *   "PLUS"          -> "plus"
 *   "ChatGPT Plus"  -> "plus"
 *   "Business"      -> "business"
 *   "Pro"           -> "pro"
 *   null            -> "other"
 *   "Mystery"       -> "other"
 */
export function normalizePlanTier(planType) {
  if (!planType || typeof planType !== "string") return "other";
  const lower = planType.toLowerCase().trim();
  // Strip "ChatGPT " or "Plan " prefixes if present.
  const stripped = lower.replace(/^(chatgpt|plan|tier)\s+/i, "").trim();
  // Match against known tier keys (longest-first to avoid "pro" matching "enterprise pro").
  const known = ["enterprise", "business", "team", "plus", "free", "pro", "go"];
  for (const tier of known) {
    if (stripped === tier) return tier;
    if (stripped.includes(tier)) return tier;
  }
  return "other";
}
