import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const clean = (value, maxLength = 160) => String(value || "").trim().slice(0, maxLength);

const statusError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const groupConversationId = (roomId, agentId) => {
  const readableId = `group:${roomId}:${agentId}`;
  if (readableId.length <= 120) return readableId;
  return `group:${createHash("sha256").update(`${roomId}\u0000${agentId}`).digest("hex")}`;
};

const normalizeRuntimeSessions = (binding) => {
  const sessions = [];
  const seen = new Set();
  const add = (runtimeKind, runtimeSessionId, linkedAt) => {
    const kind = clean(runtimeKind, 40) || "codex";
    const sessionId = clean(runtimeSessionId, 120);
    const key = `${kind}\u0000${sessionId}`;
    if (!sessionId || seen.has(key)) return;
    seen.add(key);
    sessions.push({
      runtimeKind: kind,
      runtimeSessionId: sessionId,
      linkedAt: linkedAt || binding?.createdAt || new Date().toISOString(),
    });
  };
  for (const session of Array.isArray(binding?.runtimeSessions) ? binding.runtimeSessions : []) {
    add(session?.runtimeKind, session?.runtimeSessionId, session?.linkedAt);
  }
  add(binding?.runtimeKind, binding?.runtimeSessionId, binding?.updatedAt || binding?.createdAt);
  return sessions;
};

const readStored = async (stateFile) => {
  try {
    const stored = JSON.parse(await fs.readFile(stateFile, "utf8"));
    return Array.isArray(stored?.bindings) ? stored.bindings : [];
  } catch {
    return [];
  }
};

const historyFileName = (conversationId) => `${encodeURIComponent(conversationId)}.jsonl`;

const textFromContent = (value) => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFromContent).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  if (typeof value.text === "string") return value.text;
  if (typeof value.message === "string") return value.message;
  return textFromContent(value.content);
};

const normalizeHistoryMessage = (message, binding) => {
  const role = message?.role === "user" || message?.role === "assistant" ? message.role : "";
  const text = String(message?.text || "");
  const id = clean(message?.id, 240);
  if (!role || !id || !text.trim()) return null;
  return {
    id,
    role,
    text,
    ...(message.turnId ? { turnId: clean(message.turnId, 160) } : {}),
    ...(message.itemId ? { itemId: clean(message.itemId, 160) } : {}),
    createdAt: message.createdAt || new Date().toISOString(),
    runtimeKind: clean(message.runtimeKind, 40) || binding?.runtimeKind || "codex",
    runtimeSessionId: clean(message.runtimeSessionId, 120) || binding?.runtimeSessionId || "",
    ...(message.authorId ? { authorId: clean(message.authorId, 80) } : {}),
    ...(message.authorName ? { authorName: clean(message.authorName, 80) } : {}),
    ...(Number.isSafeInteger(message.sequence) ? { sequence: message.sequence } : {}),
    ...(message.source ? { source: clean(message.source, 40) } : {}),
    ...(message.projectId ? { projectId: clean(message.projectId, 200) } : {}),
    ...(message.targetProjectId ? { targetProjectId: clean(message.targetProjectId, 200) } : {}),
    ...(message.executionRoot ? { executionRoot: clean(message.executionRoot, 800) } : {}),
    ...(message.roomId ? { roomId: clean(message.roomId, 120) } : {}),
    ...(message.groupMessageId ? { groupMessageId: clean(message.groupMessageId, 120) } : {}),
  };
};

const readHistoryFile = async (file) => {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw.split(/\r?\n/u)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const value = JSON.parse(line);
          return value && typeof value === "object" ? [value] : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
};

