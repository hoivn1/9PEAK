/**
 * [9peak-fork] v0.4.2 — Codex Workspace grouping utilities.
 *
 * Each Codex OAuth connection carries a `providerSpecificData.primaryWorkspace`
 * object (introduced v0.4.2) describing the ChatGPT workspace (org) that the
 * acc belongs to. Multiple connections share a workspace when their
 * `primaryWorkspace.id` matches — typical for Team / Business / Enterprise
 * plans where 1 owner + N members all belong to the same org.
 *
 * Personal workspaces (`personal === true`, default for Plus / Pro) each get
 * their own org id, but UX-wise we gather them all into a single
 * "Individual accounts" pseudo-group to keep the dashboard tidy.
 *
 * Connections lacking workspace info (legacy OAuth pre-v0.4.2) are returned
 * as `unassigned` — the dashboard renders them in a separate group with a
 * "Re-fetch workspace info" migration button (v0.4.4).
 */

const INDIVIDUAL_GROUP_ID = "__individual__";
const UNASSIGNED_GROUP_ID = "__unassigned__";

export const SPECIAL_GROUP_IDS = {
  INDIVIDUAL: INDIVIDUAL_GROUP_ID,
  UNASSIGNED: UNASSIGNED_GROUP_ID,
};

/**
 * Determine if a connection is currently "down" (non-healthy).
 * A connection is considered down if:
 *   - `isActive === false` (disabled by user), OR
 *   - testStatus is one of error / expired / unavailable, OR
 *   - any active modelLock_* timestamp is in the future (rate-limit cooldown).
 */
