import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const fileVersion = 2;

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const normalizeMessages = (messages) => {
  const used = new Set();
  return (Array.isArray(messages) ? messages : []).map((message, index) => {
    const baseId = String(message.id || `message-${index}`);
    let id = baseId;
    let duplicate = 0;
    while (used.has(id)) {
      duplicate += 1;
      id = `${baseId}#duplicate-${duplicate}`;
    }
    used.add(id);
    return message.id === id ? message : { ...message, id };
  });
};

const normalizeSession = (session) => {
  const messages = normalizeMessages(session.messages);
  return messages === session.messages ? session : { ...session, messages };
};

const messageEntriesFrom = (messages) => (Array.isArray(messages) ? messages : []).map((message, index) => ({
  id: String(message.id || `message-${index}`),
  fingerprint: hash(message),
}));

const patchFromSession = (session) => ({
  threadId: session.threadId,
  source: session.source,
  title: session.title,
  updatedAt: session.updatedAt,
  messageCount: session.messageCount,
  latestUser: session.latestUser,
  latestAssistant: session.latestAssistant,
  archived: session.archived,
  forkedFromId: session.forkedFromId ?? null,
  hasMore: session.hasMore,
  nextBefore: session.nextBefore ?? null,
  nextCursor: session.nextCursor ?? null,
});

const snapshotFromSession = (session) => {
  const messages = messageEntriesFrom(session.messages);
  const patch = patchFromSession(session);
  const contentPatch = {
    threadId: patch.threadId,
    source: patch.source,
    title: patch.title,
    updatedAt: patch.updatedAt,
    messageCount: patch.messageCount,
    latestUser: patch.latestUser,
    latestAssistant: patch.latestAssistant,
    archived: patch.archived,
    forkedFromId: patch.forkedFromId,
  };
  return {
    signature: hash({ patch: contentPatch, messages }),
    patch,
    messages,
  };
};

const validRecord = (record) => record
  && Number.isSafeInteger(record.contentVersion)
  && record.contentVersion > 0
  && typeof record.signature === "string"
  && Array.isArray(record.messages);

export const createConversationVersionStore = ({ stateFile = "" } = {}) => {
  let loaded = false;
  let records = new Map();
  let queue = Promise.resolve();

  const load = async () => {
    if (loaded) return;
    loaded = true;
    if (!stateFile) return;
    try {
      const stored = JSON.parse(await fs.readFile(stateFile, "utf8"));
      if (stored?.version !== fileVersion || !stored.threads || typeof stored.threads !== "object") return;
      records = new Map(Object.entries(stored.threads).filter(([, record]) => validRecord(record)));
    } catch (error) {
      if (error?.code !== "ENOENT") console.warn(`[conversation-version-store] state ignored: ${error.message}`);
    }
  };

  const persist = async () => {
    if (!stateFile) return;
    const payload = `${JSON.stringify({ version: fileVersion, threads: Object.fromEntries(records) }, null, 2)}\n`;
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    const temporary = `${stateFile}.${process.pid}.tmp`;
    await fs.writeFile(temporary, payload, "utf8");
    await fs.rename(temporary, stateFile);
  };

  const run = (operation) => {
    const next = queue.then(operation, operation);
    queue = next.catch(() => {});
    return next;
  };

  const decorate = (threadId, session) => run(async () => {
    await load();
    const normalized = normalizeSession(session);
    const contentVersion = records.get(threadId)?.contentVersion;
    return contentVersion ? { ...normalized, contentVersion } : normalized;
  });

  const sync = (threadId, session, { requestedVersion, incremental = false } = {}) => run(async () => {
    await load();
    const normalized = normalizeSession(session);
    const previous = records.get(threadId);
    const current = snapshotFromSession(normalized);
    const changed = !previous || previous.signature !== current.signature;
    const contentVersion = previous
      ? changed ? previous.contentVersion + 1 : previous.contentVersion
      : 1;

    if (changed) {
      records.set(threadId, { ...current, contentVersion });
      await persist();
    }

    const full = { ...normalized, contentVersion };
    if (!incremental || !Number.isSafeInteger(requestedVersion) || !previous) return full;

    if (!changed && requestedVersion === contentVersion) {
      return {
        threadId,
        contentVersion,
        unchanged: true,
        upserts: [],
        deletes: [],
      };
    }

    if (changed && requestedVersion === previous.contentVersion) {
      const previousMessages = new Map(previous.messages.map((message) => [message.id, message.fingerprint]));
      const currentMessages = new Map(current.messages.map((message) => [message.id, message.fingerprint]));
      const currentIds = new Set(current.messages.map((message) => message.id));
      const canConfirmDeletes = current.patch.hasMore === false && previous.patch.hasMore === false;

      // A temporary source switch (app-server to JSONL or back) can produce a
      // different identity namespace for the same visible messages. A delta
      // would leave both namespaces in the browser, so replace the snapshot.
      const identityReset = previous.messages.length > 0
        && current.messages.length > 0
        && ![...currentMessages.keys()].some((id) => previousMessages.has(id));
      if (identityReset) return full;

      return {
        threadId,
        contentVersion,
        unchanged: false,
        upserts: (Array.isArray(normalized.messages) ? normalized.messages : []).filter((message, index) => {
          const id = String(message.id || `message-${index}`);
          return previousMessages.get(id) !== currentMessages.get(id);
        }),
        deletes: canConfirmDeletes
          ? previous.messages.filter((message) => !currentIds.has(message.id)).map((message) => message.id)
          : [],
        sessionPatch: current.patch,
      };
    }

    return full;
  });

  return {
    decorate,
    sync,
    close: () => queue,
  };
};
