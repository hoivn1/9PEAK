const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_SEARCH_DEPTH = "basic";

function sanitizeHeaders(headers) {
  if (!headers) return headers;
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = typeof v === "string" ? v.replace(/[^\x00-\xFF]/g, "").trim() : v;
  }
  return out;
}

async function tryFetch(url, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, headers: sanitizeHeaders(init?.headers), signal: ctrl.signal });
    return { ok: true, res };
  } catch (err) {
    const isAbort = err?.name === "AbortError";
    return { ok: false, timeout: isAbort, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonOrText(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return { json: await res.json() };
    } catch {
      return { text: "" };
    }
  }
  return { text: await res.text() };
}

function toResult(item, index, provider, retrievedAt) {
  return {
    title: item?.title || "",
    url: item?.url || "",
    snippet: item?.snippet || "",
    position: index + 1,
    score: typeof item?.score === "number" ? item.score : null,
    published_at: item?.published_at || null,
    favicon_url: item?.favicon_url || null,
    content: item?.content || null,
    metadata: item?.metadata || {},
    citation: { provider, retrieved_at: retrievedAt, rank: index + 1 },
    provider_raw: item?.provider_raw || null,
  };
}

function normalizeCitation(c) {
  if (!c) return null;
  if (typeof c === "string") return { url: c };
  if (typeof c === "object" && c.url) return c;
  return null;
}

function normalizeSearchItems(items, provider, retrievedAt) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => toResult(item, index, provider, retrievedAt))
    .filter((item) => item.url);
}

function buildAnswerData({ provider, query, results, answerText, tokens, startedAt, upstreamMs, model }) {
  return {
    provider,
    query,
    results,
    answer: { source: provider, text: answerText || "", model: model || null },
    usage: { queries_used: 1, search_cost_usd: 0, llm_tokens: tokens || 0 },
    metrics: {
      response_time_ms: Date.now() - startedAt,
      upstream_latency_ms: upstreamMs,
      total_results_available: null,
    },
    errors: [],
  };
}

async function runTavily({ query, maxResults, searchDepth, timeoutMs, apiKey, startedAt }) {
  const upstreamStart = Date.now();
  const r = await tryFetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      search_depth: searchDepth || DEFAULT_SEARCH_DEPTH,
      include_answer: true,
      include_raw_content: false,
    }),
  }, timeoutMs);

  if (!r.ok) {
    return { success: false, status: r.timeout ? 504 : 502, error: r.error };
  }

  const upstreamMs = Date.now() - upstreamStart;
  const { json } = await readJsonOrText(r.res);
  if (!r.res.ok) {
    return { success: false, status: r.res.status, error: json?.error || `Tavily error: ${r.res.status}` };
  }

  const retrievedAt = new Date().toISOString();
  const results = normalizeSearchItems((json?.results || []).map((item) => ({
    title: item?.title || "",
    url: item?.url || "",
    snippet: item?.content || item?.snippet || "",
    score: typeof item?.score === "number" ? item.score : null,
    content: item?.raw_content || null,
    metadata: { source: item?.source || null },
    provider_raw: item,
  })), "tavily", retrievedAt);

  return {
    success: true,
    data: buildAnswerData({
      provider: "tavily",
      query,
      results,
      answerText: json?.answer || "",
      tokens: 0,
      startedAt,
      upstreamMs,
      model: null,
    }),
  };
}

