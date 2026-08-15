import fs from "node:fs/promises";
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

const AUTO_TITLE_MODEL = "gpt-5.6-terra";
const AUTO_TITLE_TIMEOUT_MS = 20000;
const AUTO_TITLE_SCHEMA = {
  type: "object",
  properties: { title: { type: "string", minLength: 1, maxLength: 36 } },
  required: ["title"],
  additionalProperties: false,
};

const cleanAutoTitle = (value) => {
  let title = String(value || "").replace(/\s+/gu, " ").trim();
  try { title = JSON.parse(title)?.title || title; } catch {}
  title = String(title).replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/gu, "").replace(/[。.!！?？]+$/gu, "").trim();
  return [...title].slice(0, 36).join("");
};

const titlePromptFrom = (text) => [
  "请为用户请求生成简洁的对话标题。",
  "使用用户的语言，尽量不超过 5 个词或 20 个汉字，最多 36 个字符。",
  "标题应概括实际主题，不要回答问题，不要使用引号、Markdown 或结尾标点。",
  "只填写结构化 title 字段。",
  "",
  "用户请求：",
  String(text || "").slice(0, 2000),
].join("\n");

export const inputFromAttachments = async (text, attachments = [], attachmentContent) => {
  const input = [];
  if (text) input.push({ type: "text", text, text_elements: [] });
  for (const attachment of attachments) {
    if (attachment.mimeType.startsWith("image/")) {
      input.push({ type: "localImage", path: attachment.path });
    } else if (attachment.mimeType.startsWith("audio/")) {
      input.push({ type: "localAudio", path: attachment.path });
    } else {
      input.push({ type: "mention", name: attachment.name, path: attachment.path });
      const analysis = await attachmentContent?.inspect?.(attachment);
      if (analysis?.status === "ready" && analysis.content) {
        input.push({
          type: "text",
          text: `\n\n[附件正文：${attachment.name}]\n${analysis.content}\n[附件正文结束]`,
          text_elements: [],
        });
      }
    }
  }
  return input;
};

const promptFromSlashCommand = (text, attachments = []) => {
  const match = /^\s*\/(image|file|skill|app)(?:\s+([\s\S]*?))?\s*$/iu.exec(String(text || ""));
  if (!match) return text;
  const detail = String(match[2] || "").trim();
  const command = match[1].toLocaleLowerCase();
  if (command === "image") {
    return attachments.length
      ? `请直接调用已配置的图片生成 MCP 工具，使用我上传的图片作为参考并按以下要求修改：${detail || "请先分析参考图片，再给出适当的修改结果。"}`
      : `请直接调用已配置的图片生成 MCP 工具，按以下要求生成图片：${detail || "请根据当前对话中已经明确的画面要求生成图片。"}`;
  }
  if (command === "file") {
    return `请读取并处理我上传的文件。${detail || "先理解文件内容和结构，再回答我的问题。"}`;
  }
  if (command === "skill") {
    return `请使用与以下任务最匹配的 Codex Skill，并完成任务：${detail || "根据当前对话选择合适的 Skill。"}`;
  }
  return `请使用当前可用的 Codex App 或连接器完成以下任务：${detail || "根据当前对话选择合适的 App。"}`;
};

