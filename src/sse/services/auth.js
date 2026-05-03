import { getProviderConnections, validateApiKey, updateProviderConnection, getSettings } from "@/lib/localDb";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { formatRetryAfter, checkFallbackError, isModelLockActive, buildModelLockUpdate, getEarliestModelLockUntil } from "open-sse/services/accountFallback.js";
import { MAX_RATE_LIMIT_COOLDOWN_MS } from "open-sse/config/errorConfig.js";
import { resolveProviderId, FREE_PROVIDERS } from "@/shared/constants/providers.js";
import { getActiveCount, getLastUsedAt, getAvgResponseTime, hasCapacity, getNextRoundRobinIndex, addRoutingLog } from "./concurrency.js";
import { isOpenAIProvider, getQuotaScoreBonus } from "./openaiBusinessOptimizer.js";
// [9peak-fork] v0.4.0 — Auto Mode (smart per-plan rotation)
import { selectAuto } from "./autoRouting.js";
import * as log from "../utils/logger.js";

// Mutex to prevent race conditions during account selection
let selectionMutex = Promise.resolve();

/**
 * Get provider credentials from localDb
 * Filters out unavailable accounts and returns the selected account based on strategy
 * @param {string} provider - Provider name
 * @param {Set<string>|string|null} excludeConnectionIds - Connection ID(s) to exclude (for retry with next account)
 * @param {string|null} model - Model name for per-model rate limit filtering
 */