export function isConnectionDown(conn) {
  if (!conn) return true;
  if (conn.isActive === false) return true;
  const status = conn.testStatus;
  if (status === "error" || status === "expired" || status === "unavailable") return true;
  // Active model-lock cooldown
  for (const [k, v] of Object.entries(conn)) {
    if (!k.startsWith("modelLock_") || !v) continue;
    try {
      if (new Date(v).getTime() > Date.now()) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/**
 * Cascade-failure detector.
 * Returns { triggered, downCount, totalCount, ratio, severity, ownerEmail? }.
 *
 * Severity tiers (priority order):
 *   - "owner-down" (NEW v0.4.5): owner exists AND owner is down — entire
 *                                workspace billing/quota is at risk regardless
 *                                of how many members still look "healthy".
 *                                Triggers immediately, ignoring the >50% rule.
 *   - "critical":                ratio >= 0.8
 *   - "warning":                 0.5 < ratio < 0.8
 *   - null:                      no cascade (or single-member group)
 *
 * Single-member groups never trigger cascade by member-ratio — 1 down out of 1
 * is just a normal failure. But owner-down still fires on a 1-member group
 * (where the lone member IS the owner) because billing dies regardless.
 */
export function detectCascade(group) {
  const members = Array.isArray(group?.members) ? group.members : [];
  const totalCount = members.length;
  if (totalCount === 0) {
    return { triggered: false, downCount: 0, totalCount, ratio: 0, severity: null };
  }
  const downCount = members.filter(isConnectionDown).length;
  const ratio = downCount / totalCount;

  // [9peak-fork] v0.4.5 — owner-specific cascade.
  // If owner exists AND owner is down, trigger immediately regardless of ratio.
  // Owner failure = workspace billing/quota dies for ALL members (Business
  // farm semantic). This is the user's primary signal and beats the
  // ratio-based critical/warning tiers.
  const owner = group?.owner;
  if (owner && isConnectionDown(owner)) {
    return {
      triggered: true,
      severity: "owner-down",
      ownerEmail: owner.email || null,
      downCount,
      totalCount,
      ratio,
    };
  }

  if (totalCount < 2) {
    return { triggered: false, downCount, totalCount, ratio, severity: null };
  }
  const triggered = ratio > 0.5;
  const severity = triggered
    ? ratio >= 0.8
      ? "critical"
      : "warning"
    : null;
  return { triggered, downCount, totalCount, ratio, severity };
}

/**
 * [9peak-fork] v0.4.5 — Helper to enumerate the "at-risk but not-yet-down"
 * member accs when a workspace is in `owner-down` cascade. These accs may
 * still report `testStatus === "healthy"` but cannot actually call API
 * because the owner's billing was suspended. UI uses this to overlay an
 * "at-risk · billing chung với owner" badge on each member row.
 *
 * Returns [] when cascade is not owner-down or group has no owner.
 */
export function getCascadeAtRiskMembers(group) {
  if (!group?.cascade?.triggered) return [];
  if (group.cascade.severity !== "owner-down") return [];
  const owner = group.owner;
  if (!owner) return [];
  const members = Array.isArray(group.members) ? group.members : [];
  return members.filter((m) => m && m.id !== owner.id);
}

function pickRoleRank(role) {
  const order = { owner: 0, admin: 1, member: 2 };
  return order[role] ?? 9;
}

/**
 * Group an array of Codex connections by their primary workspace.
 *
 * @param {Array<object>} connections — provider connections (already filtered to provider="codex")
 * @returns {{ workspaces: Array<object>, individuals: object|null, unassigned: Array<object> }}
 *
 * `workspaces` items shape:
 *   {
 *     id: string,                   // workspace org id
 *     title: string,                // workspace display title
 *     planType: string|null,        // chatgpt plan tier (from owner's connection or first member)
 *     personal: false,
 *     members: Array<connection>,   // sorted: owner first, admin, then member
 *     owner: connection|null,       // member with role=owner if present
 *     ownerCount: number,
 *     memberCount: number,
 *     healthyCount: number,         // members not down
 *     cascade: detectCascade result,
 *   }
 *
 * `individuals` (or null if empty):
 *   { id: "__individual__", title: "Individual accounts", personal: true, members, ... }
 *
 * `unassigned`: connections lacking primaryWorkspace data (legacy pre-v0.4.2 OAuth).
 */
export function groupConnectionsByWorkspace(connections) {
  const list = Array.isArray(connections) ? connections : [];
  /** @type {Map<string, object>} */
  const byId = new Map();
  /** @type {Array<object>} */
  const individualMembers = [];
  /** @type {Array<object>} */
  const unassigned = [];

  for (const conn of list) {
    const psd = conn?.providerSpecificData || {};
    const ws = psd.primaryWorkspace;
    if (!ws || !ws.id) {
      unassigned.push(conn);
      continue;
    }
    if (ws.personal) {
      individualMembers.push(conn);
      continue;
    }
    const existing = byId.get(ws.id);
    if (existing) {
      existing.members.push(conn);
    } else {
      byId.set(ws.id, {
        id: ws.id,
        title: ws.title || "Unnamed Workspace",
        planType: psd.chatgptPlanType || null,
        personal: false,
        members: [conn],
      });
    }
  }

  const workspaces = [...byId.values()].map((g) => {
    // Sort: owner > admin > member, then by createdAt ascending if present.
    const sortedMembers = [...g.members].sort((a, b) => {
      const roleA = a?.providerSpecificData?.primaryWorkspace?.role;
      const roleB = b?.providerSpecificData?.primaryWorkspace?.role;
      const diff = pickRoleRank(roleA) - pickRoleRank(roleB);
      if (diff !== 0) return diff;
      const tsA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tsB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tsA - tsB;
    });
    const owner = sortedMembers.find(
      (m) => m?.providerSpecificData?.primaryWorkspace?.role === "owner"
    ) || null;
    const ownerCount = sortedMembers.filter(
      (m) => m?.providerSpecificData?.primaryWorkspace?.role === "owner"
    ).length;
    const memberCount = sortedMembers.length;
    const healthyCount = sortedMembers.filter((m) => !isConnectionDown(m)).length;
    // Use planType from any owner first, else from first member.
    const planType = (owner?.providerSpecificData?.chatgptPlanType)
      || sortedMembers[0]?.providerSpecificData?.chatgptPlanType
      || g.planType
      || null;
    const groupBase = {
      ...g,
      members: sortedMembers,
      owner,
      ownerCount,
      memberCount,
      healthyCount,
      planType,
    };
    return { ...groupBase, cascade: detectCascade(groupBase) };
  });

  // Sort workspaces: severity-prioritised so admin sees the most urgent farm
  // on top. Severity rank: owner-down > critical > warning > none.
  // [9peak-fork] v0.4.5 — owner-down beats the existing critical/warning tiers
  // because billing dying is worse than members dying.
  const severityRank = (sev) => {
    if (sev === "owner-down") return 0;
    if (sev === "critical") return 1;
    if (sev === "warning") return 2;
    return 3;
  };
  workspaces.sort((a, b) => {
    const ra = severityRank(a.cascade?.severity);
    const rb = severityRank(b.cascade?.severity);
    if (ra !== rb) return ra - rb;
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    return (a.title || "").localeCompare(b.title || "");
  });

  let individuals = null;
  if (individualMembers.length > 0) {
    const sorted = [...individualMembers].sort((a, b) => {
      const tsA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tsB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tsA - tsB;
    });
    individuals = {
      id: INDIVIDUAL_GROUP_ID,
      title: "Individual accounts",
      planType: null,
      personal: true,
      members: sorted,
      owner: null,
      ownerCount: 0,
      memberCount: sorted.length,
      healthyCount: sorted.filter((m) => !isConnectionDown(m)).length,
      cascade: { triggered: false, downCount: 0, totalCount: sorted.length, ratio: 0, severity: null },
    };
  }

  return { workspaces, individuals, unassigned };
}
