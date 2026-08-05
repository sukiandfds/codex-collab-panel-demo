import { createFollowUpQueueStore } from "./follow-up-queue-store.mjs";

const publicItem = (item) => ({
  ...item,
  attachments: (item.attachments || []).map((attachment) => ({ ...attachment })),
});

export const createFollowUpQueueService = ({
  stateFile,
  execution,
  conversations,
  media,
  publishThreadEvent,
}) => {
  const store = createFollowUpQueueStore({ stateFile });
  const locks = new Map();

  const broadcastQueue = (threadId, reason) => {
    publishThreadEvent(threadId, {
      type: "queue_changed",
      threadId,
      reason,
      items: store.list(threadId).map(publicItem),
    });
  };

  const withThreadLock = (threadId, task) => {
    const previous = locks.get(threadId) || Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    locks.set(threadId, current);
    return current.finally(() => {
      if (locks.get(threadId) === current) locks.delete(threadId);
    });
  };

  const dispatchClaimed = async (threadId, item, status) => {
    broadcastQueue(threadId, "dispatching");
    const attachments = media.resolveMany(item.attachmentIds);
    if (attachments.length !== item.attachmentIds.length) {
      const failed = store.markFailed(threadId, item.id, "排队中的附件已不可用");
      broadcastQueue(threadId, "failed");
      return failed;
    }
    publishThreadEvent(threadId, {
      type: "user_message_submitted",
      threadId,
      submissionId: item.submissionId,
      messageId: `optimistic-${item.submissionId}`,
      text: item.text,
      attachments: item.attachments,
      createdAt: item.createdAt,
    });
    try {
      if (status.active) await conversations.steerMessage(threadId, status.turnId, item.text, attachments);
      else await conversations.sendMessage(threadId, item.text, attachments);
      store.complete(threadId, item.id);
      broadcastQueue(threadId, "completed");
      return item;
    } catch (error) {
      const failed = store.markFailed(threadId, item.id, error);
      broadcastQueue(threadId, "failed");
      return failed;
    }
  };

  const dispatchNext = (threadId) => withThreadLock(threadId, async () => {
    const status = execution.getStatus(threadId);
    if (status.active || ["failed", "interrupted", "systemError", "waitingOnApproval", "waitingOnUserInput"].includes(status.phase)) {
      return null;
    }
    const item = store.claimNext(threadId);
    if (!item) return null;
    return dispatchClaimed(threadId, item, status);
  });

  const enqueue = async ({ threadId, text, attachmentIds = [], attachments = [], submissionId = "" }) => {
    const item = store.enqueue({ threadId, text, attachmentIds, attachments, submissionId });
    broadcastQueue(threadId, "queued");
    const status = execution.getStatus(threadId);
    if (!status.active) void dispatchNext(threadId);
    return publicItem(item);
  };

  const edit = async (threadId, itemId, text) => withThreadLock(threadId, async () => {
    const item = store.find(threadId, itemId);
    if (!item) throw Object.assign(new Error("排队指令不存在"), { statusCode: 404 });
    if (item.state === "dispatching") throw Object.assign(new Error("该指令正在发送，暂时不能编辑"), { statusCode: 409 });
    const updated = store.update(threadId, itemId, { text: String(text || "").trim(), error: "" });
    if (!updated?.text && !updated?.attachmentIds?.length) throw Object.assign(new Error("指令内容不能为空"), { statusCode: 400 });
    broadcastQueue(threadId, "edited");
    return publicItem(updated);
  });

  const remove = async (threadId, itemId) => withThreadLock(threadId, async () => {
    const removed = store.remove(threadId, itemId);
    if (!removed) throw Object.assign(new Error("该指令不存在或正在发送"), { statusCode: 409 });
    broadcastQueue(threadId, "removed");
    return publicItem(removed);
  });

  const move = async (threadId, itemId, direction) => withThreadLock(threadId, async () => {
    if (!["up", "down"].includes(direction)) throw Object.assign(new Error("排序方向无效"), { statusCode: 400 });
    const moved = store.move(threadId, itemId, direction);
    if (!moved) throw Object.assign(new Error("该指令不存在或正在发送"), { statusCode: 409 });
    broadcastQueue(threadId, "moved");
    return publicItem(moved);
  });

  const retry = async (threadId, itemId) => withThreadLock(threadId, async () => {
    const item = store.find(threadId, itemId);
    if (!item) throw Object.assign(new Error("排队指令不存在"), { statusCode: 404 });
    if (item.state !== "failed") throw Object.assign(new Error("当前指令不需要重试"), { statusCode: 409 });
    const pending = store.markPending(threadId, itemId);
    broadcastQueue(threadId, "retrying");
    if (!execution.getStatus(threadId).active) void dispatchNext(threadId);
    return publicItem(pending);
  });

  const sendNow = async (threadId, itemId) => withThreadLock(threadId, async () => {
    const status = execution.getStatus(threadId);
    if (status.active && !status.turnId) {
      throw Object.assign(new Error("Codex 正在启动当前任务，请稍后再试"), { statusCode: 409 });
    }
    const item = store.claim(threadId, itemId);
    if (!item) throw Object.assign(new Error("该指令不存在或正在发送"), { statusCode: 409 });
    return publicItem(await dispatchClaimed(threadId, item, status));
  });

  const handleTurnTerminal = ({ threadId, status }) => {
    if (status !== "completed") return;
    if (!execution.getStatus(threadId).active) void dispatchNext(threadId);
  };

  const start = async () => {
    for (const threadId of store.threadIds()) {
      const status = execution.getStatus(threadId);
      if (!status.active && ["idle", "completed"].includes(status.phase)) void dispatchNext(threadId);
    }
  };

  return {
    list: (threadId) => store.list(threadId).map(publicItem),
    enqueue,
    edit,
    remove,
    move,
    retry,
    sendNow,
    withThreadLock,
    handleTurnTerminal,
    start,
    close: store.close,
  };
};
