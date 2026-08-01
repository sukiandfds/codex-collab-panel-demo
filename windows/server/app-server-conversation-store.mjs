import path from "node:path";
import { messageFromThreadItem, previewText } from "./content-blocks.mjs";
import { createAppServerClient } from "./app-server-client.mjs";

const sourceFromThread = (thread) => thread.source === "cli" && thread.cliVersion === "0.122.0" ? "happy" : "codex";

export const inputFromAttachments = (text, attachments = []) => {
  const input = [];
  if (text) input.push({ type: "text", text, text_elements: [] });
  for (const attachment of attachments) {
    if (attachment.mimeType.startsWith("image/")) {
      input.push({ type: "localImage", path: attachment.path });
    } else if (attachment.mimeType.startsWith("audio/")) {
      input.push({ type: "localAudio", path: attachment.path });
    } else {
      input.push({ type: "mention", name: attachment.name, path: attachment.path });
    }
  }
  return input;
};

export const createAppServerConversationStore = ({
  projectRoot, registerMedia, onProtocolMessage, onSubmitted, onFailed, onHealthState,
  client = createAppServerClient(),
  supervision = {},
}) => {
  const activeRuns = new Map();
  const monitorIntervalMs = supervision.intervalMs ?? 5000;
  const staleAfterMs = supervision.staleAfterMs ?? 30000;
  const finalizingAfterMs = supervision.finalizingAfterMs ?? 10000;
  const retryAfterMs = supervision.retryAfterMs ?? 10000;
  let monitorBusy = false;

  const handleProtocolMessage = (message) => {
    const { method, params = {} } = message || {};
    const threadId = params.threadId;
    if (threadId) {
      const current = activeRuns.get(threadId) || {};
      if (method === "turn/completed" || (method === "thread/status/changed" && params.status?.type === "idle")) {
        activeRuns.delete(threadId);
      } else if (method === "turn/started" || activeRuns.has(threadId)) {
        activeRuns.set(threadId, {
          ...current,
          lastEventAt: Date.now(),
          nextProbeAt: 0,
          finalAnswerCompleted: method === "turn/started"
            ? false
            : Boolean(current.finalAnswerCompleted) || (method === "item/completed"
              && params.item?.type === "agentMessage"
              && params.item?.phase !== "commentary"),
        });
      }
    }
    onProtocolMessage?.(message);
  };

  const handleHealthState = (event) => {
    if (["recovered", "failed"].includes(event?.phase)) activeRuns.delete(event.threadId);
    onHealthState?.(event);
  };

  const unsubscribe = client.subscribe(handleProtocolMessage);
  const unsubscribeHealth = client.subscribeHealth?.(handleHealthState) || (() => {});
  const threadCache = new Map();
  const freshThreadRuntime = new Map();

  const monitorActiveRuns = async () => {
    if (monitorBusy || !client.probe || activeRuns.size === 0) return;
    monitorBusy = true;
    try {
      const now = Date.now();
      for (const [threadId, run] of activeRuns) {
        const staleMs = run.finalAnswerCompleted ? finalizingAfterMs : staleAfterMs;
        if (now - run.lastEventAt < staleMs || now < (run.nextProbeAt || 0)) continue;
        run.nextProbeAt = now + retryAfterMs;
        try {
          const result = await client.probe(
            "thread/read",
            { threadId, includeTurns: false },
            { timeoutMs: 5000, threadId },
          );
          const status = result.thread?.status || null;
          onHealthState?.({
            phase: "authoritative",
            threadId,
            status,
            finalAnswerCompleted: Boolean(run.finalAnswerCompleted),
          });
          if (status?.type === "idle") activeRuns.delete(threadId);
        } catch {
          // The client emits checking/recovery events and owns the restart policy.
        }
      }
    } finally {
      monitorBusy = false;
    }
  };

  const monitorTimer = client.probe
    ? setInterval(() => void monitorActiveRuns(), monitorIntervalMs)
    : null;
  monitorTimer?.unref?.();

  const listThreads = async () => {
    const threads = [];
    let cursor = null;
    do {
      const result = await client.request("thread/list", {
        cursor,
        limit: 100,
        sortKey: "updated_at",
        sortDirection: "desc",
        cwd: projectRoot,
      });
      threads.push(...result.data);
      cursor = result.nextCursor;
    } while (cursor);
    for (const thread of threads) threadCache.set(thread.id, thread);
    return threads;
  };

  const summaryFromThread = (thread) => ({
    threadId: thread.id,
    source: sourceFromThread(thread),
    title: thread.name?.trim() || "未命名会话",
    updatedAt: new Date(thread.updatedAt * 1000).toISOString(),
    messageCount: null,
    latestUser: "",
    latestAssistant: "",
  });

  const listSessions = async (source = "all") => {
    const threads = await listThreads();
    return threads
      .filter((thread) => source === "all" || sourceFromThread(thread) === source)
      .map(summaryFromThread);
  };

  const createSession = async (model = "") => {
    const params = { cwd: projectRoot };
    if (model) params.model = model;
    const result = await client.request("thread/start", params);
    const thread = result.thread;
    threadCache.set(thread.id, thread);
    freshThreadRuntime.set(thread.id, {
      ...result,
      model: result.model || model,
    });
    return summaryFromThread(thread);
  };

  const listModels = async () => {
    const models = [];
    let cursor = null;
    do {
      const result = await client.request("model/list", { cursor, limit: 100 });
      models.push(...result.data);
      cursor = result.nextCursor;
    } while (cursor);
    return models.map((entry) => ({
      id: entry.id,
      model: entry.model,
      displayName: entry.displayName,
      description: entry.description,
      isDefault: entry.isDefault,
      supportedReasoningEfforts: entry.supportedReasoningEfforts || [],
    }));
  };

  const findSession = async (threadId, source = "all", { before, limit } = {}) => {
    const cached = threadCache.get(threadId);
    if (cached && source !== "all" && sourceFromThread(cached) !== source) return null;
    const result = await client.request("thread/read", { threadId, includeTurns: true });
    const thread = result.thread;
    if (source !== "all" && sourceFromThread(thread) !== source) return null;
    threadCache.set(thread.id, thread);
    const messages = thread.turns
      .flatMap((turn) => turn.items.map((item) => {
        const message = messageFromThreadItem(item, registerMedia);
        if (!message) return null;
        const timestamp = message.role === "user" ? turn.startedAt : turn.completedAt;
        return Number.isFinite(timestamp)
          ? { ...message, createdAt: new Date(timestamp * 1000).toISOString() }
          : message;
      }))
      .filter(Boolean);
    const latestUser = messages.findLast((item) => item.role === "user")?.text || "";
    const latestAssistant = messages.findLast((item) => item.role === "assistant")?.text || "";
    const end = Math.min(Number.isSafeInteger(before) ? before : messages.length, messages.length);
    const start = limit ? Math.max(0, end - limit) : 0;
    return {
      ...summaryFromThread(thread),
      messageCount: messages.length,
      latestUser: previewText(latestUser, 260),
      latestAssistant: previewText(latestAssistant, 260),
      messages: messages.slice(start, end),
      hasMore: start > 0,
      nextBefore: start || null,
    };
  };

  const resumeThread = async (threadId) => {
    const thread = threadCache.get(threadId)
      || (await client.request("thread/read", { threadId, includeTurns: false })).thread;
    if (!thread?.cwd || path.resolve(thread.cwd).toLowerCase() !== path.resolve(projectRoot).toLowerCase()) {
      throw new Error("This conversation does not belong to the current project.");
    }
    threadCache.set(thread.id, thread);
    const freshRuntime = freshThreadRuntime.get(threadId);
    if (freshRuntime) return freshRuntime;
    return client.request("thread/resume", { threadId, persistExtendedHistory: true });
  };

  const sendMessage = async (threadId, text, attachments = []) => {
    onSubmitted?.(threadId);
    try {
      await resumeThread(threadId);
      const result = await client.request("turn/start", {
        threadId,
        input: inputFromAttachments(text, attachments),
      });
      freshThreadRuntime.delete(threadId);
      return result;
    } catch (error) {
      onFailed?.(threadId, error);
      throw error;
    }
  };

  const steerMessage = async (threadId, turnId, text, attachments = []) => client.request("turn/steer", {
    threadId,
    expectedTurnId: turnId,
    input: inputFromAttachments(text, attachments),
  });

  const interrupt = async (threadId, turnId) => client.request("turn/interrupt", { threadId, turnId });

  const getRuntimeContext = async (threadId) => {
    const result = await resumeThread(threadId);
    return {
      model: result.model || "",
      modelProvider: result.modelProvider || "",
      reasoningEffort: result.reasoningEffort || "",
    };
  };

  const getThreadStatus = async (threadId) => {
    const request = client.probe?.bind(client) || client.request.bind(client);
    const result = await request(
      "thread/read",
      { threadId, includeTurns: false },
      { timeoutMs: 5000, threadId },
    );
    return result.thread?.status || null;
  };

  const compactContext = async (threadId) => {
    await resumeThread(threadId);
    return client.request("thread/compact/start", { threadId });
  };

  const updateModel = async (threadId, model) => {
    const runtime = await resumeThread(threadId);
    await client.request("thread/settings/update", { threadId, model });
    if (freshThreadRuntime.has(threadId)) {
      freshThreadRuntime.set(threadId, { ...runtime, model });
    }
    return getRuntimeContext(threadId);
  };

  const updateReasoningEffort = async (threadId, reasoningEffort) => {
    const runtime = await resumeThread(threadId);
    await client.request("thread/settings/update", { threadId, effort: reasoningEffort });
    if (freshThreadRuntime.has(threadId)) {
      freshThreadRuntime.set(threadId, { ...runtime, reasoningEffort });
    }
    return getRuntimeContext(threadId);
  };

  const close = () => {
    if (monitorTimer) clearInterval(monitorTimer);
    unsubscribe();
    unsubscribeHealth();
    client.close();
  };

  return {
    listSessions, createSession, findSession, sendMessage, steerMessage, interrupt,
    listModels, updateModel, updateReasoningEffort, getRuntimeContext, getThreadStatus,
    compactContext, close,
  };
};
