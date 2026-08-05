import { randomUUID } from "node:crypto";
import { readJson, sendJson } from "../http/request-utils.mjs";

const publicAttachment = ({ id, name, mimeType, url, width, height }) => ({
  id,
  name,
  mimeType,
  url,
  ...(Number.isSafeInteger(width) && Number.isSafeInteger(height) ? { width, height } : {}),
});

export const createFollowUpQueueRoutes = ({ queue, media }) => async (request, response, url) => {
  if (url.pathname === "/api/session/queue" && request.method === "GET") {
    const threadId = String(url.searchParams.get("threadId") || "").trim();
    if (!threadId) {
      sendJson(response, { error: "threadId is required" }, 400);
      return true;
    }
    sendJson(response, { threadId, items: queue.list(threadId) });
    return true;
  }

  if (url.pathname !== "/api/session/queue" || request.method !== "POST") return false;
  const body = await readJson(request);
  const threadId = String(body.threadId || "").trim();
  if (!threadId) {
    sendJson(response, { error: "threadId is required" }, 400);
    return true;
  }

  const action = String(body.action || "enqueue").trim();
  if (action === "enqueue") {
    const text = String(body.text || "").trim();
    const attachmentIds = [...new Set(Array.isArray(body.attachmentIds) ? body.attachmentIds.map(String) : [])].slice(0, 6);
    const attachments = media.resolveMany(attachmentIds);
    if ((!text && !attachmentIds.length) || attachments.length !== attachmentIds.length) {
      sendJson(response, { error: "指令内容或附件无效" }, 400);
      return true;
    }
    if (text.length > 32000) {
      sendJson(response, { error: "message is too long" }, 413);
      return true;
    }
    const item = await queue.enqueue({
      threadId,
      text,
      attachmentIds,
      attachments: attachments.map(publicAttachment),
      submissionId: String(body.submissionId || "").trim().slice(0, 160) || randomUUID(),
    });
    sendJson(response, { threadId, item, items: queue.list(threadId) }, 202);
    return true;
  }

  const itemId = String(body.itemId || "").trim();
  if (!itemId) {
    sendJson(response, { error: "itemId is required" }, 400);
    return true;
  }
  let item;
  if (action === "edit") {
    const text = String(body.text || "").trim();
    if (!text || text.length > 32000) {
      sendJson(response, { error: "指令内容无效" }, 400);
      return true;
    }
    item = await queue.edit(threadId, itemId, text);
  } else if (action === "remove") {
    item = await queue.remove(threadId, itemId);
  } else if (action === "move") {
    item = await queue.move(threadId, itemId, String(body.direction || ""));
  } else if (action === "retry") {
    item = await queue.retry(threadId, itemId);
  } else if (action === "sendNow") {
    item = await queue.sendNow(threadId, itemId);
  } else {
    sendJson(response, { error: "unknown queue action" }, 400);
    return true;
  }
  sendJson(response, { threadId, item, items: queue.list(threadId) }, 202);
  return true;
};
