import { messageFromThreadItem, previewText } from "./content-blocks.mjs";
import { createAppServerClient } from "./app-server-client.mjs";

const sourceFromThread = (thread) => thread.source === "cli" && thread.cliVersion === "0.122.0" ? "happy" : "codex";

export const createAppServerConversationStore = ({ projectRoot, registerMedia }) => {
  const client = createAppServerClient();
  const threadCache = new Map();

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

  const findSession = async (threadId, source = "all", { before, limit } = {}) => {
    const cached = threadCache.get(threadId);
    if (cached && source !== "all" && sourceFromThread(cached) !== source) return null;
    const result = await client.request("thread/read", { threadId, includeTurns: true });
    const thread = result.thread;
    if (source !== "all" && sourceFromThread(thread) !== source) return null;
    threadCache.set(thread.id, thread);
    const messages = thread.turns
      .flatMap((turn) => turn.items)
      .map((item) => messageFromThreadItem(item, registerMedia))
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

  return { listSessions, findSession, close: client.close };
};
