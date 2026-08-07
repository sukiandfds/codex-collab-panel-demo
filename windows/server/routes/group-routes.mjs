import { readJson, sendJson } from "../http/request-utils.mjs";

export const createGroupRoutes = ({ groupRoom, media, multiAgent, webOutputs }) => async (request, response, url) => {
  if (url.pathname === "/api/group/snapshot") {
    sendJson(response, groupRoom.snapshot());
    return true;
  }
  if ((url.pathname === "/api/group/join" || url.pathname === "/api/group/presence") && request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, groupRoom.touchMember(body.memberId, body.name));
    return true;
  }
  if (url.pathname === "/api/group/agent-settings" && request.method === "POST") {
    const body = await readJson(request);
    const agentId = String(body.agentId || "").trim();
    const model = String(body.model || "").trim();
    const reasoningEffort = String(body.reasoningEffort || "").trim();
    if (!agentId || !model || !reasoningEffort) {
      sendJson(response, { error: "Agent、模型和推理强度不能为空" }, 400);
      return true;
    }
    sendJson(response, await multiAgent.updateAgentSettings(agentId, { model, reasoningEffort }));
    return true;
  }
  if (url.pathname !== "/api/group/message" || request.method !== "POST") return false;

  const body = await readJson(request);
  let mode = body.mode === "development" ? "development" : "discussion";
  const member = groupRoom.touchMember(body.memberId, body.authorName);
  const text = String(body.text || "").trim();
  const attachments = media.resolveMany(body.attachmentIds);
  if (!text && !attachments.length) {
    sendJson(response, { error: "消息不能为空" }, 400);
    return true;
  }
  const requestedAgentIds = Array.isArray(body.agentIds) ? body.agentIds : [body.agentId];
  const availableAgentIds = new Set(groupRoom.snapshot().agents.map((agent) => agent.id));
  const targetAgentIds = [...new Set(requestedAgentIds
    .map((agentId) => String(agentId || "").trim())
    .filter((agentId) => availableAgentIds.has(agentId)))];
  if (!targetAgentIds.length) targetAgentIds.push("manager");
  if (webOutputs.isRequest(text)) {
    targetAgentIds.splice(0, targetAgentIds.length, "developer");
    mode = "development";
  }
  const { message, created } = await groupRoom.addMessageWithStatus({
    type: "human",
    authorId: member.id,
    authorName: member.name,
    clientMessageId: body.clientMessageId,
    agentId: targetAgentIds[0],
    targetAgentIds,
    mode,
    text,
    attachments: attachments.map(({ id, name, mimeType, url: attachmentUrl }) => ({ id, name, mimeType, url: attachmentUrl })),
  });
  if (!created) {
    sendJson(response, { message, execution: null, deduplicated: true }, 202);
    return true;
  }
  const execution = await multiAgent.enqueueDiscussion({
    agentIds: targetAgentIds,
    mode,
    requestText: text || "请查看附件并根据内容进行处理。",
    attachments,
    sourceMessageId: message.id,
  });
  sendJson(response, { message, execution }, 202);
  return true;
};
