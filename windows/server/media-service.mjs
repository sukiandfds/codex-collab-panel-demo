import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { imageSize } from "image-size";
import { imageSizeFromFile } from "image-size/fromFile";
import sharp from "sharp";

const mimeTypes = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".gif", "image/gif"],
  [".webp", "image/webp"], [".bmp", "image/bmp"], [".svg", "image/svg+xml"], [".avif", "image/avif"],
  [".mp3", "audio/mpeg"], [".wav", "audio/wav"], [".m4a", "audio/mp4"], [".ogg", "audio/ogg"],
  [".mp4", "video/mp4"], [".webm", "video/webm"], [".mov", "video/quicktime"],
  [".pdf", "application/pdf"], [".csv", "text/csv; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"], [".md", "text/markdown; charset=utf-8"], [".xml", "application/xml; charset=utf-8"],
  [".yaml", "application/yaml; charset=utf-8"], [".yml", "application/yaml; charset=utf-8"],
  [".html", "text/html; charset=utf-8"], [".htm", "text/html; charset=utf-8"],
  [".doc", "application/msword"], [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".xls", "application/vnd.ms-excel"], [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".ppt", "application/vnd.ms-powerpoint"], [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [".zip", "application/zip"], [".7z", "application/x-7z-compressed"],
]);

const inlineTypes = /^(?:image|audio|video)\//u;
const maxUploadBytes = 20 * 1024 * 1024;
const maxImageProbeBytes = 25 * 1024 * 1024;
const previewMaxPixels = 320;

const validDimension = (value) => Number.isSafeInteger(value) && value > 0;
const publicMedia = ({ id, name, mimeType, url, width, height }) => ({
  id,
  name,
  mimeType,
  url,
  ...(validDimension(width) && validDimension(height) ? { width, height } : {}),
});
const normalizeSize = (size) => {
  if (!validDimension(size?.width) || !validDimension(size?.height)) return {};
  const rotated = [5, 6, 7, 8].includes(size.orientation);
  return rotated
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
};
const normalizeDimensions = (input) => {
  try {
    return normalizeSize(imageSize(input));
  } catch {
    return {};
  }
};
const dimensionsFromFile = async (file) => {
  try {
    return normalizeSize(await imageSizeFromFile(file));
  } catch {
    return {};
  }
};
const imageUrl = (id, dimensions) => validDimension(dimensions.width) && validDimension(dimensions.height)
  ? `/api/media/${id}?w=${dimensions.width}&h=${dimensions.height}`
  : `/api/media/${id}`;
const storedUploadName = (value) => {
  const marker = value.indexOf("__");
  return marker >= 0 ? value.slice(marker + 2) : value;
};
const safeUploadName = (value) => {
  const name = path.basename(String(value || "attachment"))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
    .trim()
    .slice(-120);
  return name || "attachment";
};

const readUpload = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxUploadBytes) {
      const error = new Error("附件不能超过 20 MB");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!size) {
    const error = new Error("附件内容为空");
    error.statusCode = 400;
    throw error;
  }
  return Buffer.concat(chunks);
};

