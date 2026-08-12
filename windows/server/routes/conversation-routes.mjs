import { randomUUID } from "node:crypto";
import { paginationFrom, readJson, sendJson } from "../http/request-utils.mjs";

const publicAttachment = ({ id, name, mimeType, url, width, height, readStatus, readError }) => ({
  id,
  name,
  mimeType,
  url,
  ...(Number.isSafeInteger(width) && Number.isSafeInteger(height) ? { width, height } : {}),
  ...(readStatus ? { readStatus } : {}),
  ...(readError ? { readError } : {}),
});

export const createConversationRoutes = ({
  conversations, execution, followUpQueue, contextManagement, media, submissionStore,
  broadcast = () => {}, publishThreadEvent = (_threadId, event) => broadcast(event), agentConversationStore,
  employeeRuntime, roomDirectory,
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

  const authorizeAgentThread = async ({ threadId, conversationId, allowGroup = false }) => {
    if (!agentConversationStore) return null;
    const cleanThreadId = String(threadId || "").trim();
    const cleanConversationId = String(conversationId || "").trim();
    const boundByThread = cleanThreadId
      ? agentConversationStore.findByRuntimeSession?.("codex", cleanThreadId)
      : null;
    if (!cleanConversationId) {
      if (boundByThread) throw Object.assign(new Error("Agent 单聊需要 conversationId"), { statusCode: 400 });
      return null;
    }
    const binding = await agentConversationStore.resolve({ conversationId: cleanConversationId });
    const allowed = binding.runtimeSessionId === cleanThreadId;
    if (!allowed) throw Object.assign(new Error("conversationId 与 threadId 不匹配"), { statusCode: 409 });
    if (binding.conversationKind === "group" && allowGroup) return binding;
    if (binding.conversationKind !== "direct") {
      throw Object.assign(new Error("Agent 单聊尚未绑定独立 Thread"), { statusCode: 409 });
    }
    return binding;
  };

  const readGroupAgentSession = (binding, pagination = {}) => {
    const room = roomDirectory?.get?.(binding.roomId);
    const snapshot = room?.snapshot?.();
    const allMessages = (snapshot?.messages || [])
      .filter((message) => message?.type === "agent"
        && (message.agentId === binding.agentId || message.authorId === binding.agentId)
        && String(message.text || "").trim())
      .map((message) => ({
        id: `group:${binding.roomId}:${message.id}`,
        role: "assistant",
        text: String(message.text || ""),
        createdAt: message.createdAt,
        source: "group",
        projectId: binding.projectId,
        roomId: binding.roomId,
        groupMessageId: message.id,
      }));
    const end = Math.min(Number.isSafeInteger(pagination.before) ? pagination.before : allMessages.length, allMessages.length);
    const start = pagination.limit ? Math.max(0, end - pagination.limit) : 0;
    const messages = allMessages.slice(start, end);
    const latest = allMessages[allMessages.length - 1];
    return {
      threadId: binding.runtimeSessionId,
      source: "codex",
      title: binding.title || `${snapshot?.room?.name || "项目群"} · 员工回复`,
      updatedAt: latest?.createdAt || "",
      messageCount: allMessages.length,
      latestUser: "",
      latestAssistant: latest?.text || "",
      archived: false,
      conversationKind: "group",
      readOnly: true,
      messages,
      hasMore: start > 0,
      nextBefore: start || null,
      nextCursor: null,
      conversationId: binding.conversationId,
    };
  };

  const readAgentSession = async (binding, source, pagination) => {
    if (binding.conversationKind === "group") return readGroupAgentSession(binding, pagination);
    return conversations.findSession(binding.runtimeSessionId, source, pagination);
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
    const conversationId = String(body.conversationId || "").trim();
    const binding = await authorizeAgentThread({ threadId, conversationId });
    const submissionId = String(body.submissionId || "").trim().slice(0, 160) || randomUUID();
    const messageId = `optimistic-${submissionId}`;
    const createdAt = new Date().toISOString();
    const fingerprint = JSON.stringify({
      threadId,
      conversationId,
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
          ? await conversations.steerMessage(threadId, status.turnId, text, attachments, submissionId)
          : await conversations.sendMessage(threadId, text, attachments, submissionId);
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
    const conversationId = String(url.searchParams.get("conversationId") || "").trim();
    if (!threadId || !submissionId) {
      sendJson(response, { error: "threadId and submissionId are required" }, 400);
      return true;
    }
    await authorizeAgentThread({ threadId, conversationId });
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
    const conversationId = String(body.conversationId || "").trim();
    const name = String(body.name || "").trim();
    if (!threadId || !name) {
      sendJson(response, { error: "threadId and name are required" }, 400);
      return true;
    }
    await authorizeAgentThread({ threadId, conversationId });
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
    const conversationId = String(body.conversationId || "").trim();
    const model = String(body.model || "").trim();
    if (!threadId || !model) {
      sendJson(response, { error: "threadId and model are required" }, 400);
      return true;
    }
    await authorizeAgentThread({ threadId, conversationId });
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
    const conversationId = String(body.conversationId || "").trim();
    const reasoningEffort = String(body.reasoningEffort || "").trim();
    if (!threadId || !reasoningEffort) {
      sendJson(response, { error: "threadId and reasoningEffort are required" }, 400);
      return true;
    }
    await authorizeAgentThread({ threadId, conversationId });
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
    const conversationId = String(body.conversationId || "").trim();
    await authorizeAgentThread({ threadId, conversationId });
    const status = execution.getStatus(threadId);
    if (!threadId || !status.active || !status.turnId) {
      sendJson(response, { error: "当前没有可停止的任务" }, 409);
      return true;
    }
    await conversations.interrupt(threadId, status.turnId);
    sendJson(response, { threadId, turnId: status.turnId, status: "interrupting" }, 202);
    return true;
  }
  if (url.pathname === "/api/session/review" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    const conversationId = String(body.conversationId || "").trim();
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    await authorizeAgentThread({ threadId, conversationId });
    if (execution.getStatus(threadId).active) {
      sendJson(response, { error: "当前任务完成后才能开始审查" }, 409);
      return true;
    }
    await conversations.reviewSession(threadId);
    publishThreadEvent(threadId, { type: "sessions_changed", threadId });
    sendJson(response, { threadId, status: "started" }, 202);
    return true;
  }
  if (url.pathname === "/api/session/fork" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    const conversationId = String(body.conversationId || "").trim();
    const lastTurnId = String(body.lastTurnId || "").trim();
    if (!threadId || !lastTurnId) {
      sendJson(response, { error: "threadId and lastTurnId are required" }, 400);
      return true;
    }
    await authorizeAgentThread({ threadId, conversationId });
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
    const conversationId = String(body.conversationId || "").trim();
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    await authorizeAgentThread({ threadId, conversationId });
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
    const conversationId = String(body.conversationId || "").trim();
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    await authorizeAgentThread({ threadId, conversationId });
    sendJson(response, await conversations.unarchiveSession(threadId), 202);
    return true;
  }
  if (url.pathname === "/api/session/context" && request.method === "GET") {
    const threadId = url.searchParams.get("threadId") || "";
    const conversationId = url.searchParams.get("conversationId") || "";
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    await authorizeAgentThread({ threadId, conversationId });
    sendJson(response, await contextManagement.load(threadId));
    return true;
  }
  if (url.pathname === "/api/session/context/settings" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    const conversationId = String(body.conversationId || "").trim();
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    await authorizeAgentThread({ threadId, conversationId });
    const threshold = body.autoCompactThreshold === null ? null : Number(body.autoCompactThreshold);
    sendJson(response, await contextManagement.setThreshold(threadId, threshold));
    return true;
  }
  if (url.pathname === "/api/session/context/compact" && request.method === "POST") {
    const body = await readJson(request);
    const threadId = String(body.threadId || "").trim();
    const conversationId = String(body.conversationId || "").trim();
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    await authorizeAgentThread({ threadId, conversationId });
    sendJson(response, await contextManagement.requestCompaction(threadId), 202);
    return true;
  }
  if (url.pathname === "/api/execution-status") {
    const threadId = url.searchParams.get("threadId") || "";
    const conversationId = url.searchParams.get("conversationId") || "";
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    await authorizeAgentThread({ threadId, conversationId });
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
    const source = url.searchParams.get("source") || "all";
    const conversationId = String(url.searchParams.get("conversationId") || "").trim();
    if (conversationId && agentConversationStore) {
      const binding = await agentConversationStore.resolve({ conversationId });
      if (binding.conversationKind !== "direct" && binding.conversationKind !== "group") {
        sendJson(response, { error: "该 Agent 对话不是独立单聊" }, 409);
        return true;
      }
      const session = await readAgentSession(binding, source, {});
      const matchesFilter = session
        && Boolean(session.archived) === archived
        && (source === "all" || session.source === source);
      if (!matchesFilter) {
        sendJson(response, []);
        return true;
      }
      const { messages, file, ...summary } = session;
      sendJson(response, [summary]);
      return true;
    }
    const sessions = await conversations.listSessions(source, archived);
    const groupThreadIds = new Set(roomDirectory?.threadIds?.() || []);
    const visibleSessions = sessions.filter((session) => {
      const threadId = String(session?.threadId || "").trim();
      if (!threadId) return false;
      if (employeeRuntime?.ownsThread?.(threadId)) return false;
      if (groupThreadIds.has(threadId)) return false;
      return !agentConversationStore?.findByRuntimeSession?.("codex", threadId);
    });
    sendJson(response, visibleSessions.map(({ messages, file, ...summary }) => summary));
    return true;
  }
  if (url.pathname === "/api/session" && request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, await conversations.createSession(
      String(body.model || "").trim(),
      String(body.projectRoot || "").trim(),
    ), 201);
    return true;
  }
  if (url.pathname === "/api/session") {
    const threadId = url.searchParams.get("threadId") || "";
    const conversationId = url.searchParams.get("conversationId") || "";
    const source = url.searchParams.get("source") || "all";
    const pagination = paginationFrom(url);
    const binding = await authorizeAgentThread({ threadId, conversationId, allowGroup: true });
    const session = binding
      ? await readAgentSession(binding, source, pagination)
      : await conversations.findSession(threadId, source, pagination);
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
