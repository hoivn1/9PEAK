/**
 * Auto Mode routing — Smart Routing v2.
 * [9peak-fork] v0.4.0 — community-friendly routing that requires zero config.
 *
 * Group available connections by ChatGPT plan tier, then iterate from
 * highest-quota tier (pro) down to lowest (free). The first tier that
 * has at least one available connection is picked, and we pick a
 * connection from it using the strategy mapped to that tier:
 *   - High tiers (pro/business/enterprise/team) → fill-first
 *     (milk one account; minimize churn).
 *   - Low tiers (plus/go/free/other)            → sticky round-robin
 *     (spread evenly; protect each seat's quota).
 *
 * Free tier is genuinely last-resort: only used when all paid tiers
 * are unavailable.
 */

import {
  TIER_PRIORITY,
  TIER_STRATEGY,
  TIER_STICKY_LIMIT,
  MIXED_TIER_STICKY_LIMIT,
  getTierGroup,
  normalizePlanTier,
} from "./planTier.js";
import { getActiveCount } from "./concurrency.js";

/**
 * Group available connections by normalized plan tier.
 * Returns Map<tierId, connection[]> with insertion order matching TIER_PRIORITY.
 */
function groupByTier(availableConnections) {
  const groups = new Map();
  for (const tier of TIER_PRIORITY) groups.set(tier, []);
  for (const conn of availableConnections) {
    const planType = conn.providerSpecificData?.chatgptPlanType;
    const tier = normalizePlanTier(planType);
    if (groups.has(tier)) groups.get(tier).push(conn);
    else groups.get("other").push(conn);
  }
  return groups;
}

/**
 * Pick a connection from a list using fill-first (priority order, lowest first).
 */
function pickFillFirst(connections) {
  const sorted = [...connections].sort((a, b) => (a.priority || 999) - (b.priority || 999));
  return sorted[0];
}

/**
 * Pick a connection from a list using sticky round-robin.
 * Mirrors the logic in auth.js so behavior stays consistent — we don't
 * import there directly to avoid a circular dependency.
 *
 * NOTE: this is a best-effort selection. The caller (auth.js) is responsible
 * for actually persisting `lastUsedAt` / `consecutiveUseCount` updates after
 * the pick — Auto Mode just chooses; auth.js commits.
 */
function pickStickyRoundRobin(connections, stickyLimit) {
  if (connections.length === 1) return connections[0];

  const byRecency = [...connections].sort((a, b) => {
    if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
    if (!a.lastUsedAt) return 1;
    if (!b.lastUsedAt) return -1;
    return new Date(b.lastUsedAt) - new Date(a.lastUsedAt);
  });

  const current = byRecency[0];
  const currentCount = current?.consecutiveUseCount || 0;

  if (current && current.lastUsedAt && currentCount < stickyLimit) {
    return current;
  }

  const sortedByOldest = [...connections].sort((a, b) => {
    if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
    if (!a.lastUsedAt) return -1;
    if (!b.lastUsedAt) return 1;
    return new Date(a.lastUsedAt) - new Date(b.lastUsedAt);
  });

  return sortedByOldest[0];
}

/**
 * Auto Mode entry point — pick the best connection given the available pool.
 *
 * @param {Array} availableConnections - already filtered (active, not locked, not excluded)
 * @returns {{ connection: object, routingReason: string, tier: string, strategy: string } | null}
 *          Returns null if pool is empty (caller should fall through).
 */
export function selectAuto(availableConnections) {
  if (!Array.isArray(availableConnections) || availableConnections.length === 0) {
    return null;
  }

  const groups = groupByTier(availableConnections);
  const activeTierGroups = getActiveTierGroups(groups);

  if (activeTierGroups.length > 1) {
    const connection = pickStickyRoundRobin(availableConnections, MIXED_TIER_STICKY_LIMIT);
    if (connection) {
      const active = getActiveCount(connection.id);
      return {
        connection,
        routingReason: `auto: mixed GPT account groups (${activeTierGroups.join(", ")}) even round-robin sticky=${MIXED_TIER_STICKY_LIMIT} (active ${active}, pool ${availableConnections.length})`,
        tier: "mixed",
        strategy: "round-robin",
      };
    }
  }

  for (const tier of TIER_PRIORITY) {
    const tierConns = groups.get(tier) || [];
    if (tierConns.length === 0) continue;

    const strategy = TIER_STRATEGY[tier] || "round-robin";
    let connection;

    if (strategy === "fill-first") {
      connection = pickFillFirst(tierConns);
    } else {
      const stickyLimit = TIER_STICKY_LIMIT[tier] || 2;
      connection = pickStickyRoundRobin(tierConns, stickyLimit);
    }

    if (!connection) continue;

    const active = getActiveCount(connection.id);
    const reason = strategy === "fill-first"
      ? `auto: ${tier} tier fill-first (priority ${connection.priority || 999}, active ${active})`
      : `auto: ${tier} tier round-robin sticky=${TIER_STICKY_LIMIT[tier] || 2} (active ${active}, pool ${tierConns.length})`;

    return {
      connection,
      routingReason: reason,
      tier,
      strategy,
    };
  }

  return null;
}

/**
 * Build a UI-friendly summary of the current Auto Mode plan.
 * Returns array of { tier, strategy, stickyLimit, connections: [...] }.
 * Used by the dashboard to show "đang xoay theo plan của bạn".
 */
export function summarizeAutoPlan(connections) {
  if (!Array.isArray(connections)) return [];
  const groups = new Map();
  for (const tier of TIER_PRIORITY) groups.set(tier, []);
  for (const conn of connections) {
    const planType = conn.providerSpecificData?.chatgptPlanType;
    const tier = normalizePlanTier(planType);
    if (groups.has(tier)) groups.get(tier).push(conn);
    else groups.get("other").push(conn);
  }
  const out = [];
  for (const tier of TIER_PRIORITY) {
    const conns = groups.get(tier) || [];
    if (conns.length === 0) continue;
    out.push({
      tier,
      strategy: TIER_STRATEGY[tier] || "round-robin",
      stickyLimit: TIER_STICKY_LIMIT[tier] || null,
      connections: conns,
    });
  }
  return out;
}

function getActiveTierGroups(groups) {
  const activeGroups = new Set();
  for (const tier of TIER_PRIORITY) {
    const tierConns = groups.get(tier) || [];
    if (tierConns.length > 0) activeGroups.add(getTierGroup(tier));
  }
  return [...activeGroups];
}
