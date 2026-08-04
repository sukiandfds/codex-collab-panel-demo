import { paginationFrom, readJson, sendJson } from "../http/request-utils.mjs";

export const createConversationRoutes = ({ conversations, execution, contextManagement, media }) => {
  const submissions = new Map();
  const submissionTtlMs = 60000;
  const maxSubmissions = 200;

  const rememberSubmission = (submissionId, fingerprint, promise) => {
    if (!submissionId) return promise;
    const existing = submissions.get(submissionId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        const error = new Error("submissionId was already used for a different message");
        error.statusCode = 409;
        throw error;
      }
      return existing.promise;
    }
    const timer = setTimeout(() => {
      if (submissions.get(submissionId)?.promise === promise) submissions.delete(submissionId);
    }, submissionTtlMs);
    timer.unref?.();
    submissions.set(submissionId, { fingerprint, promise, timer });
    while (submissions.size > maxSubmissions) {
      const oldestId = submissions.keys().next().value;
      const oldest = submissions.get(oldestId);
      clearTimeout(oldest?.timer);
      submissions.delete(oldestId);
    }
    void promise.catch(() => {
      const entry = submissions.get(submissionId);
      if (entry?.promise === promise) {
        clearTimeout(entry.timer);
        submissions.delete(submissionId);
      }
    });
    return promise;
  };

  return async (request, response, url) => {
  if (url.pathname === "/api/models" && request.method === "GET") {
    sendJson(response, await conversations.listModels());
    return true;
  }
  if (url.pathname === "/api/session/message" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    const text = String(body.text || "").trim();
    const attachments = media.resolveMany(body.attachmentIds);
    if (!threadId || (!text && !attachments.length)) {
      sendJson(response, { error: "threadId and message content are required" }, 400);
      return true;
    }
    if (text.length > 32000) {
      sendJson(response, { error: "message is too long" }, 413);
      return true;
    }
    const submissionId = String(body.submissionId || "").trim().slice(0, 160);
    const fingerprint = JSON.stringify({
      threadId,
      text,
      attachmentIds: Array.isArray(body.attachmentIds) ? body.attachmentIds : [],
    });
    const cachedSubmission = submissionId ? submissions.get(submissionId) : null;
    if (cachedSubmission) {
      if (cachedSubmission.fingerprint !== fingerprint) {
        const error = new Error("submissionId was already used for a different message");
        error.statusCode = 409;
        throw error;
      }
      const cachedResult = await cachedSubmission.promise;
      sendJson(response, cachedResult.body, cachedResult.statusCode);
      return true;
    }
    const status = execution.getStatus(threadId);
    if (status.active && !status.turnId) {
      sendJson(response, { error: "Codex 正在启动当前任务，请稍后再试" }, 409);
      return true;
    }
    const submit = (async () => {
      let result;
      try {
        result = status.active
          ? await conversations.steerMessage(threadId, status.turnId, text, attachments)
          : await conversations.sendMessage(threadId, text, attachments);
      } catch (error) {
        const recovered = execution.getStatus(threadId);
        if (status.active || !recovered.turnId || recovered.turnId === status.turnId) throw error;
        return {
          body: { threadId, turnId: recovered.turnId, status: "inProgress", recovered: true },
          statusCode: 202,
        };
      }
      return {
        body: {
          threadId,
          turnId: status.active ? status.turnId : result.turn?.id || "",
          status: status.active ? "steered" : result.turn?.status || "inProgress",
        },
        statusCode: 202,
      };
    })();
    const accepted = rememberSubmission(submissionId, fingerprint, submit);
    const responsePayload = await accepted;
    sendJson(response, responsePayload.body, responsePayload.statusCode);
    return true;
  }
  if (url.pathname === "/api/session/model" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    const model = String(body.model || "").trim();
    if (!threadId || !model) {
      sendJson(response, { error: "threadId and model are required" }, 400);
      return true;
    }
    if (execution.getStatus(threadId).active) {
      sendJson(response, { error: "当前任务运行中，请在完成后切换模型" }, 409);
      return true;
    }
    sendJson(response, await conversations.updateModel(threadId, model));
    return true;
  }
  if (url.pathname === "/api/session/reasoning-effort" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    const reasoningEffort = String(body.reasoningEffort || "").trim();
    if (!threadId || !reasoningEffort) {
      sendJson(response, { error: "threadId and reasoningEffort are required" }, 400);
      return true;
    }
    if (execution.getStatus(threadId).active) {
      sendJson(response, { error: "当前任务运行中，请在完成后调整推理强度" }, 409);
      return true;
    }
    sendJson(response, await conversations.updateReasoningEffort(threadId, reasoningEffort));
    return true;
  }
  if (url.pathname === "/api/session/interrupt" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    const status = execution.getStatus(threadId);
    if (!threadId || !status.active || !status.turnId) {
      sendJson(response, { error: "当前没有可停止的任务" }, 409);
      return true;
    }
    await conversations.interrupt(threadId, status.turnId);
    sendJson(response, { threadId, turnId: status.turnId, status: "interrupting" }, 202);
    return true;
  }
  if (url.pathname === "/api/session/fork" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    const lastTurnId = String(body.lastTurnId || "").trim();
    if (!threadId || !lastTurnId) {
      sendJson(response, { error: "threadId and lastTurnId are required" }, 400);
      return true;
    }
    if (execution.getStatus(threadId).active) {
      sendJson(response, { error: "当前任务运行中，请完成后再从这里继续" }, 409);
      return true;
    }
    const session = await conversations.forkSession(threadId, lastTurnId);
    sendJson(response, {
      session,
      sourceThreadId: threadId,
      forkedFromTurnId: lastTurnId,
    }, 201);
    return true;
  }
  if (url.pathname === "/api/session/archive" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    if (execution.getStatus(threadId).active) {
      sendJson(response, { error: "当前任务运行中，请完成后再归档" }, 409);
      return true;
    }
    sendJson(response, await conversations.archiveSession(threadId), 202);
    return true;
  }
  if (url.pathname === "/api/session/unarchive" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    sendJson(response, await conversations.unarchiveSession(threadId), 202);
    return true;
  }
  if (url.pathname === "/api/session/context" && request.method === "GET") {
    const threadId = url.searchParams.get("threadId") || "";
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    sendJson(response, await contextManagement.load(threadId));
    return true;
  }
  if (url.pathname === "/api/session/context/settings" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    const threshold = body.autoCompactThreshold === null ? null : Number(body.autoCompactThreshold);
    sendJson(response, await contextManagement.setThreshold(threadId, threshold));
    return true;
  }
  if (url.pathname === "/api/session/context/compact" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    sendJson(response, await contextManagement.requestCompaction(threadId), 202);
    return true;
  }
  if (url.pathname === "/api/execution-status") {
    const threadId = url.searchParams.get("threadId") || "";
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    const current = execution.getStatus(threadId);
    if (current.active && url.searchParams.get("reconcile") === "1") {
      try {
        execution.reconcile(threadId, await conversations.getThreadStatus(threadId));
      } catch {
        execution.reconcile(threadId, null);
      }
    }
    sendJson(response, execution.getStatus(threadId));
    return true;
  }
  if (url.pathname === "/api/sessions") {
    const archived = url.searchParams.get("archived") === "1";
    const sessions = await conversations.listSessions(url.searchParams.get("source") || "all", archived);
    sendJson(response, sessions.map(({ messages, file, ...summary }) => summary));
    return true;
  }
  if (url.pathname === "/api/session" && request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, await conversations.createSession(String(body.model || "").trim()), 201);
    return true;
  }
  if (url.pathname === "/api/session") {
    const session = await conversations.findSession(
      url.searchParams.get("threadId") || "",
      url.searchParams.get("source") || "all",
      paginationFrom(url),
    );
    if (!session) {
      sendJson(response, { error: "session not found" }, 404);
      return true;
    }
    sendJson(response, session);
    return true;
  }
  return false;
};
};
