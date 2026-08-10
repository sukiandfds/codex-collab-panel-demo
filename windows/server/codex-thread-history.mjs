import { dedupeAssistantMediaMessages, messageFromThreadItem } from "./content-blocks.mjs";

const cursorValue = (value) => typeof value === "string" && value ? value : null;

// With descending history, nextCursor advances toward older entries. The
// backwards cursor includes the current anchor and would replay this page.
const olderCursorFrom = (result) => cursorValue(result?.nextCursor);

const itemListMethods = ["thread/items/list", "thread/turns/items/list"];
const itemListMethodByClient = new WeakMap();
const unsupportedMethodPattern = /(?:method\s+not\s+found|unknown\s+method|unsupported\s+method|not\s+implemented|unrecognized\s+method)/iu;

const stableMessageId = (turnId, itemId, index, message) => {
  const identity = itemId || `${message.id}:${index}`;
  return `codex:${encodeURIComponent(String(turnId || "unknown"))}:${encodeURIComponent(String(identity))}`;
};

const timestampFromValue = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.abs(value) >= 10_000_000_000 ? value : value * 1000;
  if (typeof value !== "string" || !value.trim()) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.abs(numeric) >= 10_000_000_000 ? numeric : numeric * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const timestampFromSubmissionId = (value) => {
  const match = /^msg-([0-9a-z]+)-/iu.exec(String(value || ""));
  if (!match) return null;
  const timestamp = Number.parseInt(match[1], 36);
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : null;
};

const userMessageTimestamp = (item, fallback) => {
  for (const value of [item?.createdAt, item?.timestamp, item?.created_at]) {
    const timestamp = timestampFromValue(value);
    if (timestamp !== null) return timestamp;
  }
  return timestampFromSubmissionId(item?.clientId) ?? timestampFromValue(fallback);
};

const turnPageLimit = (messageLimit) => {
  const safeLimit = Number.isSafeInteger(messageLimit) && messageLimit > 0 ? messageLimit : 60;
  return Math.min(100, Math.max(20, Math.ceil(safeLimit / 2) + 4));
};

const messagesFromTurn = (turn, registerMedia) => dedupeAssistantMediaMessages((Array.isArray(turn?.items) ? turn.items : [])
  .map((item, index) => {
    const message = messageFromThreadItem(item, registerMedia);
    if (!message) return null;
    const timestamp = message.role === "user"
      ? userMessageTimestamp(item, turn.startedAt)
      : timestampFromValue(turn.completedAt);
    const itemId = item.id || message.itemId || "";
    const withTurn = turn.id
      ? {
        ...message,
        id: stableMessageId(turn.id, itemId, index, message),
        turnId: turn.id,
        itemId,
      }
      : { ...message, id: stableMessageId("unknown", itemId, index, message), itemId };
    return timestamp !== null
      ? { ...withTurn, createdAt: new Date(timestamp).toISOString() }
      : withTurn;
  })
  .filter(Boolean));

const messagesFromItems = (entries, registerMedia) => {
  const messages = (Array.isArray(entries) ? entries : [])
  .map((entry, index) => {
    const item = entry?.item || entry?.threadItem || entry;
    const message = messageFromThreadItem(item, registerMedia);
    if (!message) return null;
    const turnId = item?.turnId || entry?.turnId || entry?.turn?.id || "";
    const itemId = item?.id || message.itemId || "";
    const timestamp = message.role === "user" ? userMessageTimestamp(item, entry?.createdAt || entry?.timestamp) : null;
    const withTimestamp = timestamp !== null ? { ...message, createdAt: new Date(timestamp).toISOString() } : message;
    return turnId
      ? { ...withTimestamp, id: stableMessageId(turnId, itemId, index, message), turnId, itemId }
      : { ...withTimestamp, id: stableMessageId("unknown", itemId, index, message), itemId };
  })
    .filter(Boolean);
  const seenByTurn = new Map();
  return messages.flatMap((message) => {
    const scope = message.turnId || message.id;
    if (!seenByTurn.has(scope)) seenByTurn.set(scope, new Set());
    return dedupeAssistantMediaMessages([message], seenByTurn.get(scope));
  });
};

export const messagesFromTurns = (turns, registerMedia) => (Array.isArray(turns) ? turns : [])
  .flatMap((turn) => messagesFromTurn(turn, registerMedia));

const readItemPage = async ({ client, threadId, limit, cursor, registerMedia }) => {
  const rememberedMethod = itemListMethodByClient.get(client);
  const methods = rememberedMethod ? [rememberedMethod] : itemListMethods;
  let lastError;
  for (const method of methods) {
    try {
      const result = await client.request(method, {
        threadId,
        cursor: cursor || null,
        limit: Math.min(100, Math.max(20, Number.isSafeInteger(limit) && limit > 0 ? limit : 60)),
        sortDirection: "desc",
      });
      if (!Array.isArray(result?.data)) throw new Error("Codex returned an invalid paginated item response");
      itemListMethodByClient.set(client, method);
      return {
        messages: messagesFromItems([...result.data].reverse(), registerMedia),
        nextCursor: olderCursorFrom(result),
      };
    } catch (error) {
      lastError = error;
      if (rememberedMethod || !unsupportedMethodPattern.test(String(error?.message || error))) throw error;
    }
  }
  throw lastError || new Error("Codex item pagination is unavailable");
};

export const readRecentThreadPage = async ({ client, threadId, limit, cursor, registerMedia }) => {
  try {
    const result = await client.request("thread/turns/list", {
      threadId,
      cursor: cursor || null,
      limit: turnPageLimit(limit),
      sortDirection: "desc",
      itemsView: "full",
    });
    if (!Array.isArray(result?.data)) throw new Error("Codex returned an invalid paginated thread response");

    // Codex returns the newest turns first for desc; the UI model remains chronological.
    const turns = [...result.data].reverse();
    return {
      messages: messagesFromTurns(turns, registerMedia),
      nextCursor: olderCursorFrom(result),
    };
  } catch (error) {
    if (!unsupportedMethodPattern.test(String(error?.message || error))) throw error;
    return readItemPage({ client, threadId, limit, cursor, registerMedia });
  }
};