export const createAppServerConversationStore = ({
  projectRoot, projectRoots = [projectRoot], registerMedia, onProtocolMessage, onSubmitted, onFailed, onHealthState,
  autoTitleStateFile = "", onAutoTitleChanged,
  attachmentContent,
  threadRuntimeOptions = async () => null,
  client = createAppServerClient(),
  supervision = {},
}) => {
  const allowedProjectRoots = [...new Set(projectRoots.map((root) => path.resolve(root).toLowerCase()))];
  const isAllowedProjectRoot = (cwd) => {
    if (!cwd) return false;
    try { return allowedProjectRoots.includes(path.resolve(cwd).toLowerCase()); } catch { return false; }
  };
  const isSameProjectRoot = (left, right) => {
    if (!left || !right) return false;
    try { return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase(); } catch { return false; }
  };
  const activeRuns = new Map();
  const autoTitleAttempts = new Set();
  const autoTitleThreads = new Map();
  const autoTitles = new Map();
  let autoTitlesLoaded = false;
  let autoTitlesLoading = null;
  const monitorIntervalMs = supervision.intervalMs ?? 5000;
  const staleAfterMs = supervision.staleAfterMs ?? 30000;
  const finalizingAfterMs = supervision.finalizingAfterMs ?? 10000;
  const retryAfterMs = supervision.retryAfterMs ?? 10000;
  let monitorBusy = false;

  const loadAutoTitles = async () => {
    if (autoTitlesLoaded || !autoTitleStateFile) return;
    if (!autoTitlesLoading) {
      autoTitlesLoading = fs.readFile(autoTitleStateFile, "utf8")
        .then((text) => JSON.parse(text)?.titles || {})
        .catch((error) => error?.code === "ENOENT" ? {} : Promise.reject(error))
        .then((titles) => {
          for (const [threadId, value] of Object.entries(titles)) {
            const title = cleanAutoTitle(value?.title);
            if (title) autoTitles.set(threadId, { title, updatedAt: String(value?.updatedAt || "") });
          }
          autoTitlesLoaded = true;
        })
        .finally(() => { autoTitlesLoading = null; });
    }
    await autoTitlesLoading;
  };

  const saveAutoTitle = async (threadId, title) => {
    await loadAutoTitles();
    autoTitles.set(threadId, { title, updatedAt: new Date().toISOString() });
    if (!autoTitleStateFile) return;
    const state = { version: 1, titles: Object.fromEntries(autoTitles) };
    await fs.mkdir(path.dirname(autoTitleStateFile), { recursive: true });
    const temporary = `${autoTitleStateFile}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await fs.rename(temporary, autoTitleStateFile);
  };

  const handleProtocolMessage = (message) => {
    const { method, params = {} } = message || {};
    const threadId = params.threadId;
    const autoTitleThread = autoTitleThreads.get(threadId);
    if (autoTitleThread) {
      if (method === "item/completed" && params.item?.type === "agentMessage" && params.item?.phase !== "commentary") {
        autoTitleThread.text = String(params.item.text || "");
      }
      if (method === "turn/completed") autoTitleThread.resolve(autoTitleThread.text);
      return;
    }
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
    for (const root of projectRoots) {
      let cursor = null;
      do {
        const params = {
          cursor,
          limit: 100,
          sortKey: "updated_at",
          sortDirection: "desc",
          cwd: root,
        };
        // Older app-server versions omit the archived filter and return active threads by default.
        // Only send the new field when the caller explicitly requests the archive view.
        if (archived) params.archived = true;
        const result = await client.request("thread/list", params);
        threads.push(...result.data);
        cursor = result.nextCursor;
      } while (cursor);
    }
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
    title: thread.name?.trim() || autoTitles.get(thread.id)?.title || "未命名会话",
    updatedAt: isoFromUnixSeconds(thread.updatedAt),
    messageCount: null,
    latestUser: "",
    latestAssistant: "",
    archived,
    forkedFromId: thread.forkedFromId || null,
    cwd: thread.cwd || null,
  });

  const listSessions = async (source = "all", archived = false) => {
    await loadAutoTitles();
    const threads = await listThreads({ archived });
    return threads
      .filter((thread) => source === "all" || sourceFromThread(thread) === source)
      .map((thread) => summaryFromThread(thread, archived));
  };

  const createSession = async (model = "", requestedProjectRoot = "") => {
    const cwd = requestedProjectRoot ? path.resolve(requestedProjectRoot) : projectRoot;
    if (!isAllowedProjectRoot(cwd)) throw new Error("This project folder is not registered in Negus.");
    const params = { cwd };
    if (model) params.model = model;
    const result = await client.request("thread/start", params);
    let thread = result.thread;
    if (!thread?.id) throw new Error("Codex did not return the newly created Thread.");
    if (!thread.cwd) {
      const verified = await client.request("thread/read", { threadId: thread.id, includeTurns: false });
      thread = verified.thread || thread;
    }
    if (!isSameProjectRoot(thread.cwd, cwd)) {
      throw Object.assign(new Error("新对话未创建在所选项目中，请检查项目路径后重试。"), { statusCode: 502 });
    }
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

  const generateAutoTitle = async (text, cwd) => {
    const started = await client.request("thread/start", {
      model: AUTO_TITLE_MODEL,
      cwd,
      approvalPolicy: "never",
      permissions: ":read-only",
      config: {
        model_reasoning_effort: "low",
        web_search: "disabled",
        "features.enable_fanout": false,
        "features.multi_agent": false,
        "features.multi_agent_v2": false,
        "features.plugins": false,
      },
      ephemeral: true,
      threadSource: "system",
      experimentalRawEvents: false,
    }, { timeoutMs: AUTO_TITLE_TIMEOUT_MS });
    const titleThreadId = started.thread.id;
    let timer;
    const response = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Automatic title generation timed out")), AUTO_TITLE_TIMEOUT_MS);
      timer.unref?.();
      autoTitleThreads.set(titleThreadId, { resolve, text: "" });
    });
    try {
      await client.request("turn/start", {
        threadId: titleThreadId,
        input: [{ type: "text", text: titlePromptFrom(text), text_elements: [] }],
        outputSchema: AUTO_TITLE_SCHEMA,
      }, { timeoutMs: AUTO_TITLE_TIMEOUT_MS });
      return cleanAutoTitle(await response);
    } finally {
      clearTimeout(timer);
      autoTitleThreads.delete(titleThreadId);
      void client.request("thread/unsubscribe", { threadId: titleThreadId }, { timeoutMs: 2000 }).catch(() => {});
    }
  };

  const autoTitleSession = async (threadId, text) => {
    await loadAutoTitles();
    if (autoTitleAttempts.has(threadId) || autoTitles.has(threadId)) return;
    const cached = threadCache.get(threadId);
    if (cached?.name?.trim()) return;
    autoTitleAttempts.add(threadId);
    try {
      const generatedTitle = await generateAutoTitle(text, cached?.cwd || projectRoot);
      if (!generatedTitle) return;
      const current = await client.request("thread/read", { threadId, includeTurns: false });
      if (String(current.thread?.name || "").trim()) return;
      await saveAutoTitle(threadId, generatedTitle);
      onAutoTitleChanged?.(threadId);
    } catch (error) {
      console.warn(`[auto-title] generation failed for ${threadId}: ${error.message}`);
    } finally {
      autoTitleAttempts.delete(threadId);
    }
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
    await loadAutoTitles();
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
    const belongsToProject = isAllowedProjectRoot(thread?.cwd);
    const runtimeOptions = belongsToProject ? null : await threadRuntimeOptions(thread);
    if (!belongsToProject && !runtimeOptions) {
      throw new Error("This conversation does not belong to the current project.");
    }
    threadCache.set(thread.id, thread);
    return { thread, runtimeOptions };
  };

  const resumeThread = async (threadId) => {
    const { runtimeOptions } = await ensureProjectThread(threadId);
    const freshRuntime = freshThreadRuntime.get(threadId);
    if (freshRuntime) return freshRuntime;
    return client.request("thread/resume", { threadId, persistExtendedHistory: true, ...(runtimeOptions?.resume || {}) });
  };

  const forkSession = async (threadId, lastTurnId) => {
    const { thread } = await ensureProjectThread(threadId);
    if (!lastTurnId) throw new Error("请选择一个已完成的对话位置再继续");
    const result = await client.request("thread/fork", {
      threadId,
      lastTurnId,
      cwd: thread.cwd || projectRoot,
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
    if (result.thread.cwd && !isAllowedProjectRoot(result.thread.cwd)) {
      throw new Error("This conversation does not belong to the current project.");
    }
    threadCache.set(result.thread.id, result.thread);
    return summaryFromThread(result.thread, false);
  };

  const sendMessage = async (threadId, text, attachments = [], submissionId = "") => {
    onSubmitted?.(threadId);
    try {
      await resumeThread(threadId);
      const { runtimeOptions } = await ensureProjectThread(threadId);
      const result = await client.request("turn/start", {
        threadId,
        input: await inputFromAttachments(promptFromSlashCommand(text, attachments), attachments, attachmentContent),
        ...(submissionId ? { clientUserMessageId: submissionId } : {}),
        ...(runtimeOptions?.turn || {}),
      });
      freshThreadRuntime.delete(threadId);
      void autoTitleSession(threadId, text).catch((error) => {
        console.warn(`[auto-title] failed for ${threadId}: ${error.message}`);
      });
      return result;
    } catch (error) {
      onFailed?.(threadId, error);
      throw error;
    }
  };

  const steerMessage = async (threadId, turnId, text, attachments = [], submissionId = "") => client.request("turn/steer", {
    threadId,
    expectedTurnId: turnId,
    input: await inputFromAttachments(promptFromSlashCommand(text, attachments), attachments, attachmentContent),
    ...(submissionId ? { clientUserMessageId: submissionId } : {}),
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

  const reviewSession = async (threadId) => {
    await ensureProjectThread(threadId);
    return client.request("review/start", { threadId });
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
    for (const pending of autoTitleThreads.values()) pending.resolve(pending.text);
    autoTitleThreads.clear();
    client.close();
  };

  return {
    listSessions, createSession, renameSession, findSession, sendMessage, steerMessage, interrupt,
    forkSession, archiveSession, unarchiveSession,
    listModels, updateModel, updateReasoningEffort, getRuntimeContext, getThreadStatus,
    compactContext, reviewSession, close,
  };
};