export const createMediaService = ({ uploadRoot } = {}) => {
  const entries = new Map();
  const previewJobs = new Map();
  const previewRoot = uploadRoot ? path.join(path.dirname(uploadRoot), "media-previews") : "";

  const createPreview = async (entry) => {
    if (!previewRoot || !entry.mimeType.startsWith("image/") || entry.mimeType === "image/svg+xml") return null;
    const version = createHash("sha256").update(entry.signature || entry.path).digest("hex").slice(0, 12);
    const target = path.join(previewRoot, `${entry.id}-${version}.webp`);
    try {
      await fsp.access(target);
      return target;
    } catch {
      // Generate once below.
    }

    const existing = previewJobs.get(target);
    if (existing) return existing;
    const job = (async () => {
      await fsp.mkdir(previewRoot, { recursive: true });
      const temporary = `${target}.${process.pid}.tmp`;
      try {
        await sharp(entry.path, { failOn: "none" })
          .rotate()
          .resize({ width: previewMaxPixels, height: previewMaxPixels, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 62, effort: 3 })
          .toFile(temporary);
        await fsp.rename(temporary, target);
        return target;
      } finally {
        await fsp.rm(temporary, { force: true }).catch(() => {});
      }
    })();
    previewJobs.set(target, job);
    try {
      return await job;
    } finally {
      previewJobs.delete(target);
    }
  };

  const register = (file, overrides = {}) => {
    const resolved = path.resolve(file);
    const id = createHash("sha256").update(resolved.toLowerCase()).digest("hex").slice(0, 32);
    const inferredType = mimeTypes.get(path.extname(resolved).toLowerCase());
    const declaredType = /^[\w.+-]+\/[\w.+-]+(?:;\s*charset=[\w-]+)?$/iu.test(overrides.mimeType || "")
      ? overrides.mimeType
      : "";
    const mimeType = inferredType || declaredType || "application/octet-stream";
    let stat = null;
    try {
      stat = fs.statSync(resolved);
    } catch {
      // Missing files remain registered so the normal availability path can handle them.
    }
    const signature = stat?.isFile() ? `${stat.size}:${stat.mtimeMs}` : "";
    const existing = entries.get(id);
    if (existing && existing.signature === signature && existing.mimeType === mimeType) return publicMedia(existing);

    let dimensions = overrides.dimensions || {};
    if (!(validDimension(dimensions.width) && validDimension(dimensions.height)) && mimeType.startsWith("image/") && (!stat || stat.size <= maxImageProbeBytes)) {
      const input = overrides.buffer || (() => {
        try {
          return fs.readFileSync(resolved);
        } catch {
          return null;
        }
      })();
      if (input) dimensions = normalizeDimensions(input);
    }
    const value = {
      id,
      path: resolved,
      name: overrides.name || path.basename(resolved),
      mimeType,
      url: imageUrl(id, dimensions),
      ...dimensions,
      signature,
    };
    entries.set(id, value);
    return publicMedia(value);
  };

  const restoreUploads = async () => {
    if (!uploadRoot) return;
    try {
      const files = await fsp.readdir(uploadRoot, { withFileTypes: true });
      await Promise.all(files.filter((file) => file.isFile()).map(async (file) => {
        const resolved = path.join(uploadRoot, file.name);
        const inferredType = mimeTypes.get(path.extname(resolved).toLowerCase()) || "";
        const dimensions = inferredType.startsWith("image/") ? await dimensionsFromFile(resolved) : {};
        register(resolved, { name: storedUploadName(file.name), dimensions });
      }));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  };

  const upload = async (request, { name, mimeType }) => {
    if (!uploadRoot) throw new Error("附件上传服务未配置");
    const displayName = safeUploadName(name);
    const body = await readUpload(request);
    await fsp.mkdir(uploadRoot, { recursive: true });
    const contentHash = createHash("sha256").update(body).digest("hex");
    const storedName = `${contentHash}__${displayName}`;
    const file = path.join(uploadRoot, storedName);
    try {
      await fsp.writeFile(file, body, { flag: "wx" });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    return register(file, { name: displayName, mimeType, buffer: body });
  };

  const resolveMany = (ids) => [...new Set(Array.isArray(ids) ? ids : [])]
    .slice(0, 6)
    .map((id) => {
      const key = String(id || "");
      const entry = entries.get(key);
      const available = Boolean(entry && fs.existsSync(entry.path));
      if (entry && !available) entries.delete(key);
      return available ? entry : null;
    })
    .filter(Boolean);

  const serve = async (request, response, id, { download = false, preview = false } = {}) => {
    const entry = entries.get(id);
    if (!entry) {
      response.writeHead(404);
      response.end("Media not found");
      return;
    }
    let servedPath = entry.path;
    let servedType = entry.mimeType;
    if (preview && !download) {
      try {
        const generated = await createPreview(entry);
        if (generated) {
          servedPath = generated;
          servedType = "image/webp";
        }
      } catch {
        // Keep the original image available when preview generation is unsupported.
      }
    }

    let stat;
    try {
      stat = await fsp.stat(servedPath);
      if (!stat.isFile()) throw new Error("not a file");
    } catch {
      entries.delete(id);
      response.writeHead(404);
      response.end("Media file is unavailable");
      return;
    }

    const disposition = download || (!inlineTypes.test(servedType) && servedType !== "application/pdf") ? "attachment" : "inline";
    const headers = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "Content-Type": servedType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(entry.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    };
    const range = request.headers.range;
    if (!range) {
      response.writeHead(200, { ...headers, "Content-Length": stat.size });
      fs.createReadStream(servedPath).pipe(response);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/u.exec(range);
    if (!match) {
      response.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      response.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
      response.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      ...headers,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    });
    fs.createReadStream(servedPath, { start, end }).pipe(response);
  };

  return { register, restoreUploads, upload, resolveMany, serve };
};
