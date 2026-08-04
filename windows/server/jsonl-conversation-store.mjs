import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { blocksFromContent, messageFromItem, previewText } from "./content-blocks.mjs";

const walkJsonl = async (directory) => {
  let entries = [];
  try { entries = await fsp.readdir(directory, { withFileTypes: true }); } catch { return []; }
  const groups = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJsonl(fullPath);
    return entry.isFile() && entry.name.endsWith(".jsonl") ? [fullPath] : [];
  }));
  return groups.flat();
};

const threadIdFromFile = (file) => path.basename(file).match(/[0-9a-f]{8}-[0-9a-f-]{27,}/iu)?.[0] || path.basename(file);

export const createJsonlConversationStore = ({ sessionRoot, projectRoot, registerMedia, onChange }) => {
  const archivedRoot = path.join(path.dirname(sessionRoot), "archived_sessions");
  const headerCache = new Map();
  const projectHeaders = new Map();
  const sessionCache = new Map();
  let initializePromise;
  let reconcileTimer;

  const sameProject = (cwd) => {
    if (!cwd) return false;
    try { return path.resolve(cwd).toLowerCase() === projectRoot.toLowerCase(); } catch { return false; }
  };

  const isArchivedFile = (file) => {
    const root = path.resolve(archivedRoot).toLowerCase();
    const candidate = path.resolve(file).toLowerCase();
    return candidate === root || candidate.startsWith(`${root}${path.sep}`);
  };

  const readHeader = async (file, refresh = false) => {
    if (!refresh && headerCache.has(file)) return headerCache.get(file);
    let handle;
    try {
      handle = await fsp.open(file, "r");
      const decoder = new StringDecoder("utf8");
      const buffer = Buffer.alloc(32768);
      let offset = 0;
      let carry = "";
      while (offset < 1024 * 1024) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
        if (!bytesRead) break;
        offset += bytesRead;
        const lines = (carry + decoder.write(buffer.subarray(0, bytesRead))).split(/\r?\n/u);
        carry = lines.pop() || "";
        for (const line of lines) {
          try {
            const item = JSON.parse(line);
            if (item?.type !== "session_meta") continue;
            const header = {
              file,
              cwd: item.payload?.cwd || "",
              cliVersion: item.payload?.cli_version || "",
              threadId: item.payload?.id || item.payload?.session_id || threadIdFromFile(file),
              title: item.payload?.name || item.payload?.title || null,
              archived: isArchivedFile(file),
            };
            headerCache.set(file, header);
            return header;
          } catch {}
        }
      }
    } catch {}
    finally { await handle?.close().catch(() => {}); }
    return null;
  };

  const addFile = async (file) => {
    if (!file.endsWith(".jsonl")) return false;
    const header = await readHeader(file, true);
    if (!header || !sameProject(header.cwd)) return false;
    projectHeaders.set(file, header);
    return true;
  };

  const reconcile = async () => {
    const files = [
      ...(await walkJsonl(sessionRoot)),
      ...(await walkJsonl(archivedRoot)),
    ];
    const existing = new Set(files);
    for (const file of projectHeaders.keys()) {
      if (!existing.has(file)) {
        projectHeaders.delete(file);
        headerCache.delete(file);
        sessionCache.delete(file);
      }
    }
    await Promise.all(files.filter((file) => !headerCache.has(file)).map(addFile));
  };

  const initialize = () => {
    initializePromise ||= reconcile();
    return initializePromise;
  };

  const scheduleReconcile = () => {
    clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(() => void reconcile().then(() => onChange({ type: "sessions_changed" })), 500);
  };

  let watcher;
  try {
    watcher = fs.watch(sessionRoot, { recursive: true }, (_event, filename) => {
      if (!filename || !String(filename).endsWith(".jsonl")) return;
      const file = path.resolve(sessionRoot, String(filename));
      const header = projectHeaders.get(file);
      if (header) {
        onChange({ type: "sessions_changed", threadId: header.threadId });
      } else {
        scheduleReconcile();
      }
    });
    watcher.on("error", scheduleReconcile);
  } catch {}

  const fallbackTimer = setInterval(() => void reconcile(), 60000);
  fallbackTimer.unref?.();

  const createSessionState = (header) => ({
    ...header,
    offset: 0,
    carry: "",
    lastKey: "",
    messageSequence: 0,
    messages: [],
    pendingAssistantMedia: [],
    decoder: new StringDecoder("utf8"),
  });

  const blockKey = (block) => `${block.type}:${block.source || block.text || ""}`;

  const mergeBlocks = (current, incoming) => {
    const seen = new Set(current.map(blockKey));
    return [...current, ...incoming.filter((block) => !seen.has(blockKey(block)))];
  };

  const isFinalAssistantItem = (item) => (
    (item?.type === "event_msg" && item.payload?.type === "agent_message" && item.payload?.phase === "final_answer")
    || (item?.type === "response_item" && item.payload?.type === "message" && item.payload?.role === "assistant"
      && (!item.payload?.phase || item.payload.phase === "final_answer"))
  );

  const processLine = (state, line) => {
    if (!line.trim()) return;
    try {
      const item = JSON.parse(line);
      if (item?.type === "response_item" && item.payload?.type === "custom_tool_call_output") {
        const media = blocksFromContent(item.payload.output, registerMedia)
          .filter((block) => ["image", "audio", "video"].includes(block.type));
        state.pendingAssistantMedia = mergeBlocks(state.pendingAssistantMedia, media);
        return;
      }

      const message = messageFromItem(item, registerMedia);
      if (!message) return;
      const timestamp = Date.parse(item.timestamp || "");
      if (Number.isFinite(timestamp)) message.createdAt = new Date(timestamp).toISOString();
      if (isFinalAssistantItem(item) && state.pendingAssistantMedia.length) {
        message.blocks = mergeBlocks(message.blocks, state.pendingAssistantMedia);
        state.pendingAssistantMedia = [];
      }

      const messageIndex = state.messageSequence;
      state.messageSequence += 1;
      const itemId = item.id || item.payload?.id || item.payload?.client_id || message.itemId || "";
      const turnId = message.turnId || item.turnId || item.payload?.internal_chat_message_metadata_passthrough?.turn_id || "";
      const identity = itemId || `${item.timestamp || "unknown"}:${messageIndex}`;
      message.id = `jsonl:${encodeURIComponent(state.threadId)}:${encodeURIComponent(String(turnId || "unknown"))}:${encodeURIComponent(String(identity))}`;
      const previous = state.messages.at(-1);
      const logicalKey = `${message.role}:${turnId}:${identity}:${item.timestamp || ""}`;
      if (previous?.role === message.role && previous.text === message.text && state.lastKey.startsWith(`${logicalKey}:`)) {
        previous.blocks = mergeBlocks(previous.blocks, message.blocks);
        state.lastKey = `${logicalKey}:${previous.blocks.map(blockKey).join("|")}`;
        return;
      }
      const key = `${logicalKey}:${message.blocks.map((block) => `${block.type}:${block.source || block.text || ""}`).join("|")}`;
      if (key !== state.lastKey) state.messages.push(message);
      state.lastKey = key;
    } catch {}
  };

  const readAppend = async (file, start, length) => {
    if (length <= 0) return Buffer.alloc(0);
    const handle = await fsp.open(file, "r");
    try {
      const buffer = Buffer.alloc(length);
      let total = 0;
      while (total < length) {
        const { bytesRead } = await handle.read(buffer, total, length - total, start + total);
        if (!bytesRead) break;
        total += bytesRead;
      }
      return buffer.subarray(0, total);
    } finally { await handle.close(); }
  };

  const readSession = async (header) => {
    const stat = await fsp.stat(header.file);
    let state = sessionCache.get(header.file);
    if (!state || stat.size < state.offset) state = createSessionState(header);
    const appended = await readAppend(header.file, state.offset, stat.size - state.offset);
    state.offset += appended.length;
    if (appended.length) {
      const lines = (state.carry + state.decoder.write(appended)).split(/\r?\n/u);
      state.carry = lines.pop() || "";
      lines.forEach((line) => processLine(state, line));
    }
    sessionCache.set(header.file, state);

    const latestUser = state.messages.findLast((item) => item.role === "user")?.text || "";
    const latestAssistant = state.messages.findLast((item) => item.role === "assistant")?.text || "";
    return {
      threadId: state.threadId,
      file: path.basename(header.file),
      source: state.cliVersion === "0.122.0" ? "happy" : "codex",
      title: header.title?.trim() || "未命名会话",
      updatedAt: stat.mtime.toISOString(),
      messageCount: state.messages.length,
      latestUser: previewText(latestUser, 260),
      latestAssistant: previewText(latestAssistant, 260),
      archived: Boolean(header.archived),
      messages: state.messages,
    };
  };

  const listSessions = async (source = "all", archived = false) => {
    await initialize();
    const sessions = await Promise.all([...projectHeaders.values()].map(readSession));
    return sessions
      .filter((session) => session.messages.length
        && Boolean(session.archived) === Boolean(archived)
        && (source === "all" || session.source === source))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  };

  const findSession = async (threadId, source = "all", { before, limit } = {}) => {
    await initialize();
    const header = [...projectHeaders.values()].find((item) => item.threadId === threadId);
    if (!header) return null;
    const session = await readSession(header);
    if (source !== "all" && session.source !== source) return null;
    if (!limit) return session;
    const end = Math.min(Number.isSafeInteger(before) ? before : session.messages.length, session.messages.length);
    const start = Math.max(0, end - limit);
    return { ...session, messages: session.messages.slice(start, end), hasMore: start > 0, nextBefore: start || null };
  };

  const close = () => {
    clearTimeout(reconcileTimer);
    clearInterval(fallbackTimer);
    watcher?.close();
  };

  return { listSessions, findSession, close };
};
