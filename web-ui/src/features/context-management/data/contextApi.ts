import { fetchJson, postJson } from "../../../shared/api/http";
import type { ContextStatus } from "../model/types";

const currentConversationId = () => new URLSearchParams(window.location.search).get("conversation") || "";
const conversationQuery = () => {
  const conversationId = currentConversationId();
  return conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : "";
};
const withConversation = <T extends Record<string, unknown>>(body: T) => {
  const conversationId = currentConversationId();
  return conversationId ? { ...body, conversationId } : body;
};

export const contextApi = {
  status: (threadId: string, signal?: AbortSignal) => fetchJson<ContextStatus>(
    `/api/session/context?threadId=${encodeURIComponent(threadId)}${conversationQuery()}`,
    signal,
  ),
  compact: (threadId: string, signal?: AbortSignal) => postJson<ContextStatus>(
    "/api/session/context/compact",
    withConversation({ threadId }),
    signal,
  ),
  setThreshold: (threadId: string, autoCompactThreshold: number | null, signal?: AbortSignal) => postJson<ContextStatus>(
    "/api/session/context/settings",
    withConversation({ threadId, autoCompactThreshold }),
    signal,
  ),
};
