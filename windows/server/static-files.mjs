import fs from "node:fs/promises";
import path from "node:path";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"], [".png", "image/png"], [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"], [".webp", "image/webp"],
]);

export const createStaticFileServer = (webRoot) => async (url, response) => {
  const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.resolve(webRoot, relative);
  if (file !== webRoot && !file.startsWith(`${webRoot}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const content = await fs.readFile(file);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(file).toLowerCase()) || "application/octet-stream",
      "Cache-Control": file.endsWith(".html") ? "no-cache" : "public, max-age=31536000, immutable",
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not Found");
  }
};
