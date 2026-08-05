import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
const retryablePollStatuses = new Set([429, 502, 503, 504]);

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const parseJson = (text) => {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 1200) };
  }
};

const taskIdFrom = (body, headers) => {
  const direct = body?.task_id || body?.id || body?.data?.task_id || body?.data?.id;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const message = String(body?.message || body?.error?.message || "");
  const embedded = /task_id[=: ]+([a-z0-9_-]+)/iu.exec(message)?.[1];
  if (embedded) return embedded;
  const location = headers?.get("location") || "";
  return location.split("/").filter(Boolean).pop() || "";
};

const retryDelayMs = (response, body, fallbackMs) => {
  const header = response.headers.get("retry-after");
  if (header && /^\d+(?:\.\d+)?$/u.test(header)) return Math.max(0, Number(header) * 1000);
  if (header) {
    const dateDelay = Date.parse(header) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  const bodySeconds = Number(body?.retry_after_seconds || body?.retry_after);
  return Number.isFinite(bodySeconds) && bodySeconds >= 0 ? bodySeconds * 1000 : fallbackMs;
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

export const createHappyEveringImageClient = ({
  apiKey = process.env.LYNN_IMAGE_API_KEY || "",
  baseUrl = process.env.LYNN_IMAGE_BASE_URL || defaultBaseUrl,
  model = process.env.LYNN_IMAGE_MODEL || defaultModel,
  defaultSize = process.env.LYNN_IMAGE_DEFAULT_SIZE || "1024x1024",
  outputDirectory = process.env.LYNN_IMAGE_OUTPUT_DIR || "",
  timeoutMs = Number(process.env.LYNN_IMAGE_TIMEOUT_MS || 600_000),
  pollIntervalMs = Number(process.env.LYNN_IMAGE_POLL_INTERVAL_MS || 5_000),
  fetchImpl = fetch,
  sleep = wait,
} = {}) => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/u, "");

  const request = async (endpoint, init) => {
    if (!apiKey.trim()) throw new Error("LYNN_IMAGE_API_KEY is not configured. Set it and restart Codex.");
    let response;
    try {
      response = await fetchImpl(`${normalizedBaseUrl}${endpoint}`, {
        ...init,
        headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers || {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new Error(`HappyEvering image request could not be completed: ${error.message}`);
    }
    const body = parseJson(await response.text());
    if (!response.ok && response.status !== 202) throw providerError(response.status, body);
    return { response, body };
  };

  const poll = async (endpoint, selectedModel, taskId, initialDelayMs) => {
    const deadline = Date.now() + timeoutMs;
    let delayMs = initialDelayMs;
    while (Date.now() < deadline) {
      await sleep(delayMs);
      let result;
      try {
        result = await request(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: selectedModel, task_id: taskId }),
        });
      } catch (error) {
        const status = Number(/\((\d{3})/u.exec(error.message)?.[1]);
        if (!retryablePollStatuses.has(status)) throw error;
        delayMs = Math.min(Math.max(delayMs * 2, pollIntervalMs), 30_000);
        continue;
      }
      if (result.response.status === 200) return result.body;
      delayMs = retryDelayMs(result.response, result.body, pollIntervalMs);
    }
    throw new Error(`HappyEvering image task timed out after ${Math.round(timeoutMs / 1000)} seconds`);
  };

  const run = async ({ endpoint, requestBody, formData, prefix, outputName, requestOutputDirectory }) => {
    const selectedModel = requestBody.model || model;
    const submission = await request(endpoint, formData ? { method: "POST", body: formData } : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const taskId = submission.response.status === 202 ? taskIdFrom(submission.body, submission.response.headers) : "";
    if (submission.response.status === 202 && !taskId) throw new Error("HappyEvering accepted the task but returned no task ID");
    const completed = taskId
      ? await poll(endpoint, selectedModel, taskId, retryDelayMs(submission.response, submission.body, pollIntervalMs))
      : submission.body;
    const outputs = await saveImageResponse({
      response: completed,
      outputDirectory: requestOutputDirectory || outputDirectory,
      outputName,
      prefix,
      fetchImpl,
      apiKey,
      baseUrl: normalizedBaseUrl,
      timeoutMs,
    });
    return {
      taskId: taskId || undefined,
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
    const imagePaths = [...new Set(requestArgs.imagePaths || [])].map((item) => path.resolve(item));
    if (!imagePaths.length) throw new Error("At least one reference image is required");
    const selectedModel = requestArgs.model || model;
    const formData = new FormData();
    const requestBody = addOptionalFields({
      model: selectedModel,
      prompt,
      n: requestArgs.n || 1,
      size: requestArgs.size || defaultSize,
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
