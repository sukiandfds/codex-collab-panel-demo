import { postJson } from "../../../shared/api/http";

interface OpenAgentConversationResponse {
  conversationId: string;
  runtimeKind: string;
  threadId: string | null;
}

export async function openAgentConversation({ agentId, threadId = "", conversationId = "" }: {
  agentId: string;
  threadId?: string | null;
  conversationId?: string | null;
}) {
  const opened = threadId ? { threadId, conversationId } : await postJson<OpenAgentConversationResponse>(
    "/api/agent-conversations/open",
    { agentId },
  );
  if (!opened.threadId) throw new Error("当前 Runtime 暂不支持此单聊页面");

  const params = new URLSearchParams(window.location.search);
  params.delete("view");
  params.delete("archived");
  params.delete("employee");
  params.delete("employeeId");
  params.set("agent", agentId);
  params.set("thread", opened.threadId);
  if (opened.conversationId) params.set("conversation", opened.conversationId);
  else params.delete("conversation");
  const query = params.toString();
  window.history.pushState({ surface: "conversation", agentId, threadId: opened.threadId }, "", `/${query ? `?${query}` : ""}`);
  window.dispatchEvent(new Event("negus:navigate"));
  return opened;
}
