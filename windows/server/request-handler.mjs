const sendJson = (response, value, status = 200) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
};

const authorized = (request, token) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  return url.searchParams.get("token") === token;
};

const paginationFrom = (url) => {
  const limitValue = url.searchParams.get("limit");
  const beforeValue = url.searchParams.get("before");
  const limit = limitValue === null ? NaN : Number(limitValue);
  const before = beforeValue === null ? NaN : Number(beforeValue);
  return {
    limit: Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 200) : undefined,
    before: Number.isSafeInteger(before) && before >= 0 ? before : undefined,
  };
};

export const createRequestHandler = ({ token, project, projectRoot, observerPort, conversations, media, realtime, serveStatic }) => {
  const readObserverStatus = async (threadId = "") => {
    try {
      const query = threadId ? `?threadId=${encodeURIComponent(threadId)}` : "";
      const response = await fetch(`http://127.0.0.1:${observerPort}/status${query}`);
      if (!response.ok) throw new Error(`observer HTTP ${response.status}`);
      return await response.json();
    } catch {
      return { connected: false, summaryStatus: "offline", summary: "" };
    }
  };

  return async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    const protectedRoute = url.pathname.startsWith("/api/") || url.pathname === "/events";
    if (protectedRoute && !authorized(request, token)) {
      response.writeHead(401);
      response.end("Unauthorized");
      return;
    }

    try {
      if (url.pathname === "/api/project") {
        sendJson(response, { name: project, root: projectRoot, mode: "read-only" });
        return;
      }
      if (url.pathname === "/api/sessions") {
        const sessions = await conversations.listSessions(url.searchParams.get("source") || "all");
        sendJson(response, sessions.map(({ messages, file, ...summary }) => summary));
        return;
      }
      if (url.pathname === "/api/session") {
        const session = await conversations.findSession(
          url.searchParams.get("threadId") || "",
          url.searchParams.get("source") || "all",
          paginationFrom(url),
        );
        if (!session) return sendJson(response, { error: "session not found" }, 404);
        sendJson(response, session);
        return;
      }
      if (url.pathname.startsWith("/api/media/")) {
        await media.serve(request, response, url.pathname.slice("/api/media/".length), url.searchParams.get("download") === "1");
        return;
      }
      if (url.pathname === "/api/status") {
        sendJson(response, await readObserverStatus(url.searchParams.get("threadId") || ""));
        return;
      }
      if (url.pathname === "/events") {
        realtime.connect(request, response);
        return;
      }
      await serveStatic(url, response);
    } catch (error) {
      sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 503);
    }
  };
};
