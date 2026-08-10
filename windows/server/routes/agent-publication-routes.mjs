import { readJson, sendJson } from "../http/request-utils.mjs";

export const createAgentPublicationRoutes = ({ conversationStore, publicationService, runtimeRegistry, employeeRuntime }) => async (request, response, url) => {
  if (url.pathname === "/api/agent-conversations/open" && request.method === "POST") {
    const body = await readJson(request);
    if (employeeRuntime?.open) {
      const session = await employeeRuntime.open(body.agentId);
      sendJson(response, {
        conversationId: session.conversation.id,
        runtimeKind: session.conversation.runtimeKind,
        threadId: session.conversation.threadId,
      }, 201);
      return true;
    }
    const binding = await conversationStore.openForAgent({ agentId: body.agentId, runtimeRegistry });
    sendJson(response, {
      conversationId: binding.conversationId,
      runtimeKind: binding.runtimeKind,
      threadId: binding.runtimeKind === "codex" ? binding.runtimeSessionId : null,
    }, 201);
    return true;
  }
  if (url.pathname === "/api/agent-share/targets" && request.method === "GET") {
    sendJson(response, await conversationStore.getShareTargets({
      conversationId: url.searchParams.get("conversationId") || "",
      threadId: url.searchParams.get("threadId") || "",
    }));
    return true;
  }
  if (url.pathname === "/api/agent-share" && request.method === "POST") {
    const body = await readJson(request);
    sendJson(response, await publicationService.publish({
      requestId: body.requestId,
      conversationId: body.conversationId,
      messageId: body.messageId,
      roomId: body.roomId,
    }), 201);
    return true;
  }
  return false;
};
