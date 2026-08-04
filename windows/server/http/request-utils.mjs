export const sendJson = (response, value, status = 200) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
};

export const readJson = async (request, limit = 64 * 1024) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
};

export const paginationFrom = (url) => {
  const limitValue = url.searchParams.get("limit");
  const beforeValue = url.searchParams.get("before");
  const cursorValue = url.searchParams.get("cursor");
  const contentVersionValue = url.searchParams.get("contentVersion");
  const limit = limitValue === null ? NaN : Number(limitValue);
  const before = beforeValue === null ? NaN : Number(beforeValue);
  const contentVersion = contentVersionValue === null ? NaN : Number(contentVersionValue);
  return {
    limit: Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 200) : undefined,
    before: Number.isSafeInteger(before) && before >= 0 ? before : undefined,
    cursor: cursorValue && cursorValue.length <= 2048 ? cursorValue : undefined,
    contentVersion: Number.isSafeInteger(contentVersion) && contentVersion >= 0 ? contentVersion : undefined,
  };
};
