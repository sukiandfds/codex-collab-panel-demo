import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { messageFromItem, previewText } from "./content-blocks.mjs";

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
  const headerCache = new Map();
  const projectHeaders = new Map();
  const sessionCache = new Map();
  let initializePromise;
  let reconcileTimer;

  const sameProject = (cwd) => {
    if (!cwd) return false;
    try { return path.resolve(cwd).toLowerCase() === projectRoot.toLowerCase(); } catch { return false; }
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
    const files = await walkJsonl(sessionRoot);
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

  const createSessionState = (header) => ({ ...header, offset: 0, carry: "", lastKey: "", messages: [], decoder: new StringDecoder("utf8") });

  const processLine = (state, line) => {
    if (!line.trim()) return;
    try {
      const message = messageFromItem(JSON.parse(line), registerMedia);
      if (!message) return;
      const key = `${message.role}:${message.text}:${message.blocks.map((block) => `${block.type}:${block.source || block.text || ""}`).join("|")}`;
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
      messages: state.messages,
    };
  };

  const listSessions = async (source = "all") => {
    await initialize();
    const sessions = await Promise.all([...projectHeaders.values()].map(readSession));
    return sessions
      .filter((session) => session.messages.length && (source === "all" || session.source === source))
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
