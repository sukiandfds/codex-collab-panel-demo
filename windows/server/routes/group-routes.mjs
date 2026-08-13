import { readJson, sendJson } from "../http/request-utils.mjs";
import { mentionedAgentIds } from "../multi-agent/discussion-prompt.mjs";

export const createGroupRoutes = ({ groupRoom, roomDirectory, media, multiAgent, multiAgentDirectory, webOutputs }) => async (request, response, url) => {
  const roomIdFrom = (body = {}) => String(body.roomId || url.searchParams.get("roomId") || groupRoom.snapshot().room.id).trim();
  const resolveRoom = (body = {}) => roomDirectory?.require(roomIdFrom(body)) || groupRoom;
  const resolveAgentService = (roomId) => multiAgentDirectory?.get(roomId) || multiAgent;

  if (url.pathname === "/api/group/rooms" && request.method === "GET") {
    sendJson(response, { rooms: roomDirectory?.list?.() || [groupRoom.snapshot().room] });
    return true;
  }
  if (url.pathname === "/api/group/snapshot") {
    const room = resolveRoom();
    const page = room.getMessagePage();
    sendJson(response, { ...room.snapshot(), messages: page.messages, history: { ...page, messages: undefined } });
    return true;
  }
  if (url.pathname === "/api/group/messages" && request.method === "GET") {
    const room = resolveRoom();
    sendJson(response, room.getMessagePage({
      beforeSequence: url.searchParams.get("before"),
      afterSequence: url.searchParams.get("after"),
      date: url.searchParams.get("date"),
      limit: url.searchParams.get("limit"),
    }));
    return true;
  }
  if ((url.pathname === "/api/group/join" || url.pathname === "/api/group/presence") && request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, resolveRoom(body).touchMember(body.memberId, body.name));
    return true;
  }
  if (url.pathname === "/api/group/agent-settings" && request.method === "POST") {
    const body = await readJson(request);
    const room = resolveRoom(body);
    const service = resolveAgentService(room.snapshot().room.id);
    const agentId = String(body.agentId || "").trim();
    const model = String(body.model || "").trim();
    const reasoningEffort = String(body.reasoningEffort || "").trim();
    if (!agentId || !model || !reasoningEffort) {
      sendJson(response, { error: "Agent、模型和推理强度不能为空" }, 400);
      return true;
    }
    sendJson(response, await service.updateAgentSettings(agentId, { model, reasoningEffort }));
    return true;
  }
  if (url.pathname !== "/api/group/message" || request.method !== "POST") return false;

  const body = await readJson(request);
  const room = resolveRoom(body);
  const service = resolveAgentService(room.snapshot().room.id);
  const member = room.touchMember(body.memberId, body.authorName);
  const text = String(body.text || "").trim();
  const attachments = media.resolveMany(body.attachmentIds);
  if (!text && !attachments.length) {
    sendJson(response, { error: "消息不能为空" }, 400);
    return true;
  }
  const agents = room.snapshot().agents;
  const explicitAgentIds = mentionedAgentIds(text, agents);
  const requestedAgentIds = Array.isArray(body.agentIds) ? body.agentIds : [body.agentId];
  const availableAgentIds = new Set(agents.map((agent) => agent.id));
  const targetAgentIds = [...new Set((explicitAgentIds.length ? explicitAgentIds : requestedAgentIds)
    .map((agentId) => String(agentId || "").trim())
    .filter((agentId) => availableAgentIds.has(agentId)))];
  if (!targetAgentIds.length) targetAgentIds.push("manager");
  if (!explicitAgentIds.length && webOutputs.isRequest(text)) {
    targetAgentIds.splice(0, targetAgentIds.length, "developer");
  }
  const { message, created } = await room.addMessageWithStatus({
    type: "human",
    authorId: member.id,
    authorName: member.name,
    clientMessageId: body.clientMessageId,
    agentId: targetAgentIds[0],
    targetAgentIds,
    text,
    attachments: attachments.map(({ id, name, mimeType, url: attachmentUrl }) => ({ id, name, mimeType, url: attachmentUrl })),
  });
  if (!created) {
    sendJson(response, { message, execution: null, deduplicated: true }, 202);
    return true;
  }
  const execution = await service.enqueueDiscussion({
    agentIds: targetAgentIds,
    requestText: text || "请查看附件并根据内容进行处理。",
    attachments,
    sourceMessageId: message.id,
    explicitAgentIds,
  });
  sendJson(response, { message, execution }, 202);
  return true;
};
