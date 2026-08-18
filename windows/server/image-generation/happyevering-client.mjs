import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize } from "image-size";
import { imageResolutionForModel, normalizeProviderImageSize } from "./image-contract.mjs";
import { saveImageResponse } from "./image-output.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const localSecretsFile = path.resolve(moduleDirectory, "../../../runtime/secrets.env");
try {
  process.loadEnvFile(localSecretsFile);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const defaultBaseUrl = "https://api.happyevering.xyz/v1";
const defaultModel = "gpt-image-2";
const imageFields = new Set(["b64_json", "base64", "base64_json", "url", "image_url", "image"]);
const containerFields = new Set(["data", "images", "output", "result", "response", "image"]);

const tryParseJson = (text) => {
  try {
    return { value: JSON.parse(text), complete: true };
  } catch {
    return { value: null, complete: false };
  }
};

const parseJson = (text) => {
  if (!text.trim()) return {};
  const parsed = tryParseJson(text);
  return parsed.complete ? parsed.value : { message: text.slice(0, 1200) };
};

const readJsonBody = async (response) => {
  if (!response.body) return parseJson(await response.text());
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const trimmed = buffer.trim();
      if (trimmed.endsWith("}") || trimmed.endsWith("]")) {
        const parsed = tryParseJson(trimmed);
        if (parsed.complete) return parsed.value;
      }
      if (done) return parseJson(buffer);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
};

const hasImageSource = (value, field = "") => {
  if (typeof value === "string") return imageFields.has(field) && value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasImageSource(item, field));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => (
    (imageFields.has(key) || containerFields.has(key)) && hasImageSource(child, key)
  ));
};

const streamError = (payload) => {
  const status = String(payload?.status || payload?.data?.status || "").toLowerCase();
  const type = String(payload?.type || "").toLowerCase();
  if (!payload?.error && !["failed", "error"].includes(status) && !type.includes("error")) return null;
  return payload?.error?.message || payload?.message || "HappyEvering image stream failed";
};

const parseSseFrame = (frame) => {
  const lines = frame.split(/\r?\n/u);
  const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "";
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data || data === "[DONE]") return null;
  return { event, payload: parseJson(data) };
};

