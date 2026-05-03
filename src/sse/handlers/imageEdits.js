import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { getSettings } from "@/lib/localDb";
import { getModelInfo } from "../services/model.js";
import { handleImageEditsCore } from "open-sse/handlers/imageEditsCore.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import * as log from "../utils/logger.js";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.js";
import { saveRequestUsage, appendRequestLog } from "@/lib/usageDb.js";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg"]);
const ALLOWED_SIZES = new Set(["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"]);
const ALLOWED_RESPONSE_FORMAT = new Set(["b64_json", "url"]);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function toOpenAIError(message, code, param, status = HTTP_STATUS.BAD_REQUEST) {
  return new Response(
    JSON.stringify({
      error: {
        message,
        type: "invalid_request_error",
        code,
        param,
      },
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}

function parseIntOrDefault(value, fallback) {
  const n = Number.parseInt(String(value ?? fallback), 10);
  return Number.isNaN(n) ? fallback : n;
}

export async function handleImageEdits(request) {
  const apiKey = extractApiKey(request);
  const settings = await getSettings();

  if (settings.requireApiKey) {
    if (!apiKey) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    const valid = await isValidApiKey(apiKey);
    if (!valid) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return toOpenAIError("Invalid multipart/form-data body", "invalid_multipart", null);
  }

  const image = form.get("image");
  const mask = form.get("mask");
  const prompt = String(form.get("prompt") || "").trim();
  const modelStr = String(form.get("model") || "").trim();
  const n = parseIntOrDefault(form.get("n"), 1);
  const size = String(form.get("size") || "1024x1024").trim();
  const response_format = String(form.get("response_format") || "b64_json").trim();
  const quality = form.get("quality") ? String(form.get("quality")) : undefined;

  if (!image || typeof image === "string") {
    return toOpenAIError("Missing required field: image", "missing_image", "image");
  }
  if (!prompt) {
    return toOpenAIError("Missing required field: prompt", "missing_prompt", "prompt");
  }
  if (!modelStr) {
    return toOpenAIError("Missing required field: model", "missing_model", "model");
  }
  if (!ALLOWED_MIME.has(image.type)) {
    return toOpenAIError("Image format not supported, must be PNG or JPG", "invalid_image_format", "image");
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return toOpenAIError("Image too large, max size is 25MB", "image_too_large", "image", HTTP_STATUS.REQUEST_ENTITY_TOO_LARGE);
  }
  if (prompt.length > 4000) {
    return toOpenAIError("Prompt too long, max length is 4000 chars", "prompt_too_long", "prompt");
  }
  if (n < 1 || n > 4) {
    return toOpenAIError("Invalid n, must be between 1 and 4", "invalid_n", "n");
  }
  if (!ALLOWED_SIZES.has(size)) {
    return toOpenAIError("Invalid size", "invalid_size", "size");
  }
  if (!ALLOWED_RESPONSE_FORMAT.has(response_format)) {
    return toOpenAIError("Invalid response_format", "invalid_response_format", "response_format");
  }
  if (mask && typeof mask !== "string" && mask.size > MAX_IMAGE_BYTES) {
    return toOpenAIError("Mask too large, max size is 25MB", "mask_too_large", "mask", HTTP_STATUS.REQUEST_ENTITY_TOO_LARGE);
  }

  const modelInfo = await getModelInfo(modelStr);
  if (!modelInfo.provider) {
    return toOpenAIError("Invalid model format", "invalid_model", "model");
  }

  const { provider, model } = modelInfo;
  const body = {
    prompt,
    n,
    size,
    model: modelStr,
    response_format,
    quality,
    image: {
      name: image.name || "image.png",
      type: image.type,
      data: Buffer.from(await image.arrayBuffer()),
    },
    mask: mask && typeof mask !== "string"
      ? {
          name: mask.name || "mask.png",
          type: mask.type,
          data: Buffer.from(await mask.arrayBuffer()),
        }
      : null,
  };

  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      }
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);
    const result = await handleImageEditsCore({
      body,
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      onCredentialsRefreshed: async (newCreds) => {
        await updateProviderCredentials(credentials.connectionId, {
          accessToken: newCreds.accessToken,
          refreshToken: newCreds.refreshToken,
          providerSpecificData: newCreds.providerSpecificData,
          testStatus: "active",
        });
      },
      onRequestSuccess: async () => {
        await clearAccountError(credentials.connectionId, credentials, model);
        const imageCount = n || 1;
        await saveRequestUsage({
          provider,
          model,
          endpoint: "/v1/images/edits",
          connectionId: credentials.connectionId,
          tokens: { input_tokens: 0, output_tokens: 0, image_count: imageCount },
        });
        await appendRequestLog({
          model,
          provider,
          connectionId: credentials.connectionId,
          tokens: { prompt_tokens: 0, completion_tokens: 0 },
          status: "ok",
        });
      },
    });

    if (result.success) return result.response;

    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model);
    if (shouldFallback) {
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    return result.response;
  }
}
