import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const maxItemsPerThread = 50;
const queueStates = new Set(["pending", "dispatching", "failed"]);
const dispatchSubmissionId = () => `msg-${Date.now().toString(36)}-${randomUUID()}`;

const normalizeItem = (threadId, item, index = 0) => {
  const state = queueStates.has(item?.state) ? item.state : "pending";
  const dispatching = state === "dispatching";
  return {
    id: String(item?.id || `queued-${randomUUID()}`),
    threadId,
    submissionId: String(item?.submissionId || randomUUID()),
    text: String(item?.text || "").trim(),
    attachmentIds: [...new Set(Array.isArray(item?.attachmentIds) ? item.attachmentIds.map(String) : [])].slice(0, 6),
    attachments: Array.isArray(item?.attachments) ? item.attachments : [],
    state: dispatching ? "failed" : state,
    error: dispatching ? "服务重启后未自动重发，请点击重试" : String(item?.error || ""),
    createdAt: String(item?.createdAt || new Date().toISOString()),
    sentAt: String(item?.sentAt || ""),
    dispatchSubmissionId: String(item?.dispatchSubmissionId || ""),
    updatedAt: String(item?.updatedAt || item?.createdAt || new Date().toISOString()),
    position: index,
  };
};

export const createFollowUpQueueStore = ({ stateFile = "" } = {}) => {
  const queues = new Map();
  let persistTimer;
  let persistChain = Promise.resolve();

  try {
    if (stateFile && fs.existsSync(stateFile)) {
      const stored = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      const entries = Array.isArray(stored?.queues)
        ? stored.queues
        : Object.entries(stored?.queues || {});
      for (const entry of entries) {
        const threadId = Array.isArray(entry) ? String(entry[0] || "") : String(entry?.threadId || "");
        const items = Array.isArray(entry) ? entry[1] : entry?.items;
        if (!threadId || !Array.isArray(items)) continue;
        queues.set(threadId, items.slice(0, maxItemsPerThread).map((item, index) => normalizeItem(threadId, item, index)));
      }
    }
  } catch {
    // A malformed queue snapshot should not prevent the project service from starting.
  }

  const snapshot = () => ({
    version: 1,
    queues: [...queues.entries()].map(([threadId, items]) => ({ threadId, items })),
  });

  const persist = () => {
    if (!stateFile) return Promise.resolve();
    const payload = `${JSON.stringify(snapshot(), null, 2)}\n`;
    persistChain = persistChain.catch(() => {}).then(async () => {
      await fsp.mkdir(path.dirname(stateFile), { recursive: true });
      const temporary = `${stateFile}.${process.pid}.tmp`;
      await fsp.writeFile(temporary, payload, "utf8");
      await fsp.rename(temporary, stateFile);
    }).catch((error) => console.warn(`[follow-up-queue] state persistence failed: ${error.message}`));
    return persistChain;
  };

  const schedulePersist = () => {
    if (!stateFile) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => void persist(), 100);
    persistTimer.unref?.();
  };

  const itemsFor = (threadId) => queues.get(threadId) || [];
  const reindex = (items) => items.forEach((item, index) => { item.position = index; });
  const writeItems = (threadId, items) => {
    if (items.length) queues.set(threadId, items);
    else queues.delete(threadId);
    reindex(items);
    schedulePersist();
  };

  const list = (threadId) => itemsFor(threadId).map((item) => ({ ...item, attachments: item.attachments.map((attachment) => ({ ...attachment })) }));
  const find = (threadId, itemId) => itemsFor(threadId).find((item) => item.id === itemId) || null;
  const findBySubmissionId = (threadId, submissionId) => itemsFor(threadId).find((item) => item.submissionId === submissionId) || null;

  const enqueue = ({ threadId, text, attachmentIds = [], attachments = [], submissionId = "" }) => {
    const existing = submissionId ? findBySubmissionId(threadId, submissionId) : null;
    if (existing) return { ...existing };
    const now = new Date().toISOString();
    const item = normalizeItem(threadId, {
      id: `queued-${randomUUID()}`,
      submissionId: submissionId || randomUUID(),
      text,
      attachmentIds,
      attachments,
      state: "pending",
      createdAt: now,
      updatedAt: now,
    });
    const items = [...itemsFor(threadId), item].slice(-maxItemsPerThread);
    writeItems(threadId, items);
    return { ...item };
  };

  const update = (threadId, itemId, changes = {}, { allowDispatching = false } = {}) => {
    const items = itemsFor(threadId);
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0) return null;
    if (items[index].state === "dispatching" && !allowDispatching) return null;
    const next = normalizeItem(threadId, {
      ...items[index],
      ...changes,
      id: items[index].id,
      submissionId: items[index].submissionId,
      state: changes.state || items[index].state,
      updatedAt: new Date().toISOString(),
    }, index);
    const nextItems = [...items];
    nextItems[index] = next;
    writeItems(threadId, nextItems);
    return { ...next };
  };

  const remove = (threadId, itemId, { allowDispatching = false } = {}) => {
    const items = itemsFor(threadId);
    const item = items.find((value) => value.id === itemId);
    if (!item || (item.state === "dispatching" && !allowDispatching)) return null;
    writeItems(threadId, items.filter((value) => value.id !== itemId));
    return { ...item };
  };

  const move = (threadId, itemId, direction) => {
    const items = [...itemsFor(threadId)];
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0 || items[index].state === "dispatching") return null;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= items.length) return { ...items[index] };
    if (items[nextIndex].state === "dispatching") return { ...items[index] };
    [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
    items[index].updatedAt = new Date().toISOString();
    items[nextIndex].updatedAt = items[index].updatedAt;
    writeItems(threadId, items);
    return { ...items[nextIndex] };
  };

  const claimNext = (threadId) => {
    const items = itemsFor(threadId);
    const index = items.findIndex((item) => item.state === "pending");
    if (index < 0) return null;
    const now = new Date().toISOString();
    const item = {
      ...items[index],
      state: "dispatching",
      error: "",
      sentAt: now,
      dispatchSubmissionId: dispatchSubmissionId(),
      updatedAt: now,
    };
    const nextItems = [...items];
    nextItems[index] = item;
    writeItems(threadId, nextItems);
    return { ...item };
  };

  const claim = (threadId, itemId) => {
    const items = itemsFor(threadId);
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0 || items[index].state === "dispatching") return null;
    const now = new Date().toISOString();
    const item = {
      ...items[index],
      state: "dispatching",
      error: "",
      sentAt: now,
      dispatchSubmissionId: dispatchSubmissionId(),
      updatedAt: now,
    };
    const nextItems = [...items];
    nextItems[index] = item;
    writeItems(threadId, nextItems);
    return { ...item };
  };

  const markFailed = (threadId, itemId, error) => update(threadId, itemId, {
    state: "failed",
    error: String(error?.message || error || "指令发送失败"),
  }, { allowDispatching: true });

  const markPending = (threadId, itemId) => update(threadId, itemId, {
    state: "pending",
    error: "",
    sentAt: "",
    dispatchSubmissionId: "",
  });

  const complete = (threadId, itemId) => remove(threadId, itemId, { allowDispatching: true });

  const threadIds = () => [...queues.keys()];

  const close = async () => {
    clearTimeout(persistTimer);
    await persist();
  };

  return {
    list,
    find,
    findBySubmissionId,
    enqueue,
    update,
    remove,
    move,
    claim,
    claimNext,
    markFailed,
    markPending,
    complete,
    threadIds,
    close,
  };
};