export async function getProviderCredentials(provider, excludeConnectionIds = null, model = null) {
  // Normalize to Set for consistent handling
  const excludeSet = excludeConnectionIds instanceof Set
    ? excludeConnectionIds
    : (excludeConnectionIds ? new Set([excludeConnectionIds]) : new Set());
  // Acquire mutex to prevent race conditions
  const currentMutex = selectionMutex;
  let resolveMutex;
  selectionMutex = new Promise(resolve => { resolveMutex = resolve; });

  try {
    await currentMutex;

    // Resolve alias to provider ID (e.g., "kc" -> "kilocode")
    const providerId = resolveProviderId(provider);

    // Inject a virtual connection for no-auth free providers
    if (FREE_PROVIDERS[providerId]?.noAuth) {
      return { id: "noauth", connectionName: "Public", isActive: true, accessToken: "public" };
    }

    const connections = await getProviderConnections({ provider: providerId, isActive: true });
    log.debug("AUTH", `${provider} | total connections: ${connections.length}, excludeIds: ${excludeSet.size > 0 ? [...excludeSet].join(",") : "none"}, model: ${model || "any"}`);

    if (connections.length === 0) {
      log.warn("AUTH", `No credentials for ${provider}`);
      return null;
    }

    // Filter out model-locked and excluded connections
    const availableConnections = connections.filter(c => {
      if (excludeSet.has(c.id)) return false;
      if (isModelLockActive(c, model)) return false;
      return true;
    });

    log.debug("AUTH", `${provider} | available: ${availableConnections.length}/${connections.length}`);
    connections.forEach(c => {
      const excluded = excludeSet.has(c.id);
      const locked = isModelLockActive(c, model);
      if (excluded || locked) {
        const lockUntil = getEarliestModelLockUntil(c);
        log.debug("AUTH", `  → ${c.id?.slice(0, 8)} | ${excluded ? "excluded" : ""} ${locked ? `modelLocked(${model}) until ${lockUntil}` : ""}`);
      }
    });

    if (availableConnections.length === 0) {
      // Find earliest lock expiry across all connections for retry timing
      const lockedConns = connections.filter(c => isModelLockActive(c, model));
      const expiries = lockedConns.map(c => getEarliestModelLockUntil(c)).filter(Boolean);
      const earliest = expiries.sort()[0] || null;
      if (earliest) {
        const earliestConn = lockedConns[0];
        log.warn("AUTH", `${provider} | all ${connections.length} accounts locked for ${model || "all"} (${formatRetryAfter(earliest)}) | lastError=${earliestConn?.lastError?.slice(0, 50)}`);
        return {
          allRateLimited: true,
          retryAfter: earliest,
          retryAfterHuman: formatRetryAfter(earliest),
          lastError: earliestConn?.lastError || null,
          lastErrorCode: earliestConn?.errorCode || null
        };
      }
      log.warn("AUTH", `${provider} | all ${connections.length} accounts unavailable`);
      return null;
    }

    const settings = await getSettings();
    // Per-provider strategy overrides global setting
    const providerOverride = (settings.providerStrategies || {})[providerId] || {};
    const strategy = providerOverride.fallbackStrategy || settings.fallbackStrategy || "fill-first";
    const maxConcurrent = providerOverride.maxConcurrentPerAccount || settings.maxConcurrentPerAccount || 2;

    // Sort by priority as baseline for all strategies (used by business/least-connections)
    const sortedByPriority = [...availableConnections].sort((a, b) =>
      (a.priority || 999) - (b.priority || 999)
    );

    let connection;
    let routingReason = null;

    // [9peak-fork] v0.4.0 — Auto Mode (smart per-plan rotation).
    // When enabled (default for fresh installs), bypass the manual 4-strategy logic
    // and group by ChatGPT plan tier: high tiers (pro/business/enterprise/team) use
    // fill-first within tier, low tiers (plus/go/free) use sticky round-robin.
    // Falls through to existing strategies if Auto returns null (defensive).
    const routingMode = settings.routingMode || "custom";
    if (routingMode === "auto") {
      const autoResult = selectAuto(availableConnections);
      if (autoResult) {
        connection = autoResult.connection;
        routingReason = autoResult.routingReason;
        // For round-robin tiers, persist sticky-counter state so the next call
        // sees up-to-date lastUsedAt / consecutiveUseCount.
        if (autoResult.strategy === "round-robin") {
          const wasCurrent = connection.lastUsedAt && (() => {
            // If we picked the most-recent, increment; else reset.
            const sortedRecency = [...availableConnections].sort((a, b) => {
              if (!a.lastUsedAt && !b.lastUsedAt) return 0;
              if (!a.lastUsedAt) return 1;
              if (!b.lastUsedAt) return -1;
              return new Date(b.lastUsedAt) - new Date(a.lastUsedAt);
            });
            return sortedRecency[0]?.id === connection.id;
          })();
          await updateProviderConnection(connection.id, {
            lastUsedAt: new Date().toISOString(),
            consecutiveUseCount: wasCurrent ? (connection.consecutiveUseCount || 0) + 1 : 1,
          });
        }
      }
      // If autoResult is null (shouldn't happen since availableConnections > 0 above,
      // but defensive), fall through to existing strategy logic below.
    }
    // [9peak-fork] end Auto Mode hook

    // [9peak-fork] v0.4.0 — wrap manual strategy block: only runs if Auto Mode
    // didn't pick (routingMode !== "auto", or autoResult was null).
    if (!connection) {
    // openai-business only makes sense for openai/codex — fall back to least-connections otherwise
    let effectiveStrategy = strategy;
    if (strategy === "openai-business" && !isOpenAIProvider(providerId)) {
      effectiveStrategy = "least-connections";
    }

    if (effectiveStrategy === "openai-business") {
      // Quota-aware scoring for OpenAI/Codex business accounts.
      const getQuotaScore = (conn) => {
        let score = getQuotaScoreBonus(conn.id) * 10;
        score += getActiveCount(conn.id) * 100;
        const avgMs = getAvgResponseTime(conn.id);
        score += avgMs > 0 ? avgMs : 500;
        score += (conn.priority || 999) * 0.1;
        return score;
      };
      const withCapacity = sortedByPriority.filter(c => hasCapacity(c.id, maxConcurrent));
      const pool = withCapacity.length > 0 ? withCapacity : sortedByPriority;
      pool.sort((a, b) => getQuotaScore(a) - getQuotaScore(b));
      connection = pool[0];
      const qb = getQuotaScoreBonus(connection.id);
      const overflow = withCapacity.length === 0 ? " overflow" : "";
      routingReason = `openai-business${overflow} (quotaPenalty: ${qb}, active: ${getActiveCount(connection.id)}/${maxConcurrent})`;
    } else if (effectiveStrategy === "least-connections") {
      // Weighted scoring: active count + response time + recency. Lower score = better.
      const getWeightedScore = (conn) => {
        const active = getActiveCount(conn.id);
        const avgMs = getAvgResponseTime(conn.id);
        const lastUsed = getLastUsedAt(conn.id);
        let score = active * 1000;
        score += avgMs > 0 ? avgMs : 500;
        if (lastUsed) {
          const agoMs = Date.now() - new Date(lastUsed).getTime();
          if (agoMs < 2000) score += 200;
          else if (agoMs < 5000) score += 100;
        }
        score += (conn.priority || 999) * 0.1;
        return score;
      };
      const withCapacity = sortedByPriority.filter(c => hasCapacity(c.id, maxConcurrent));
      const pool = withCapacity.length > 0 ? withCapacity : sortedByPriority;
      pool.sort((a, b) => getWeightedScore(a) - getWeightedScore(b));
      connection = pool[0];
      const avgMs = getAvgResponseTime(connection.id);
      const score = Math.round(getWeightedScore(connection));
      const overflow = withCapacity.length === 0 ? " overflow" : "";
      routingReason = `weighted${overflow} (score: ${score}, active: ${getActiveCount(connection.id)}/${maxConcurrent}${avgMs ? `, avg: ${avgMs}ms` : ""})`;
    } else if (strategy === "round-robin") {
      const stickyLimit = providerOverride.stickyRoundRobinLimit || settings.stickyRoundRobinLimit || 3;

      // Sort by lastUsed (most recent first) to find current candidate
      const byRecency = [...availableConnections].sort((a, b) => {
        if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
        if (!a.lastUsedAt) return 1;
        if (!b.lastUsedAt) return -1;
        return new Date(b.lastUsedAt) - new Date(a.lastUsedAt);
      });

      const current = byRecency[0];
      const currentCount = current?.consecutiveUseCount || 0;

      if (current && current.lastUsedAt && currentCount < stickyLimit) {
        // Stay with current account
        connection = current;
        // Update lastUsedAt and increment count (await to ensure persistence)
        await updateProviderConnection(connection.id, {
          lastUsedAt: new Date().toISOString(),
          consecutiveUseCount: (connection.consecutiveUseCount || 0) + 1
        });
      } else {
        // Pick the least recently used (excluding current if possible)
        const sortedByOldest = [...availableConnections].sort((a, b) => {
          if (!a.lastUsedAt && !b.lastUsedAt) return (a.priority || 999) - (b.priority || 999);
          if (!a.lastUsedAt) return -1;
          if (!b.lastUsedAt) return 1;
          return new Date(a.lastUsedAt) - new Date(b.lastUsedAt);
        });

        connection = sortedByOldest[0];

        // Update lastUsedAt and reset count to 1 (await to ensure persistence)
        await updateProviderConnection(connection.id, {
          lastUsedAt: new Date().toISOString(),
          consecutiveUseCount: 1
        });
      }
      routingReason = `round-robin sticky (active: ${getActiveCount(connection.id)}/${maxConcurrent})`;
    } else {
      // Default: fill-first (already sorted by priority in getProviderConnections)
      const withCapacity = availableConnections.filter(c => hasCapacity(c.id, maxConcurrent));
      connection = withCapacity.length > 0 ? withCapacity[0] : availableConnections[0];
      const overflow = withCapacity.length === 0 ? " overflow" : "";
      routingReason = `fill-first${overflow} (priority: ${connection.priority || 999}, active: ${getActiveCount(connection.id)}/${maxConcurrent})`;
    }
    } // [9peak-fork] end manual strategy block (Auto Mode wrapper)

    // Log routing decision to in-memory routingLog for the monitor dashboard
    const connName = connection.displayName || connection.name || connection.email || connection.id;
    // [9peak-fork] v0.4.0 — surface "auto" as the strategy label when Auto Mode picked.
    const loggedStrategy = routingMode === "auto" ? "auto" : strategy;
    addRoutingLog({
      provider: providerId,
      model,
      connectionId: connection.id,
      connectionName: connName,
      strategy: loggedStrategy,
      reason: routingReason
    });

    const resolvedProxy = await resolveConnectionProxyConfig(connection.providerSpecificData || {});

    return {
      apiKey: connection.apiKey,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      projectId: connection.projectId,
      connectionName: connection.displayName || connection.name || connection.email || connection.id,
      copilotToken: connection.providerSpecificData?.copilotToken,
      providerSpecificData: {
        ...(connection.providerSpecificData || {}),
        connectionProxyEnabled: resolvedProxy.connectionProxyEnabled,
        connectionProxyUrl: resolvedProxy.connectionProxyUrl,
        connectionNoProxy: resolvedProxy.connectionNoProxy,
        connectionProxyPoolId: resolvedProxy.proxyPoolId || null,
        vercelRelayUrl: resolvedProxy.vercelRelayUrl || "",
      },
      connectionId: connection.id,
      // Per-provider concurrency cap — handlers pass this to acquireSlot
      maxConcurrent,
      // Include current status for optimization check
      testStatus: connection.testStatus,
      lastError: connection.lastError,
      // Pass full connection for clearAccountError to read modelLock_* keys
      _connection: connection
    };
  } finally {
    if (resolveMutex) resolveMutex();
  }
}

