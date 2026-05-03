import { getProviderCredentials } from "@/sse/services/auth.js";
import { handleFetchCore } from "open-sse/handlers/fetchCore.js";
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

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const provider = typeof body?.provider === "string" && body.provider.trim() ? body.provider.trim() : "firecrawl";
  const format = typeof body?.format === "string" && body.format.trim() ? body.format.trim() : "markdown";
  const maxCharacters = Number.isFinite(Number(body?.max_characters ?? body?.maxCharacters))
    ? Number(body?.max_characters ?? body?.maxCharacters)
    : 20000;

  if (!url) {
    return json({ success: false, error: "url is required" }, 400);
  }

  let credentials = null;
  if (provider !== "jina-reader") {
    credentials = await getProviderCredentials(provider);
    if (!credentials || credentials.allRateLimited) {
      return json({
        success: false,
        error: credentials?.allRateLimited
          ? `All ${provider} accounts are temporarily unavailable`
          : `No active credentials found for ${provider}`,
        retryAfter: credentials?.retryAfter || null,
      }, 503);
    }
  }

  const result = await handleFetchCore({
    url,
    format,
    maxCharacters,
    provider,
    providerConfig: {},
    credentials,
    log: (...args) => console.warn("[web-fetch]", ...args),
  });

  const status = result?.success ? 200 : (result?.status || 500);
  return json(result, status);
}
