import { randomUUID } from "node:crypto";
import { paginationFrom, readJson, sendJson } from "../http/request-utils.mjs";

const publicAttachment = ({ id, name, mimeType, url, width, height }) => ({
  id,
  name,
  mimeType,
  url,
  ...(Number.isSafeInteger(width) && Number.isSafeInteger(height) ? { width, height } : {}),
});

export const createConversationRoutes = ({
  conversations, execution, followUpQueue, contextManagement, media, submissionStore,
  broadcast = () => {}, publishThreadEvent = broadcast,
}) => {
  const inFlightSubmissions = new Map();
  const submissionTtlMs = 60000;
  const maxSubmissions = 200;

  const submissionResult = (entry, status) => ({
    body: {
      threadId: entry.threadId,
      turnId: status.turnId || entry.result?.turnId || "",
      status: status.active && status.turnId ? status.phase : "pending",
      submissionId: entry.submissionId,
      messageId: entry.messageId,
      ...(entry.result?.migratedFromThreadId ? { migratedFromThreadId: entry.result.migratedFromThreadId } : {}),
      ...(status.turnId ? { recovered: true } : {}),
    },
    statusCode: 202,
  });

  const resolveStoredSubmission = async (entry) => {
    if (!entry) return null;
    if (entry.state === "accepted" && entry.result) return entry.result;
    if (entry.state === "failed") return { body: { error: entry.error || "指令发送失败", submissionId: entry.submissionId }, statusCode: 409 };
    const current = execution.getStatus(entry.threadId);
    const startedAt = Date.parse(current.startedAt || "");
    const submittedAt = Date.parse(entry.createdAt || "");
    if (current.active && current.turnId && (!Number.isFinite(submittedAt) || !Number.isFinite(startedAt) || startedAt >= submittedAt - 1000)) {
      const result = submissionResult(entry, current);
      submissionStore?.complete(entry.submissionId, result);
      return result;
    }
    return submissionResult(entry, current);
  };

  const rememberSubmission = (submissionId, fingerprint, promise) => {
    if (!submissionId) return promise;
    const existing = inFlightSubmissions.get(submissionId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        const error = new Error("submissionId was already used for a different message");
        error.statusCode = 409;
        throw error;
      }
      return existing.promise;
    }
    const timer = setTimeout(() => {
      if (inFlightSubmissions.get(submissionId)?.promise === promise) inFlightSubmissions.delete(submissionId);
    }, submissionTtlMs);
    timer.unref?.();
    inFlightSubmissions.set(submissionId, { fingerprint, promise, timer });
    while (inFlightSubmissions.size > maxSubmissions) {
      const oldestId = inFlightSubmissions.keys().next().value;
      const oldest = inFlightSubmissions.get(oldestId);
      clearTimeout(oldest?.timer);
      inFlightSubmissions.delete(oldestId);
    }
    void promise.catch(() => {
      const entry = inFlightSubmissions.get(submissionId);
      if (entry?.promise === promise) {
        clearTimeout(entry.timer);
        inFlightSubmissions.delete(submissionId);
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
    const submissionId = String(body.submissionId || "").trim().slice(0, 160) || randomUUID();
    const messageId = `optimistic-${submissionId}`;
    const createdAt = new Date().toISOString();
    const fingerprint = JSON.stringify({
      threadId,
      text,
      attachmentIds: Array.isArray(body.attachmentIds) ? body.attachmentIds : [],
    });
    const cachedSubmission = inFlightSubmissions.get(submissionId);
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
    const storedSubmission = submissionStore?.get(submissionId);
    if (storedSubmission) {
      if (storedSubmission.fingerprint !== fingerprint) {
        const error = new Error("submissionId was already used for a different message");
        error.statusCode = 409;
        throw error;
      }
      const resolved = await resolveStoredSubmission(storedSubmission);
      sendJson(response, resolved.body, resolved.statusCode);
      return true;
    }
    const run = async () => {
      const status = execution.getStatus(threadId);
      if (status.active && !status.turnId) {
        const error = new Error("Codex 正在启动当前任务，请稍后再试");
        error.statusCode = 409;
        throw error;
      }
      publishThreadEvent(threadId, {
        type: "user_message_submitted",
        threadId,
        submissionId,
        messageId,
        text,
        attachments: attachments.map(publicAttachment),
        createdAt,
      });
      let result;
      try {
        result = status.active
          ? await conversations.steerMessage(threadId, status.turnId, text, attachments)
          : await conversations.sendMessage(threadId, text, attachments);
      } catch (error) {
        const recovered = execution.getStatus(threadId);
        if (status.active || !recovered.turnId || recovered.turnId === status.turnId) throw error;
        return {
          body: { threadId, turnId: recovered.turnId, status: "inProgress", recovered: true, submissionId, messageId },
          statusCode: 202,
        };
      }
      return {
        body: {
          threadId: result.threadId || threadId,
          turnId: status.active ? status.turnId : result.turn?.id || "",
          status: status.active ? "steered" : result.turn?.status || "inProgress",
          submissionId,
          messageId,
          ...(result.migratedFromThreadId ? { migratedFromThreadId: result.migratedFromThreadId } : {}),
        },
        statusCode: 202,
      };
    };
    const persistentEntry = submissionStore?.begin({
      submissionId,
      threadId,
      fingerprint,
      messageId,
      createdAt,
    });
    if (persistentEntry?.state === "accepted" && persistentEntry.result) {
      sendJson(response, persistentEntry.result.body, persistentEntry.result.statusCode);
      return true;
    }
    const submit = followUpQueue?.withThreadLock
      ? followUpQueue.withThreadLock(threadId, run)
      : run();
    const accepted = rememberSubmission(submissionId, fingerprint, submit);
    let responsePayload;
    try {
      responsePayload = await accepted;
      submissionStore?.complete(submissionId, responsePayload);
    } catch (error) {
      submissionStore?.fail(submissionId, error);
      throw error;
    }
    sendJson(response, responsePayload.body, responsePayload.statusCode);
    return true;
  }
  if (url.pathname === "/api/session/submission" && request.method === "GET") {
    const threadId = String(url.searchParams.get("threadId") || "").trim();
    const submissionId = String(url.searchParams.get("submissionId") || "").trim();
    if (!threadId || !submissionId) {
      sendJson(response, { error: "threadId and submissionId are required" }, 400);
      return true;
    }
    const entry = submissionStore?.get(submissionId);
    const resultThreadId = entry?.result?.body?.threadId || "";
    if (!entry || (entry.threadId !== threadId && resultThreadId !== threadId)) {
      sendJson(response, { threadId, submissionId, status: "unknown" });
      return true;
    }
    const resolved = await resolveStoredSubmission(entry);
    if (resolved?.body?.error) {
      sendJson(response, { ...resolved.body, status: "failed" });
      return true;
    }
    sendJson(response, {
      ...resolved.body,
      status: entry.state === "accepted" || resolved.body.status !== "pending" ? "accepted" : "pending",
    });
    return true;
  }
  if (url.pathname === "/api/session/name" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    const name = String(body.name || "").trim();
    if (!threadId || !name) {
      sendJson(response, { error: "threadId and name are required" }, 400);
      return true;
    }
    if (name.length > 120) {
      sendJson(response, { error: "name is too long" }, 413);
      return true;
    }
    const session = await conversations.renameSession(threadId, name);
    publishThreadEvent(threadId, { type: "sessions_changed", threadId });
    sendJson(response, session, 202);
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