/**
 * Mark account+model as unavailable — locks modelLock_${model} in DB.
 * All errors (429, 401, 5xx, etc.) lock per model, not per account.
 * @param {string} connectionId
 * @param {number} status - HTTP status code from upstream
 * @param {string} errorText
 * @param {string|null} provider
 * @param {string|null} model - The specific model that triggered the error
 * @returns {{ shouldFallback: boolean, cooldownMs: number }}
 */
export async function markAccountUnavailable(connectionId, status, errorText, provider = null, model = null, resetsAtMs = null) {
  if (!connectionId || connectionId === "noauth") return { shouldFallback: false, cooldownMs: 0 };
  const connections = await getProviderConnections({ provider });
  const conn = connections.find(c => c.id === connectionId);
  const backoffLevel = conn?.backoffLevel || 0;

  // Provider-specific precise cooldown (e.g. codex usage_limit_reached resets_at) overrides backoff
  let shouldFallback, cooldownMs, newBackoffLevel;
  if (resetsAtMs && resetsAtMs > Date.now()) {
    shouldFallback = true;
    cooldownMs = Math.min(resetsAtMs - Date.now(), MAX_RATE_LIMIT_COOLDOWN_MS);
    newBackoffLevel = 0;
  } else {
    ({ shouldFallback, cooldownMs, newBackoffLevel } = checkFallbackError(status, errorText, backoffLevel));
  }
  if (!shouldFallback) return { shouldFallback: false, cooldownMs: 0 };

  const reason = typeof errorText === "string" ? errorText.slice(0, 100) : "Provider error";
  const lockUpdate = buildModelLockUpdate(model, cooldownMs);

  await updateProviderConnection(connectionId, {
    ...lockUpdate,
    testStatus: "unavailable",
    lastError: reason,
    errorCode: status,
    lastErrorAt: new Date().toISOString(),
    backoffLevel: newBackoffLevel ?? backoffLevel
  });

  const lockKey = Object.keys(lockUpdate)[0];
  const connName = conn?.displayName || conn?.name || conn?.email || connectionId.slice(0, 8);
  log.warn("AUTH", `${connName} locked ${lockKey} for ${Math.round(cooldownMs / 1000)}s [${status}]`);

  if (provider && status && reason) {
    console.error(`❌ ${provider} [${status}]: ${reason}`);
  }

  return { shouldFallback: true, cooldownMs };
}

