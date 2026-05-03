/**
 * Concurrency tracking and routing statistics module.
 * Tracks active requests per connection, total requests served,
 * and maintains a routing decision log for the monitor dashboard.
 *
 * Stats (totalRequests, lastUsedAt, routingLog) are persisted to disk
 * so they survive server restarts and Next.js dev-mode reloads.
 */

import path from "path";
import os from "os";
import fs from "fs";

// --- Persistence setup ---
const dataDir = process.env.DATA_DIR || (process.platform === "win32"
  ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "9router")
  : path.join(os.homedir(), ".9router"));
const STATS_FILE = path.join(dataDir, "routing-stats.json");

function loadPersistedStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      return JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
    }
  } catch { /* start fresh */ }
  return null;
}

let persistTimer = null;
function schedulePersist() {
  // Debounce: write at most once per second to avoid hammering disk
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const data = {
        totalRequests: Object.fromEntries(totalRequests),
        lastUsedAt: Object.fromEntries(lastUsedAt),
        routingLog,
        clientStats: Object.fromEntries(clientStats),
        responseTime: Object.fromEntries(responseTime),
      };
      fs.writeFileSync(STATS_FILE, JSON.stringify(data), "utf-8");
    } catch { /* non-critical */ }
  }, 1000);
}

// --- State ---

// Active concurrent requests per connectionId (always in-memory only, represents live state)
const activeRequests = new Map();

// Total requests served per connectionId
const totalRequests = new Map();

// Last used timestamp per connectionId (ISO string)
const lastUsedAt = new Map();

// Routing decision log (ring buffer, last N entries)
const ROUTING_LOG_MAX = 50;
const routingLog = [];

// Round-robin index per provider (atomic, in-memory)
const rrIndex = new Map();

// Client (VM) tracking: Map<clientIp, { total, lastSeenAt, lastModel, activeRequests }>
const clientStats = new Map();

// Response time tracking per connectionId: { totalMs, count, avgMs }
const responseTime = new Map();

// Request queue: waiters that are waiting for a slot to open
const slotWaiters = [];

// --- Restore persisted data on module load ---
const saved = loadPersistedStats();
if (saved) {
  if (saved.totalRequests) {
    for (const [k, v] of Object.entries(saved.totalRequests)) totalRequests.set(k, v);
  }
  if (saved.lastUsedAt) {
    for (const [k, v] of Object.entries(saved.lastUsedAt)) lastUsedAt.set(k, v);
  }
  if (saved.routingLog && Array.isArray(saved.routingLog)) {
    routingLog.push(...saved.routingLog.slice(-ROUTING_LOG_MAX));
  }
  if (saved.clientStats) {
    for (const [k, v] of Object.entries(saved.clientStats)) {
      clientStats.set(k, { ...v, activeRequests: 0 }); // reset live state
    }
  }
  if (saved.responseTime) {
    for (const [k, v] of Object.entries(saved.responseTime)) {
      responseTime.set(k, v);
    }
  }
}

// --- Public API ---

/**
 * Acquire a slot for a connection. Returns true if under limit.
 * @param {string} connectionId
 * @param {number} maxConcurrent
 * @param {string|null} clientIp - Client IP for VM tracking
 * @param {string|null} model - Model being requested
 */
export function acquireSlot(connectionId, maxConcurrent = 2, clientIp = null, model = null) {
  const current = activeRequests.get(connectionId) || 0;
  if (current >= maxConcurrent) return false;
  activeRequests.set(connectionId, current + 1);
  totalRequests.set(connectionId, (totalRequests.get(connectionId) || 0) + 1);
  lastUsedAt.set(connectionId, new Date().toISOString());
  // Track client VM
  if (clientIp) {
    const cs = clientStats.get(clientIp) || { total: 0, lastSeenAt: null, lastModel: null, activeRequests: 0 };
    cs.total += 1;
    cs.lastSeenAt = new Date().toISOString();
    cs.lastModel = model || cs.lastModel;
    cs.activeRequests = (cs.activeRequests || 0) + 1;
    clientStats.set(clientIp, cs);
  }
  schedulePersist();
  return true;
}

/**
 * Release a slot for a connection (call in finally block).
 * @param {string} connectionId
 * @param {string|null} clientIp
 */
export function releaseSlot(connectionId, clientIp = null) {
  if (!connectionId) return;
  const current = activeRequests.get(connectionId) || 0;
  if (current > 0) {
    activeRequests.set(connectionId, current - 1);
  }
  if (clientIp) {
    const cs = clientStats.get(clientIp);
    if (cs && cs.activeRequests > 0) {
      cs.activeRequests -= 1;
    }
  }
  // Notify queued requests that a slot is now available
  notifySlotAvailable();
}