const readImageStream = async (response) => {
  if (!response.body) throw new Error("HappyEvering image stream returned no response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/u);
      buffer = frames.pop() || "";
      if (done && buffer.trim()) frames.push(buffer);
      for (const frame of frames) {
        const parsed = parseSseFrame(frame);
        if (!parsed) continue;
        const message = streamError(parsed.payload);
        if (message) throw new Error(message);
        const eventType = `${parsed.event} ${parsed.payload?.type || ""}`;
        if (!/partial|progress/iu.test(eventType) && hasImageSource(parsed.payload)) return parsed.payload;
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  throw new Error("HappyEvering image stream ended without a final image");
};

const mimeFromPath = (filePath) => ({
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
}[path.extname(filePath).toLowerCase()] || "application/octet-stream");

const addOptionalFields = (target, request) => {
  if (request.quality) target.quality = request.quality;
  if (request.targetSize) target.target_size = request.targetSize;
  return target;
};

const providerError = (status, body) => {
  const code = body?.error?.code || body?.code || "";
  const message = body?.error?.message || body?.message || `HTTP ${status}`;
  return new Error(`HappyEvering image request failed (${status}${code ? `, ${code}` : ""}): ${message}`);
};

const greatestCommonDivisor = (left, right) => {
  let a = left;
  let b = right;
  while (b) [a, b] = [b, a % b];
  return a;
};

const sizeFromReferenceImage = async (imagePath, model) => {
  let dimensions;
  try {
    dimensions = imageSize(await fs.readFile(imagePath));
  } catch (error) {
    throw new Error(`Could not read the aspect ratio from ${imagePath}: ${error.message}`);
  }
  if (!dimensions.width || !dimensions.height) {
    throw new Error(`Could not read the aspect ratio from ${imagePath}`);
  }
  const divisor = greatestCommonDivisor(dimensions.width, dimensions.height);
  return normalizeProviderImageSize(
    `${dimensions.width / divisor}:${dimensions.height / divisor}`,
    imageResolutionForModel(model),
  );
};

export const createHappyEveringImageClient = ({
  apiKey = process.env.NEGUS_IMAGE_API_KEY || process.env.LYNN_IMAGE_API_KEY || "",
  baseUrl = process.env.NEGUS_IMAGE_BASE_URL || process.env.LYNN_IMAGE_BASE_URL || defaultBaseUrl,
  model = process.env.NEGUS_IMAGE_MODEL || process.env.LYNN_IMAGE_MODEL || defaultModel,
  defaultSize = process.env.NEGUS_IMAGE_DEFAULT_SIZE || process.env.LYNN_IMAGE_DEFAULT_SIZE || "1024x1024",
  outputDirectory = process.env.NEGUS_IMAGE_OUTPUT_DIR || process.env.LYNN_IMAGE_OUTPUT_DIR || "",
  timeoutMs = Number(process.env.NEGUS_IMAGE_TIMEOUT_MS || process.env.LYNN_IMAGE_TIMEOUT_MS || 180_000),
  fetchImpl = fetch,
} = {}) => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/u, "");

  const request = async (endpoint, init, signal) => {
    if (!apiKey.trim()) throw new Error("NEGUS_IMAGE_API_KEY is not configured. Set it and restart Codex.");
    let response;
    try {
      response = await fetchImpl(`${normalizedBaseUrl}${endpoint}`, {
        ...init,
        headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers || {}) },
        signal,
      });
    } catch (error) {
      throw new Error(`HappyEvering image request could not be completed: ${error.message}`);
    }
    if (response.status === 202) {
      const body = await readJsonBody(response);
      throw new Error(`HappyEvering returned an unexpected asynchronous task (${body?.id || body?.task_id || "no task ID"})`);
    }
    if (!response.ok) {
      const body = await readJsonBody(response);
      throw providerError(response.status, body);
    }
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.toLowerCase().includes("text/event-stream")
      ? await readImageStream(response)
      : await readJsonBody(response);
    return { response, body };
  };

  const run = async ({ endpoint, requestBody, formData, prefix, outputName, requestOutputDirectory }) => {
    const selectedModel = requestBody.model || model;
    const startedAt = Date.now();
    process.stderr.write(`[negus-image] timing request_started model=${selectedModel}\n`);
    const signal = AbortSignal.timeout(timeoutMs);
    let submission;
    try {
      submission = await request(endpoint, formData ? { method: "POST", body: formData } : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }, signal);
    } catch (error) {
      process.stderr.write(`[negus-image] timing request_failed duration_ms=${Date.now() - startedAt}\n`);
      throw error;
    }
    const providerReturnedAt = Date.now();
    process.stderr.write(`[negus-image] timing provider_returned duration_ms=${providerReturnedAt - startedAt}\n`);
    const completed = submission.body;
    const outputs = await saveImageResponse({
      response: completed,
      outputDirectory: requestOutputDirectory || outputDirectory,
      outputName,
      prefix,
      fetchImpl,
      apiKey,
      baseUrl: normalizedBaseUrl,
      timeoutMs,
      signal,
    });
    process.stderr.write(`[negus-image] timing image_saved duration_ms=${Date.now() - providerReturnedAt} total_ms=${Date.now() - startedAt}\n`);
    return {
      model: selectedModel,
      outputs,
      usage: completed?.usage || null,
      revisedPrompt: completed?.data?.[0]?.revised_prompt || null,
    };
  };

  const generate = async (requestArgs) => {
    const prompt = String(requestArgs.prompt || "").trim();
    if (!prompt) throw new Error("prompt is required");
    const selectedModel = requestArgs.model || model;
    const requestBody = addOptionalFields({
      model: selectedModel,
      prompt,
      n: requestArgs.n || 1,
      size: requestArgs.size || defaultSize,
      response_format: "b64_json",
    }, requestArgs);
    return run({
      endpoint: "/images/generations",
      requestBody,
      prefix: "generated",
      outputName: requestArgs.outputName,
      requestOutputDirectory: requestArgs.outputDirectory,
    });
  };

  const edit = async (requestArgs) => {
    const prompt = String(requestArgs.prompt || "").trim();
    if (!prompt) throw new Error("prompt is required");
    const imagePaths = (requestArgs.imagePaths || []).map((item) => path.resolve(item));
    if (!imagePaths.length) throw new Error("At least one reference image is required");
    const selectedModel = requestArgs.model || model;
    let selectedSize = requestArgs.size;
    if (!selectedSize && requestArgs.aspectSourceImageIndex !== undefined) {
      const index = Number(requestArgs.aspectSourceImageIndex);
      if (!Number.isInteger(index) || index < 1 || index > imagePaths.length) {
        throw new Error(`aspect_source_image_index must reference one of the ${imagePaths.length} input images`);
      }
      selectedSize = await sizeFromReferenceImage(imagePaths[index - 1], selectedModel);
    }
    const formData = new FormData();
    const requestBody = addOptionalFields({
      model: selectedModel,
      prompt,
      n: requestArgs.n || 1,
      size: selectedSize || defaultSize,
      response_format: "b64_json",
    }, requestArgs);
    for (const [key, value] of Object.entries(requestBody)) formData.append(key, String(value));
    for (const imagePath of imagePaths) {
      const buffer = await fs.readFile(imagePath);
      formData.append("image", new Blob([buffer], { type: mimeFromPath(imagePath) }), path.basename(imagePath));
    }
    if (requestArgs.maskPath) {
      const maskPath = path.resolve(requestArgs.maskPath);
      if (path.extname(maskPath).toLowerCase() !== ".png") throw new Error("mask_path must point to a PNG file");
      formData.append("mask", new Blob([await fs.readFile(maskPath)], { type: "image/png" }), path.basename(maskPath));
    }
    return run({
      endpoint: "/images/edits",
      requestBody,
      formData,
      prefix: "edited",
      outputName: requestArgs.outputName,
      requestOutputDirectory: requestArgs.outputDirectory,
    });
  };

  return { generate, edit };
};