/**
 * Clear account error status on successful request.
 * - Clears modelLock_${model} (the model that just succeeded)
 * - Lazy-cleans any other expired modelLock_* keys
 * - Resets error state only if no active locks remain
 * @param {string} connectionId
 * @param {object} currentConnection - credentials object (has _connection) or raw connection
 * @param {string|null} model - model that succeeded
 */
export async function clearAccountError(connectionId, currentConnection, model = null) {
  if (!connectionId || connectionId === "noauth") return;
  const conn = currentConnection._connection || currentConnection;
  const now = Date.now();
  const allLockKeys = Object.keys(conn).filter(k => k.startsWith("modelLock_"));

  if (!conn.testStatus && !conn.lastError && allLockKeys.length === 0) return;

  // Keys to clear: current model's lock + all expired locks
  const keysToClear = allLockKeys.filter(k => {
    if (model && k === `modelLock_${model}`) return true; // succeeded model
    if (model && k === "modelLock___all") return true;    // account-level lock
    const expiry = conn[k];
    return expiry && new Date(expiry).getTime() <= now;   // expired
  });

  if (keysToClear.length === 0 && conn.testStatus !== "unavailable" && !conn.lastError) return;

  // Check if any active locks remain after clearing
  const remainingActiveLocks = allLockKeys.filter(k => {
    if (keysToClear.includes(k)) return false;
    const expiry = conn[k];
    return expiry && new Date(expiry).getTime() > now;
  });

  const clearObj = Object.fromEntries(keysToClear.map(k => [k, null]));

  // Only reset error state if no active locks remain
  if (remainingActiveLocks.length === 0) {
    Object.assign(clearObj, { testStatus: "active", lastError: null, lastErrorAt: null, backoffLevel: 0 });
  }

  await updateProviderConnection(connectionId, clearObj);
}

/**
 * Extract API key from request headers
 */
export function extractApiKey(request) {
  // Check Authorization header first
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check Anthropic x-api-key header
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey) {
    return xApiKey;
  }

  return null;
}

/**
 * Validate API key (optional - for local use can skip)
 */
export async function isValidApiKey(apiKey) {
  if (!apiKey) return false;
  return await validateApiKey(apiKey);
}