/**
 * Get active concurrent request count for a connection.
 */
export function getActiveCount(connectionId) {
  return activeRequests.get(connectionId) || 0;
}

/**
 * Get last used timestamp for a connection (ISO string or null).
 */
export function getLastUsedAt(connectionId) {
  return lastUsedAt.get(connectionId) || null;
}

/**
 * Check if a connection can accept more requests.
 */
export function hasCapacity(connectionId, maxConcurrent = 2) {
  return (activeRequests.get(connectionId) || 0) < maxConcurrent;
}

/**
 * Get next round-robin index for a provider and increment.
 */
export function getNextRoundRobinIndex(providerId, totalConnections) {
  if (totalConnections <= 0) return 0;
  const current = rrIndex.get(providerId) || 0;
  const idx = current % totalConnections;
  rrIndex.set(providerId, current + 1);
  return idx;
}

/**
 * Add a routing decision to the log.
 */
export function addRoutingLog(entry) {
  routingLog.push({
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString()
  });
  if (routingLog.length > ROUTING_LOG_MAX) {
    routingLog.shift();
  }
  schedulePersist();
}

/**
 * Attach clientIp to the most recent routing log entry for a connectionId.
 * Called from chat/embeddings handler after routing decision is made.
 */
export function tagRoutingLogClient(connectionId, clientIp) {
  if (!clientIp || !connectionId) return;
  for (let i = routingLog.length - 1; i >= 0; i--) {
    if (routingLog[i].connectionId === connectionId && !routingLog[i].clientIp) {
      routingLog[i].clientIp = clientIp;
      break;
    }
  }
}

/**
 * Record response time for a connection (call after request completes).
 * Uses exponential moving average so recent requests weigh more.
 * @param {string} connectionId
 * @param {number} durationMs - Time from request start to first response byte
 */
export function recordResponseTime(connectionId, durationMs) {
  if (!connectionId || connectionId === "noauth" || durationMs <= 0) return;
  const rt = responseTime.get(connectionId) || { totalMs: 0, count: 0, avgMs: 0 };
  rt.count += 1;
  rt.totalMs += durationMs;
  // Exponential moving average (alpha=0.3): recent requests weigh more
  if (rt.count === 1) {
    rt.avgMs = durationMs;
  } else {
    rt.avgMs = Math.round(rt.avgMs * 0.7 + durationMs * 0.3);
  }
  responseTime.set(connectionId, rt);
  schedulePersist();
}

/**
 * Get average response time for a connection (ms), or 0 if unknown.
 */
export function getAvgResponseTime(connectionId) {
  return responseTime.get(connectionId)?.avgMs || 0;
}

/**
 * Wait for any slot to become available (request queue).
 * Returns a Promise that resolves when a slot is released.
 * @param {number} timeoutMs - Max time to wait before giving up
 * @returns {Promise<boolean>} true if a slot opened, false if timed out
 */
export function waitForSlot(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // Remove from waiters and resolve with false (timeout)
      const idx = slotWaiters.indexOf(waiter);
      if (idx !== -1) slotWaiters.splice(idx, 1);
      resolve(false);
    }, timeoutMs);

    const waiter = () => {
      clearTimeout(timer);
      resolve(true);
    };
    slotWaiters.push(waiter);
  });
}

/**
 * Notify one waiter that a slot is available (called from releaseSlot).
 */
function notifySlotAvailable() {
  if (slotWaiters.length > 0) {
    const waiter = slotWaiters.shift();
    waiter();
  }
}

/**
 * Get all routing stats for the API endpoint.
 */
export function getAllStats() {
  return {
    activeRequests: Object.fromEntries(activeRequests),
    totalRequests: Object.fromEntries(totalRequests),
    lastUsedAt: Object.fromEntries(lastUsedAt),
    routingLog: [...routingLog].reverse(), // newest first
    clientStats: Object.fromEntries(clientStats),
    responseTime: Object.fromEntries(responseTime),
    queueLength: slotWaiters.length,
  };
}

/**
 * Reset all counters (for the dashboard reset button).
 */
export function resetStats() {
  totalRequests.clear();
  lastUsedAt.clear();
  routingLog.length = 0;
  responseTime.clear();
  // Reset client totals but keep IPs visible (reset counts, keep structure)
  for (const [ip, cs] of clientStats) {
    clientStats.set(ip, { ...cs, total: 0 });
  }
  schedulePersist();
  // Don't clear activeRequests - those represent live state
}
