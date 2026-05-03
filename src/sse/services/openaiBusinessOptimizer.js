/**
 * OpenAI Business/Enterprise Account Optimizer
 *
 * Dedicated module for ChatGPT Business-specific optimizations.
 * Only activated for "openai" and "codex" providers.
 *
 * Features:
 *   1. Rate limit header tracking (x-ratelimit-remaining-*)
 *   2. Quota-aware routing score bonus
 *   3. Organization header injection
 *
 * Usage:
 *   - Call recordRateLimits() after each successful OpenAI/Codex response
 *   - Call getQuotaScoreBonus() during account selection for weighted routing
 *   - Call injectOrgHeader() in executor buildHeaders for org-scoped requests
 */

// Providers this module applies to
const OPENAI_PROVIDERS = new Set(["openai", "codex"]);

// Cached enabled state (refreshed from DB every 30s to avoid DB reads per request)
let _enabled = true;
let _enabledCheckedAt = 0;
const ENABLED_CHECK_INTERVAL_MS = 30 * 1000;

/**
 * Check if OpenAI Business optimizer is enabled (from settings).
 * Caches result for 30s to avoid DB reads on every request.
 */
export async function isEnabled() {
  const now = Date.now();
  if (now - _enabledCheckedAt < ENABLED_CHECK_INTERVAL_MS) return _enabled;
  try {
    const { getSettings } = await import("@/lib/localDb");
    const settings = await getSettings();
    _enabled = settings.openaiBusinessOptimizer !== false; // default ON
    _enabledCheckedAt = now;
  } catch {
    // On error, keep previous state
  }
  return _enabled;
}

/**
 * Sync check — uses cached value (always instant, no DB read).
 * Call isEnabled() at least once first to prime the cache.
 */
export function isEnabledSync() {
  return _enabled;
}

/**
 * Check if a provider is OpenAI-family (openai or codex).
 */
export function isOpenAIProvider(provider) {
  return OPENAI_PROVIDERS.has(provider);
}

// --- Rate Limit Tracking ---
// In-memory store: connectionId → { remainingRequests, remainingTokens, resetRequests, resetTokens, updatedAt }
const rateLimitStore = new Map();
const RATE_LIMIT_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Extract and store rate limit info from OpenAI response headers.
 * Only stores data if x-ratelimit-* headers are present.
 *
 * OpenAI headers:
 *   x-ratelimit-remaining-requests  — remaining RPM
 *   x-ratelimit-remaining-tokens    — remaining TPM
 *   x-ratelimit-reset-requests      — when RPM resets (e.g., "1s", "6m0s")
 *   x-ratelimit-reset-tokens        — when TPM resets
 *   x-ratelimit-limit-requests      — total RPM limit
 *   x-ratelimit-limit-tokens        — total TPM limit
 *
 * @param {string} connectionId
 * @param {object} headers - Response headers (Headers, Map, or plain object)
 */
export function recordRateLimits(connectionId, headers) {
  if (!connectionId || connectionId === "noauth" || !headers) return;

  const get = (name) => {
    if (typeof headers.get === "function") return headers.get(name);
    return headers[name] || null;
  };

  const remainingRequests = parseInt(get("x-ratelimit-remaining-requests"), 10);
  const remainingTokens = parseInt(get("x-ratelimit-remaining-tokens"), 10);
  const limitRequests = parseInt(get("x-ratelimit-limit-requests"), 10);
  const limitTokens = parseInt(get("x-ratelimit-limit-tokens"), 10);

  // Only store if we got at least one meaningful value
  if (isNaN(remainingRequests) && isNaN(remainingTokens)) return;

  rateLimitStore.set(connectionId, {
    remainingRequests: isNaN(remainingRequests) ? null : remainingRequests,
    remainingTokens: isNaN(remainingTokens) ? null : remainingTokens,
    limitRequests: isNaN(limitRequests) ? null : limitRequests,
    limitTokens: isNaN(limitTokens) ? null : limitTokens,
    resetRequests: get("x-ratelimit-reset-requests"),
    resetTokens: get("x-ratelimit-reset-tokens"),
    updatedAt: Date.now(),
  });
}

/**
 * Get rate limit info for a connection, or null if unknown/expired.
 */
export function getRateLimits(connectionId) {
  const info = rateLimitStore.get(connectionId);
  if (!info) return null;
  if (Date.now() - info.updatedAt > RATE_LIMIT_TTL_MS) {
    rateLimitStore.delete(connectionId);
    return null;
  }
  return info;
}

/**
 * Get all stored rate limit info (for dashboard/stats API).
 */
export function getAllRateLimits() {
  // Clean expired entries first
  const now = Date.now();
  for (const [key, info] of rateLimitStore) {
    if (now - info.updatedAt > RATE_LIMIT_TTL_MS) rateLimitStore.delete(key);
  }
  return Object.fromEntries(rateLimitStore);
}

// --- Quota-Aware Routing ---

/**
 * Calculate a score bonus for weighted routing based on remaining quota.
 * Lower score = better candidate.
 *
 * Business accounts (RPM ~500-10000) → very low penalty → always preferred
 * Free/Plus accounts (RPM ~3-60) → higher penalty → deprioritized when low
 * Unknown (no data) → returns 0 (neutral, no effect on routing)
 *
 * @param {string} connectionId
 * @returns {number} Score penalty (0 = neutral, higher = deprioritized)
 */
export function getQuotaScoreBonus(connectionId) {
  const info = getRateLimits(connectionId);
  if (!info || info.remainingRequests === null) return 0;

  const remaining = info.remainingRequests;

  // Business accounts with high limits get near-zero penalty
  // Free accounts approaching 0 get high penalty
  if (remaining <= 0) return 500;      // exhausted → strong penalty
  if (remaining <= 3) return 400;      // almost out
  if (remaining <= 10) return 200;     // getting low
  if (remaining <= 50) return 50;      // comfortable
  return 0;                            // plenty of quota (Business)
}

// --- Organization Header ---

/**
 * Inject OpenAI-Organization header if the connection has an organizationId.
 * This ensures requests use org quota (Business/Enterprise) instead of personal.
 *
 * @param {object} headers - Mutable headers object to modify
 * @param {object} credentials - Connection credentials with providerSpecificData
 */
export function injectOrgHeader(headers, credentials) {
  const orgId = credentials?.providerSpecificData?.organizationId;
  if (orgId) {
    headers["OpenAI-Organization"] = orgId;
  }
}

// --- Summary for Logging ---

/**
 * Get a human-readable summary of rate limit status for a connection.
 * @param {string} connectionId
 * @returns {string|null} e.g., "RPM: 45/500, TPM: 89000/200000" or null
 */
export function getRateLimitSummary(connectionId) {
  const info = getRateLimits(connectionId);
  if (!info) return null;

  const parts = [];
  if (info.remainingRequests !== null) {
    const limit = info.limitRequests ? `/${info.limitRequests}` : "";
    parts.push(`RPM: ${info.remainingRequests}${limit}`);
  }
  if (info.remainingTokens !== null) {
    const limit = info.limitTokens ? `/${info.limitTokens}` : "";
    parts.push(`TPM: ${info.remainingTokens}${limit}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}
