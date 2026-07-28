const sendJson = (response, value, status = 200) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
};

const readJson = async (request, limit = 64 * 1024) => {
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

const authorized = (request, token) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (url.searchParams.get("token") === token) return true;
  const cookies = String(request.headers.cookie || "").split(";");
  return cookies.some((cookie) => {
    const [name, ...value] = cookie.trim().split("=");
    const cookieValue = value.join("=");
    return name === "codex_demo_token" && (cookieValue === token || cookieValue === encodeURIComponent(token));
  });
};

const rememberAuthorizedDevice = (request, response, url, token) => {
  if (url.searchParams.get("token") !== token) return;
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").toLowerCase();
  const secure = forwardedProto === "https" || Boolean(request.socket?.encrypted);
  const attributes = [`codex_demo_token=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=2592000"];
  if (secure) attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
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

export const createRequestHandler = ({
  token, project, projectRoot, device, observerPort, conversations, execution, media, realtime,
  contextManagement, groupRoom, multiAgent, artifacts, webOutputs, serveStatic,
}) => {
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
    rememberAuthorizedDevice(request, response, url, token);
    const protectedRoute = url.pathname.startsWith("/api/") || url.pathname === "/events";
    if (protectedRoute && !authorized(request, token)) {
      response.writeHead(401);
      response.end("Unauthorized");
      return;
    }

    try {
      const previewMatch = /^\/artifact-preview\/([^/]+)$/u.exec(url.pathname);
      if (previewMatch && request.method === "GET") {
        const preview = await webOutputs.readPreview(decodeURIComponent(previewMatch[1]));
        response.writeHead(200, preview.headers);
        response.end(preview.content);
        return;
      }
      if (url.pathname === "/api/group/snapshot") {
        sendJson(response, groupRoom.snapshot());
        return;
      }
      if ((url.pathname === "/api/group/join" || url.pathname === "/api/group/presence") && request.method === "POST") {
        const body = await readJson(request);
        const member = groupRoom.touchMember(body.memberId, body.name);
        sendJson(response, member);
        return;
      }
      if (url.pathname === "/api/group/message" && request.method === "POST") {
        const body = await readJson(request);
        let mode = body.mode === "development" ? "development" : "discussion";
        const member = groupRoom.touchMember(body.memberId, body.authorName);
        const text = String(body.text || "").trim();
        const attachments = media.resolveMany(body.attachmentIds);
        if (!text && !attachments.length) return sendJson(response, { error: "消息不能为空" }, 400);
        const requestedAgentIds = Array.isArray(body.agentIds)
          ? body.agentIds
          : [body.agentId];
        const availableAgentIds = new Set(groupRoom.snapshot().agents.map((agent) => agent.id));
        const targetAgentIds = [...new Set(requestedAgentIds
          .map((agentId) => String(agentId || "").trim())
          .filter((agentId) => availableAgentIds.has(agentId)))];
        if (!targetAgentIds.length) targetAgentIds.push("manager");
        if (webOutputs.isRequest(text)) {
          targetAgentIds.splice(0, targetAgentIds.length, "developer");
          mode = "development";
        }
        const messageInput = {
          type: "human", authorId: member.id, authorName: member.name,
          agentId: targetAgentIds[0], targetAgentIds,
          mode, text,
          attachments: attachments.map(({ id, name, mimeType, url }) => ({ id, name, mimeType, url })),
        };
        const message = await groupRoom.addMessage(messageInput);
        const execution = await multiAgent.enqueueDiscussion({
          agentIds: targetAgentIds,
          mode,
          requestText: text || "请查看附件并根据内容进行处理。",
          attachments,
          sourceMessageId: message.id,
        });
        sendJson(response, { message, execution }, 202);
        return;
      }
      if (url.pathname === "/api/project") {
        sendJson(response, { name: project, root: projectRoot, mode: "interactive" });
        return;
      }
      if (url.pathname === "/api/models" && request.method === "GET") {
        sendJson(response, await conversations.listModels());
        return;
      }
      if (url.pathname === "/api/device") {
        sendJson(response, device);
        return;
      }
      if (url.pathname === "/api/uploads" && request.method === "POST") {
        const upload = await media.upload(request, {
          name: url.searchParams.get("name") || "attachment",
          mimeType: request.headers["content-type"] || "",
        });
        sendJson(response, upload, 201);
        return;
      }
      if (url.pathname === "/api/artifacts/publish" && request.method === "POST") {
        const body = await readJson(request);
        const agent = groupRoom.getAgent(String(body.createdByAgent || "").trim());
        if (!agent) return sendJson(response, { error: "创建交付物的 Agent 不存在" }, 404);
        const messageId = String(body.messageId || "").trim();
        if (messageId && !groupRoom.getMessage(messageId)) return sendJson(response, { error: "关联的群消息不存在" }, 404);
        const artifact = await artifacts.publish({
          artifactId: body.artifactId,
          taskId: body.taskId,
          messageId,
          createdByAgent: agent.id,
          createdByName: agent.name,
          mediaId: body.mediaId,
          relativePath: body.relativePath,
        });
        if (messageId) await groupRoom.attachArtifact(messageId, artifact.id);
        sendJson(response, artifact, 201);
        return;
      }
      if (url.pathname === "/api/artifacts" && request.method === "GET") {
        sendJson(response, artifacts.list({
          messageId: url.searchParams.get("messageId") || "",
          taskId: url.searchParams.get("taskId") || "",
        }));
        return;
      }
      const artifactHtmlMatch = /^\/api\/artifacts\/([^/]+)\/open-html$/u.exec(url.pathname);
      if (artifactHtmlMatch && request.method === "GET") {
        const previewPath = await webOutputs.previewForArtifact(decodeURIComponent(artifactHtmlMatch[1]));
        response.writeHead(302, {
          Location: previewPath,
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        });
        response.end();
        return;
      }
      const artifactReviewMatch = /^\/api\/artifacts\/([^/]+)\/review$/u.exec(url.pathname);
      if (artifactReviewMatch && request.method === "POST") {
        const body = await readJson(request);
        sendJson(response, await artifacts.review(
          decodeURIComponent(artifactReviewMatch[1]),
          body.decision,
          body.note,
          body.reviewedBy,
        ));
        return;
      }
      const artifactMatch = /^\/api\/artifacts\/([^/]+)$/u.exec(url.pathname);
      if (artifactMatch && request.method === "GET") {
        sendJson(response, artifacts.get(decodeURIComponent(artifactMatch[1])));
        return;
      }
      if (url.pathname === "/api/session/message" && request.method === "POST") {
        const body = await readJson(request);
        const threadId = String(body.threadId || "").trim();
        const text = String(body.text || "").trim();
        const attachments = media.resolveMany(body.attachmentIds);
        if (!threadId || (!text && !attachments.length)) return sendJson(response, { error: "threadId and message content are required" }, 400);
        if (text.length > 32000) return sendJson(response, { error: "message is too long" }, 413);
        const status = execution.getStatus(threadId);
        if (status.active && !status.turnId) return sendJson(response, { error: "Codex 正在启动当前任务，请稍后再试" }, 409);
        let result;
        try {
          result = status.active
            ? await conversations.steerMessage(threadId, status.turnId, text, attachments)
            : await conversations.sendMessage(threadId, text, attachments);
        } catch (error) {
          const recovered = execution.getStatus(threadId);
          if (status.active || !recovered.turnId || recovered.turnId === status.turnId) throw error;
          sendJson(response, {
            threadId,
            turnId: recovered.turnId,
            status: "inProgress",
            recovered: true,
          }, 202);
          return;
        }
        sendJson(response, {
          threadId,
          turnId: status.active ? status.turnId : result.turn?.id || "",
          status: status.active ? "steered" : result.turn?.status || "inProgress",
        }, 202);
        return;
      }
      if (url.pathname === "/api/session/model" && request.method === "POST") {
        const body = await readJson(request);
        const threadId = String(body.threadId || "").trim();
        const model = String(body.model || "").trim();
        if (!threadId || !model) return sendJson(response, { error: "threadId and model are required" }, 400);
        if (execution.getStatus(threadId).active) return sendJson(response, { error: "当前任务运行中，请在完成后切换模型" }, 409);
        sendJson(response, await conversations.updateModel(threadId, model));
        return;
      }
      if (url.pathname === "/api/session/interrupt" && request.method === "POST") {
        const body = await readJson(request);
        const threadId = String(body.threadId || "").trim();
        const status = execution.getStatus(threadId);
        if (!threadId || !status.active || !status.turnId) return sendJson(response, { error: "当前没有可停止的任务" }, 409);
        await conversations.interrupt(threadId, status.turnId);
        sendJson(response, { threadId, turnId: status.turnId, status: "interrupting" }, 202);
        return;
      }
      if (url.pathname === "/api/session/context" && request.method === "GET") {
        const threadId = url.searchParams.get("threadId") || "";
        if (!threadId) return sendJson(response, { error: "threadId is required" }, 400);
        sendJson(response, await contextManagement.load(threadId));
        return;
      }
      if (url.pathname === "/api/session/context/settings" && request.method === "POST") {
        const body = await readJson(request);
        const threadId = String(body.threadId || "").trim();
        if (!threadId) return sendJson(response, { error: "threadId is required" }, 400);
        const threshold = body.autoCompactThreshold === null ? null : Number(body.autoCompactThreshold);
        sendJson(response, await contextManagement.setThreshold(threadId, threshold));
        return;
      }
      if (url.pathname === "/api/session/context/compact" && request.method === "POST") {
        const body = await readJson(request);
        const threadId = String(body.threadId || "").trim();
        if (!threadId) return sendJson(response, { error: "threadId is required" }, 400);
        sendJson(response, await contextManagement.requestCompaction(threadId), 202);
        return;
      }
      if (url.pathname === "/api/execution-status") {
        const threadId = url.searchParams.get("threadId") || "";
        if (!threadId) return sendJson(response, { error: "threadId is required" }, 400);
        sendJson(response, execution.getStatus(threadId));
        return;
      }
      if (url.pathname === "/api/sessions") {
        const sessions = await conversations.listSessions(url.searchParams.get("source") || "all");
        sendJson(response, sessions.map(({ messages, file, ...summary }) => summary));
        return;
      }
      if (url.pathname === "/api/session" && request.method === "POST") {
        const body = await readJson(request);
        sendJson(response, await conversations.createSession(String(body.model || "").trim()), 201);
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
      sendJson(response, { error: error instanceof Error ? error.message : String(error) }, error?.statusCode || 503);
    }
  };
};
