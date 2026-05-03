import { createErrorResult, parseUpstreamError, formatProviderError } from "../utils/error.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";

function normalizeResponse(provider, model, responseBody, prompt) {
  if (responseBody?.created && Array.isArray(responseBody?.data)) {
    return { ...responseBody, model: responseBody.model || model };
  }

  const created = Math.floor(Date.now() / 1000);

  if (provider === "gemini") {
    const parts = responseBody?.candidates?.flatMap((c) => c?.content?.parts || []) || [];
    const images = parts
      .filter((p) => p?.inlineData?.data || p?.inline_data?.data)
      .map((p) => ({
        b64_json: p.inlineData?.data || p.inline_data?.data,
        revised_prompt: prompt,
      }));

    return {
      created,
      model,
      data: images,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    };
  }

  return {
    created,
    model,
    data: [],
    usage: {
      input_tokens: 0,
      output_tokens: 0,
    },
  };
}

function mapProvider(modelInfo) {
  const { provider, model } = modelInfo;
  const alias = `${provider}/${model}`;

  if (alias === "gemini/gemini-2.5-flash-image") {
    return "gemini";
  }
  return "openai-compatible";
}

export async function handleImageEditsCore({ body, modelInfo, credentials, log, onRequestSuccess }) {
  const mappedProvider = mapProvider(modelInfo);
  const nowModel = body.model || `${modelInfo.provider}/${modelInfo.model}`;

  try {
    let providerResponse;

    if (mappedProvider === "gemini") {
      const apiKey = credentials?.apiKey || credentials?.accessToken;
      const b64 = body.image.data.toString("base64");
      const payload = {
        contents: [{
          parts: [
            { text: body.prompt },
            { inline_data: { mime_type: body.image.type, data: b64 } },
          ],
        }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          temperature: 0.7,
        },
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(apiKey)}`;
      providerResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      const form = new FormData();
      form.append("image", new Blob([body.image.data], { type: body.image.type }), body.image.name);
      if (body.mask?.data) {
        form.append("mask", new Blob([body.mask.data], { type: body.mask.type || "image/png" }), body.mask.name || "mask.png");
      }
      form.append("prompt", body.prompt);
      form.append("model", "gpt-image-1");
      form.append("n", String(body.n || 1));
      form.append("size", body.size || "1024x1024");
      form.append("response_format", body.response_format || "b64_json");
      if (body.quality) form.append("quality", body.quality);

      providerResponse = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials?.apiKey || credentials?.accessToken}`,
        },
        body: form,
      });
    }

    if (!providerResponse.ok) {
      const { statusCode, message } = await parseUpstreamError(providerResponse);
      const errMsg = formatProviderError(new Error(message), modelInfo.provider, modelInfo.model, statusCode);
      return createErrorResult(statusCode, errMsg);
    }

    const raw = await providerResponse.json();
    const normalized = normalizeResponse(modelInfo.provider, nowModel, raw, body.prompt);

    if (onRequestSuccess) await onRequestSuccess();

    return {
      success: true,
      response: new Response(JSON.stringify(normalized), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }),
    };
  } catch (error) {
    const errMsg = formatProviderError(error, modelInfo.provider, modelInfo.model, HTTP_STATUS.BAD_GATEWAY);
    log?.error?.("IMAGE_EDITS", errMsg);
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, errMsg);
  }
}
