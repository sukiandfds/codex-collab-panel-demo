import path from "node:path";
import { previewText } from "./content-blocks.mjs";
import { createAppServerClient } from "./app-server-client.mjs";
import { messagesFromTurns, readRecentThreadPage } from "./codex-thread-history.mjs";

const sourceFromThread = (thread) => thread.source === "cli" && thread.cliVersion === "0.122.0" ? "happy" : "codex";

const isoFromUnixSeconds = (value) => {
  if (value === null || value === undefined) return "";
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "";
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
};

const latestIsoFromEpochMilliseconds = (values, fallback = "") => {
  const latest = values.filter(Number.isFinite).reduce(
    (current, value) => Math.max(current, value),
    Number.NEGATIVE_INFINITY,
  );
  if (!Number.isFinite(latest)) return fallback;
  const date = new Date(latest);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
};

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
      const eventTurnId = String(params.turnId || params.turn?.id || params.item?.turnId || params.item?.turn?.id || "");
      const hasConflictingTurn = Boolean(current.turnId && eventTurnId && current.turnId !== eventTurnId);
      if (method === "turn/started") {
        activeRuns.set(threadId, {
          ...current,
          turnId: eventTurnId || current.turnId || "",
          lastEventAt: Date.now(),
          nextProbeAt: 0,
          finalAnswerCompleted: false,
        });
      } else if (hasConflictingTurn) {
        // Keep the current run monitor alive; the tracker handles the same
        // stale protocol event for the browser-facing state.
      } else if (method === "turn/completed") {
        // A terminal notification without a turn id cannot prove that the
        // currently monitored turn is the one that completed.
        if (!current.turnId || eventTurnId === current.turnId) activeRuns.delete(threadId);
      } else if (method === "thread/status/changed" && params.status?.type === "idle") {
        // An idle notification has no turn id. Keep a known run until its
        // turn/completed event or an authoritative probe confirms the end.
        if (!current.turnId) activeRuns.delete(threadId);
      } else if (activeRuns.has(threadId)) {
        activeRuns.set(threadId, {
          ...current,
          turnId: current.turnId || eventTurnId,
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

  const listThreads = async ({ archived = false } = {}) => {
    const threads = [];
    let cursor = null;
    do {
      const params = {
        cursor,
        limit: 100,
        sortKey: "updated_at",
        sortDirection: "desc",
        cwd: projectRoot,
      };
      // Older app-server versions omit the archived filter and return active threads by default.
      // Only send the new field when the caller explicitly requests the archive view.
      if (archived) params.archived = true;
      const result = await client.request("thread/list", params);
      threads.push(...result.data);
      cursor = result.nextCursor;
    } while (cursor);
    for (const thread of threads) threadCache.set(thread.id, thread);
    return threads;
  };

  const archivedFromThread = (thread) => {
    if (thread?.archived === true) return true;
    const threadPath = String(thread?.path || "").replaceAll("\\", "/").toLowerCase();
    return threadPath.includes("/archived_sessions/") || threadPath.endsWith("/archived_sessions");
  };

  const summaryFromThread = (thread, archived = archivedFromThread(thread)) => ({
    threadId: thread.id,
    source: sourceFromThread(thread),
    title: thread.name?.trim() || "未命名会话",
    updatedAt: isoFromUnixSeconds(thread.updatedAt),
    messageCount: null,
    latestUser: "",
    latestAssistant: "",
    archived,
    forkedFromId: thread.forkedFromId || null,
  });

  const listSessions = async (source = "all", archived = false) => {
    const threads = await listThreads({ archived });
    return threads
      .filter((thread) => source === "all" || sourceFromThread(thread) === source)
      .map((thread) => summaryFromThread(thread, archived));
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

  const renameSession = async (threadId, name) => {
    await ensureProjectThread(threadId);
    const result = await client.request("thread/name/set", { threadId, name });
    const cached = threadCache.get(threadId) || { id: threadId };
    const thread = result?.thread || { ...cached, name };
    threadCache.set(threadId, thread);
    return summaryFromThread(thread, archivedFromThread(thread));
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

  const detailFromMessages = (thread, messages, {
    messageCount = messages.length,
    hasMore = false,
    nextBefore = null,
    nextCursor = null,
    preferMessageUpdatedAt = false,
  } = {}) => {
    const latestUser = messages.findLast((item) => item.role === "user")?.text || "";
    const latestAssistant = messages.findLast((item) => item.role === "assistant")?.text || "";
    const summary = summaryFromThread(thread);
    const messageTimes = messages
      .map((message) => Date.parse(message.createdAt || ""))
      .filter(Number.isFinite);
    const updatedAt = preferMessageUpdatedAt && messageTimes.length
      ? latestIsoFromEpochMilliseconds([Date.parse(summary.updatedAt), ...messageTimes], summary.updatedAt)
      : summary.updatedAt;
    return {
      ...summary,
      updatedAt,
      messageCount,
      latestUser: previewText(latestUser, 260),
      latestAssistant: previewText(latestAssistant, 260),
      messages,
      hasMore,
      nextBefore,
      nextCursor,
    };
  };

  const readThreadMetadata = async (threadId) => {
    const cached = threadCache.get(threadId);
    if (cached) return cached;
    const result = await client.request("thread/read", { threadId, includeTurns: false });
    if (!result?.thread) throw new Error("Codex did not return the requested thread");
    threadCache.set(result.thread.id, result.thread);
    return result.thread;
  };

  const findSession = async (threadId, source = "all", { before, cursor, limit } = {}) => {
    const cached = threadCache.get(threadId);
    if (cached && source !== "all" && sourceFromThread(cached) !== source) return null;

    // A bounded native page avoids expanding the complete rollout history for the common Web request.
    // Numeric `before` remains the legacy JSONL/app-server fallback contract.
    if (cursor !== undefined || (before === undefined && Number.isSafeInteger(limit) && limit > 0)) {
      try {
        const thread = await readThreadMetadata(threadId);
        if (source !== "all" && sourceFromThread(thread) !== source) return null;
        const page = await readRecentThreadPage({
          client,
          threadId,
          limit,
          cursor,
          registerMedia,
        });
        return detailFromMessages(thread, page.messages, {
          messageCount: null,
          hasMore: Boolean(page.nextCursor),
          nextCursor: page.nextCursor,
          preferMessageUpdatedAt: before === undefined && cursor === undefined,
        });
      } catch (error) {
        if (cursor !== undefined) throw error;
        console.warn(`[conversation-store] native paginated history unavailable, using thread/read: ${error.message}`);
      }
    }

    const result = await client.request("thread/read", { threadId, includeTurns: true });
    const thread = result.thread;
    if (source !== "all" && sourceFromThread(thread) !== source) return null;
    threadCache.set(thread.id, thread);
    const messages = messagesFromTurns(thread.turns, registerMedia);
    const end = Math.min(Number.isSafeInteger(before) ? before : messages.length, messages.length);
    const start = limit ? Math.max(0, end - limit) : 0;
    return detailFromMessages(thread, messages.slice(start, end), {
      messageCount: messages.length,
      hasMore: start > 0,
      nextBefore: start || null,
      preferMessageUpdatedAt: before === undefined,
    });
  };

  const getThread = async (threadId) => threadCache.get(threadId)
    || (await client.request("thread/read", { threadId, includeTurns: false })).thread;

  const ensureProjectThread = async (threadId) => {
    const thread = await getThread(threadId);
    if (!thread?.cwd || path.resolve(thread.cwd).toLowerCase() !== path.resolve(projectRoot).toLowerCase()) {
      throw new Error("This conversation does not belong to the current project.");
    }
    threadCache.set(thread.id, thread);
    return thread;
  };

  const resumeThread = async (threadId) => {
    const thread = await ensureProjectThread(threadId);
    const freshRuntime = freshThreadRuntime.get(threadId);
    if (freshRuntime) return freshRuntime;
    return client.request("thread/resume", { threadId, persistExtendedHistory: true });
  };

  const forkSession = async (threadId, lastTurnId) => {
    await ensureProjectThread(threadId);
    if (!lastTurnId) throw new Error("请选择一个已完成的对话位置再继续");
    const result = await client.request("thread/fork", {
      threadId,
      lastTurnId,
      cwd: projectRoot,
    });
    if (!result?.thread) throw new Error("Codex 未返回新的分支会话");
    threadCache.set(result.thread.id, result.thread);
    return summaryFromThread(result.thread, false);
  };

  const archiveSession = async (threadId) => {
    await ensureProjectThread(threadId);
    await client.request("thread/archive", { threadId });
    threadCache.delete(threadId);
    freshThreadRuntime.delete(threadId);
    return { threadId, archived: true };
  };

  const unarchiveSession = async (threadId) => {
    const result = await client.request("thread/unarchive", { threadId });
    if (!result?.thread) throw new Error("Codex 未返回恢复后的会话");
    if (result.thread.cwd && path.resolve(result.thread.cwd).toLowerCase() !== path.resolve(projectRoot).toLowerCase()) {
      throw new Error("This conversation does not belong to the current project.");
    }
    threadCache.set(result.thread.id, result.thread);
    return summaryFromThread(result.thread, false);
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
    listSessions, createSession, renameSession, findSession, sendMessage, steerMessage, interrupt,
    forkSession, archiveSession, unarchiveSession,
    listModels, updateModel, updateReasoningEffort, getRuntimeContext, getThreadStatus,
    compactContext, close,
  };
};
