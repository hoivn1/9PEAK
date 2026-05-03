import { NextResponse } from "next/server";
import { getAllStats, resetStats } from "@/sse/services/concurrency";
import { getSettings, getProviderConnections } from "@/lib/localDb";

export async function GET() {
  try {
    const stats = getAllStats();
    const settings = await getSettings();

    // Enrich with connection names and provider info
    const connections = await getProviderConnections({ isActive: true });
    const connectionMap = {};
    for (const conn of connections) {
      // [9peak-fork] Surface chatgptPlanType + active modelLock_* timestamps so
      // the Image Gen "Accounts" tab can display plan badges and cooldown
      // remaining for Codex OAuth accounts.
      const psd = conn.providerSpecificData || {};
      const modelLocks = {};
      const now = Date.now();
      for (const k of Object.keys(conn)) {
        if (!k.startsWith("modelLock_")) continue;
        const v = conn[k];
        const ts = v ? new Date(v).getTime() : 0;
        if (ts > now) modelLocks[k.slice("modelLock_".length)] = v;
      }
      connectionMap[conn.id] = {
        name: conn.displayName || conn.name || conn.email || conn.id?.slice(0, 8),
        email: conn.email || null,
        provider: conn.provider,
        priority: conn.priority,
        testStatus: conn.testStatus,
        lastError: conn.lastError,
        lastErrorAt: conn.lastErrorAt,
        errorCode: conn.errorCode,
        healthCheck: conn.healthCheck || null,
        chatgptPlanType: psd.chatgptPlanType || null,
        modelLocks,
      };
    }

    // Per-provider strategy info
    const globalStrategy = settings.fallbackStrategy || "least-connections";
    const maxConcurrent = settings.maxConcurrentPerAccount || 2;
    const providerStrategies = settings.providerStrategies || {};

    return NextResponse.json({
      globalStrategy,
      maxConcurrent,
      providerStrategies,
      connections: connectionMap,
      activeRequests: stats.activeRequests,
      totalRequests: stats.totalRequests,
      lastUsedAt: stats.lastUsedAt,
      routingLog: stats.routingLog,
      clientStats: stats.clientStats,
      responseTime: stats.responseTime,
      queueLength: stats.queueLength
    });
  } catch (error) {
    console.error("Error getting routing stats:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    resetStats();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