async function runBraveSearch({ query, maxResults, timeoutMs, apiKey, startedAt }) {
  const qs = new URLSearchParams({ q: query, count: String(maxResults) });
  const upstreamStart = Date.now();
  const r = await tryFetch(`https://api.search.brave.com/res/v1/web/search?${qs.toString()}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...(apiKey ? { "x-subscription-token": apiKey } : {}),
    },
  }, timeoutMs);

  if (!r.ok) {
    return { success: false, status: r.timeout ? 504 : 502, error: r.error };
  }

  const upstreamMs = Date.now() - upstreamStart;
  const { json } = await readJsonOrText(r.res);
  if (!r.res.ok) {
    return { success: false, status: r.res.status, error: json?.error || `Brave Search error: ${r.res.status}` };
  }

  const retrievedAt = new Date().toISOString();
  const items = Array.isArray(json?.web?.results) ? json.web.results : [];
  const results = normalizeSearchItems(items.map((item) => ({
    title: item?.title || "",
    url: item?.url || "",
    snippet: item?.description || "",
    published_at: item?.age || null,
    favicon_url: item?.meta_url?.favicon || null,
    metadata: {
      language: item?.language || null,
      family_friendly: item?.family_friendly ?? null,
    },
    provider_raw: item,
  })), "brave-search", retrievedAt);

  return {
    success: true,
    data: buildAnswerData({
      provider: "brave-search",
      query,
      results,
      answerText: "",
      tokens: 0,
      startedAt,
      upstreamMs,
      model: null,
    }),
  };
}

async function runSerper({ query, maxResults, timeoutMs, apiKey, startedAt }) {
  const upstreamStart = Date.now();
  const r = await tryFetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
    body: JSON.stringify({ q: query, num: maxResults }),
  }, timeoutMs);

  if (!r.ok) {
    return { success: false, status: r.timeout ? 504 : 502, error: r.error };
  }

  const upstreamMs = Date.now() - upstreamStart;
  const { json } = await readJsonOrText(r.res);
  if (!r.res.ok) {
    return { success: false, status: r.res.status, error: json?.error || `Serper error: ${r.res.status}` };
  }

  const retrievedAt = new Date().toISOString();
  const organic = Array.isArray(json?.organic) ? json.organic : [];
  const results = normalizeSearchItems(organic.map((item) => ({
    title: item?.title || "",
    url: item?.link || item?.url || "",
    snippet: item?.snippet || "",
    position: item?.position,
    metadata: { date: item?.date || null },
    provider_raw: item,
  })), "serper", retrievedAt);

  return {
    success: true,
    data: buildAnswerData({
      provider: "serper",
      query,
      results,
      answerText: json?.answerBox?.answer || json?.answerBox?.snippet || "",
      tokens: 0,
      startedAt,
      upstreamMs,
      model: null,
    }),
  };
}

async function runExa({ query, maxResults, timeoutMs, apiKey, startedAt }) {
  const upstreamStart = Date.now();
  const r = await tryFetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
    },
    body: JSON.stringify({ query, numResults: maxResults, type: "auto", contents: { text: false } }),
  }, timeoutMs);

  if (!r.ok) {
    return { success: false, status: r.timeout ? 504 : 502, error: r.error };
  }

  const upstreamMs = Date.now() - upstreamStart;
  const { json } = await readJsonOrText(r.res);
  if (!r.res.ok) {
    return { success: false, status: r.res.status, error: json?.error || `Exa error: ${r.res.status}` };
  }

  const retrievedAt = new Date().toISOString();
  const items = Array.isArray(json?.results) ? json.results : [];
  const results = normalizeSearchItems(items.map((item) => ({
    title: item?.title || "",
    url: item?.url || item?.id || "",
    snippet: item?.text || item?.summary || "",
    published_at: item?.publishedDate || null,
    metadata: { author: item?.author || null },
    provider_raw: item,
  })), "exa", retrievedAt);

  return {
    success: true,
    data: buildAnswerData({
      provider: "exa",
      query,
      results,
      answerText: "",
      tokens: 0,
      startedAt,
      upstreamMs,
      model: null,
    }),
  };
}

async function runSearxng({ query, maxResults, timeoutMs, credentials, startedAt }) {
  const baseUrl = credentials?.providerSpecificData?.baseUrl || credentials?.baseUrl || "";
  if (!baseUrl) {
    return { success: false, status: 400, error: "Missing SearXNG base URL" };
  }

  const qs = new URLSearchParams({ q: query, format: "json" });
  if (maxResults > 0) qs.set("count", String(maxResults));
  const target = `${String(baseUrl).replace(/\/$/, "")}/search?${qs.toString()}`;

  const upstreamStart = Date.now();
  const r = await tryFetch(target, {
    method: "GET",
    headers: { accept: "application/json" },
  }, timeoutMs);

  if (!r.ok) {
    return { success: false, status: r.timeout ? 504 : 502, error: r.error };
  }

  const upstreamMs = Date.now() - upstreamStart;
  const { json, text } = await readJsonOrText(r.res);
  if (!r.res.ok) {
    return { success: false, status: r.res.status, error: json?.error || text || `SearXNG error: ${r.res.status}` };
  }

  const retrievedAt = new Date().toISOString();
  const items = Array.isArray(json?.results) ? json.results : [];
  const results = normalizeSearchItems(items.map((item) => ({
    title: item?.title || "",
    url: item?.url || "",
    snippet: item?.content || "",
    published_at: item?.publishedDate || null,
    metadata: {
      engine: item?.engine || null,
      category: item?.category || null,
    },
    provider_raw: item,
  })), "searxng", retrievedAt);

  return {
    success: true,
    data: buildAnswerData({
      provider: "searxng",
      query,
      results,
      answerText: "",
      tokens: 0,
      startedAt,
      upstreamMs,
      model: null,
    }),
  };
}

const CHAT_SEARCH_CONFIG = {
  gemini: {
    endpoint: (model, credentials) => `${credentials?.providerSpecificData?.baseUrl || "https://generativelanguage.googleapis.com/v1beta/models"}/${model}:generateContent`,
    defaultModel: "gemini-2.5-flash",
    buildBody: (query) => ({
      contents: [{ role: "user", parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
    }),
    buildHeaders: (token) => ({
      "Content-Type": "application/json",
      "x-goog-api-key": token,
    }),
    extractAnswer: (data) => {
      const candidate = data?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const text = parts.map((p) => p?.text || "").filter(Boolean).join("");
      const chunks = candidate?.groundingMetadata?.groundingChunks || [];
      const citations = chunks
        .map((ch) => ch?.web)
        .filter(Boolean)
        .map((w) => ({ url: w.uri || w.url, title: w.title || "" }))
        .filter((c) => c.url);
      const tokens = data?.usageMetadata?.totalTokenCount || 0;
      return { text, citations, tokens };
    },
  },
  openai: {
    endpoint: (_model, credentials) => `${(credentials?.providerSpecificData?.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`,
    defaultModel: "gpt-4o-mini",
    buildBody: (query, model) => {
      const body = { model, messages: [{ role: "user", content: query }] };
      if (!/search/i.test(model)) body.tools = [{ type: "web_search" }];
      return body;
    },
    buildHeaders: (token) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    extractAnswer: (data) => {
      const msg = data?.choices?.[0]?.message || {};
      const text = typeof msg.content === "string" ? msg.content : "";
      const annotations = Array.isArray(msg.annotations) ? msg.annotations : [];
      const fromAnn = annotations
        .map((a) => a?.url_citation)
        .filter(Boolean)
        .map((u) => ({ url: u.url, title: u.title || "" }));
      const fromTop = Array.isArray(data?.citations) ? data.citations.map(normalizeCitation).filter(Boolean) : [];
      const citations = fromAnn.length ? fromAnn : fromTop;
      const tokens = data?.usage?.total_tokens || 0;
      return { text, citations, tokens };
    },
  },
  xai: {
    endpoint: (_model, credentials) => `${(credentials?.providerSpecificData?.baseUrl || "https://api.x.ai/v1").replace(/\/$/, "")}/responses`,
    defaultModel: "grok-4.20-reasoning",
    buildBody: (query, model) => ({
      model,
      input: [{ role: "user", content: query }],
      tools: [{ type: "web_search" }],
    }),
    buildHeaders: (token) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    extractAnswer: (data) => {
      const output = Array.isArray(data?.output) ? data.output : [];
      let text = "";
      const citations = [];
      for (const item of output) {
        const parts = Array.isArray(item?.content) ? item.content : [];
        for (const p of parts) {
          if (typeof p?.text === "string") text += p.text;
          const anns = Array.isArray(p?.annotations) ? p.annotations : [];
          for (const a of anns) {
            const c = normalizeCitation(a?.url ? a : a?.url_citation);
            if (c) citations.push(c);
          }
        }
      }
      if (!citations.length && Array.isArray(data?.citations)) {
        for (const c of data.citations) {
          const n = normalizeCitation(c);
          if (n) citations.push(n);
        }
      }
      const tokens = data?.usage?.total_tokens || 0;
      return { text, citations, tokens };
    },
  },
  kimi: {
    endpoint: (_model, credentials) => `${(credentials?.providerSpecificData?.baseUrl || "https://api.moonshot.cn/v1").replace(/\/$/, "")}/chat/completions`,
    defaultModel: "kimi-k2.5",
    buildBody: (query, model) => ({
      model,
      messages: [{ role: "user", content: query }],
      tools: [{ type: "builtin_function", function: { name: "$web_search" } }],
    }),
    buildHeaders: (token) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    extractAnswer: (data) => {
      const msg = data?.choices?.[0]?.message || {};
      const text = typeof msg.content === "string" ? msg.content : "";
      const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
      const citations = [];
      for (const call of calls) {
        const argStr = call?.function?.arguments;
        if (!argStr) continue;
        let parsed;
        try {
          parsed = typeof argStr === "string" ? JSON.parse(argStr) : argStr;
        } catch {
          continue;
        }
        const items = parsed?.search_results || parsed?.results || parsed?.references || [];
        if (Array.isArray(items)) {
          for (const it of items) {
            const url = it?.url || it?.link;
            if (!url) continue;
            citations.push({ url, title: it?.title || "", snippet: it?.snippet || it?.summary || "" });
          }
        }
      }
      const tokens = data?.usage?.total_tokens || 0;
      return { text, citations, tokens };
    },
  },
  minimax: {
    endpoint: (_model, credentials) => `${(credentials?.providerSpecificData?.baseUrl || "https://api.minimaxi.com/v1").replace(/\/$/, "")}/text/chatcompletion_v2`,
    defaultModel: "MiniMax-M2.7",
    buildBody: (query, model) => ({
      model,
      messages: [{ role: "user", content: query }],
      tools: [{ type: "web_search" }],
    }),
    buildHeaders: (token) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    extractAnswer: (data) => {
      const msg = data?.choices?.[0]?.message || {};
      const text = typeof msg.content === "string" ? msg.content : "";
      const citations = [];
      const direct = Array.isArray(data?.web_search_results) ? data.web_search_results : [];
      for (const it of direct) {
        const url = it?.url || it?.link;
        if (url) citations.push({ url, title: it?.title || "", snippet: it?.snippet || it?.summary || "" });
      }
      if (!citations.length) {
        const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
        for (const call of calls) {
          const argStr = call?.function?.arguments;
          if (!argStr) continue;
          let parsed;
          try {
            parsed = typeof argStr === "string" ? JSON.parse(argStr) : argStr;
          } catch {
            continue;
          }
          const items = parsed?.results || parsed?.search_results || [];
          if (Array.isArray(items)) {
            for (const it of items) {
              const url = it?.url || it?.link;
              if (!url) continue;
              citations.push({ url, title: it?.title || "", snippet: it?.snippet || "" });
            }
          }
        }
      }
      const tokens = data?.usage?.total_tokens || 0;
      return { text, citations, tokens };
    },
  },
  perplexity: {
    endpoint: (_model, credentials) => `${(credentials?.providerSpecificData?.baseUrl || "https://api.perplexity.ai").replace(/\/$/, "")}/chat/completions`,
    defaultModel: "sonar",
    buildBody: (query, model) => ({
      model,
      messages: [{ role: "user", content: query }],
    }),
    buildHeaders: (token) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    extractAnswer: (data) => {
      const msg = data?.choices?.[0]?.message || {};
      const text = typeof msg.content === "string" ? msg.content : "";
      const raw = data?.citations || [];
      const citations = Array.isArray(raw) ? raw.map(normalizeCitation).filter(Boolean) : [];
      const tokens = data?.usage?.total_tokens || 0;
      return { text, citations, tokens };
    },
  },
};

async function runChatSearch({ provider, query, maxResults, model, credentials, timeoutMs, startedAt, log }) {
  const cfg = CHAT_SEARCH_CONFIG[provider];
  if (!cfg) {
    return { success: false, status: 400, error: `Unsupported chat-search provider: ${provider}` };
  }

  const token = credentials?.apiKey || credentials?.accessToken || credentials?.token;
  if (!token) {
    return { success: false, status: 401, error: "Missing credentials (apiKey or accessToken)" };
  }

  const useModel = model || cfg.defaultModel;
  const url = cfg.endpoint(useModel, credentials);
  const body = cfg.buildBody(query, useModel, credentials);
  const headers = cfg.buildHeaders(token, credentials);

  const upstreamStart = Date.now();
  const r = await tryFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }, timeoutMs);

  if (!r.ok) {
    log?.("chat search upstream failed", provider, r.error);
    return { success: false, status: r.timeout ? 504 : 502, error: r.error };
  }

  const upstreamMs = Date.now() - upstreamStart;
  const { json } = await readJsonOrText(r.res);
  if (!r.res.ok) {
    const errMsg = json?.error?.message || json?.error || json?.message || `Upstream HTTP ${r.res.status}`;
    return { success: false, status: r.res.status, error: typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg) };
  }

  const { text, citations, tokens } = cfg.extractAnswer(json || {});
  const retrievedAt = new Date().toISOString();
  const limited = (citations || []).slice(0, maxResults).map((c) => ({
    title: c?.title || "",
    url: c?.url || "",
    snippet: c?.snippet || "",
    provider_raw: c,
  }));
  const results = normalizeSearchItems(limited, provider, retrievedAt);

  return {
    success: true,
    data: buildAnswerData({
      provider,
      query,
      results,
      answerText: text || "",
      tokens,
      startedAt,
      upstreamMs,
      model: useModel,
    }),
  };
}

export async function handleSearchCore({ query, provider, maxResults, searchDepth, model, providerConfig, credentials, log }) {
  if (!query || typeof query !== "string") {
    return { success: false, status: 400, error: "query is required" };
  }
  if (!provider) {
    return { success: false, status: 400, error: "provider is required" };
  }

  const timeoutMs = providerConfig?.timeoutMs || REQUEST_TIMEOUT_MS;
  const limit = Number.isFinite(Number(maxResults)) && Number(maxResults) > 0 ? Math.floor(Number(maxResults)) : DEFAULT_MAX_RESULTS;
  const startedAt = Date.now();
  const apiKey = credentials?.apiKey || credentials?.key || credentials?.token || credentials?.accessToken || "";

  try {
    if (provider === "tavily") {
      return await runTavily({ query, maxResults: limit, searchDepth, timeoutMs, apiKey, startedAt });
    }
    if (provider === "brave-search") {
      return await runBraveSearch({ query, maxResults: limit, timeoutMs, apiKey, startedAt });
    }
    if (provider === "serper") {
      return await runSerper({ query, maxResults: limit, timeoutMs, apiKey, startedAt });
    }
    if (provider === "exa") {
      return await runExa({ query, maxResults: limit, timeoutMs, apiKey, startedAt });
    }
    if (provider === "searxng") {
      return await runSearxng({ query, maxResults: limit, timeoutMs, credentials, startedAt });
    }
    if (CHAT_SEARCH_CONFIG[provider]) {
      return await runChatSearch({ provider, query, maxResults: limit, model, credentials, timeoutMs, startedAt, log });
    }
    return { success: false, status: 400, error: `Unsupported provider: ${provider}` };
  } catch (err) {
    log?.("search handler error:", err?.message || err);
    return { success: false, status: 502, error: err?.message || "Internal search error" };
  }
}

export { CHAT_SEARCH_CONFIG };