export const createAgentConversationStore = async ({ stateFile, groupRoom, roomDirectory, historyRoot: customHistoryRoot = "" }) => {
  const historyRoot = customHistoryRoot || path.join(path.dirname(stateFile), "agent-conversations");
  const historyQueues = new Map();
  const bindings = new Map();
  for (const binding of await readStored(stateFile)) {
    const conversationId = clean(binding?.conversationId, 120);
    const agentId = clean(binding?.agentId, 80);
    const runtimeSessionId = clean(binding?.runtimeSessionId, 120);
    if (!conversationId || !agentId || !runtimeSessionId) continue;
    bindings.set(conversationId, {
      conversationId,
      agentId,
      runtimeKind: clean(binding.runtimeKind, 40) || "codex",
      runtimeSessionId,
      runtimeSessions: normalizeRuntimeSessions(binding),
      conversationKind: clean(binding.conversationKind, 40) || "legacy",
      roomId: clean(binding.roomId, 120) || null,
      projectId: clean(binding.projectId, 200) || null,
      targetProjectId: clean(binding.targetProjectId, 200) || null,
      executionRoot: clean(binding.executionRoot, 800) || null,
      title: clean(binding.title, 240) || null,
      createdAt: binding.createdAt || new Date().toISOString(),
      updatedAt: binding.updatedAt || binding.createdAt || new Date().toISOString(),
    });
  }

  let writeQueue = Promise.resolve();
  const persist = () => {
    const payload = JSON.stringify({ version: 2, bindings: [...bindings.values()] }, null, 2);
    writeQueue = writeQueue
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(stateFile), { recursive: true });
        const temporary = `${stateFile}.${process.pid}.tmp`;
        await fs.writeFile(temporary, payload, "utf8");
        await fs.rename(temporary, stateFile);
      });
    return writeQueue;
  };

  const findByRuntimeSession = (runtimeKind, runtimeSessionId) => [...bindings.values()]
    .find((binding) => binding.runtimeSessions.some((session) => (
      session.runtimeKind === runtimeKind && session.runtimeSessionId === runtimeSessionId
    ))) || null;

  const findByActiveRuntimeSession = (runtimeKind, runtimeSessionId) => [...bindings.values()]
    .find((binding) => binding.runtimeKind === runtimeKind && binding.runtimeSessionId === runtimeSessionId) || null;

  const findByAgent = (agentId) => [...bindings.values()]
    .find((binding) => binding.agentId === agentId) || null;

  const findByAgentKind = (agentId, conversationKind) => [...bindings.values()]
    .find((binding) => binding.agentId === agentId && binding.conversationKind === conversationKind) || null;

  const findByAgentRoom = (agentId, roomId) => {
    const canonical = bindings.get(groupConversationId(roomId, agentId));
    if (canonical) return canonical;
    return [...bindings.values()]
      .filter((binding) => binding.agentId === agentId
        && binding.conversationKind === "group"
        && binding.roomId === roomId)
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))[0] || null;
  };

  const bindRuntime = async ({
    conversationId = "",
    agentId,
    runtimeKind = "codex",
    runtimeSessionId,
    conversationKind = "",
    roomId = "",
    projectId = "",
    targetProjectId = "",
    executionRoot = "",
    title = "",
  }) => {
    const cleanAgentId = clean(agentId, 80);
    const cleanRuntimeKind = clean(runtimeKind, 40) || "codex";
    const cleanRuntimeSessionId = clean(runtimeSessionId, 120);
    const requestedConversationId = clean(conversationId, 120);
    const requestedConversationKind = clean(conversationKind, 40);
    const cleanRoomId = clean(roomId, 120);
    if (!cleanAgentId || !cleanRuntimeSessionId) throw statusError("Agent 对话绑定不完整", 400);
    if (!groupRoom.getAgent(cleanAgentId)) throw statusError("Agent 不存在", 404);
    const existing = requestedConversationId
      ? bindings.get(requestedConversationId)
      : requestedConversationKind === "direct"
        ? findByAgentKind(cleanAgentId, "direct")
        : requestedConversationKind === "legacy"
          ? findByAgentKind(cleanAgentId, "legacy")
          : requestedConversationKind === "group"
            ? findByAgentRoom(cleanAgentId, cleanRoomId)
            : findByAgent(cleanAgentId);
    const cleanConversationKind = requestedConversationKind || existing?.conversationKind || "direct";
    const runtimeBinding = findByRuntimeSession(cleanRuntimeKind, cleanRuntimeSessionId);
    const canShareRuntime = runtimeBinding
      && existing?.conversationId !== runtimeBinding.conversationId
      && runtimeBinding.agentId === cleanAgentId
      && runtimeBinding.conversationKind !== "direct"
      && cleanConversationKind !== "direct";
    if (runtimeBinding && runtimeBinding.conversationId !== existing?.conversationId && !canShareRuntime) {
      throw statusError("Runtime 会话已绑定其他对话", 409);
    }
    const now = new Date().toISOString();
    const runtimeSessions = normalizeRuntimeSessions(existing);
    if (!runtimeSessions.some((session) => (
      session.runtimeKind === cleanRuntimeKind && session.runtimeSessionId === cleanRuntimeSessionId
    ))) {
      runtimeSessions.push({
        runtimeKind: cleanRuntimeKind,
        runtimeSessionId: cleanRuntimeSessionId,
        linkedAt: now,
      });
    }
    const binding = {
      conversationId: existing?.conversationId || requestedConversationId || `conversation-${randomUUID()}`,
      agentId: cleanAgentId,
      runtimeKind: cleanRuntimeKind,
      runtimeSessionId: cleanRuntimeSessionId,
      runtimeSessions,
      conversationKind: cleanConversationKind || existing?.conversationKind || "direct",
      roomId: cleanRoomId || existing?.roomId || null,
      projectId: clean(projectId, 200) || existing?.projectId || null,
      targetProjectId: clean(targetProjectId, 200) || existing?.targetProjectId || null,
      executionRoot: clean(executionRoot, 800) || existing?.executionRoot || null,
      title: clean(title, 240) || existing?.title || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    bindings.set(binding.conversationId, binding);
    await persist();
    return binding;
  };

  const ensureForThread = async (threadId) => {
    const runtimeSessionId = clean(threadId, 120);
    if (!runtimeSessionId) throw statusError("缺少对话会话", 400);
    const existingRuntime = findByRuntimeSession("codex", runtimeSessionId);
    if (existingRuntime) {
      if (existingRuntime.conversationKind === "direct") {
        throw statusError("Agent 直聊需要 conversationId", 400);
      }
      return existingRuntime;
    }
    const agent = groupRoom.snapshot().agents.find((entry) => entry.threadId === runtimeSessionId);
    if (!agent) throw statusError("该对话尚未绑定 Agent", 404);
    const agentBinding = findByAgentKind(agent.id, "legacy");
    return bindRuntime({
      conversationId: agentBinding?.runtimeKind === "codex" ? agentBinding.conversationId : "",
      agentId: agent.id,
      runtimeKind: "codex",
      runtimeSessionId,
      conversationKind: "legacy",
    });
  };

  const openGroupForAgent = async ({ agentId, roomId, projectId = "", targetProjectId = "", executionRoot = "", threadId = "", title = "" }) => {
    const cleanAgentId = clean(agentId, 80);
    const cleanRoomId = clean(roomId, 120);
    const room = roomDirectory?.get?.(cleanRoomId)
      || (groupRoom.snapshot().room.id === cleanRoomId ? groupRoom : null);
    const agent = room?.getAgent(cleanAgentId);
    const runtimeSessionId = clean(threadId, 120) || clean(agent?.threadId, 120);
    if (!room || !agent || !runtimeSessionId) return null;
    return bindRuntime({
      conversationId: groupConversationId(cleanRoomId, cleanAgentId),
      agentId: cleanAgentId,
      runtimeKind: "codex",
      runtimeSessionId,
      conversationKind: "group",
      roomId: cleanRoomId,
      projectId,
      targetProjectId,
      executionRoot,
      title,
    });
  };

  const resolve = async ({ conversationId = "", threadId = "", agentId = "", runtimeKind = "", runtimeSessionId = "" } = {}) => {
    const requestedId = clean(conversationId, 120);
    if (requestedId) {
      const binding = bindings.get(requestedId);
      if (!binding) throw statusError("对话不存在", 404);
      return binding;
    }
    if (runtimeSessionId) {
      const existing = findByRuntimeSession(runtimeKind || "codex", runtimeSessionId);
      if (existing) return existing;
      return bindRuntime({ agentId, runtimeKind, runtimeSessionId, conversationKind: "legacy" });
    }
    return ensureForThread(threadId);
  };

  const readMessages = async (conversationId) => {
    const binding = bindings.get(clean(conversationId, 120));
    if (!binding) throw statusError("对话不存在", 404);
    return readHistoryFile(path.join(historyRoot, historyFileName(binding.conversationId)));
  };

  const readMessage = async (conversationId, messageId) => {
    const target = clean(messageId, 240);
    return (await readMessages(conversationId)).find((message) => message.id === target) || null;
  };

  async function appendMessage({ conversationId, message }) {
    const binding = bindings.get(clean(conversationId, 120));
    if (!binding) throw statusError("对话不存在", 404);
    const normalized = normalizeHistoryMessage(message, binding);
    if (!normalized) return null;
    const file = path.join(historyRoot, historyFileName(binding.conversationId));
    const previous = historyQueues.get(file) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const existing = await readHistoryFile(file);
      const duplicate = existing.find((entry) => entry.id === normalized.id);
      if (duplicate) return duplicate;
      await fs.mkdir(historyRoot, { recursive: true });
      await fs.appendFile(file, `${JSON.stringify(normalized)}\n`, "utf8");
      return normalized;
    });
    historyQueues.set(file, next);
    try {
      return await next;
    } finally {
      if (historyQueues.get(file) === next) historyQueues.delete(file);
    }
  }

  const recordRuntimeMessage = async (runtimeKind, runtimeSessionId, message) => {
    const binding = findByActiveRuntimeSession(runtimeKind, runtimeSessionId);
    if (!binding || binding.conversationKind !== "direct") return null;
    return appendMessage({
      conversationId: binding.conversationId,
      message: { ...message, runtimeKind, runtimeSessionId },
    });
  };

  const recordRuntimeEvent = async (event) => {
    if (event?.method !== "item/completed") return null;
    const threadId = clean(event.params?.threadId, 120);
    const item = event.params?.item;
    if (!threadId || !item || !["userMessage", "agentMessage"].includes(item.type)) return null;
    if (item.type === "agentMessage" && item.phase && item.phase !== "final_answer") return null;
    const text = item.type === "agentMessage" ? String(item.text || "") : textFromContent(item.content);
    return recordRuntimeMessage("codex", threadId, {
      id: item.id || `${event.params?.turnId || "turn"}:${item.type}:${text}`,
      role: item.type === "agentMessage" ? "assistant" : "user",
      text,
      turnId: event.params?.turnId || item.turnId,
      itemId: item.id,
    });
  };

  const getShareTargets = async ({ conversationId = "", threadId = "", agentId = "", runtimeKind = "", runtimeSessionId = "" } = {}) => {
    const binding = await resolve({ conversationId, threadId, agentId, runtimeKind, runtimeSessionId });
    const agent = groupRoom.snapshot().agents.find((entry) => entry.id === binding.agentId);
    if (!agent) throw statusError("Agent 不存在", 404);
    const rooms = roomDirectory
      ? roomDirectory.listForAgent(binding.agentId)
      : [groupRoom.snapshot().room].filter(Boolean);
    return {
      conversationId: binding.conversationId,
      agent: { id: agent.id, name: agent.name },
      rooms: rooms.map(({ id, name }) => ({ id, name })),
    };
  };

  await persist();
  return {
    resolve,
    bindRuntime,
    findByAgent,
    findByAgentKind,
    findByAgentRoom,
    findByRuntimeSession,
    readMessages,
    readMessage,
    appendMessage,
    recordRuntimeMessage,
    recordRuntimeEvent,
    getShareTargets,
    openGroupForAgent,
    close: () => writeQueue,
  };
};
