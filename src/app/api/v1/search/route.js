import { getProviderCredentials } from "@/sse/services/auth.js";
import { handleSearchCore } from "open-sse/handlers/searchCore.js";
import { initTranslators } from "open-sse/translator/index.js";

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
    console.log("[SSE] Translators initialized");
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    }
  });
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function POST(request) {
  await ensureInitialized();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const provider = typeof body?.provider === "string" && body.provider.trim() ? body.provider.trim() : "tavily";
  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : undefined;
  const searchDepth = typeof body?.search_depth === "string" && body.search_depth.trim()
    ? body.search_depth.trim()
    : (typeof body?.searchDepth === "string" && body.searchDepth.trim() ? body.searchDepth.trim() : undefined);
  const maxResults = Number.isFinite(Number(body?.max_results ?? body?.maxResults))
    ? Number(body?.max_results ?? body?.maxResults)
    : 10;

  if (!query) {
    return json({ success: false, error: "query is required" }, 400);
  }

  const credentials = await getProviderCredentials(provider, undefined, model);
  if (!credentials || credentials.allRateLimited) {
    return json({
      success: false,
      error: credentials?.allRateLimited
        ? `All ${provider} accounts are temporarily unavailable`
        : `No active credentials found for ${provider}`,
      retryAfter: credentials?.retryAfter || null,
    }, 503);
  }

  const result = await handleSearchCore({
    query,
    provider,
    maxResults,
    searchDepth,
    model,
    providerConfig: {},
    credentials,
    log: (...args) => console.warn("[web-search]", ...args),
  });

  const status = result?.success ? 200 : (result?.status || 500);
  return json(result, status);
}
