import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const mimeTypes = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".gif", "image/gif"],
  [".webp", "image/webp"], [".bmp", "image/bmp"], [".svg", "image/svg+xml"], [".avif", "image/avif"],
  [".mp3", "audio/mpeg"], [".wav", "audio/wav"], [".m4a", "audio/mp4"], [".ogg", "audio/ogg"],
  [".mp4", "video/mp4"], [".webm", "video/webm"], [".mov", "video/quicktime"],
  [".pdf", "application/pdf"], [".csv", "text/csv; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".html", "text/html; charset=utf-8"], [".htm", "text/html; charset=utf-8"],
]);

const inlineTypes = /^(?:image|audio|video)\//u;

export const createMediaService = () => {
  const entries = new Map();

  const register = (file) => {
    const resolved = path.resolve(file);
    const id = createHash("sha256").update(resolved.toLowerCase()).digest("hex").slice(0, 32);
    const mimeType = mimeTypes.get(path.extname(resolved).toLowerCase()) || "application/octet-stream";
    const value = { id, path: resolved, name: path.basename(resolved), mimeType, url: `/api/media/${id}` };
    entries.set(id, value);
    return { id, name: value.name, mimeType, url: value.url };
  };

  const serve = async (request, response, id, download = false) => {
    const entry = entries.get(id);
    if (!entry) {
      response.writeHead(404);
      response.end("Media not found");
      return;
    }
    let stat;
    try {
      stat = await fsp.stat(entry.path);
      if (!stat.isFile()) throw new Error("not a file");
    } catch {
      response.writeHead(404);
      response.end("Media file is unavailable");
      return;
    }

    const disposition = download || (!inlineTypes.test(entry.mimeType) && entry.mimeType !== "application/pdf") ? "attachment" : "inline";
    const headers = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "Content-Type": entry.mimeType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(entry.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    };
    const range = request.headers.range;
    if (!range) {
      response.writeHead(200, { ...headers, "Content-Length": stat.size });
      fs.createReadStream(entry.path).pipe(response);
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
    fs.createReadStream(entry.path, { start, end }).pipe(response);
  };

  return { register, serve };
};
