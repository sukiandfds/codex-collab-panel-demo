import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize } from "image-size";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultOutputDirectory = path.resolve(moduleDirectory, "../../../runtime/generated-images");

const imageFields = new Set(["b64_json", "base64", "base64_json", "url", "image_url", "image"]);
const containerFields = new Set(["data", "images", "output", "result", "image"]);

const collectImageSources = (value, field = "", sources = []) => {
  if (typeof value === "string") {
    if (imageFields.has(field)) sources.push(value);
    return sources;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageSources(item, field, sources);
    return sources;
  }
  if (!value || typeof value !== "object") return sources;
  for (const [key, child] of Object.entries(value)) {
    if (imageFields.has(key) || containerFields.has(key)) collectImageSources(child, key, sources);
  }
  return sources;
};

const extensionFromMime = (mimeType) => ({
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
}[mimeType] || "");

const identifyImage = (buffer, hintedMime = "") => {
  let type = "";
  try {
    type = imageSize(buffer).type || "";
  } catch {
    type = "";
  }
  const mimeType = type === "jpg" ? "image/jpeg" : type ? `image/${type}` : hintedMime.split(";")[0].trim();
  const extension = extensionFromMime(mimeType);
  if (!extension) throw new Error(`Image API returned an unsupported image format: ${mimeType || "unknown"}`);
  let dimensions = {};
  try {
    const measured = imageSize(buffer);
    dimensions = { width: measured.width, height: measured.height };
  } catch {
    dimensions = {};
  }
  return { mimeType, extension, ...dimensions };
};

const downloadImage = async ({ url, fetchImpl, apiKey, baseUrl, timeoutMs }) => {
  const headers = {};
  if (new URL(url).origin === new URL(baseUrl).origin) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Failed to download generated image: HTTP ${response.status}`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") || "",
  };
};

const decodeImageSource = async (source, options) => {
  const dataUrl = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/isu.exec(source);
  if (dataUrl) return { buffer: Buffer.from(dataUrl[2], "base64"), mimeType: dataUrl[1] };
  if (/^https?:\/\//iu.test(source)) return downloadImage({ url: source, ...options });
  return { buffer: Buffer.from(source, "base64"), mimeType: "" };
};

const safeStem = (outputName, prefix, stamp) => {
  const proposed = path.basename(String(outputName || "")).replace(/\.[^.]+$/u, "");
  const cleaned = proposed.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-").trim();
  return cleaned || `${prefix}-${stamp}`;
};

const availablePath = async (directory, stem, suffix, extension) => {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const collision = attempt ? `-${attempt + 1}` : "";
    const candidate = path.join(directory, `${stem}${suffix}${collision}${extension}`);
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error("Could not allocate an output filename");
};

export const saveImageResponse = async ({
  response,
  outputDirectory = "",
  outputName = "",
  prefix,
  fetchImpl,
  apiKey,
  baseUrl,
  timeoutMs,
}) => {
  const sources = [...new Set(collectImageSources(response))];
  if (!sources.length) {
    const message = response?.error?.message || response?.message || "Image API returned no image data";
    throw new Error(message);
  }
  const directory = path.resolve(outputDirectory || defaultOutputDirectory);
  await fs.mkdir(directory, { recursive: true });
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  const stem = safeStem(outputName, prefix, stamp);
  const outputs = [];
  for (let index = 0; index < sources.length; index += 1) {
    const decoded = await decodeImageSource(sources[index], { fetchImpl, apiKey, baseUrl, timeoutMs });
    if (!decoded.buffer.length) throw new Error("Image API returned an empty image");
    const identified = identifyImage(decoded.buffer, decoded.mimeType);
    const suffix = sources.length > 1 ? `-${index + 1}` : "";
    const filePath = await availablePath(directory, stem, suffix, identified.extension);
    await fs.writeFile(filePath, decoded.buffer, { flag: "wx" });
    outputs.push({ path: filePath, bytes: decoded.buffer.length, ...identified });
  }
  return outputs;
};
