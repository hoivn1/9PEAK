import { createErrorResult, parseUpstreamError, formatProviderError } from "../utils/error.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import { refreshWithRetry } from "../services/tokenRefresh.js";
import { getExecutor } from "../executors/index.js";

// Image provider configurations
const IMAGE_PROVIDERS = {
  openai: {
    baseUrl: "https://api.openai.com/v1/images/generations",
    format: "openai",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    format: "gemini",
  },
  minimax: {
    baseUrl: "https://api.minimaxi.com/v1/images/generations",
    format: "openai",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1/images/generations",
    format: "openai",
  },
  nanobanana: {
    baseUrl: "https://api.nanobananaapi.ai/api/v1/nanobanana/generate",
    format: "nanobanana",
  },
  sdwebui: {
    baseUrl: "http://localhost:7860/sdapi/v1/txt2img",
    format: "sdwebui",
  },
  comfyui: {
    baseUrl: "http://localhost:8188",
    format: "comfyui",
  },
  huggingface: {
    baseUrl: "https://api-inference.huggingface.co/models",
    format: "huggingface",
  },
  codex: {
    baseUrl: "https://chatgpt.com/backend-api/codex/responses",
    format: "codex",
  },
};

/**
 * Build image generation URL
 */
function buildImageUrl(provider, model, credentials) {
  const config = IMAGE_PROVIDERS[provider];
  if (!config) return null;

  switch (provider) {
    case "gemini": {
      const apiKey = credentials?.apiKey || credentials?.accessToken;
      const modelId = model.replace(/^models\//, "");
      return `${config.baseUrl}/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
    }
    case "huggingface":
      return `${config.baseUrl}/${model}`;
    default:
      return config.baseUrl;
  }
}

/**
 * Build request headers
 */
function buildImageHeaders(provider, credentials) {
  const headers = { "Content-Type": "application/json" };

  if (provider === "codex") {
    const cryptoObj = globalThis.crypto || require("node:crypto").webcrypto;
    return {
      "authorization": `Bearer ${credentials?.accessToken || ""}`,
      "chatgpt-account-id": credentials?.providerSpecificData?.chatgptAccountId || "",
      "accept": "text/event-stream, application/json",
      "content-type": "application/json",
      "originator": "codex_cli_rs",
      "version": "0.122.0",
      "session_id": cryptoObj.randomUUID(),
      "x-client-request-id": cryptoObj.randomUUID(),
    };
  }

  if (provider === "gemini") {
    return headers;
  }

  if (provider === "openrouter") {
    headers["Authorization"] = `Bearer ${credentials?.apiKey || credentials?.accessToken}`;
    headers["HTTP-Referer"] = "https://endpoint-proxy.local";
    headers["X-Title"] = "Endpoint Proxy";
    return headers;
  }

  if (provider === "huggingface") {
    headers["Authorization"] = `Bearer ${credentials?.apiKey || credentials?.accessToken}`;
    return headers;
  }

  if (credentials?.apiKey || credentials?.accessToken) {
    headers["Authorization"] = `Bearer ${credentials.apiKey || credentials.accessToken}`;
  }

  return headers;
}

/**
 * Build request body based on provider format
 */
function buildImageBody(provider, model, body) {
  const { prompt, n = 1, size = "1024x1024", quality, style, response_format } = body;

  switch (provider) {
    case "codex": {
      const cryptoObj = globalThis.crypto || require("node:crypto").webcrypto;
      const content = [];
      const refs = [].concat(body.image || []).concat(body.image_url || []);
      for (const ref of refs) {
        if (!ref) continue;
        content.push({
          type: "input_image",
          image_url: typeof ref === "string" ? ref : ref.url || "",
          detail: (typeof ref === "object" && ref?.detail) || "high",
        });
      }
      const sizeHint = body.size ? ` (size: ${body.size})` : "";
      const nHint = body.n && body.n > 1 ? ` Generate ${body.n} variations.` : "";
      content.push({ type: "input_text", text: `${body.prompt || ""}${sizeHint}${nHint}` });

      return {
        model: body.codexModel || "gpt-5.4",
        instructions: "",
        input: [{ type: "message", role: "user", content }],
        tools: [{ type: "image_generation", output_format: body.output_format || "png" }],
        tool_choice: "auto",
        parallel_tool_calls: false,
        prompt_cache_key: cryptoObj.randomUUID(),
        stream: true,
        store: false,
        reasoning: null,
      };
    }

    case "gemini":
      return {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      };

    case "sdwebui": {
      const [width, height] = size.split("x").map(Number);
      return {
        prompt,
        width: width || 512,
        height: height || 512,
        steps: 20,
        batch_size: n,
      };
    }

    case "nanobanana": {
      const sizeMap = {
        "1024x1024": "1:1",
        "1024x1792": "9:16",
        "1792x1024": "16:9",
      };
      return {
        prompt,
        type: "TEXTTOIAMGE",
        numImages: n,
        image_size: sizeMap[size] || "1:1",
      };
    }

    default:
      // OpenAI-compatible format
      const requestBody = { model, prompt, n, size };
      if (quality) requestBody.quality = quality;
      if (style) requestBody.style = style;
      if (response_format) requestBody.response_format = response_format;
      return requestBody;
  }
}

/**
 * Parse SSE stream from chatgpt.com/backend-api/codex/responses for image_generation tool output.
 * Returns { created, data: [{ b64_json, revised_prompt }] }.
 */
async function parseCodexImageStream(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  const images = new Map();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (!frame.trim()) continue;

      const dataLines = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim());
      const dataStr = dataLines.join("\n");
      if (!dataStr || dataStr === "[DONE]") continue;

      let ev;
      try { ev = JSON.parse(dataStr); } catch { continue; }

      if (ev.type === "response.failed" || ev.type === "error") {
        const err = ev.error || ev;
        const code = err.code || err.type || "unknown";
        const msg = err.message || JSON.stringify(err);
        const e = new Error(`Codex image error: ${msg}`);
        e.code = code;
        e.status = code === "model_access_denied" || code === "feature_not_available"
          ? 403
          : code === "rate_limit_exceeded"
          ? 429
          : 502;
        if (err.resets_at_ms || err.resetsAtMs) {
          e.resetsAtMs = err.resets_at_ms || err.resetsAtMs;
        }
        throw e;
      }

      if (ev.type === "response.image_generation_call.partial_image") {
        const id = ev.item_id || ev.id || "_default";
        const existing = images.get(id) || {};
        images.set(id, { ...existing, b64_json: ev.partial_image_b64 || existing.b64_json });
        continue;
      }

      if (ev.type === "response.output_item.done" && ev.item?.type === "image_generation_call") {
        const id = ev.item.id || "_default";
        if (ev.item.status === "completed" && ev.item.result) {
          images.set(id, {
            b64_json: ev.item.result,
            revised_prompt: ev.item.revised_prompt || undefined,
          });
        }
        continue;
      }
    }
  }

  if (images.size === 0) {
    const e = new Error("Codex image stream ended without completed image");
    e.code = "stream_ended_before_completed_image";
    e.status = 502;
    throw e;
  }

  return {
    created: Math.floor(Date.now() / 1000),
    data: Array.from(images.values()),
  };
}

/**
 * Normalize response to OpenAI format
 */
function normalizeImageResponse(responseBody, provider, prompt) {
  // Already in OpenAI format
  if (responseBody.created && Array.isArray(responseBody.data)) {
    return responseBody;
  }

  const timestamp = Math.floor(Date.now() / 1000);

  switch (provider) {
    case "gemini": {
      const parts = responseBody.candidates?.[0]?.content?.parts || [];
      const images = parts
        .filter((p) => p.inlineData?.data)
        .map((p) => ({ b64_json: p.inlineData.data }));
      return {
        created: timestamp,
        data: images.length > 0 ? images : [{ b64_json: "", revised_prompt: prompt }],
      };
    }

    case "sdwebui": {
      const images = Array.isArray(responseBody.images)
        ? responseBody.images.map((img) => ({ b64_json: img }))
        : [];
      return { created: timestamp, data: images };
    }

    case "nanobanana": {
      if (responseBody.image) {
        return {
          created: timestamp,
          data: [{ b64_json: responseBody.image, revised_prompt: prompt }],
        };
      }
      return { created: timestamp, data: [] };
    }

    case "huggingface": {
      // HuggingFace returns binary image data
      return responseBody;
    }

    default:
      return responseBody;
  }
}

/**
 * Core image generation handler
 * @param {object} options
 * @param {object} options.body - Request body { model, prompt, n, size, ... }
 * @param {object} options.modelInfo - { provider, model }
 * @param {object} options.credentials - Provider credentials
 * @param {object} [options.log] - Logger
 * @param {function} [options.onCredentialsRefreshed] - Called when creds are refreshed
 * @param {function} [options.onRequestSuccess] - Called on success
 * @returns {Promise<{ success: boolean, response: Response, status?: number, error?: string }>}
 */
export async function handleImageGenerationCore({
  body,
  modelInfo,
  credentials,
  log,
  onCredentialsRefreshed,
  onRequestSuccess,
}) {
  const { provider, model } = modelInfo;

  if (!body.prompt) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, "Missing required field: prompt");
  }

  const url = buildImageUrl(provider, model, credentials);
  if (!url) {
    return createErrorResult(
      HTTP_STATUS.BAD_REQUEST,
      `Provider '${provider}' does not support image generation`
    );
  }

  const headers = buildImageHeaders(provider, credentials);
  const requestBody = buildImageBody(provider, model, body);

  log?.debug?.("IMAGE", `${provider.toUpperCase()} | ${model} | prompt="${body.prompt.slice(0, 50)}..."`);

  let providerResponse;
  try {
    providerResponse = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    const errMsg = formatProviderError(error, provider, model, HTTP_STATUS.BAD_GATEWAY);
    log?.debug?.("IMAGE", `Fetch error: ${errMsg}`);
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, errMsg);
  }

  // Handle 401/403 — try token refresh
  const executor = getExecutor(provider);
  if (
    !executor?.noAuth &&
    (providerResponse.status === HTTP_STATUS.UNAUTHORIZED ||
      providerResponse.status === HTTP_STATUS.FORBIDDEN)
  ) {
    const newCredentials = await refreshWithRetry(
      () => executor.refreshCredentials(credentials, log),
      3,
      log
    );

    if (newCredentials?.accessToken || newCredentials?.apiKey) {
      log?.info?.("TOKEN", `${provider.toUpperCase()} | refreshed for image generation`);
      Object.assign(credentials, newCredentials);
      if (onCredentialsRefreshed && newCredentials) {
        await onCredentialsRefreshed(newCredentials);
      }

      try {
        const retryHeaders = buildImageHeaders(provider, credentials);
        const retryUrl = provider === "gemini" ? buildImageUrl(provider, model, credentials) : url;

        providerResponse = await fetch(retryUrl, {
          method: "POST",
          headers: retryHeaders,
          body: JSON.stringify(requestBody),
        });
      } catch (retryError) {
        log?.warn?.("TOKEN", `${provider.toUpperCase()} | retry after refresh failed`);
      }
    } else {
      log?.warn?.("TOKEN", `${provider.toUpperCase()} | refresh failed`);
    }
  }

  if (!providerResponse.ok) {
    const { statusCode, message } = await parseUpstreamError(providerResponse);
    const errMsg = formatProviderError(new Error(message), provider, model, statusCode);
    log?.debug?.("IMAGE", `Provider error: ${errMsg}`);
    return createErrorResult(statusCode, errMsg);
  }

  if (provider === "codex") {
    try {
      const parsed = await parseCodexImageStream(providerResponse);
      if (onRequestSuccess) {
        await onRequestSuccess();
      }
      log?.debug?.("IMAGE", `Success | images=${parsed.data?.length || 0}`);
      return {
        success: true,
        response: new Response(JSON.stringify(parsed), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }),
      };
    } catch (streamError) {
      const status = streamError.status || HTTP_STATUS.BAD_GATEWAY;
      const errMsg = formatProviderError(streamError, provider, model, status);
      log?.debug?.("IMAGE", `Codex stream error: ${errMsg}`);
      return createErrorResult(status, errMsg, streamError.resetsAtMs);
    }
  }

  let responseBody;
  try {
    // HuggingFace returns binary image data
    if (provider === "huggingface") {
      const buffer = await providerResponse.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      responseBody = {
        created: Math.floor(Date.now() / 1000),
        data: [{ b64_json: base64 }],
      };
    } else {
      responseBody = await providerResponse.json();
    }
  } catch (parseError) {
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, `Invalid response from ${provider}`);
  }

  if (onRequestSuccess) {
    await onRequestSuccess();
  }

  const normalized = normalizeImageResponse(responseBody, provider, body.prompt);

  log?.debug?.("IMAGE", `Success | images=${normalized.data?.length || 0}`);

  return {
    success: true,
    response: new Response(JSON.stringify(normalized), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }),
  };
}
